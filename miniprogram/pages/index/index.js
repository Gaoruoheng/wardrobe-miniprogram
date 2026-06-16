const {
  canAccessOwnedRecord,
  getVerifiedUser,
  requireVerifiedPage
} = require("../../utils/auth.js");
const { getCache, removeCache } = require("../../utils/pageCache.js");
const { backHome } = require("../../utils/navigation.js");
const { DEFAULT_SKIN, syncPageSkin } = require("../../utils/skin.js");
const { isAdminModeActive } = require("../../utils/adminMode.js");
const { normalizeItems } = require("../../utils/indexItemView.js");
const indexCache = require("../../utils/indexCache.js");
const indexDataLoader = require("../../utils/indexDataLoader.js");
const indexDrag = require("../../utils/indexDrag.js");
const indexGrouping = require("../../utils/indexGrouping.js");
const indexMetaActions = require("../../utils/indexMetaActions.js");
const indexPanelActions = require("../../utils/indexPanelActions.js");
const indexSelectionActions = require("../../utils/indexSelectionActions.js");
const wardrobeIndexApi = require("../../services/wardrobeIndexApi.js");

Page({
  data: {
    selectedSkin: DEFAULT_SKIN,
    wardrobeId: "",
    isAdminViewing: false,
    wardrobeName: "我的衣柜",
    allItems: [],
    categoryNames: [],
    groupedItems: [],
    allItemsLoaded: false,
    loadingMoreItems: false,
    itemsPageCursor: null,
    totalItems: 0,
    selectedItemIds: [],
    selectedItems: [],
    pickPackagePreview: [],
    storedSelectedCount: 0,
    selectedUpdatedText: "",
    headerBg: "",
    headerImages: [],
    showPickPanel: false,
    activeCat: 0,
    activeTab: 0,
    scrollIntoView: "",
    sideScrollIntoView: "side-cat-0",
    count: 0,
    searchKeyword: "",
    searchResultText: "",
    showSearch: false,
    searchMode: "",
    searchTargetCategory: "",
    showItemPanel: false,
    panelItem: null,
    isDragging: false,
    dragCategory: "",
    dragCategoryIndex: -1,
    dragIndex: -1,
    floatY: 0,
    floatLeft: 0,
    floatWidth: 0,
    floatItem: null,
    floatRank: 1,
    plans: [],
    tasks: [],
    taskBadgeCount: 0,
    newPlanText: "",
    newTaskText: "",
    showPlanInput: false,
    showTaskInput: false,
    about: {
      desc: "一个可爱的个人衣柜",
      createdAt: ""
    }
  },

  _dragListTop: 0,
  _dragListBottom: 0,
  _dragItemHeight: 120,
  _dragTouchOffset: 60,
  _lastTouchY: 0,
  _overIndex: -1,
  _suppressTap: false,

  onLoad(options) {
    if (!requireVerifiedPage()) return;
    const wardrobeId = options.wardrobeId || "";
    this.setData({
      wardrobeId,
      isAdminViewing: isAdminModeActive()
    });
    this._hasIndexCache = wardrobeId ? this.hydrateWardrobeCache(wardrobeId) : false;
    this.loadHeaderImages();
  },

  loadHeaderImages() {
    const headerBg = "/images/chars/header-bg.png";
    const imagePaths = [
      "/images/chars/jiyi.png",
      "/images/chars/xiaoba.png",
      "/images/chars/wusachi.png"
    ];

    wx.getImageInfo({
      src: headerBg,
      success: () => {
        this.setData({ headerBg });
      },
      fail: () => {}
    });

    Promise.all(imagePaths.map(src => new Promise(resolve => {
      wx.getImageInfo({
        src,
        success: () => resolve(src),
        fail: () => resolve("")
      });
    }))).then(results => {
      const headerImages = results.filter(src => !!src);
      if (headerImages.length > 0) {
        this.setData({ headerImages });
      }
    });
  },

  onShow() {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
    this.setData({ isAdminViewing: isAdminModeActive() });
    if (this.data.wardrobeId) {
      this.fetchData({ silent: this._hasIndexCache || this.hasWardrobeContent() });
    }
  },

  hasWardrobeContent() {
    return this.data.categoryNames.length > 0 || this.data.allItems.length > 0;
  },

  isCurrentItemFetch(fetchSeq) {
    return indexDataLoader.isCurrentItemFetch(this, fetchSeq);
  },

  getWardrobeCacheId(wardrobeId) {
    const user = getVerifiedUser();
    const openid = user && user.openid ? user.openid : "";
    return [openid, wardrobeId || this.data.wardrobeId].join(":");
  },

  hydrateWardrobeCache(wardrobeId) {
    const cacheId = this.getWardrobeCacheId(wardrobeId);
    const cached = getCache("wardrobe-index", cacheId);
    if (!cached) return false;
    if (!isAdminModeActive() && !canAccessOwnedRecord(cached.wardrobe, getVerifiedUser())) {
      removeCache("wardrobe-index", cacheId);
      removeCache("wardrobe-index", wardrobeId);
      return false;
    }
    this.applyWardrobePayload(cached, { resetActive: true, fromCache: true });
    return true;
  },

  applyWardrobePayload(payload, options = {}) {
    const wardrobe = payload.wardrobe || {};
    const cats = payload.categories || [];
    const items = normalizeItems(payload.items || []);
    this._wardrobeForCache = wardrobe;

    this.setData({
      wardrobeName: wardrobe.name || this.data.wardrobeName,
      "about.desc": wardrobe.desc || this.data.about.desc,
      "about.createdAt": wardrobe.createTime || this.data.about.createdAt,
      plans: wardrobe.plans || [],
      tasks: wardrobe.tasks || [],
      selectedItemIds: wardrobe.selectedItemIds || [],
      selectedUpdatedText: wardrobe.selectedUpdatedText || "",
      categoryNames: cats,
      allItems: items,
      totalItems: typeof payload.totalItems === "number" ? payload.totalItems : this.data.totalItems,
      itemsPageCursor: payload.nextCursor || null,
      allItemsLoaded: options.allItemsLoaded !== false,
      loadingMoreItems: !!options.loadingMoreItems
    }, () => {
      this.refreshSelectedItems();
      this.buildGrouped(cats, items, { resetActive: options.resetActive !== false });
    });
  },

  cacheWardrobePayload(payload) {
    indexCache.cacheWardrobePayload(this, payload);
  },

  cacheCategoryPayloads(items) {
    indexCache.cacheCategoryPayloads(this, items);
  },

  getItemCacheId(itemId) {
    return indexCache.getItemCacheId(this, itemId);
  },

  cacheItemDetail(item) {
    indexCache.cacheItemDetail(this, item);
  },

  cacheCurrentWardrobeState(wardrobeOverrides = {}) {
    indexCache.cacheCurrentWardrobeState(this, wardrobeOverrides);
  },

  cacheManagePreview() {
    indexCache.cacheManagePreview(this);
  },

  cacheAddPreview() {
    indexCache.cacheAddPreview(this);
  },

  applyItemMutationFromChild(change) {
    indexCache.applyItemMutationFromChild(this, change);
  },

  async fetchWardrobeInfo(wardrobeId) {
    return indexDataLoader.fetchWardrobeInfo(this, wardrobeId);
  },

  canUseWardrobe(wardrobe, options = {}) {
    const user = getVerifiedUser();
    if (isAdminModeActive()) return true;
    if (canAccessOwnedRecord(wardrobe, user)) return true;
    if (options.deferRedirect) {
      const err = new Error("FORBIDDEN");
      err.code = "FORBIDDEN";
      throw err;
    }
    wx.showToast({ title: "无权访问这个衣柜", icon: "none" });
    wx.reLaunch({ url: "/pages/home/home" });
    return false;
  },


  async fetchPriorityItems(cats, wardrobe) {
    return indexDataLoader.fetchPriorityItems(this, cats, wardrobe);
  },

  async fetchWardrobeSnapshot() {
    return indexDataLoader.fetchWardrobeSnapshot(this);
  },

  applyProgressItems(items, options = {}) {
    indexDataLoader.applyProgressItems(this, items, options);
  },

  async fetchItemsPage(wardrobeId, cursor, limit) {
    return indexDataLoader.fetchItemsPage(this, wardrobeId, cursor, limit);
  },

  async loadNextItemPage() {
    return indexDataLoader.loadNextItemPage(this);
  },

  async fetchData(options = {}) {
    return indexDataLoader.fetchData(this, options);
  },

  buildGrouped(cats, items, options = {}) {
    indexGrouping.buildGrouped(this, cats, items, options);
  },

  switchTab(e) {
    const tab = Number(e.currentTarget.dataset.tab);
    if (Number.isNaN(tab)) {
      wx.showToast({ title: "按钮数据异常，请重新编译", icon: "none" });
      return;
    }
    const shouldResetSearch = this.data.showSearch || !!this.data.searchKeyword;
    this.setData({
      activeTab: tab,
      showSearch: false,
      searchKeyword: "",
      searchResultText: "",
      searchMode: "",
      searchTargetCategory: "",
      showPickPanel: false,
      showItemPanel: false,
      panelItem: null
    }, () => {
      if (tab === 0 || shouldResetSearch) {
        this.buildGrouped(this.data.categoryNames, this.data.allItems, { resetActive: true });
      }
      if (tab === 0) this.scheduleSectionMeasure();
    });
  },

  switchCat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const group = this.data.groupedItems[index];
    if (!group) return;
    this.setData({
      activeCat: index,
      scrollIntoView: group.id,
      sideScrollIntoView: "side-cat-" + index
    }, () => {
      this.scheduleSectionMeasure();
    });
  },

  onItemListScroll(e) {
    const detail = e.detail || {};
    const scrollTop = Number(detail.scrollTop) || 0;
    const scrollHeight = Number(detail.scrollHeight) || 0;
    this._lastRightScrollTop = scrollTop;

    // ??????????????? 10 ??????????
    if (this.maybeTriggerOnDemandLoad(scrollHeight, scrollTop)) {
      this.loadNextItemPage();
    }

    if (typeof this._lockedActiveCat === "number") {
      if (this.data.activeCat !== this._lockedActiveCat) {
        this.setData({
          activeCat: this._lockedActiveCat,
          sideScrollIntoView: "side-cat-" + this._lockedActiveCat
        });
      }
      return;
    }

    if (!this._sectionTops || this._sectionTops.length === 0) {
      this.scheduleSectionMeasure();
      return;
    }

    const triggerTop = scrollTop + 24;
    let nextActive = 0;
    for (let index = 0; index < this._sectionTops.length; index += 1) {
      if (this._sectionTops[index] <= triggerTop) {
        nextActive = index;
      } else {
        break;
      }
    }

    if (nextActive !== this.data.activeCat) {
      this.setData({
        activeCat: nextActive,
        sideScrollIntoView: "side-cat-" + nextActive
      });
    }
  },

  maybeTriggerOnDemandLoad(scrollHeight, scrollTop) {
    return indexDataLoader.maybeTriggerOnDemandLoad(this, scrollHeight, scrollTop);
  },

  scheduleSectionMeasure() {
    if (this._sectionMeasureTimer) clearTimeout(this._sectionMeasureTimer);
    this._sectionMeasureTimer = setTimeout(() => {
      this.measureSections();
    }, 80);
  },

  focusCategory(index, groupId) {
    if (index < 0 || !groupId) return;
    this._sectionTops = [];
    this._lockedActiveCat = index;
    if (this._unlockActiveCatTimer) clearTimeout(this._unlockActiveCatTimer);
    this._unlockActiveCatTimer = setTimeout(() => {
      this._lockedActiveCat = null;
      this.scheduleSectionMeasure();
    }, 700);

    setTimeout(() => {
      this.setData({
        activeCat: index,
        sideScrollIntoView: "side-cat-" + index,
        scrollIntoView: groupId
      }, () => {
        this.scheduleSectionMeasure();
      });
    }, 30);
  },

  measureSections() {
    wx.createSelectorQuery().in(this)
      .select(".item-list")
      .boundingClientRect()
      .selectAll(".cat-section")
      .boundingClientRect()
      .exec(res => {
        const listRect = res[0];
        const sectionRects = res[1] || [];
        if (!listRect || sectionRects.length === 0) {
          this._sectionTops = [];
          return;
        }

        const scrollTop = this._lastRightScrollTop || 0;
        this._sectionTops = sectionRects.map(rect => scrollTop + rect.top - listRect.top);
      });
  },

  applyDragClasses(groupedItems, dragCategory, dragIndex, overIndex) {
    return indexDrag.applyDragClasses(groupedItems, dragCategory, dragIndex, overIndex);
  },

  cacheDragBounds(groupIndex) {
    return indexDrag.cacheDragBounds(this, groupIndex);
  },

  getTouchY(e) {
    return indexDrag.getTouchY(this, e);
  },

  clampDragTop(touchY) {
    return indexDrag.clampDragTop(this, touchY);
  },

  getOverIndex(floatTop, itemCount) {
    return indexDrag.getOverIndex(this, floatTop, itemCount);
  },

  onDragTouchStart(e) {
    indexDrag.onDragTouchStart(this, e);
  },

  async onDragStart(e) {
    await indexDrag.onDragStart(this, e);
  },

  onDragMove(e) {
    indexDrag.onDragMove(this, e);
  },

  async onDragEnd() {
    const result = indexDrag.onDragEnd(this);
    if (!result || !result.orderedItems) return;
    const saved = await this.saveItemOrder(result.orderedItems);
    if (saved) wx.showToast({ title: "排序已保存", icon: "success", duration: 800 });
  },

  async saveItemOrder(items) {
    try {
      const category = items && items[0] ? items[0].category : "";
      await wardrobeIndexApi.saveItemOrder({
        wardrobeId: this.data.wardrobeId,
        category,
        itemIds: (items || []).map(item => item._id)
      });
      return true;
    } catch (err) {
      console.error("save index item order failed", err);
      this.showWriteError(err, "排序保存失败");
      return false;
    }
  },

  findItemById(itemId) {
    return indexPanelActions.findItemById(this, itemId);
  },

  showWriteError(err, fallback) {
    indexPanelActions.showWriteError(err, fallback);
  },

  openItemPanel(e) {
    indexPanelActions.openItemPanel(this, e);
  },

  closeItemPanel() {
    indexPanelActions.closeItemPanel(this);
  },

  editPanelItem() {
    indexPanelActions.editPanelItem(this);
  },

  markPanelItemStatus(e) {
    indexPanelActions.markPanelItemStatus(this, e);
  },

  async updateItemStatus(itemId, status) {
    return indexPanelActions.updateItemStatus(this, itemId, status);
  },

  toggleSearch() {
    indexPanelActions.toggleSearch(this);
  },

  onSearch(e) {
    indexPanelActions.onSearch(this, e);
  },

  clearSearch() {
    indexPanelActions.clearSearch(this);
  },

  refreshSelectedItems() {
    indexSelectionActions.refreshSelectedItems(this);
  },

  setSelection(ids, shouldSave) {
    indexSelectionActions.setSelection(this, ids, shouldSave);
  },

  async saveItemSelection(itemId, selected, rollbackIds) {
    return indexSelectionActions.saveItemSelection(this, itemId, selected, rollbackIds);
  },

  toggleClothSelection(e) {
    indexSelectionActions.toggleClothSelection(this, e);
  },

  removeSelectedItem(e) {
    indexSelectionActions.removeSelectedItem(this, e);
  },

  openPickPanel() {
    indexSelectionActions.openPickPanel(this);
  },

  closePickPanel() {
    indexSelectionActions.closePickPanel(this);
  },

  noop() {},

  clearSelection() {
    indexSelectionActions.clearSelection(this);
  },

  async confirmSelection() {
    return indexSelectionActions.confirmSelection(this);
  },

  async saveSelectedItems(ids) {
    return indexSelectionActions.saveSelectedItems(this, ids);
  },

  formatNow() {
    return indexSelectionActions.formatNow();
  },

  onShareAppMessage() {
    return {
      title: this.data.wardrobeName + " - Kawaii Closet",
      path: "/pages/index/index?wardrobeId=" + this.data.wardrobeId
    };
  },

  togglePlanInput() {
    indexMetaActions.togglePlanInput(this);
  },

  onPlanInput(e) {
    indexMetaActions.onPlanInput(this, e);
  },

  addPlan() {
    indexMetaActions.addPlan(this);
  },

  togglePlanDone(e) {
    indexMetaActions.togglePlanDone(this, e);
  },

  deletePlan(e) {
    indexMetaActions.deletePlan(this, e);
  },

  toggleTaskInput() {
    indexMetaActions.toggleTaskInput(this);
  },

  onTaskInput(e) {
    indexMetaActions.onTaskInput(this, e);
  },

  addTask() {
    indexMetaActions.addTask(this);
  },

  toggleTaskDone(e) {
    indexMetaActions.toggleTaskDone(this, e);
  },

  deleteTask(e) {
    indexMetaActions.deleteTask(this, e);
  },

  async saveMeta(data) {
    return indexMetaActions.saveMeta(this, data);
  },

  addToOutfit(e) {
    this.toggleClothSelection(e);
  },

  enterItem(e) {
    this.openItemPanel(e);
  },

  goBack() {
    backHome();
  },

  ensureWardrobeForAction() {
    if (this.data.wardrobeId) return true;
    wx.showToast({ title: "请先从衣柜列表进入", icon: "none" });
    setTimeout(() => {
      wx.reLaunch({ url: "/pages/home/home" });
    }, 500);
    return false;
  },

  goManage() {
    if (!this.ensureWardrobeForAction()) return;
    this.cacheManagePreview();
    wx.navigateTo({
      url: "/pages/manage/manage?wardrobeId=" + this.data.wardrobeId,
      fail: (err) => {
        console.error("go manage failed", err);
        wx.showToast({ title: "打开设置失败，请重新编译", icon: "none" });
      }
    });
  },

  goAdd() {
    if (!this.ensureWardrobeForAction()) return;
    this.cacheAddPreview();
    wx.navigateTo({
      url: "/pages/add/add?wardrobeId=" + this.data.wardrobeId,
      fail: (err) => {
        console.error("go add failed", err);
        wx.showToast({ title: "打开添加失败，请重新编译", icon: "none" });
      }
    });
  }
});
