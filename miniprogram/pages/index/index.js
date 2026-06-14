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
const { backHome } = require("../../utils/navigation.js");
const {
  removeItem,
  upsertItem
} = require("../../utils/wardrobeCache.js");
const { DEFAULT_SKIN, syncPageSkin } = require("../../utils/skin.js");
const {
  getAdminPasswordForCloud,
  isAdminModeActive
} = require("../../utils/adminMode.js");

const FIRST_SCREEN_ITEM_LIMIT = 20;
const ON_DEMAND_PAGE_SIZE = 20;
const ON_DEMAND_TRIGGER_REMAINING = 10;

function itemOrder(item, fallbackIndex) {
  return typeof item.sort_order === "number" ? item.sort_order : 999999 + fallbackIndex;
}

function clothRowClass(selected, isPlaceholder, isOver, status) {
  let cls = "cloth-row";
  if (selected) cls += " selected";
  if (isPlaceholder) cls += " drag-placeholder";
  if (isOver) cls += " drag-over";
  const normalized = normalizeItemStatus(status);
  if (normalized === STATUS_IN_USE) cls += " status-in-use-row";
  if (normalized === STATUS_STORED) cls += " status-stored-row";
  return cls;
}

function normalizeText(value) {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function keywordTokens(keyword) {
  return normalizeText(keyword).split(" ").filter(token => !!token);
}

function fuzzyMatch(source, keyword) {
  const text = compactText(source);
  const query = compactText(keyword);
  if (!query) return true;
  if (text.indexOf(query) >= 0) return true;

  let cursor = 0;
  for (let index = 0; index < query.length; index += 1) {
    cursor = text.indexOf(query[index], cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

function itemMatchesKeyword(item, keyword) {
  const tokens = keywordTokens(keyword);
  if (tokens.length === 0) return true;

  const fields = [
    item.name,
    item.color,
    item.notes
  ];

  return tokens.every(token =>
    fields.some(field => fuzzyMatch(field, token))
  );
}

function categoryMatchesKeyword(categoryName, keyword) {
  const category = compactText(categoryName);
  const query = compactText(keyword);
  if (!category || !query) return false;
  if (category === query || category.indexOf(query) >= 0 || query.indexOf(category) >= 0) {
    return true;
  }

  const tokens = keywordTokens(keyword);
  return tokens.length > 0 && tokens.every(token => fuzzyMatch(categoryName, token));
}

function findMatchingCategoryIndex(cats, keyword) {
  const query = compactText(keyword);
  if (!query) return -1;

  let fuzzyIndex = -1;
  for (let index = 0; index < cats.length; index += 1) {
    const cat = cats[index];
    const category = compactText(cat);
    if (!category) continue;
    if (category === query || category.indexOf(query) >= 0 || query.indexOf(category) >= 0) {
      return index;
    }
    if (fuzzyIndex < 0 && categoryMatchesKeyword(cat, keyword)) {
      fuzzyIndex = index;
    }
  }
  return fuzzyIndex;
}

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

  normalizeItems(items) {
    return (items || [])
      .map((item, index) => ({
        ...decorateItemStatus(item),
        url: getDisplayImage(item.url),
        displayUrl: getListImage(item),
        sort_order: itemOrder(item, index)
      }))
      .sort((left, right) => left.sort_order - right.sort_order);
  },

  mergeItems(baseItems, nextItems) {
    const map = {};
    const result = [];

    (baseItems || []).forEach(item => {
      if (!item || !item._id || map[item._id]) return;
      map[item._id] = true;
      result.push(item);
    });

    (nextItems || []).forEach(item => {
      if (!item || !item._id) return;
      if (map[item._id]) {
        for (let index = 0; index < result.length; index += 1) {
          if (result[index]._id === item._id) {
            result[index] = item;
            break;
          }
        }
        return;
      }
      map[item._id] = true;
      result.push(item);
    });

    return this.normalizeItems(result);
  },

  isCurrentItemFetch(fetchSeq) {
    return this._itemsFetchSeq === fetchSeq && !!this.data.wardrobeId;
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
    const items = this.normalizeItems(payload.items || []);
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
      allItemsLoaded: options.allItemsLoaded !== false,
      loadingMoreItems: !!options.loadingMoreItems
    }, () => {
      this.refreshSelectedItems();
      this.buildGrouped(cats, items, { resetActive: options.resetActive !== false });
    });
  },

  cacheWardrobePayload(payload) {
    if (!this.data.wardrobeId) return;
    const wardrobe = payload.wardrobe || {};
    const sourceUpdatedAt = wardrobe.updatedAt || wardrobe.selectedUpdatedAt || wardrobe.createTime || "";
    setCache("wardrobe-index", this.getWardrobeCacheId(), {
      ...payload,
      sourceUpdatedAt
    }, { sourceUpdatedAt });
    removeCache("wardrobe-index", this.data.wardrobeId);
    this.cacheCategoryPayloads(payload.items || []);
  },

  cacheCategoryPayloads(items) {
    const user = getVerifiedUser();
    const openid = user && user.openid ? user.openid : "";
    const groups = {};
    (items || []).forEach(item => {
      const category = item.category || "";
      if (!category) return;
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });
    Object.keys(groups).forEach(category => {
      const sourceUpdatedAt = groups[category]
        .map(item => item.updatedAt || item.statusUpdatedAt || item.createTime || "")
        .join("|");
      setCache("category-items", [openid, this.data.wardrobeId, category].join(":"), {
        items: groups[category],
        sourceUpdatedAt
      }, { sourceUpdatedAt });
    });
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

  cacheCurrentWardrobeState(wardrobeOverrides = {}) {
    if (!this.data.wardrobeId) return;
    const cached = getCache("wardrobe-index", this.getWardrobeCacheId()) || {};
    const cachedWardrobe = this._wardrobeForCache || cached.wardrobe || {};
    const cachedItems = cached.items || [];
    const itemsForCache = this.data.allItemsLoaded
      ? this.data.allItems
      : cachedItems;
    this.cacheWardrobePayload({
      wardrobe: {
        ...cachedWardrobe,
        name: this.data.wardrobeName,
        desc: this.data.about.desc,
        createTime: this.data.about.createdAt,
        plans: this.data.plans,
        tasks: this.data.tasks,
        selectedItemIds: this.data.selectedItemIds,
        selectedUpdatedText: this.data.selectedUpdatedText,
        ...wardrobeOverrides
      },
      categories: this.data.categoryNames,
      items: itemsForCache
    });
  },

  cacheManagePreview() {
    if (!this.data.wardrobeId) return;
    const cached = getCache("wardrobe-index", this.getWardrobeCacheId()) || {};
    const cachedWardrobe = this._wardrobeForCache || cached.wardrobe || {};
    const counts = {};
    this.data.categoryNames.forEach(name => {
      counts[name] = 0;
    });

    const sourceItems = this.data.allItemsLoaded
      ? this.data.allItems
      : (cached.items && cached.items.length > 0 ? cached.items : this.data.allItems);
    (sourceItems || []).forEach(item => {
      if (!item || !item.category) return;
      counts[item.category] = (counts[item.category] || 0) + 1;
    });

    const categories = this.data.categoryNames.map((name, index) => ({
      name,
      count: counts[name] || 0,
      sort_order: index
    }));
    const totalItems = Object.keys(counts).reduce((sum, name) => sum + counts[name], 0);
    setCache("manage-preview", this.getWardrobeCacheId(), {
      wardrobe: {
        ...cachedWardrobe,
        _id: this.data.wardrobeId,
        name: this.data.wardrobeName,
        desc: this.data.about.desc,
        createTime: this.data.about.createdAt,
        plans: this.data.plans,
        tasks: this.data.tasks,
        selectedItemIds: this.data.selectedItemIds,
        selectedUpdatedText: this.data.selectedUpdatedText
      },
      categories,
      totalItems
    });
  },

  cacheAddPreview() {
    if (!this.data.wardrobeId) return;
    setCache("wardrobe-categories", this.getWardrobeCacheId(), {
      categories: this.data.categoryNames
    });
  },

  applyItemMutationFromChild(change) {
    if (!change || !change.type) return;
    let categoryNames = this.data.categoryNames.slice();
    let allItems = this.data.allItems.slice();
    let selectedItemIds = this.data.selectedItemIds.slice();

    if (change.type === "create" && change.item) {
      if (change.item.category && categoryNames.indexOf(change.item.category) < 0) {
        categoryNames.push(change.item.category);
      }
      allItems = upsertItem(allItems, change.item);
    }

    if (change.type === "update" && change.item) {
      if (change.item.category && categoryNames.indexOf(change.item.category) < 0) {
        categoryNames.push(change.item.category);
      }
      allItems = upsertItem(allItems, change.item);
      if (change.selectedItemIds) {
        selectedItemIds = change.selectedItemIds;
      }
    }

    if (change.type === "delete") {
      const itemId = change.itemId || change.item && change.item._id;
      allItems = removeItem(allItems, itemId);
      selectedItemIds = change.selectedItemIds || selectedItemIds.filter(id => id !== itemId);
    }

    const normalizedItems = this.normalizeItems(allItems);
    this.setData({
      categoryNames,
      allItems: normalizedItems,
      selectedItemIds
    }, () => {
      this.refreshSelectedItems();
      this.buildGrouped(categoryNames, normalizedItems, { resetActive: false });
      this.cacheCurrentWardrobeState({ selectedItemIds });
    });
  },

  async fetchWardrobeInfo(wardrobeId) {
    try {
      const res = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
      if (!this.canUseWardrobe(res.data)) return;
      this._wardrobeForCache = res.data;
      this.setData({
        wardrobeName: res.data.name || "我的衣柜",
        "about.desc": res.data.desc || "一个可爱的个人衣柜",
        "about.createdAt": res.data.createTime || "",
        plans: res.data.plans || [],
        tasks: res.data.tasks || [],
        selectedItemIds: res.data.selectedItemIds || [],
        selectedUpdatedText: res.data.selectedUpdatedText || ""
      }, () => {
        this.refreshSelectedItems();
      });
    } catch (err) {
      console.error(err);
    }
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


  async fetchCategoryFirstItems(category) {
    if (!category) return [];
    const res = await db.collection("wardrobe_items")
      .where({
        wardrobeId: this.data.wardrobeId,
        category
      })
      .orderBy("sort_order", "asc")
      .limit(FIRST_SCREEN_ITEM_LIMIT)
      .get();
    return res.data || [];
  },

  async fetchItemsByIds(ids) {
    const cleanIds = [];
    (ids || []).forEach(id => {
      if (id && cleanIds.indexOf(id) === -1) cleanIds.push(id);
    });
    if (cleanIds.length === 0) return [];

    const results = await Promise.all(cleanIds.map(id =>
      db.collection("wardrobe_items").doc(id).get()
        .then(res => res.data)
        .catch(() => null)
    ));
    return results.filter(item =>
      item && item.wardrobeId === this.data.wardrobeId
    );
  },

  async fetchPriorityItems(cats, wardrobe) {
    const firstCategory = cats[this.data.activeCat] || cats[0] || "";
    const selectedIds = wardrobe.selectedItemIds || [];
    const results = await Promise.all([
      this.fetchCategoryFirstItems(firstCategory),
      this.fetchItemsByIds(selectedIds)
    ]);
    return this.mergeItems(results[0], results[1]);
  },

  async fetchWardrobeSnapshot() {
    try {
      const activeCategory = this.data.categoryNames[this.data.activeCat] || "";
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "getWardrobeSnapshot",
          wardrobeId: this.data.wardrobeId,
          mode: "index",
          firstCategory: activeCategory,
          firstLimit: FIRST_SCREEN_ITEM_LIMIT,
          adminPassword: getAdminPasswordForCloud()
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

  applyProgressItems(items, options = {}) {
    const normalizedItems = this.normalizeItems(items || []);
    this.setData({
      allItems: normalizedItems,
      allItemsLoaded: !!options.allItemsLoaded,
      loadingMoreItems: false
    }, () => {
      this.refreshSelectedItems();
      this.buildGrouped(this.data.categoryNames, normalizedItems, {
        resetActive: !!options.resetActive
      });
    });
  },

  // ??????????? ON_DEMAND_PAGE_SIZE ????????? <= ON_DEMAND_TRIGGER_REMAINING?
  // ?????? <= ?????????????? allItemsLoaded?????????
  async fetchItemsPage(wardrobeId, skip, limit) {
    if (isAdminModeActive()) {
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "getWardrobeItemsPage",
          wardrobeId,
          skip,
          limit,
          adminPassword: getAdminPasswordForCloud()
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const err = new Error(result.code || "ITEM_PAGE_UNAVAILABLE");
        err.code = result.code || "ITEM_PAGE_UNAVAILABLE";
        throw err;
      }
      return result.items || [];
    }

    const res = await db.collection("wardrobe_items")
      .where({ wardrobeId })
      .skip(skip)
      .limit(limit)
      .orderBy("sort_order", "asc")
      .get();
    return res.data || [];
  },

  async loadNextItemPage() {
    const wardrobeId = this.data.wardrobeId;
    if (!wardrobeId || this.data.allItemsLoaded || this.data.loadingMoreItems) return;

    const total = this.data.totalItems || 0;
    const loadedCount = (this.data.allItems || []).length;
    if (total > 0 && loadedCount >= total) {
      if (!this.data.allItemsLoaded) {
        this.setData({ allItemsLoaded: true, loadingMoreItems: false });
      }
      return;
    }

    const fetchSeq = this._itemsFetchSeq;
    this.setData({ loadingMoreItems: true });

    try {
      const skip = loadedCount;
      const limit = ON_DEMAND_PAGE_SIZE;
      const pageItems = await this.fetchItemsPage(wardrobeId, skip, limit);
      const mergedItems = this.mergeItems(this.data.allItems, pageItems);
      const newLoadedCount = mergedItems.length;
      const reachedEnd = pageItems.length < limit || (total > 0 && newLoadedCount >= total);

      if (!this.isCurrentItemFetch(fetchSeq) || wardrobeId !== this.data.wardrobeId) {
        this.setData({ loadingMoreItems: false });
        return;
      }

      this.applyProgressItems(mergedItems, {
        allItemsLoaded: reachedEnd,
        resetActive: false
      });
      this.setData({ loadingMoreItems: false });

      if (reachedEnd) {
        const cachedSource = {
          wardrobe: this._wardrobeForCache || {},
          categories: this.data.categoryNames,
          items: mergedItems
        };
        this.cacheWardrobePayload(cachedSource);
      }
    } catch (err) {
      console.error("on-demand item load failed", err);
      if (this.isCurrentItemFetch(fetchSeq)) {
        this.setData({ loadingMoreItems: false });
      }
    }
  },


  async fetchData(options = {}) {
    if (!getVerifiedUser()) return;
    const fetchSeq = (this._itemsFetchSeq || 0) + 1;
    this._itemsFetchSeq = fetchSeq;
    const hadContent = this.hasWardrobeContent();
    const shouldShowLoading = !options.silent && !hadContent;
    let shouldRedirectHome = false;
    if (shouldShowLoading) wx.showLoading({ title: "加载中", mask: true });
    try {
      const snapshot = await this.fetchWardrobeSnapshot();
      if (snapshot) {
        const cats = snapshot.categoryNames ||
          (snapshot.categories || []).map(category => category.name).filter(name => !!name);
        const snapshotItems = snapshot.items || [];
        const initialItems = hadContent
          ? this.mergeItems(this.data.allItems, snapshotItems)
          : snapshotItems;
        const totalItems = typeof snapshot.totalItems === "number" ? snapshot.totalItems : 0;
        // ??????? <= ?????????????????????????
        const allItemsLoaded = snapshot.allItemsLoaded === true || totalItems <= ON_DEMAND_PAGE_SIZE;
        const payload = {
          wardrobe: snapshot.wardrobe,
          categories: cats,
          items: initialItems,
          totalItems
        };

        if (!this.isCurrentItemFetch(fetchSeq)) return;
        this.applyWardrobePayload(payload, {
          resetActive: !hadContent && !options.silent,
          allItemsLoaded,
          loadingMoreItems: false
        });
        if (allItemsLoaded) {
          this.cacheWardrobePayload(payload);
        }
        return;
      }

      const hubRes = await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).get();
      if (!this.canUseWardrobe(hubRes.data, { deferRedirect: true })) return;
      const catRes = await db.collection("wardrobe_categories")
        .where({ wardrobeId: this.data.wardrobeId })
        .orderBy("sort_order", "asc")
        .get();

      let cats = catRes.data.map(cat => cat.name);
      if (cats.length === 0) cats = ["上衣", "下装", "连衣裙", "鞋子", "配饰"];

      const payload = {
        wardrobe: hubRes.data,
        categories: cats,
        items: hadContent ? this.data.allItems : []
      };

      if (hadContent) {
        this.applyWardrobePayload(payload, {
          resetActive: false,
          allItemsLoaded: false,
          loadingMoreItems: false
        });
        return;
      }

      const priorityItems = await this.fetchPriorityItems(cats, hubRes.data);
      if (!this.isCurrentItemFetch(fetchSeq)) return;
      const priorityPayload = {
        ...payload,
        items: priorityItems
      };
      this.applyWardrobePayload(priorityPayload, {
        resetActive: !options.silent,
        allItemsLoaded: false,
        loadingMoreItems: false
      });
    } catch (err) {
      console.error(err);
      if (err && err.code === "FORBIDDEN") {
        wx.showToast({ title: "无权访问这个衣柜", icon: "none" });
        shouldRedirectHome = true;
      } else if (!options.silent) {
        wx.showToast({ title: "加载失败", icon: "none" });
      }
    } finally {
      if (shouldShowLoading) wx.hideLoading();
    }
    if (shouldRedirectHome) {
      wx.reLaunch({ url: "/pages/home/home" });
    }
  },

  getVisibleCategories(cats, items) {
    const names = [];
    const seen = new Set();
    (cats || []).forEach(cat => {
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        names.push(cat);
      }
    });
    (items || []).forEach(item => {
      const category = item && item.category;
      if (category && !seen.has(category)) {
        seen.add(category);
        names.push(category);
      }
    });
    return names;
  },

  buildGrouped(cats, items, options = {}) {
    const keyword = typeof options.keyword === "string"
      ? options.keyword
      : this.data.searchKeyword;
    const isSearching = normalizeText(keyword).length > 0;
    const selectedMap = this.makeSelectedMap(this.data.selectedItemIds);
    const visibleCats = this.getVisibleCategories(cats, items);
    const matchedCategoryIndex = findMatchingCategoryIndex(visibleCats, keyword);
    const isCategorySearch = isSearching && matchedCategoryIndex >= 0;
    const filtered = isCategorySearch
      ? items
      : isSearching
      ? items.filter(item => itemMatchesKeyword(item, keyword))
      : items;

    const groupedMap = new Map();
    visibleCats.forEach(cat => {
      groupedMap.set(cat, []);
    });
    filtered.forEach(item => {
      const bucket = groupedMap.get(item.category);
      if (bucket) bucket.push(item);
    });

    const grouped = visibleCats.map((cat, index) => {
      const catItems = (groupedMap.get(cat) || [])
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((item, itemIndex) => {
          const statusItem = decorateItemStatus(item);
          const selected = !!selectedMap[item._id] && !statusItem.isInUse;
          return {
            ...statusItem,
            display_rank: itemIndex + 1,
            selected,
            selectText: statusItem.isInUse ? "?????" : selected ? "OK" : "+",
            canSelect: !statusItem.isInUse,
            cls: clothRowClass(selected, false, false, statusItem.wearStatus)
          };
        });

      return {
        id: "cat" + index,
        name: cat,
        items: catItems
      };
    });
    const firstMatchedGroupIndex = grouped.findIndex(group => group.items.length > 0);

    const nextData = {
      groupedItems: grouped,
      count: filtered.length,
      searchResultText: isCategorySearch
        ? "?????" + visibleCats[matchedCategoryIndex]
        : isSearching
        ? "?????" + filtered.length + " ??"
        : "",
      searchMode: isCategorySearch ? "category" : isSearching ? "item" : "",
      searchTargetCategory: isCategorySearch ? visibleCats[matchedCategoryIndex] : ""
    };

    let focusIndex = -1;
    let focusGroupId = "";
    if (options.resetActive) {
      const activeIndex = isCategorySearch
        ? matchedCategoryIndex
        : isSearching && firstMatchedGroupIndex >= 0
        ? firstMatchedGroupIndex
        : 0;
      const activeGroup = grouped[activeIndex];
      focusIndex = activeGroup ? activeIndex : -1;
      focusGroupId = activeGroup ? activeGroup.id : "";
      nextData.activeCat = activeIndex;
      nextData.sideScrollIntoView = "side-cat-" + activeIndex;
      nextData.scrollIntoView = "";
    }

    this.setData(nextData, () => {
      if (focusIndex >= 0 && focusGroupId) {
        this.focusCategory(focusIndex, focusGroupId);
      } else {
        this.scheduleSectionMeasure();
      }
    });
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

  // ????????????????
  maybeTriggerOnDemandLoad(scrollHeight, scrollTop) {
    if (this.data.allItemsLoaded || this.data.loadingMoreItems) return false;
    if (!this.data.wardrobeId) return false;

    const total = this.data.totalItems || 0;
    const loadedCount = (this.data.allItems || []).length;
    if (total > 0 && loadedCount >= total) return false;

    if (scrollHeight > 0) {
      const clientHeight = this._itemListClientHeight || 0;
      const approxItemHeight = 120;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      return distanceToBottom <= approxItemHeight * ON_DEMAND_TRIGGER_REMAINING;
    }

    // ???? scrollHeight ???????
    if (total > 0) {
      return total - loadedCount <= ON_DEMAND_TRIGGER_REMAINING;
    }
    return false;
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
    return groupedItems.map(group => {
      if (group.name !== dragCategory) return group;
      let changed = false;
      const items = group.items.map((cloth, itemIndex) => {
        const nextCls = clothRowClass(
          !!cloth.selected,
          itemIndex === dragIndex,
          itemIndex === overIndex && itemIndex !== dragIndex,
          cloth.wearStatus
        );
        if (nextCls === cloth.cls) return cloth;
        changed = true;
        return {
          ...cloth,
          cls: nextCls
        };
      });
      if (!changed) return group;
      return {
        ...group,
        items
      };
    });
  },

  cacheDragBounds(groupIndex) {
    return new Promise(resolve => {
      wx.createSelectorQuery().in(this)
        .selectAll(".index-drag-row-" + groupIndex)
        .boundingClientRect(rects => {
          const rows = (rects || []).filter(rect => !!rect);
          if (rows.length > 0) {
            const firstRow = rows[0];
            const lastRow = rows[rows.length - 1];
            const step = rows.length > 1
              ? Math.max(1, rows[1].top - firstRow.top)
              : Math.max(1, firstRow.height);

            this._dragListTop = firstRow.top;
            this._dragListBottom = lastRow.top + step;
            this._dragItemHeight = step;
            this.setData({
              floatLeft: firstRow.left,
              floatWidth: firstRow.width
            });
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
    const minTop = this._dragListTop;
    const maxTop = this._dragListBottom - this._dragItemHeight;
    return Math.max(minTop, Math.min(touchY - this._dragTouchOffset, maxTop));
  },

  getOverIndex(floatTop, itemCount) {
    const centerY = floatTop + this._dragItemHeight / 2;
    const rawIndex = Math.floor((centerY - this._dragListTop) / this._dragItemHeight);
    return Math.min(itemCount - 1, Math.max(0, rawIndex));
  },

  onDragTouchStart(e) {
    this._lastTouchY = this.getTouchY(e);
  },

  async onDragStart(e) {
    if (this.data.isDragging) return;
    this._suppressTap = true;
    setTimeout(() => {
      if (!this.data.isDragging) this._suppressTap = false;
    }, 350);

    if (normalizeText(this.data.searchKeyword)) {
      wx.showToast({ title: "搜索时先退出再排序", icon: "none" });
      return;
    }
    if (!this.data.allItemsLoaded) {
      wx.showToast({ title: "衣服同步中，稍后再排", icon: "none" });
      return;
    }

    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const index = Number(e.currentTarget.dataset.index);
    const group = this.data.groupedItems[groupIndex];
    if (!group || Number.isNaN(index) || group.items.length <= 1) return;

    await this.cacheDragBounds(groupIndex);
    const itemTop = this._dragListTop + index * this._dragItemHeight;
    const touchY = this.getTouchY(e) || itemTop + this._dragItemHeight / 2;
    this._lastTouchY = touchY;
    this._dragTouchOffset = Math.max(
      8,
      Math.min(touchY - itemTop, this._dragItemHeight - 8)
    );
    this._overIndex = index;

    this.setData({
      groupedItems: this.applyDragClasses(this.data.groupedItems, group.name, index, index),
      isDragging: true,
      dragCategory: group.name,
      dragCategoryIndex: groupIndex,
      dragIndex: index,
      floatY: itemTop,
      floatItem: group.items[index],
      floatRank: index + 1,
      showPickPanel: false
    });
  },

  onDragMove(e) {
    if (!this.data.isDragging || !e.touches || e.touches.length === 0) return;

    const touchY = this.getTouchY(e);
    const group = this.data.groupedItems[this.data.dragCategoryIndex];
    if (!group) return;

    this._lastTouchY = touchY;
    const floatTop = this.clampDragTop(touchY);
    const overIndex = this.getOverIndex(floatTop, group.items.length);

    if (overIndex !== this._overIndex) {
      this._overIndex = overIndex;
      this.setData({
        groupedItems: this.applyDragClasses(
          this.data.groupedItems,
          this.data.dragCategory,
          this.data.dragIndex,
          overIndex
        ),
        floatY: floatTop,
        floatRank: overIndex + 1
      });
      return;
    }

    this.setData({ floatY: floatTop });
  },

  async onDragEnd() {
    if (!this.data.isDragging) return;

    const fromIndex = this.data.dragIndex;
    const toIndex = this._overIndex >= 0 ? this._overIndex : fromIndex;
    const dragCategory = this.data.dragCategory;
    const resetData = {
      isDragging: false,
      dragCategory: "",
      dragCategoryIndex: -1,
      dragIndex: -1,
      floatItem: null,
      floatRank: 1
    };

    this._overIndex = -1;
    this._suppressTap = true;
    setTimeout(() => {
      this._suppressTap = false;
    }, 350);

    if (fromIndex === toIndex) {
      this.setData({
        ...resetData,
        groupedItems: this.applyDragClasses(this.data.groupedItems, "", -1, -1)
      }, () => {
        this.scheduleSectionMeasure();
      });
      return;
    }

    const categoryItems = this.data.allItems
      .filter(item => item.category === dragCategory)
      .sort((left, right) => left.sort_order - right.sort_order);
    const movedItem = categoryItems.splice(fromIndex, 1)[0];
    if (!movedItem) {
      this.setData(resetData);
      return;
    }
    categoryItems.splice(toIndex, 0, movedItem);

    const orderedItems = categoryItems.map((item, index) => ({
      ...item,
      sort_order: index
    }));
    const orderMap = {};
    orderedItems.forEach(item => {
      orderMap[item._id] = item.sort_order;
    });

    const nextAllItems = this.data.allItems.map(item => {
      if (typeof orderMap[item._id] !== "number") return item;
      return {
        ...item,
        sort_order: orderMap[item._id]
      };
    });

    this.setData({
      ...resetData,
      allItems: nextAllItems
    }, () => {
      this.refreshSelectedItems();
      this.buildGrouped(this.data.categoryNames, nextAllItems);
      this.cacheCurrentWardrobeState();
    });

    const saved = await this.saveItemOrder(orderedItems);
    if (saved) wx.showToast({ title: "排序已保存", icon: "success", duration: 800 });
  },

  async saveItemOrder(items) {
    try {
      const category = items && items[0] ? items[0].category : "";
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "saveItemOrder",
          wardrobeId: this.data.wardrobeId,
          category,
          itemIds: (items || []).map(item => item._id)
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const orderErr = new Error(result.code || "WRITE_UNAVAILABLE");
        orderErr.code = result.code || "WRITE_UNAVAILABLE";
        throw orderErr;
      }
      return true;
    } catch (err) {
      console.error("save index item order failed", err);
      this.showWriteError(err, "排序保存失败");
      return false;
    }
  },

  findItemById(itemId) {
    const item = this.data.allItems.find(cloth => cloth._id === itemId);
    return item ? decorateItemStatus(item) : null;
  },

  showWriteError(err, fallback) {
    if (err && err.code === "FORBIDDEN") {
      wx.showToast({ title: "无权操作这个衣柜", icon: "none" });
    } else if (err && err.code === "ITEM_NOT_FOUND") {
      wx.showToast({ title: "衣服不存在", icon: "none" });
    } else if (err && err.code === "ITEM_IN_USE") {
      wx.showToast({ title: "这件正在使用中", icon: "none" });
    } else if (isMissingFunctionError(err) || (err && err.code === "WRITE_UNAVAILABLE")) {
      wx.showToast({ title: "请重新部署云函数", icon: "none" });
    } else {
      wx.showToast({ title: fallback, icon: "none" });
    }
  },

  openItemPanel(e) {
    if (this.data.isDragging || this._suppressTap) return;

    const itemId = e.currentTarget.dataset.id;
    const item = this.findItemById(itemId);
    if (!item) return;

    this.setData({
      panelItem: item,
      showItemPanel: true,
      showPickPanel: false
    });
  },

  closeItemPanel() {
    this.setData({
      showItemPanel: false,
      panelItem: null
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
        "&from=index"
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
      const selectedUpdatedText = this.formatNow();
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "updateItemStatus",
          wardrobeId: this.data.wardrobeId,
          itemId,
          status: wearStatus,
          selectedUpdatedText
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const statusErr = new Error(result.code || "WRITE_UNAVAILABLE");
        statusErr.code = result.code || "WRITE_UNAVAILABLE";
        throw statusErr;
      }

      const nextAllItems = this.data.allItems.map(item =>
        item._id === itemId ? decorateItemStatus({ ...item, wearStatus }) : item
      );
      const nextPanelItem = this.data.panelItem && this.data.panelItem._id === itemId
        ? decorateItemStatus({ ...this.data.panelItem, wearStatus })
        : this.data.panelItem;
      const selectedIds = wearStatus === STATUS_IN_USE
        ? result.selectedItemIds || this.data.selectedItemIds.filter(id => id !== itemId)
        : this.data.selectedItemIds;
      const selectionChanged = selectedIds.length !== this.data.selectedItemIds.length;

      this.setData({
        allItems: nextAllItems,
        panelItem: nextPanelItem,
        selectedUpdatedText: selectionChanged ? selectedUpdatedText : this.data.selectedUpdatedText
      }, () => {
        if (selectionChanged) {
          this.setSelection(selectedIds, false);
        } else {
          this.refreshSelectedItems();
          this.buildGrouped(this.data.categoryNames, nextAllItems);
          this.cacheCurrentWardrobeState();
        }
      });

      wx.hideLoading();
      wx.showToast({ title: "已标记为" + nextPanelItem.wearStatusText, icon: "success", duration: 900 });
    } catch (err) {
      console.error("update item status failed", err);
      wx.hideLoading();
      this.showWriteError(err, "状态更新失败");
    }
  },

  toggleSearch() {
    const showSearch = !this.data.showSearch;
    this.setData({
      showSearch,
      searchKeyword: "",
      searchResultText: "",
      searchMode: "",
      searchTargetCategory: ""
    }, () => {
      this.buildGrouped(this.data.categoryNames, this.data.allItems, { resetActive: true });
    });
  },

  onSearch(e) {
    const keyword = e.detail.value || "";
    this.setData({ searchKeyword: keyword });
    this.buildGrouped(this.data.categoryNames, this.data.allItems, {
      keyword,
      resetActive: true
    });
  },

  clearSearch() {
    this.setData({
      searchKeyword: "",
      searchResultText: "",
      searchMode: "",
      searchTargetCategory: ""
    }, () => {
      this.buildGrouped(this.data.categoryNames, this.data.allItems, { resetActive: true });
    });
  },

  makeSelectedMap(ids) {
    const map = {};
    ids.forEach(id => {
      map[id] = true;
    });
    return map;
  },

  refreshSelectedItems() {
    const itemMap = {};
    this.data.allItems.forEach(item => {
      itemMap[item._id] = item;
    });

    const selectedItems = [];
    this.data.selectedItemIds.forEach(id => {
      const item = itemMap[id];
      if (!item) return;
      const statusItem = decorateItemStatus(item);
      if (statusItem.isInUse) return;
      selectedItems.push({
        ...statusItem,
        selected_rank: selectedItems.length + 1
      });
    });
    const selectedItemIds = this.data.allItemsLoaded
      ? selectedItems.map(item => item._id)
      : this.data.selectedItemIds;

    this.setData({
      selectedItemIds,
      selectedItems,
      pickPackagePreview: selectedItems.slice(0, 3),
      storedSelectedCount: selectedItems.filter(item => item.isStored).length,
      taskBadgeCount: this.calcTaskBadgeCount(this.data.tasks, selectedItems, selectedItemIds)
    });
  },

  calcTaskBadgeCount(tasks, selectedItems, selectedItemIds) {
    const hasPackage = (selectedItems && selectedItems.length > 0) ||
      (selectedItemIds && selectedItemIds.length > 0);
    const packageCount = hasPackage ? 1 : 0;
    return (tasks || []).length + packageCount;
  },

  setSelection(ids, shouldSave) {
    const cleanIds = [];
    ids.forEach(id => {
      if (id && cleanIds.indexOf(id) === -1) cleanIds.push(id);
    });

    this.setData({ selectedItemIds: cleanIds }, () => {
      this.refreshSelectedItems();
      this.buildGrouped(this.data.categoryNames, this.data.allItems);
      this.cacheCurrentWardrobeState({ selectedItemIds: cleanIds });
    });

    if (shouldSave) this.saveSelectedItems(cleanIds);
  },

  async saveItemSelection(itemId, selected, rollbackIds) {
    const selectedUpdatedText = this.formatNow();
    try {
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "setItemSelection",
          wardrobeId: this.data.wardrobeId,
          itemId,
          selected,
          selectedUpdatedText
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const selectErr = new Error(result.code || "WRITE_UNAVAILABLE");
        selectErr.code = result.code || "WRITE_UNAVAILABLE";
        throw selectErr;
      }
      const selectedItemIds = result.selectedItemIds || [];
      this.setData({ selectedItemIds, selectedUpdatedText }, () => {
        this.refreshSelectedItems();
        this.buildGrouped(this.data.categoryNames, this.data.allItems);
        this.cacheCurrentWardrobeState({ selectedItemIds, selectedUpdatedText });
      });
      return true;
    } catch (err) {
      console.error(err);
      this.setSelection(rollbackIds || [], false);
      this.showWriteError(err, "保存失败");
      return false;
    }
  },

  toggleClothSelection(e) {
    if (this.data.isDragging || this._suppressTap) return;

    const itemId = e.currentTarget.dataset.id;
    if (!itemId) return;
    const item = this.findItemById(itemId);
    if (item && item.isInUse) {
      wx.showToast({ title: "这件正在使用中", icon: "none", duration: 900 });
      return;
    }

    const oldIds = this.data.selectedItemIds.slice();
    const ids = this.data.selectedItemIds.slice();
    const index = ids.indexOf(itemId);
    const selected = index < 0;
    if (index >= 0) {
      ids.splice(index, 1);
      wx.showToast({ title: "已取消选择", icon: "none", duration: 700 });
    } else {
      ids.push(itemId);
      wx.showToast({ title: "已加入清单", icon: "none", duration: 700 });
    }

    this.setSelection(ids, false);
    this.saveItemSelection(itemId, selected, oldIds);
  },

  removeSelectedItem(e) {
    const itemId = e.currentTarget.dataset.id;
    const oldIds = this.data.selectedItemIds.slice();
    const ids = this.data.selectedItemIds.filter(id => id !== itemId);
    this.setSelection(ids, false);
    this.saveItemSelection(itemId, false, oldIds);
  },

  openPickPanel() {
    this.setData({ showPickPanel: true });
  },

  closePickPanel() {
    this.setData({ showPickPanel: false });
  },

  noop() {},

  clearSelection() {
    wx.showModal({
      title: "清空清单",
      content: "确定清空已经选择的衣服吗？",
      confirmText: "清空",
      confirmColor: "#FF8FAB",
      success: (res) => {
        if (!res.confirm) return;
        this.setSelection([], true);
        this.setData({ showPickPanel: false });
      }
    });
  },

  async confirmSelection() {
    const ok = await this.saveSelectedItems(this.data.selectedItemIds);
    if (ok) wx.showToast({ title: "清单已保存", icon: "success" });
  },

  async saveSelectedItems(ids) {
    if (!this.data.wardrobeId) return;
    const selectedUpdatedText = this.formatNow();
    try {
      const callRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "saveSelectedItems",
          wardrobeId: this.data.wardrobeId,
          selectedItemIds: ids,
          selectedUpdatedText
        }
      });
      const result = callRes.result || {};
      if (!result.success) {
        const saveErr = new Error(result.code || "WRITE_UNAVAILABLE");
        saveErr.code = result.code || "WRITE_UNAVAILABLE";
        throw saveErr;
      }
      const savedIds = result.selectedItemIds || ids;
      this.setData({
        selectedItemIds: savedIds,
        selectedUpdatedText,
        taskBadgeCount: this.calcTaskBadgeCount(this.data.tasks, this.data.selectedItems)
      }, () => {
        this.refreshSelectedItems();
        this.buildGrouped(this.data.categoryNames, this.data.allItems);
        this.cacheCurrentWardrobeState({ selectedItemIds: savedIds, selectedUpdatedText });
      });
      return true;
    } catch (err) {
      console.error(err);
      this.showWriteError(err, "保存失败");
      return false;
    }
  },

  formatNow() {
    const date = new Date();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return month + "月" + day + "日 " + hour + ":" + minute;
  },

  onShareAppMessage() {
    return {
      title: this.data.wardrobeName + " - Kawaii Closet",
      path: "/pages/index/index?wardrobeId=" + this.data.wardrobeId
    };
  },

  togglePlanInput() {
    this.setData({ showPlanInput: !this.data.showPlanInput });
  },

  onPlanInput(e) {
    this.setData({ newPlanText: e.detail.value });
  },

  addPlan() {
    const text = this.data.newPlanText.trim();
    if (!text) return;
    const plans = this.data.plans.concat([{ text, done: false, id: Date.now() }]);
    this.setData({ plans, newPlanText: "", showPlanInput: false });
    this.saveMeta({ plans });
  },

  togglePlanDone(e) {
    const index = Number(e.currentTarget.dataset.index);
    const plans = this.data.plans.map((plan, planIndex) =>
      planIndex === index ? { ...plan, done: !plan.done } : plan
    );
    this.setData({ plans });
    this.saveMeta({ plans });
  },

  deletePlan(e) {
    const index = Number(e.currentTarget.dataset.index);
    const plans = this.data.plans.filter((_, planIndex) => planIndex !== index);
    this.setData({ plans });
    this.saveMeta({ plans });
  },

  toggleTaskInput() {
    this.setData({ showTaskInput: !this.data.showTaskInput });
  },

  onTaskInput(e) {
    this.setData({ newTaskText: e.detail.value });
  },

  addTask() {
    const text = this.data.newTaskText.trim();
    if (!text) return;
    const tasks = this.data.tasks.concat([{ text, done: false, id: Date.now() }]);
    this.setData({
      tasks,
      newTaskText: "",
      showTaskInput: false,
      taskBadgeCount: this.calcTaskBadgeCount(tasks, this.data.selectedItems)
    });
    this.saveMeta({ tasks });
  },

  toggleTaskDone(e) {
    const index = Number(e.currentTarget.dataset.index);
    const tasks = this.data.tasks.map((task, taskIndex) =>
      taskIndex === index ? { ...task, done: !task.done } : task
    );
    this.setData({
      tasks,
      taskBadgeCount: this.calcTaskBadgeCount(tasks, this.data.selectedItems)
    });
    this.saveMeta({ tasks });
  },

  deleteTask(e) {
    const index = Number(e.currentTarget.dataset.index);
    const tasks = this.data.tasks.filter((_, taskIndex) => taskIndex !== index);
    this.setData({
      tasks,
      taskBadgeCount: this.calcTaskBadgeCount(tasks, this.data.selectedItems)
    });
    this.saveMeta({ tasks });
  },

  async saveMeta(data) {
    if (!this.data.wardrobeId) return;
    this.cacheCurrentWardrobeState(data);
    try {
      await db.collection("wardrobe_hubs").doc(this.data.wardrobeId).update({ data });
    } catch (err) {
      console.error(err);
    }
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
