const db = wx.cloud.database();
const { uploadItemImages } = require("../../utils/cloudImage.js");
const {
  canAccessOwnedRecord,
  getVerifiedUser,
  isMissingFunctionError,
  requireVerifiedPage
} = require("../../utils/auth.js");
const { getCache, setCache, removeCache } = require("../../utils/pageCache.js");
const { backToCategoryOrWardrobe } = require("../../utils/navigation.js");
const {
  patchAfterItemCreate,
  patchCategoryNamesCache
} = require("../../utils/wardrobeCache.js");
const { DEFAULT_SKIN, syncPageSkin } = require("../../utils/skin.js");

const DEFAULT_CATEGORIES = ["上衣", "下装", "连衣裙", "鞋子", "配饰"];
const UNCATEGORIZED_CATEGORY = "未分类";
const DEFAULT_ITEM_NAME = "未命名单品";
const DEFAULT_ITEM_IMAGE = "/images/default-goods-image.png";

function normalizeName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

Page({
  data: {
    selectedSkin: DEFAULT_SKIN,
    wardrobeId: "",
    itemUrl: "",
    name: "",
    color: "",
    categories: DEFAULT_CATEGORIES.slice(),
    selectedCategory: "",
    defaultCategory: "",
    newCategoryName: "",
    showCategoryInput: false,
    isSavingCategory: false
  },

  async onLoad(options) {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
    const wardrobeId = options.wardrobeId || "";
    const defaultCategory = decodeURIComponent(options.category || "");
    this.setData({ wardrobeId, defaultCategory });
    this.hydrateCategoriesCache();
    const ok = await this.verifyWardrobeAccess(wardrobeId);
    if (!ok) return;
    this.loadCategories(wardrobeId);
  },

  onShow() {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
  },

  getWardrobeCacheId() {
    const user = getVerifiedUser();
    return [
      user && user.openid ? user.openid : "",
      this.data.wardrobeId
    ].join(":");
  },

  applyCategories(names) {
    const categories = this.mergeCategories(names);
    const defaultCategory = normalizeName(this.data.defaultCategory);
    if (defaultCategory && categories.indexOf(defaultCategory) < 0) {
      categories.push(defaultCategory);
    }
    const selectedCategory = defaultCategory
      ? defaultCategory
      : this.data.selectedCategory;
    this.setData({ categories, selectedCategory });
    return categories;
  },

  hydrateCategoriesCache() {
    const cacheId = this.getWardrobeCacheId();
    const cachedCategories = getCache("wardrobe-categories", cacheId, { maxAge: 1000 * 60 * 30 });
    if (cachedCategories && cachedCategories.categories) {
      this.applyCategories(cachedCategories.categories);
      return true;
    }

    const wardrobeCache = getCache("wardrobe-index", cacheId, { maxAge: 1000 * 60 * 30 });
    if (wardrobeCache && wardrobeCache.categories) {
      this.applyCategories(wardrobeCache.categories);
      return true;
    }

    return false;
  },

  cacheCategories(categories) {
    setCache("wardrobe-categories", this.getWardrobeCacheId(), { categories });
  },

  clearWardrobeCaches(category) {
    const user = getVerifiedUser();
    if (user && user.openid) {
      const cacheId = [user.openid, this.data.wardrobeId].join(":");
      removeCache("wardrobe-index", cacheId);
      removeCache("manage-wardrobe", cacheId);
      removeCache("manage-preview", cacheId);
      if (category) {
        removeCache("category-items", [user.openid, this.data.wardrobeId, category].join(":"));
      }
    }
    removeCache("wardrobe-index", this.data.wardrobeId);
  },

  async verifyWardrobeAccess(wardrobeId) {
    const user = getVerifiedUser();
    if (!wardrobeId || !user) return false;
    try {
      const res = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
      if (canAccessOwnedRecord(res.data, user)) return true;
    } catch (err) {
      console.error(err);
    }
    wx.showToast({ title: "无权访问这个衣柜", icon: "none" });
    wx.reLaunch({ url: "/pages/home/home" });
    return false;
  },

  async loadCategories(wardrobeId) {
    if (!wardrobeId) return;
    try {
      const res = await db.collection("wardrobe_categories")
        .where({ wardrobeId })
        .orderBy("sort_order", "asc")
        .get();
      const categories = this.applyCategories(res.data.map(cat => cat.name));
      this.cacheCategories(categories);
    } catch (err) {
      console.error(err);
    }
  },

  mergeCategories(names) {
    const result = [];
    const source = names && names.length > 0 ? names : DEFAULT_CATEGORIES;
    source.forEach(name => {
      const normalized = normalizeName(name);
      if (normalized && result.indexOf(normalized) === -1) {
        result.push(normalized);
      }
    });
    return result;
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        this.setData({ itemUrl: res.tempFiles[0].tempFilePath });
      }
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onColorInput(e) {
    this.setData({ color: e.detail.value });
  },

  selectCategory(e) {
    const category = e.currentTarget.dataset.category || "";
    this.setData({ selectedCategory: category });
  },

  toggleCategoryInput() {
    this.setData({
      showCategoryInput: !this.data.showCategoryInput,
      newCategoryName: ""
    });
  },

  onNewCategoryInput(e) {
    this.setData({ newCategoryName: e.detail.value });
  },

  async addCategory() {
    const name = normalizeName(this.data.newCategoryName);
    const { categories, wardrobeId, isSavingCategory } = this.data;

    if (isSavingCategory) return;
    if (!name) {
      wx.showToast({ title: "先写分类名", icon: "none" });
      return;
    }

    if (categories.some(category => category === name)) {
      this.setData({
        selectedCategory: name,
        newCategoryName: "",
        showCategoryInput: false
      });
      wx.showToast({ title: "已选择该分类", icon: "none" });
      return;
    }

    if (!wardrobeId) {
      wx.showToast({ title: "缺少衣柜信息", icon: "none" });
      return;
    }

    this.setData({ isSavingCategory: true });
    try {
      await this.ensureCategory(name);
      this.setData({
        categories: categories.concat(name),
        selectedCategory: name,
        newCategoryName: "",
        showCategoryInput: false
      });
      this.cacheCategories(categories.concat(name));
      wx.showToast({ title: "分类已添加", icon: "success" });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: "添加失败", icon: "none" });
    } finally {
      this.setData({ isSavingCategory: false });
    }
  },

  async ensureCategory(name) {
    const { wardrobeId, categories } = this.data;
    const user = getVerifiedUser();
    if (!wardrobeId || !name) return;

    const res = await db.collection("wardrobe_categories")
      .where({ wardrobeId, name })
      .limit(1)
      .get();

    if (res.data.length > 0) return;

    const existingIndex = categories.indexOf(name);
    await db.collection("wardrobe_categories").add({
      data: {
        name,
        wardrobeId,
        ownerOpenId: user ? user.openid : "",
        sort_order: existingIndex >= 0 ? existingIndex : categories.length,
        itemCount: 0,
        createTime: db.serverDate()
      }
    });
  },

  notifyPreviousPages(change) {
    const pages = getCurrentPages();
    for (let index = pages.length - 2; index >= 0; index -= 1) {
      const page = pages[index];
      if (page && typeof page.applyItemMutationFromChild === "function") {
        page.applyItemMutationFromChild(change);
      }
    }
  },

  async saveItem() {
    const { itemUrl, name, color, wardrobeId, selectedCategory } = this.data;
    const user = getVerifiedUser();
    if (!wardrobeId) {
      wx.showToast({ title: "缺少衣柜信息", icon: "none" });
      return;
    }
    if (!user) {
      wx.showToast({ title: "登录后才能保存衣物", icon: "none" });
      return;
    }

    const itemName = normalizeName(name);
    const itemColor = normalizeName(color);
    if (!itemName && !itemColor && !itemUrl && !selectedCategory) {
      wx.showToast({ title: "至少填一项信息", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中", mask: true });
    try {
      const category = selectedCategory || UNCATEGORIZED_CATEGORY;
      const imageData = itemUrl
        ? await uploadItemImages(itemUrl, wardrobeId)
        : { url: DEFAULT_ITEM_IMAGE, thumbUrl: DEFAULT_ITEM_IMAGE };
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "createItem",
          wardrobeId,
          item: {
            name: itemName || DEFAULT_ITEM_NAME,
            category,
            color: itemColor,
            url: imageData.url,
            thumbUrl: imageData.thumbUrl
          }
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const createErr = new Error(result.code || "WRITE_UNAVAILABLE");
        createErr.code = result.code || "WRITE_UNAVAILABLE";
        throw createErr;
      }
      if (result.item) {
        patchAfterItemCreate(user, wardrobeId, result.item);
        patchCategoryNamesCache(user, wardrobeId, this.mergeCategories(this.data.categories.concat(category)));
        this.notifyPreviousPages({ type: "create", item: result.item });
      } else {
        this.clearWardrobeCaches(category);
      }
      wx.hideLoading();
      wx.showToast({ title: "已保存", icon: "success" });
      backToCategoryOrWardrobe(wardrobeId, this.data.defaultCategory);
    } catch (err) {
      console.error(err);
      wx.hideLoading();
      if (isMissingFunctionError(err) || (err && err.code === "WRITE_UNAVAILABLE")) {
        wx.showToast({ title: "请重新部署云函数", icon: "none" });
      } else if (err && err.code === "FORBIDDEN") {
        wx.showToast({ title: "无权操作这个衣柜", icon: "none" });
      } else {
        wx.showToast({ title: "保存失败", icon: "error" });
      }
    }
  },

  goBack() {
    backToCategoryOrWardrobe(this.data.wardrobeId, this.data.defaultCategory);
  }
});
