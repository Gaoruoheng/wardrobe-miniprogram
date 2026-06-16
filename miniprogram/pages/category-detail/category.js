const db = wx.cloud.database();
const { getDisplayImage, getListImage } = require("../../utils/cloudImage.js");
const {
  canAccessOwnedRecord,
  getVerifiedUser,
  isMissingFunctionError,
  requireVerifiedPage
} = require("../../utils/auth.js");
const {
  STATUS_IN_USE,
  STATUS_STORED,
  normalizeItemStatus,
  decorateItemStatus
} = require("../../utils/itemStatus.js");
const { getCache, setCache, removeCache } = require("../../utils/pageCache.js");
const { backToWardrobe } = require("../../utils/navigation.js");
const {
  patchAfterItemUpdate,
  removeItem,
  upsertItem
} = require("../../utils/wardrobeCache.js");
const { DEFAULT_SKIN, syncPageSkin } = require("../../utils/skin.js");
const {
  buildCategoryItemCursorWhere,
  toItemPageResult
} = require("../../utils/itemPagination.js");

const PAGE_SIZE = 50;

function rowClass(isDragging, isOver, status) {
  let cls = "cloth-row kawaii-card";
  if (isDragging) cls += " cloth-placeholder";
  if (isOver) cls += " cloth-over";
  const normalized = normalizeItemStatus(status);
  if (normalized === STATUS_IN_USE) cls += " status-in-use-row";
  if (normalized === STATUS_STORED) cls += " status-stored-row";
  return cls;
}

function itemOrder(item, fallbackIndex) {
  return typeof item.sort_order === "number" ? item.sort_order : 999999 + fallbackIndex;
}

Page({
  data: {
    selectedSkin: DEFAULT_SKIN,
    categoryName: "",
    wardrobeId: "",
    items: [],
    isDragging: false,
    dragIndex: -1,
    floatY: 0,
    floatItem: null,
    floatRank: 1,
    showItemPanel: false,
    panelItem: null,
    allItemsLoaded: false,
    loadingMoreItems: false
  },

  _listTop: 0,
  _listBottom: 0,
  _itemHeight: 120,
  _overIndex: -1,
  _suppressTap: false,
  _dragTouchOffset: 60,
  _lastTouchY: 0,
  _itemsFetchSeq: 0,

  onLoad(options) {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
    const categoryName = decodeURIComponent(options.name || "");
    const wardrobeId = options.wardrobeId || "";

    this.setData({ categoryName, wardrobeId }, () => {
      this._hasItemsCache = this.hydrateItemsCache();
    });
  },

  onShow() {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
    if (this.data.categoryName && this.data.wardrobeId) {
      this.fetchItems({ silent: this._hasItemsCache || this.data.items.length > 0 });
    }
  },

  getItemsCacheId() {
    const user = getVerifiedUser();
    return [
      user && user.openid ? user.openid : "",
      this.data.wardrobeId,
      this.data.categoryName
    ].join(":");
  },

  decorateItems(items) {
    const sortedItems = (items || [])
      .map((item, index) => ({
        ...decorateItemStatus(item),
        url: getDisplayImage(item.url),
        displayUrl: getListImage(item),
        sort_order: itemOrder(item, index),
        orderMissing: typeof item.sort_order !== "number",
        cls: rowClass(false, false, item.wearStatus || item.status)
      }))
      .sort((left, right) => left.sort_order - right.sort_order);
    const normalizedItems = sortedItems.map((item, index) => ({
      ...item,
      sort_order: index,
      orderMissing: false
    }));
    const shouldNormalize = sortedItems.some((item, index) =>
      item.orderMissing || item.sort_order !== index
    );
    return { items: normalizedItems, shouldNormalize };
  },

  hydrateItemsCache() {
    const cached = getCache("category-items", this.getItemsCacheId());
    if (!cached || !cached.items) return false;
    const result = this.decorateItems(cached.items);
    this.setData({
      items: result.items,
      allItemsLoaded: true,
      loadingMoreItems: false
    });
    return true;
  },

  cacheItems(items) {
    const sourceUpdatedAt = (items || [])
      .map(item => item.updatedAt || item.statusUpdatedAt || item.createTime || "")
      .join("|");
    setCache("category-items", this.getItemsCacheId(), { items, sourceUpdatedAt }, { sourceUpdatedAt });
  },

  getItemCacheId(itemId) {
    const user = getVerifiedUser();
    return [
      user && user.openid ? user.openid : "",
      this.data.wardrobeId,
      itemId || ""
    ].join(":");
  },

  cacheItemDetail(item) {
    if (!item || !item._id) return;
    const sourceUpdatedAt = item.updatedAt || item.statusUpdatedAt || item.createTime || "";
    setCache("item-detail", this.getItemCacheId(item._id), { item, sourceUpdatedAt }, { sourceUpdatedAt });
  },

  removeRelatedCaches() {
    const user = getVerifiedUser();
    removeCache("category-items", this.getItemsCacheId());
    this.removeWardrobeCaches(user);
  },

  removeWardrobeCaches(user) {
    const currentUser = user || getVerifiedUser();
    if (currentUser && currentUser.openid) {
      removeCache("wardrobe-index", [currentUser.openid, this.data.wardrobeId].join(":"));
    }
    removeCache("wardrobe-index", this.data.wardrobeId);
  },

  showWriteError(err, fallback) {
    if (err && err.code === "FORBIDDEN") {
      wx.showToast({ title: "无权操作这个衣柜", icon: "none" });
    } else if (err && err.code === "ITEM_NOT_FOUND") {
      wx.showToast({ title: "衣服不存在", icon: "none" });
    } else if (isMissingFunctionError(err) || (err && err.code === "WRITE_UNAVAILABLE")) {
      wx.showToast({ title: "请重新部署云函数", icon: "none" });
    } else {
      wx.showToast({ title: fallback, icon: "none" });
    }
  },

  isCurrentItemsFetch(fetchSeq) {
    return this._itemsFetchSeq === fetchSeq &&
      !!this.data.wardrobeId &&
      !!this.data.categoryName;
  },

  async fetchCategoryItems(options = {}) {
    let cursor = null;
    let items = [];
    const _ = db.command;

    while (true) {
      const res = await db.collection("wardrobe_items")
        .where(buildCategoryItemCursorWhere(_, this.data.wardrobeId, this.data.categoryName, cursor))
        .orderBy("sort_order", "asc")
        .orderBy("_id", "asc")
        .limit(PAGE_SIZE + 1)
        .get();
      const page = toItemPageResult(res.data || [], PAGE_SIZE);
      const pageItems = page.items;
      items = items.concat(pageItems);
      if (options.onPage) {
        options.onPage(pageItems, items.slice(), !page.hasMore);
      }
      if (!page.hasMore) break;
      cursor = page.nextCursor;
    }

    return items;
  },

  async fetchItems(options = {}) {
    const ok = await this.verifyWardrobeAccess();
    if (!ok) return;
    const fetchSeq = this._itemsFetchSeq + 1;
    this._itemsFetchSeq = fetchSeq;
    const shouldShowLoading = !options.silent && this.data.items.length === 0;
    if (shouldShowLoading) wx.showLoading({ title: "加载中", mask: true });
    this.setData({ loadingMoreItems: true });
    try {
      let firstPageApplied = this.data.items.length > 0;
      const items = await this.fetchCategoryItems({
        onPage: (pageItems, loadedItems, done) => {
          if (!this.isCurrentItemsFetch(fetchSeq) || pageItems.length === 0) return;
          if (firstPageApplied && !done) return;
          firstPageApplied = true;
          const partialResult = this.decorateItems(loadedItems);
          this.setData({
            items: partialResult.items,
            allItemsLoaded: done,
            loadingMoreItems: !done
          });
        }
      });
      if (!this.isCurrentItemsFetch(fetchSeq)) return;
      const result = this.decorateItems(items);

      this.setData({
        items: result.items,
        allItemsLoaded: true,
        loadingMoreItems: false
      });
      this.cacheItems(items);
      if (result.shouldNormalize) this.saveOrder(result.items);
    } catch (err) {
      console.error(err);
      if (!options.silent) wx.showToast({ title: "加载失败", icon: "none" });
      if (this.isCurrentItemsFetch(fetchSeq)) {
        this.setData({ loadingMoreItems: false });
      }
    } finally {
      if (shouldShowLoading) wx.hideLoading();
    }
  },

  async verifyWardrobeAccess() {
    const user = getVerifiedUser();
    if (!this.data.wardrobeId || !user) return false;
    try {
      const res = await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).get();
      if (canAccessOwnedRecord(res.data, user)) return true;
    } catch (err) {
      console.error(err);
    }
    wx.showToast({ title: "无权访问这个衣柜", icon: "none" });
    wx.reLaunch({ url: "/pages/home/home" });
    return false;
  },

  cacheDragBounds() {
    return new Promise(resolve => {
      wx.createSelectorQuery().in(this)
        .select("#item-drag-list")
        .boundingClientRect(rect => {
          if (rect && this.data.items.length > 0) {
            this._listTop = rect.top;
            this._listBottom = rect.bottom;
            this._itemHeight = rect.height / this.data.items.length;
          }
          resolve();
        })
        .exec();
    });
  },

  getTouchY(e) {
    const touch = (e.touches && e.touches[0]) ||
      (e.changedTouches && e.changedTouches[0]);
    return touch ? touch.clientY : this._lastTouchY;
  },

  clampDragTop(touchY) {
    const minTop = this._listTop;
    const maxTop = this._listBottom - this._itemHeight;
    return Math.max(minTop, Math.min(touchY - this._dragTouchOffset, maxTop));
  },

  getOverIndex(floatTop) {
    const centerY = floatTop + this._itemHeight / 2;
    const rawIndex = Math.floor((centerY - this._listTop) / this._itemHeight);
    return Math.min(
      this.data.items.length - 1,
      Math.max(0, rawIndex)
    );
  },

  onDragTouchStart(e) {
    this._lastTouchY = this.getTouchY(e);
  },

  async onDragStart(e) {
    if (this.data.isDragging) return;
    if (!this.data.allItemsLoaded) {
      wx.showToast({ title: "衣服同步中，稍后再排", icon: "none" });
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;

    await this.cacheDragBounds();
    this._overIndex = index;
    const itemTop = this._listTop + index * this._itemHeight;
    const touchY = this.getTouchY(e) || itemTop + this._itemHeight / 2;
    this._lastTouchY = touchY;
    this._dragTouchOffset = Math.max(
      8,
      Math.min(touchY - itemTop, this._itemHeight - 8)
    );

    const items = this.data.items.map((item, itemIndex) => ({
      ...item,
      cls: rowClass(itemIndex === index, false, item.wearStatus)
    }));

    this.setData({
      items,
      isDragging: true,
      dragIndex: index,
      floatY: itemTop,
      floatItem: this.data.items[index],
      floatRank: index + 1
    });
  },

  onDragMove(e) {
    if (!this.data.isDragging || !e.touches || e.touches.length === 0) return;

    const touchY = this.getTouchY(e);
    this._lastTouchY = touchY;
    const floatTop = this.clampDragTop(touchY);
    const overIndex = this.getOverIndex(floatTop);

    if (overIndex !== this._overIndex) {
      const dragIndex = this.data.dragIndex;
      const items = this.data.items.map((item, itemIndex) => ({
        ...item,
        cls: rowClass(
          itemIndex === dragIndex,
          itemIndex === overIndex && itemIndex !== dragIndex,
          item.wearStatus
        )
      }));

      this._overIndex = overIndex;
      this.setData({ items, floatY: floatTop, floatRank: overIndex + 1 });
      return;
    }

    this.setData({ floatY: floatTop });
  },

  onDragEnd() {
    if (!this.data.isDragging) return;

    const fromIndex = this.data.dragIndex;
    const toIndex = this._overIndex >= 0 ? this._overIndex : fromIndex;
    const items = this.data.items.map(item => ({
      ...item,
      cls: rowClass(false, false, item.wearStatus)
    }));

    if (fromIndex !== toIndex) {
      const movedItem = items.splice(fromIndex, 1)[0];
      items.splice(toIndex, 0, movedItem);
      const orderedItems = items.map((item, index) => ({
        ...item,
        sort_order: index,
        orderMissing: false
      }));
      this.saveOrder(orderedItems);
      wx.showToast({ title: "排序已保存", icon: "success", duration: 800 });
      this.setData({ items: orderedItems }, () => {
        this.cacheItems(orderedItems);
      });
    } else {
      this.setData({ items });
    }

    this.setData({
      isDragging: false,
      dragIndex: -1,
      floatItem: null,
      floatRank: 1
    });
    this._overIndex = -1;
    this._suppressTap = true;
    setTimeout(() => {
      this._suppressTap = false;
    }, 350);
  },

  normalizeOrder(items) {
    const shouldSave = items.some((item, index) => item.sort_order !== index);
    if (shouldSave) this.saveOrder(items);
  },

  async saveOrder(items) {
    try {
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "saveItemOrder",
          wardrobeId: this.data.wardrobeId,
          category: this.data.categoryName,
          itemIds: (items || []).map(item => item._id)
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const orderErr = new Error(result.code || "WRITE_UNAVAILABLE");
        orderErr.code = result.code || "WRITE_UNAVAILABLE";
        throw orderErr;
      }
    } catch (err) {
      console.error("save item order failed", err);
      this.showWriteError(err, "排序保存失败");
    }
  },

  findItemById(itemId) {
    const item = this.data.items.find(cloth => cloth._id === itemId);
    return item ? decorateItemStatus(item) : null;
  },

  openItemPanel(e) {
    if (this.data.isDragging || this._suppressTap) return;

    const id = e.currentTarget.dataset.id;
    const item = this.findItemById(id);
    if (!item) return;
    this.setData({
      panelItem: item,
      showItemPanel: true
    });
  },

  closeItemPanel() {
    this.setData({
      panelItem: null,
      showItemPanel: false
    });
  },

  editPanelItem() {
    const item = this.data.panelItem;
    if (!item || !item._id) return;
    this.setData({ showItemPanel: false });
    this.cacheItemDetail(item);
    wx.navigateTo({
      url: "/pages/item-detail/item-detail?itemId=" + item._id +
        "&wardrobeId=" + this.data.wardrobeId +
        "&from=category&category=" + encodeURIComponent(this.data.categoryName)
    });
  },

  markPanelItemStatus(e) {
    const item = this.data.panelItem;
    if (!item || !item._id) return;
    const status = (e.detail && e.detail.status) || e.currentTarget.dataset.status;
    this.updateItemStatus(item._id, status);
  },

  async updateItemStatus(itemId, status) {
    const wearStatus = normalizeItemStatus(status);
    const oldItem = this.findItemById(itemId);
    if (!oldItem) return;
    if (oldItem.wearStatus === wearStatus) {
      wx.showToast({ title: "状态未变化", icon: "none", duration: 700 });
      return;
    }

    wx.showLoading({ title: "更新中", mask: true });
    try {
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "updateItemStatus",
          wardrobeId: this.data.wardrobeId,
          itemId,
          status: wearStatus
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const statusErr = new Error(result.code || "WRITE_UNAVAILABLE");
        statusErr.code = result.code || "WRITE_UNAVAILABLE";
        throw statusErr;
      }

      const items = this.data.items.map(item => {
        if (item._id !== itemId) return item;
        const nextItem = decorateItemStatus({ ...item, wearStatus });
        return {
          ...nextItem,
          cls: rowClass(false, false, nextItem.wearStatus)
        };
      });
      const panelItem = this.data.panelItem && this.data.panelItem._id === itemId
        ? decorateItemStatus({ ...this.data.panelItem, wearStatus })
        : this.data.panelItem;
      const changedItem = items.find(item => item._id === itemId) || panelItem;

      this.setData({ items, panelItem }, () => {
        this.cacheItems(items);
        patchAfterItemUpdate(getVerifiedUser(), this.data.wardrobeId, oldItem, changedItem);
        this.notifyPreviousPages({
          type: "update",
          item: changedItem,
          oldItem,
          oldCategory: oldItem.category,
          selectedItemIds: result.selectedItemIds
        });
      });
      wx.hideLoading();
      wx.showToast({ title: "已标记为" + panelItem.wearStatusText, icon: "success", duration: 900 });
    } catch (err) {
      console.error("update category item status failed", err);
      wx.hideLoading();
      this.showWriteError(err, "状态更新失败");
    }
  },

  enterItem(e) {
    this.openItemPanel(e);
  },

  noop() {},

  notifyPreviousPages(change) {
    const pages = getCurrentPages();
    for (let index = pages.length - 2; index >= 0; index -= 1) {
      const page = pages[index];
      if (page && page !== this && typeof page.applyItemMutationFromChild === "function") {
        page.applyItemMutationFromChild(change);
      }
    }
  },

  applyItemMutationFromChild(change) {
    if (!change || !change.type) return;
    let items = this.data.items.slice();
    const currentCategory = this.data.categoryName;

    if (change.type === "create" && change.item && change.item.category === currentCategory) {
      items = upsertItem(items, change.item);
    }

    if (change.type === "update" && change.item) {
      const oldCategory = change.oldCategory || change.oldItem && change.oldItem.category || "";
      if (oldCategory === currentCategory && change.item.category !== currentCategory) {
        items = removeItem(items, change.item._id);
      } else if (change.item.category === currentCategory) {
        items = upsertItem(items, change.item);
      }
    }

    if (change.type === "delete") {
      items = removeItem(items, change.itemId || change.item && change.item._id);
    }

    const result = this.decorateItems(items);
    this.setData({ items: result.items }, () => {
      this.cacheItems(result.items);
    });
  },

  cacheAddPreview() {
    const user = getVerifiedUser();
    if (!user || !user.openid || !this.data.wardrobeId || !this.data.categoryName) return;

    const cacheId = [user.openid, this.data.wardrobeId].join(":");
    const cached = getCache("wardrobe-categories", cacheId, { maxAge: 1000 * 60 * 30 }) ||
      getCache("wardrobe-index", cacheId, { maxAge: 1000 * 60 * 30 }) ||
      {};
    const categories = (cached.categories || []).slice();
    if (categories.indexOf(this.data.categoryName) < 0) {
      categories.push(this.data.categoryName);
    }
    setCache("wardrobe-categories", cacheId, { categories });
  },

  goAddItem() {
    if (!this.data.wardrobeId || !this.data.categoryName) return;
    this.cacheAddPreview();
    wx.navigateTo({
      url: "/pages/add/add?wardrobeId=" + this.data.wardrobeId +
        "&category=" + encodeURIComponent(this.data.categoryName)
    });
  },

  goBack() {
    backToWardrobe(this.data.wardrobeId);
  }
});
