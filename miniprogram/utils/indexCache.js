const { getVerifiedUser } = require("./auth.js");
const { getCache, setCache, removeCache } = require("./pageCache.js");
const { removeItem, upsertItem } = require("./wardrobeCache.js");
const { normalizeItems } = require("./indexItemView.js");

function getItemCacheId(page, itemId) {
  const user = getVerifiedUser();
  return [
    user && user.openid ? user.openid : "",
    page.data.wardrobeId,
    itemId || ""
  ].join(":");
}

function cacheWardrobePayload(page, payload) {
  if (!page.data.wardrobeId) return;
  const wardrobe = payload.wardrobe || {};
  const sourceUpdatedAt = wardrobe.updatedAt || wardrobe.selectedUpdatedAt || wardrobe.createTime || "";
  setCache("wardrobe-index", page.getWardrobeCacheId(), {
    ...payload,
    sourceUpdatedAt
  }, { sourceUpdatedAt });
  removeCache("wardrobe-index", page.data.wardrobeId);
  cacheCategoryPayloads(page, payload.items || []);
}

function cacheCategoryPayloads(page, items) {
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
    setCache("category-items", [openid, page.data.wardrobeId, category].join(":"), {
      items: groups[category],
      sourceUpdatedAt
    }, { sourceUpdatedAt });
  });
}

function cacheItemDetail(page, item) {
  if (!item || !item._id) return;
  const sourceUpdatedAt = item.updatedAt || item.statusUpdatedAt || item.createTime || "";
  setCache("item-detail", getItemCacheId(page, item._id), { item, sourceUpdatedAt }, { sourceUpdatedAt });
}

function cacheCurrentWardrobeState(page, wardrobeOverrides = {}) {
  if (!page.data.wardrobeId) return;
  const cached = getCache("wardrobe-index", page.getWardrobeCacheId()) || {};
  const cachedWardrobe = page._wardrobeForCache || cached.wardrobe || {};
  const cachedItems = cached.items || [];
  const itemsForCache = page.data.allItemsLoaded ? page.data.allItems : cachedItems;
  cacheWardrobePayload(page, {
    wardrobe: {
      ...cachedWardrobe,
      name: page.data.wardrobeName,
      desc: page.data.about.desc,
      createTime: page.data.about.createdAt,
      plans: page.data.plans,
      tasks: page.data.tasks,
      selectedItemIds: page.data.selectedItemIds,
      selectedUpdatedText: page.data.selectedUpdatedText,
      ...wardrobeOverrides
    },
    categories: page.data.categoryNames,
    items: itemsForCache
  });
}

function cacheManagePreview(page) {
  if (!page.data.wardrobeId) return;
  const cached = getCache("wardrobe-index", page.getWardrobeCacheId()) || {};
  const cachedWardrobe = page._wardrobeForCache || cached.wardrobe || {};
  const counts = {};
  page.data.categoryNames.forEach(name => {
    counts[name] = 0;
  });

  const sourceItems = page.data.allItemsLoaded
    ? page.data.allItems
    : (cached.items && cached.items.length > 0 ? cached.items : page.data.allItems);
  (sourceItems || []).forEach(item => {
    if (!item || !item.category) return;
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  const categories = page.data.categoryNames.map((name, index) => ({
    name,
    count: counts[name] || 0,
    sort_order: index
  }));
  const totalItems = Object.keys(counts).reduce((sum, name) => sum + counts[name], 0);
  setCache("manage-preview", page.getWardrobeCacheId(), {
    wardrobe: {
      ...cachedWardrobe,
      _id: page.data.wardrobeId,
      name: page.data.wardrobeName,
      desc: page.data.about.desc,
      createTime: page.data.about.createdAt,
      plans: page.data.plans,
      tasks: page.data.tasks,
      selectedItemIds: page.data.selectedItemIds,
      selectedUpdatedText: page.data.selectedUpdatedText
    },
    categories,
    totalItems
  });
}

function cacheAddPreview(page) {
  if (!page.data.wardrobeId) return;
  setCache("wardrobe-categories", page.getWardrobeCacheId(), {
    categories: page.data.categoryNames
  });
}

function applyItemMutationFromChild(page, change) {
  if (!change || !change.type) return;
  let categoryNames = page.data.categoryNames.slice();
  let allItems = page.data.allItems.slice();
  let selectedItemIds = page.data.selectedItemIds.slice();

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

  const normalizedItems = normalizeItems(allItems);
  page.setData({
    categoryNames,
    allItems: normalizedItems,
    selectedItemIds
  }, () => {
    page.refreshSelectedItems();
    page.buildGrouped(categoryNames, normalizedItems, { resetActive: false });
    page.cacheCurrentWardrobeState({ selectedItemIds });
  });
}

module.exports = {
  getItemCacheId,
  cacheWardrobePayload,
  cacheCategoryPayloads,
  cacheItemDetail,
  cacheCurrentWardrobeState,
  cacheManagePreview,
  cacheAddPreview,
  applyItemMutationFromChild
};
