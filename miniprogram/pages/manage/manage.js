const db = wx.cloud.database();
const {
  canAccessOwnedRecord,
  getVerifiedUser,
  isMissingFunctionError,
  isRecordOwner,
  requireVerifiedPage
} = require("../../utils/auth.js");
const { getCache, setCache, removeCache } = require("../../utils/pageCache.js");
const { backToWardrobe } = require("../../utils/navigation.js");
const { DEFAULT_SKIN, syncPageSkin } = require("../../utils/skin.js");

const DEFAULT_CATEGORIES = ["上衣", "下装", "连衣裙", "鞋子", "配饰"];
const MANAGE_CACHE_MAX_AGE = 1000 * 60 * 30;

function catClass(isDragging, isOver) {
  let cls = "cat-item";
  if (isDragging) cls += " cat-placeholder";
  if (isOver) cls += " cat-over";
  return cls;
}

Page({
  data: {
    selectedSkin: DEFAULT_SKIN,
    wardrobeId: "",
    wardrobeName: "",
    wardrobeDesc: "",
    categories: [],
    newCatName: "",
    showAddCat: false,
    totalItems: 0,
    isDragging: false,
    dragIndex: -1,
    floatY: 0,
    floatItem: null,
    floatRank: 1,
    isOwner: false,
    shareEnabled: false,
    shareCode: "",
    sharedUsers: [],
    manageReady: false,
    isRefreshingManage: false
  },

  _listTop: 0,
  _listBottom: 0,
  _itemHeight: 80,
  _overIndex: -1,
  _suppressTap: false,
  _dragTouchOffset: 40,
  _lastTouchY: 0,

  onLoad(options) {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
    const wardrobeId = options.wardrobeId || "";
    this.setData({ wardrobeId });
    const hasCache = wardrobeId ? this.hydrateManageCache() : false;
    if (wardrobeId) this.fetchData(wardrobeId, { silent: hasCache });
  },

  onShow() {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
  },

  getManageCacheId() {
    const user = getVerifiedUser();
    return [
      user && user.openid ? user.openid : "",
      this.data.wardrobeId
    ].join(":");
  },

  normalizeManageCategories(categories) {
    return (categories || []).map((cat, index) => {
      const name = typeof cat === "string" ? cat : cat && cat.name;
      const docId = typeof cat === "string" ? "" : cat && (cat.docId || cat._id) || "";
      return {
        _id: docId || ("preview-" + index + "-" + name),
        docId,
        isPreview: !docId,
        name,
        count: typeof cat.count === "number" ? cat.count : 0,
        itemCount: typeof cat.itemCount === "number" ? cat.itemCount : typeof cat.count === "number" ? cat.count : 0,
        sort_order: typeof cat.sort_order === "number" ? cat.sort_order : index,
        orderMissing: !!cat.orderMissing,
        cls: catClass(false, false)
      };
    }).filter(cat => !!cat.name);
  },

  applyManagePayload(payload, options = {}) {
    if (!payload || !payload.wardrobe) return false;
    if (!canAccessOwnedRecord(payload.wardrobe, getVerifiedUser())) return false;

    const categories = this.normalizeManageCategories(payload.categories);
    this.setData({
      wardrobeName: payload.wardrobe.name || "",
      wardrobeDesc: payload.wardrobe.desc || "",
      categories,
      totalItems: typeof payload.totalItems === "number" ? payload.totalItems : 0,
      isOwner: isRecordOwner(payload.wardrobe, getVerifiedUser()),
      shareEnabled: !!payload.wardrobe.shareEnabled,
      shareCode: payload.wardrobe.shareCode || "",
      sharedUsers: payload.wardrobe.sharedUsers || [],
      manageReady: !!options.ready
    });
    return true;
  },

  hydrateManageCache() {
    const cacheId = this.getManageCacheId();
    const cached = getCache("manage-wardrobe", cacheId, { maxAge: MANAGE_CACHE_MAX_AGE });
    if (cached && this.applyManagePayload(cached, { ready: true })) return true;

    const preview = getCache("manage-preview", cacheId, { maxAge: 1000 * 60 * 5 });
    if (preview && this.applyManagePayload(preview, { ready: false })) return true;
    return false;
  },

  cacheManagePayload(payload) {
    setCache("manage-wardrobe", this.getManageCacheId(), payload);
    removeCache("manage-preview", this.getManageCacheId());
  },

  getCachedManagePayload() {
    const cacheId = this.getManageCacheId();
    return getCache("manage-wardrobe", cacheId, { maxAge: MANAGE_CACHE_MAX_AGE }) ||
      getCache("manage-preview", cacheId, { maxAge: 1000 * 60 * 5 }) ||
      {};
  },

  buildManagePayload(wardrobeOverrides = {}, categoriesOverride) {
    const cached = this.getCachedManagePayload();
    const cachedWardrobe = cached.wardrobe || {};
    const categories = this.normalizeManageCategories(categoriesOverride || this.data.categories);
    const totalItems = typeof this.data.totalItems === "number"
      ? this.data.totalItems
      : categories.reduce((sum, cat) => sum + (cat.count || 0), 0);

    return {
      wardrobe: {
        ...cachedWardrobe,
        _id: this.data.wardrobeId || cachedWardrobe._id,
        name: this.data.wardrobeName,
        desc: this.data.wardrobeDesc,
        shareEnabled: this.data.shareEnabled,
        shareCode: this.data.shareCode,
        sharedUsers: this.data.sharedUsers || [],
        ...wardrobeOverrides
      },
      categories,
      totalItems
    };
  },

  syncWardrobeIndexCache(payload) {
    const cacheId = this.getManageCacheId();
    const cached = getCache("wardrobe-index", cacheId) || {};
    const wardrobe = {
      ...(cached.wardrobe || {}),
      ...(payload.wardrobe || {})
    };
    const categories = (payload.categories || []).map(cat => cat.name).filter(name => !!name);
    const sourceUpdatedAt = wardrobe.updatedAt || cached.sourceUpdatedAt || "";

    setCache("wardrobe-index", cacheId, {
      ...cached,
      wardrobe,
      categories,
      items: cached.items || [],
      sourceUpdatedAt
    }, { sourceUpdatedAt });
    setCache("wardrobe-categories", cacheId, { categories });
    removeCache("wardrobe-index", this.data.wardrobeId);
  },

  syncHomeWardrobesCache(payload) {
    const user = getVerifiedUser();
    if (!user || !user.openid) return;

    const cached = getCache("home-wardrobes", user.openid);
    if (!cached || !cached.wardrobes) return;

    const wardrobe = payload.wardrobe || {};
    const wardrobes = cached.wardrobes.map(item => {
      if (!item || item._id !== this.data.wardrobeId) return item;
      return {
        ...item,
        ...wardrobe,
        name: wardrobe.name || item.name,
        desc: wardrobe.desc !== undefined ? wardrobe.desc : item.desc
      };
    });
    const sourceUpdatedAt = wardrobes
      .map(item => item.updatedAt || item.createTime || "")
      .join("|");
    setCache("home-wardrobes", user.openid, {
      wardrobes,
      sourceUpdatedAt
    }, { sourceUpdatedAt });
  },

  cacheCurrentManageState(wardrobeOverrides = {}, categoriesOverride) {
    const payload = this.buildManagePayload(wardrobeOverrides, categoriesOverride);
    this.cacheManagePayload(payload);
    this.syncWardrobeIndexCache(payload);
    this.syncHomeWardrobesCache(payload);
    return payload;
  },

  async fetchManageSnapshot(wardrobeId) {
    try {
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "getWardrobeSnapshot",
          wardrobeId,
          mode: "manage"
        }
      });
      const result = callRes.result || {};
      if (result.success) return result;
      const snapshotErr = new Error(result.code || "SNAPSHOT_UNAVAILABLE");
      snapshotErr.code = result.code || "SNAPSHOT_UNAVAILABLE";
      throw snapshotErr;
    } catch (err) {
      if (isMissingFunctionError(err) || (err && err.code === "SNAPSHOT_UNAVAILABLE")) {
        return null;
      }
      throw err;
    }
  },

  async fetchData(wardrobeId, options = {}) {
    const shouldShowLoading = !options.silent && this.data.categories.length === 0 && !this.data.wardrobeName;
    if (shouldShowLoading) wx.showLoading({ title: "加载中", mask: true });
    this.setData({ isRefreshingManage: true });
    try {
      const snapshot = await this.fetchManageSnapshot(wardrobeId);
      if (snapshot) {
        const categories = (snapshot.categories || []).map((cat, index) => ({
          _id: cat._id,
          docId: cat._id,
          name: cat.name,
          count: typeof cat.count === "number" ? cat.count : cat.itemCount || 0,
          itemCount: typeof cat.itemCount === "number" ? cat.itemCount : cat.count || 0,
          sort_order: typeof cat.sort_order === "number" ? cat.sort_order : index,
          orderMissing: typeof cat.sort_order !== "number",
          cls: catClass(false, false)
        }));
        const payload = {
          wardrobe: snapshot.wardrobe,
          categories,
          totalItems: typeof snapshot.totalItems === "number"
            ? snapshot.totalItems
            : categories.reduce((sum, cat) => sum + (cat.count || 0), 0)
        };
        this.applyManagePayload(payload, { ready: true });
        this.cacheManagePayload(payload);
        this.syncWardrobeIndexCache(payload);
        this.normalizeOrder(categories);
        return;
      }

      const hubRes = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
      if (!this.canUseWardrobe(hubRes.data)) return;
      this.setData({
        wardrobeName: hubRes.data.name || this.data.wardrobeName,
        wardrobeDesc: hubRes.data.desc || this.data.wardrobeDesc,
        isOwner: isRecordOwner(hubRes.data, getVerifiedUser()),
        shareEnabled: !!hubRes.data.shareEnabled,
        shareCode: hubRes.data.shareCode || "",
        sharedUsers: hubRes.data.sharedUsers || []
      });

      let catRes = await db.collection("wardrobe_categories")
        .where({ wardrobeId })
        .orderBy("sort_order", "asc")
        .get();
      if (!catRes.data || catRes.data.length === 0) {
        await this.createDefaultCategories(wardrobeId, hubRes.data);
        catRes = await db.collection("wardrobe_categories")
          .where({ wardrobeId })
          .orderBy("sort_order", "asc")
          .get();
      }
      const countList = await Promise.all(catRes.data.map(cat => {
        if (typeof cat.itemCount === "number") {
          return Promise.resolve({ total: cat.itemCount });
        }
        return db.collection("wardrobe_items")
          .where({ wardrobeId, category: cat.name })
          .count();
      }));
      const totalItems = countList.reduce((sum, item) => sum + (item ? item.total || 0 : 0), 0);

      const categories = catRes.data.map((cat, index) => ({
        _id: cat._id,
        docId: cat._id,
        name: cat.name,
        count: countList[index] ? countList[index].total : 0,
        itemCount: countList[index] ? countList[index].total : 0,
        sort_order: typeof cat.sort_order === "number" ? cat.sort_order : index,
        orderMissing: typeof cat.sort_order !== "number",
        cls: catClass(false, false)
      }));

      const payload = {
        wardrobe: hubRes.data,
        categories,
        totalItems
      };
      this.applyManagePayload(payload, { ready: true });
      this.cacheManagePayload(payload);

      this.normalizeOrder(categories);
    } catch (err) {
      console.error(err);
      if (err && err.code === "FORBIDDEN") {
        wx.showToast({ title: "无权访问这个衣柜", icon: "none" });
        wx.reLaunch({ url: "/pages/home/home" });
      } else if (!options.silent) {
        wx.showToast({ title: "加载失败", icon: "none" });
      }
    } finally {
      this.setData({ isRefreshingManage: false });
      if (shouldShowLoading) wx.hideLoading();
    }
  },

  async createDefaultCategories(wardrobeId, wardrobe) {
    const user = getVerifiedUser();
    const ownerOpenId = wardrobe.ownerOpenId || (user ? user.openid : "");
    await Promise.all(DEFAULT_CATEGORIES.map((name, index) =>
      db.collection("wardrobe_categories").add({
        data: {
          name,
          wardrobeId,
          ownerOpenId,
          sort_order: index,
          itemCount: 0,
          createTime: db.serverDate()
        }
      })
    ));
  },

  canUseWardrobe(wardrobe) {
    const user = getVerifiedUser();
    if (canAccessOwnedRecord(wardrobe, user)) return true;
    wx.showToast({ title: "无权访问这个衣柜", icon: "none" });
    wx.reLaunch({ url: "/pages/home/home" });
    return false;
  },

  createShareCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "K";
    for (let index = 0; index < 7; index += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },

  async findUniqueShareCode() {
    for (let index = 0; index < 6; index += 1) {
      const shareCode = this.createShareCode();
      const res = await db.collection("wardrobe_hubs").where({ shareCode }).limit(1).get();
      if (!res.data || res.data.length === 0) return shareCode;
    }
    return this.createShareCode() + Date.now().toString().slice(-2);
  },

  async enableShare() {
    if (!this.data.isOwner) {
      wx.showToast({ title: "只有主人可以授权", icon: "none" });
      return;
    }

    wx.showLoading({ title: "生成中", mask: true });
    try {
      const shareCode = this.data.shareCode || await this.findUniqueShareCode();
      await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).update({
        data: {
          shareEnabled: true,
          shareCode,
          updatedAt: db.serverDate()
        }
      });
      this.setData({ shareEnabled: true, shareCode }, () => {
        this.cacheCurrentManageState({ shareEnabled: true, shareCode });
      });
      wx.showToast({ title: "共享已开启", icon: "success" });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: "生成失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  async disableShare() {
    if (!this.data.isOwner) return;
    wx.showModal({
      title: "关闭共享",
      content: "关闭后新用户不能再通过共享码加入，已加入用户仍保留在列表中。",
      confirmText: "关闭",
      confirmColor: "#E76F7A",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).update({
            data: {
              shareEnabled: false,
              updatedAt: db.serverDate()
            }
          });
          this.setData({ shareEnabled: false }, () => {
            this.cacheCurrentManageState({ shareEnabled: false });
          });
          wx.showToast({ title: "已关闭", icon: "success" });
        } catch (err) {
          console.error(err);
          wx.showToast({ title: "关闭失败", icon: "none" });
        }
      }
    });
  },

  copyShareCode() {
    if (!this.data.shareCode) return;
    wx.setClipboardData({
      data: this.data.shareCode,
      success: () => {
        wx.showToast({ title: "共享码已复制", icon: "success" });
      }
    });
  },

  async removeSharedUser(e) {
    if (!this.data.isOwner) return;
    const openid = e.currentTarget.dataset.openid;
    if (!openid) return;
    const sharedOpenIds = (this.data.sharedUsers || [])
      .map(item => item.openid)
      .filter(id => id && id !== openid);
    const sharedUsers = (this.data.sharedUsers || [])
      .filter(item => item && item.openid !== openid);

    try {
      await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).update({
        data: {
          sharedOpenIds,
          sharedUsers,
          updatedAt: db.serverDate()
        }
      });
      this.setData({ sharedUsers }, () => {
        this.cacheCurrentManageState({ sharedOpenIds, sharedUsers });
      });
      wx.showToast({ title: "已移除", icon: "success" });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: "移除失败", icon: "none" });
    }
  },

  cacheDragBounds() {
    return new Promise(resolve => {
      wx.createSelectorQuery().in(this)
        .select("#drag-list")
        .boundingClientRect(rect => {
          if (rect && this.data.categories.length > 0) {
            this._listTop = rect.top;
            this._listBottom = rect.bottom;
            this._itemHeight = rect.height / this.data.categories.length;
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
      this.data.categories.length - 1,
      Math.max(0, rawIndex)
    );
  },

  onDragTouchStart(e) {
    this._lastTouchY = this.getTouchY(e);
  },

  async onDragStart(e) {
    if (this.data.isDragging) return;
    if (this.data.categories.some(cat => cat.isPreview)) {
      wx.showToast({ title: "分类同步中，稍后再排", icon: "none" });
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

    const categories = this.data.categories.map((cat, catIndex) => ({
      ...cat,
      cls: catClass(catIndex === index, false)
    }));

    this.setData({
      categories,
      isDragging: true,
      dragIndex: index,
      floatY: itemTop,
      floatItem: this.data.categories[index],
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
      const categories = this.data.categories.map((cat, catIndex) => ({
        ...cat,
        cls: catClass(catIndex === dragIndex, catIndex === overIndex && catIndex !== dragIndex)
      }));

      this._overIndex = overIndex;
      this.setData({ categories, floatY: floatTop, floatRank: overIndex + 1 });
      return;
    }

    this.setData({ floatY: floatTop });
  },

  onDragEnd() {
    if (!this.data.isDragging) return;

    const fromIndex = this.data.dragIndex;
    const toIndex = this._overIndex >= 0 ? this._overIndex : fromIndex;
    const categories = this.data.categories.map(cat => ({
      ...cat,
      cls: catClass(false, false)
    }));

    if (fromIndex !== toIndex) {
      const moved = categories.splice(fromIndex, 1)[0];
      categories.splice(toIndex, 0, moved);
      categories.forEach((cat, index) => {
        cat.sort_order = index;
        cat.orderMissing = false;
      });
      this.saveOrder(categories, { showToast: true });
    }

    this.setData({
      categories,
      isDragging: false,
      dragIndex: -1,
      floatItem: null,
      floatRank: 1
    }, () => {
      this.cacheCurrentManageState({}, categories);
    });
    this._overIndex = -1;
    this._suppressTap = true;
    setTimeout(() => {
      this._suppressTap = false;
    }, 350);
  },

  async normalizeOrder(categories) {
    const shouldSave = categories.some((cat, index) => cat.orderMissing || cat.sort_order !== index);
    if (shouldSave) this.saveOrder(categories);
  },

  async saveOrder(categories, options = {}) {
    const missingDocId = (categories || []).some(cat =>
      !cat || cat.isPreview || !(cat.docId || cat._id)
    );
    if (missingDocId) {
      wx.showToast({ title: "分类同步中，稍后再排", icon: "none" });
      this.fetchData(this.data.wardrobeId, { silent: true });
      return false;
    }

    try {
      await Promise.all(categories.map((cat, index) =>
        db.collection("wardrobe_categories").doc(cat.docId || cat._id).update({
          data: { sort_order: index }
        })
      ));
      await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).update({
        data: { updatedAt: db.serverDate() }
      });
      this.cacheCurrentManageState({}, categories);
      if (options.showToast) wx.showToast({ title: "排序已保存", icon: "success", duration: 800 });
      return true;
    } catch (err) {
      console.error("save category order failed", err);
      wx.showToast({ title: "排序保存失败", icon: "none" });
      return false;
    }
  },

  enterCategory(e) {
    if (this.data.isDragging || this._suppressTap) return;
    const index = Number(e.currentTarget.dataset.index);
    const cat = this.data.categories[index];
    if (!cat) return;

    wx.navigateTo({
      url: "/pages/category-detail/category?wardrobeId=" + this.data.wardrobeId +
        "&name=" + encodeURIComponent(cat.name)
    });
  },

  onNameInput(e) {
    this.setData({ wardrobeName: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ wardrobeDesc: e.detail.value });
  },

  toggleAddCat() {
    this.setData({ showAddCat: !this.data.showAddCat, newCatName: "" });
  },

  onNewCatInput(e) {
    this.setData({ newCatName: e.detail.value });
  },

  async addCategory() {
    const name = this.data.newCatName.trim();
    const user = getVerifiedUser();
    if (!name) return;
    if (!user) {
      wx.showToast({ title: "登录后才能添加分类", icon: "none" });
      return;
    }
    if (this.data.categories.some(cat => cat.name === name)) {
      wx.showToast({ title: "这个分类已经有啦", icon: "none" });
      return;
    }

    wx.showLoading({ title: "添加中", mask: true });
    try {
      const res = await db.collection("wardrobe_categories").add({
          data: {
            name,
            wardrobeId: this.data.wardrobeId,
            ownerOpenId: user.openid,
            sort_order: this.data.categories.length,
            itemCount: 0,
            createTime: db.serverDate()
          }
      });
      await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).update({
        data: { updatedAt: db.serverDate() }
      });
      const categories = this.data.categories.concat([{
        _id: res._id,
        docId: res._id,
        isPreview: false,
        name,
        count: 0,
        itemCount: 0,
        sort_order: this.data.categories.length,
        cls: catClass(false, false)
      }]);

      this.setData({ categories, newCatName: "", showAddCat: false }, () => {
        this.cacheCurrentManageState({}, categories);
      });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: "添加失败", icon: "error" });
    } finally {
      wx.hideLoading();
    }
  },

  async saveAll() {
    const wardrobeName = this.data.wardrobeName.trim();
    const wardrobeDesc = this.data.wardrobeDesc.trim();
    if (!wardrobeName) {
      wx.showToast({ title: "先写衣柜名称", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中", mask: true });
    try {
      await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).update({
        data: {
          name: wardrobeName,
          desc: wardrobeDesc,
          updatedAt: db.serverDate()
        }
      });
      this.setData({ wardrobeName, wardrobeDesc });
      this.cacheCurrentManageState({ name: wardrobeName, desc: wardrobeDesc });
      wx.hideLoading();
      wx.showToast({ title: "已保存", icon: "success" });
      backToWardrobe(this.data.wardrobeId);
    } catch (err) {
      console.error(err);
      wx.hideLoading();
      wx.showToast({ title: "保存失败", icon: "error" });
    }
  },

  goBack() {
    backToWardrobe(this.data.wardrobeId);
  }
});
