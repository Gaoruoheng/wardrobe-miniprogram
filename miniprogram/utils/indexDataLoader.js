const db = wx.cloud.database();
const { isMissingFunctionError } = require("./auth.js");
const {
  getAdminTokenForCloud,
  isAdminModeActive
} = require("./adminMode.js");
const {
  normalizeItems,
  mergeItems
} = require("./indexItemView.js");
const wardrobeIndexApi = require("../services/wardrobeIndexApi.js");

const FIRST_SCREEN_ITEM_LIMIT = 20;
const ON_DEMAND_PAGE_SIZE = 20;
const ON_DEMAND_TRIGGER_REMAINING = 10;

function isCurrentItemFetch(page, fetchSeq) {
  return page._itemsFetchSeq === fetchSeq && !!page.data.wardrobeId;
}

async function fetchWardrobeInfo(page, wardrobeId) {
  try {
    const res = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
    if (!page.canUseWardrobe(res.data)) return;
    page._wardrobeForCache = res.data;
    page.setData({
      wardrobeName: res.data.name || "我的衣柜",
      "about.desc": res.data.desc || "一个可爱的个人衣柜",
      "about.createdAt": res.data.createTime || "",
      plans: res.data.plans || [],
      tasks: res.data.tasks || [],
      selectedItemIds: res.data.selectedItemIds || [],
      selectedUpdatedText: res.data.selectedUpdatedText || ""
    }, () => {
      page.refreshSelectedItems();
    });
  } catch (err) {
    console.error(err);
  }
}

async function fetchPriorityItems(page, cats, wardrobe) {
  const firstCategory = cats[page.data.activeCat] || cats[0] || "";
  const selectedIds = wardrobe.selectedItemIds || [];
  const results = await Promise.all([
    wardrobeIndexApi.fetchCategoryFirstItems(page.data.wardrobeId, firstCategory, FIRST_SCREEN_ITEM_LIMIT),
    wardrobeIndexApi.fetchItemsByIds(page.data.wardrobeId, selectedIds)
  ]);
  return mergeItems(results[0], results[1]);
}

async function fetchWardrobeSnapshot(page) {
  try {
    const activeCategory = page.data.categoryNames[page.data.activeCat] || "";
    return await wardrobeIndexApi.fetchWardrobeSnapshot({
      wardrobeId: page.data.wardrobeId,
      firstCategory: activeCategory,
      firstLimit: FIRST_SCREEN_ITEM_LIMIT,
      adminToken: getAdminTokenForCloud()
    });
  } catch (err) {
    if (isMissingFunctionError(err) || (err && err.code === "SNAPSHOT_UNAVAILABLE")) {
      return null;
    }
    throw err;
  }
}

function applyProgressItems(page, items, options = {}) {
  const normalizedItems = normalizeItems(items || []);
  page.setData({
    allItems: normalizedItems,
    allItemsLoaded: !!options.allItemsLoaded,
    loadingMoreItems: false,
    itemsPageCursor: options.nextCursor || null
  }, () => {
    page.refreshSelectedItems();
    page.buildGrouped(page.data.categoryNames, normalizedItems, {
      resetActive: !!options.resetActive
    });
  });
}

async function fetchItemsPage(page, wardrobeId, cursor, limit) {
  if (isAdminModeActive()) {
    return await wardrobeIndexApi.fetchAdminItemsPage({
      wardrobeId,
      cursor,
      limit,
      adminToken: getAdminTokenForCloud()
    });
  }
  return await wardrobeIndexApi.fetchItemsPage(wardrobeId, cursor, limit);
}

async function loadNextItemPage(page) {
  const wardrobeId = page.data.wardrobeId;
  if (!wardrobeId || page.data.allItemsLoaded || page.data.loadingMoreItems) return;

  const total = page.data.totalItems || 0;
  const loadedCount = (page.data.allItems || []).length;
  if (total > 0 && loadedCount >= total) {
    if (!page.data.allItemsLoaded) {
      page.setData({ allItemsLoaded: true, loadingMoreItems: false });
    }
    return;
  }

  const fetchSeq = page._itemsFetchSeq;
  page.setData({ loadingMoreItems: true });

  try {
    const cursor = page.data.itemsPageCursor || null;
    const pageResult = await fetchItemsPage(page, wardrobeId, cursor, ON_DEMAND_PAGE_SIZE);
    const pageItems = pageResult.items || [];
    const mergedItems = mergeItems(page.data.allItems, pageItems);
    const newLoadedCount = mergedItems.length;
    const reachedEnd = pageResult.hasMore === false ||
      (total > 0 && newLoadedCount >= total);

    if (!isCurrentItemFetch(page, fetchSeq) || wardrobeId !== page.data.wardrobeId) {
      page.setData({ loadingMoreItems: false });
      return;
    }

    applyProgressItems(page, mergedItems, {
      allItemsLoaded: reachedEnd,
      resetActive: false,
      nextCursor: pageResult.nextCursor || null
    });
    page.setData({ loadingMoreItems: false });

    if (reachedEnd) {
      page.cacheWardrobePayload({
        wardrobe: page._wardrobeForCache || {},
        categories: page.data.categoryNames,
        items: mergedItems
      });
    }
  } catch (err) {
    console.error("on-demand item load failed", err);
    if (isCurrentItemFetch(page, fetchSeq)) {
      page.setData({ loadingMoreItems: false });
    }
  }
}

async function fetchData(page, options = {}) {
  const fetchSeq = (page._itemsFetchSeq || 0) + 1;
  page._itemsFetchSeq = fetchSeq;
  const hadContent = page.hasWardrobeContent();
  const shouldShowLoading = !options.silent && !hadContent;
  let shouldRedirectHome = false;

  if (shouldShowLoading) wx.showLoading({ title: "加载中", mask: true });
  try {
    const snapshot = await fetchWardrobeSnapshot(page);
    if (snapshot) {
      const cats = snapshot.categoryNames ||
        (snapshot.categories || []).map(category => category.name).filter(name => !!name);
      const snapshotItems = snapshot.items || [];
      const initialItems = hadContent
        ? mergeItems(page.data.allItems, snapshotItems)
        : snapshotItems;
      const totalItems = typeof snapshot.totalItems === "number" ? snapshot.totalItems : 0;
      const allItemsLoaded = snapshot.allItemsLoaded === true ||
        snapshot.hasMore === false ||
        totalItems <= snapshotItems.length;
      const payload = {
        wardrobe: snapshot.wardrobe,
        categories: cats,
        items: initialItems,
        totalItems,
        nextCursor: snapshot.nextCursor || null
      };

      if (!isCurrentItemFetch(page, fetchSeq)) return;
      page.applyWardrobePayload(payload, {
        resetActive: !hadContent && !options.silent,
        allItemsLoaded,
        loadingMoreItems: false
      });
      if (allItemsLoaded) {
        page.cacheWardrobePayload(payload);
      }
      return;
    }

    const hubRes = await db.collection("wardrobe_hubs").doc(page.data.wardrobeId).get();
    if (!page.canUseWardrobe(hubRes.data, { deferRedirect: true })) return;
    const catRes = await db.collection("wardrobe_categories")
      .where({ wardrobeId: page.data.wardrobeId })
      .orderBy("sort_order", "asc")
      .get();

    let cats = catRes.data.map(cat => cat.name);
    if (cats.length === 0) cats = ["上衣", "下装", "连衣裙", "鞋子", "配饰"];

    const payload = {
      wardrobe: hubRes.data,
      categories: cats,
      items: hadContent ? page.data.allItems : []
    };

    if (hadContent) {
      page.applyWardrobePayload(payload, {
        resetActive: false,
        allItemsLoaded: false,
        loadingMoreItems: false
      });
      return;
    }

    const priorityItems = await fetchPriorityItems(page, cats, hubRes.data);
    if (!isCurrentItemFetch(page, fetchSeq)) return;
    page.applyWardrobePayload({
      ...payload,
      items: priorityItems
    }, {
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
}

function maybeTriggerOnDemandLoad(page, scrollHeight, scrollTop) {
  if (page.data.allItemsLoaded || page.data.loadingMoreItems) return false;
  if (!page.data.wardrobeId) return false;

  const total = page.data.totalItems || 0;
  const loadedCount = (page.data.allItems || []).length;
  if (total > 0 && loadedCount >= total) return false;

  if (scrollHeight > 0) {
    const clientHeight = page._itemListClientHeight || 0;
    const approxItemHeight = 120;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    return distanceToBottom <= approxItemHeight * ON_DEMAND_TRIGGER_REMAINING;
  }

  if (total > 0) {
    return total - loadedCount <= ON_DEMAND_TRIGGER_REMAINING;
  }
  return false;
}

module.exports = {
  FIRST_SCREEN_ITEM_LIMIT,
  ON_DEMAND_PAGE_SIZE,
  ON_DEMAND_TRIGGER_REMAINING,
  isCurrentItemFetch,
  fetchWardrobeInfo,
  fetchPriorityItems,
  fetchWardrobeSnapshot,
  applyProgressItems,
  fetchItemsPage,
  loadNextItemPage,
  fetchData,
  maybeTriggerOnDemandLoad
};
