const db = wx.cloud.database();
const {
  buildItemCursorWhere,
  toItemPageResult
} = require("../utils/itemPagination.js");

async function fetchCategoryFirstItems(wardrobeId, category, limit) {
  if (!category) return [];
  const res = await db.collection("wardrobe_items")
    .where({
      wardrobeId,
      category
    })
    .orderBy("sort_order", "asc")
    .limit(limit)
    .get();
  return res.data || [];
}

async function fetchItemsByIds(wardrobeId, ids) {
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
    item && item.wardrobeId === wardrobeId
  );
}

async function fetchWardrobeSnapshot(params) {
  const callRes = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: {
      type: "getWardrobeSnapshot",
      wardrobeId: params.wardrobeId,
      mode: "index",
      firstCategory: params.firstCategory,
      firstLimit: params.firstLimit,
      adminToken: params.adminToken || ""
    }
  });
  const result = callRes.result || {};
  if (result.success) return result;
  const err = new Error(result.code || "SNAPSHOT_UNAVAILABLE");
  err.code = result.code || "SNAPSHOT_UNAVAILABLE";
  throw err;
}

async function fetchAdminItemsPage(params) {
  const callRes = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: {
      type: "getWardrobeItemsPage",
      wardrobeId: params.wardrobeId,
      cursor: params.cursor || null,
      limit: params.limit,
      adminToken: params.adminToken || ""
    }
  });
  const result = callRes.result || {};
  if (!result.success) {
    const err = new Error(result.code || "ITEM_PAGE_UNAVAILABLE");
    err.code = result.code || "ITEM_PAGE_UNAVAILABLE";
    throw err;
  }
  return {
    items: result.items || [],
    nextCursor: result.nextCursor || null,
    hasMore: !!result.hasMore
  };
}

async function fetchItemsPage(wardrobeId, cursor, limit) {
  const safeLimit = Math.max(1, Number(limit) || 20);
  const _ = db.command;
  const res = await db.collection("wardrobe_items")
    .where(buildItemCursorWhere(_, wardrobeId, cursor))
    .orderBy("sort_order", "asc")
    .orderBy("_id", "asc")
    .limit(safeLimit + 1)
    .get();
  return toItemPageResult(res.data || [], safeLimit);
}

async function saveItemOrder(params) {
  const callRes = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: {
      type: "saveItemOrder",
      wardrobeId: params.wardrobeId,
      category: params.category,
      itemIds: params.itemIds || []
    }
  });
  const result = callRes.result || {};
  if (!result.success) {
    const err = new Error(result.code || "WRITE_UNAVAILABLE");
    err.code = result.code || "WRITE_UNAVAILABLE";
    throw err;
  }
  return result;
}

async function updateItemStatus(params) {
  const callRes = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: {
      type: "updateItemStatus",
      wardrobeId: params.wardrobeId,
      itemId: params.itemId,
      status: params.status,
      selectedUpdatedText: params.selectedUpdatedText
    }
  });
  const result = callRes.result || {};
  if (!result.success) {
    const err = new Error(result.code || "WRITE_UNAVAILABLE");
    err.code = result.code || "WRITE_UNAVAILABLE";
    throw err;
  }
  return result;
}

async function setItemSelection(params) {
  const callRes = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: {
      type: "setItemSelection",
      wardrobeId: params.wardrobeId,
      itemId: params.itemId,
      selected: params.selected,
      selectedUpdatedText: params.selectedUpdatedText
    }
  });
  const result = callRes.result || {};
  if (!result.success) {
    const err = new Error(result.code || "WRITE_UNAVAILABLE");
    err.code = result.code || "WRITE_UNAVAILABLE";
    throw err;
  }
  return result;
}

async function saveSelectedItems(params) {
  const callRes = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: {
      type: "saveSelectedItems",
      wardrobeId: params.wardrobeId,
      selectedItemIds: params.selectedItemIds || [],
      selectedUpdatedText: params.selectedUpdatedText
    }
  });
  const result = callRes.result || {};
  if (!result.success) {
    const err = new Error(result.code || "WRITE_UNAVAILABLE");
    err.code = result.code || "WRITE_UNAVAILABLE";
    throw err;
  }
  return result;
}

async function saveMeta(wardrobeId, data) {
  await db.collection("wardrobe_hubs").doc(wardrobeId).update({ data });
}

module.exports = {
  fetchCategoryFirstItems,
  fetchItemsByIds,
  fetchWardrobeSnapshot,
  fetchAdminItemsPage,
  fetchItemsPage,
  saveItemOrder,
  updateItemStatus,
  setItemSelection,
  saveSelectedItems,
  saveMeta
};
