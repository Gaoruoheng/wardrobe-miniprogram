const { cloud, db } = require("../shared/cloud.js");
const { normalizeText, getAllByWardrobe, removeDocs } = require("../shared/core.js");
const { collectItemFileIds, deleteCloudFiles } = require("../shared/files.js");
const { getWardrobeForUser, getWardrobeForAdmin } = require("../shared/access.js");
const { verifyAdminToken } = require("../shared/adminAuth.js");
const {
  normalizeCategoriesWithCounts,
  createDefaultCategoriesForWardrobe
} = require("../shared/categories.js");
const { fetchItemsByIds, mergeUniqueItems } = require("../shared/items.js");
const {
  buildItemCursorWhere,
  toItemPageResult
} = require("../shared/itemPagination.js");

async function getWardrobeSnapshot(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const mode = normalizeText(event.mode || data.mode) || "index";
  const firstCategory = normalizeText(event.firstCategory || data.firstCategory);
  const firstLimitRaw = Number(event.firstLimit || data.firstLimit || 20);
  const firstLimit = Math.max(1, Math.min(firstLimitRaw || 20, 50));
  const adminToken = event.adminToken || data.adminToken || "";
  const useAdminAccess = !!adminToken && verifyAdminToken(adminToken);
  if (adminToken && !useAdminAccess) return { success: false, code: "UNAUTHORIZED_ADMIN" };
  const wxContext = cloud.getWXContext();
  const access = useAdminAccess
    ? await getWardrobeForAdmin(wardrobeId)
    : await getWardrobeForUser(wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  let catRes = await db.collection("wardrobe_categories")
    .where({ wardrobeId })
    .orderBy("sort_order", "asc")
    .get();
  let categories = catRes.data || [];
  if (categories.length === 0) {
    const ownerOpenId = access.wardrobe.ownerOpenId || access.wardrobe.ownerOpenid || wxContext.OPENID;
    categories = await createDefaultCategoriesForWardrobe(wardrobeId, ownerOpenId);
  }

  const normalizedCategories = await normalizeCategoriesWithCounts(wardrobeId, categories);
  const categoryNames = normalizedCategories.map(category => category.name).filter(name => !!name);
  const totalItems = normalizedCategories.reduce((sum, category) => sum + (category.itemCount || 0), 0);

  if (mode === "manage") {
    return {
      success: true,
      wardrobe: access.wardrobe,
      categories: normalizedCategories,
      categoryNames,
      totalItems,
      items: [],
      allItemsLoaded: true
    };
  }

  const _ = db.command;
  const firstPageRes = await db.collection("wardrobe_items")
    .where(buildItemCursorWhere(_, wardrobeId, null))
    .orderBy("sort_order", "asc")
    .orderBy("_id", "asc")
    .limit(firstLimit + 1)
    .get();
  const firstPage = toItemPageResult(firstPageRes.data || [], firstLimit);
  const targetCategory = firstCategory && categoryNames.indexOf(firstCategory) >= 0
    ? firstCategory
    : categoryNames[0] || "";
  const selectedItemIds = access.wardrobe.selectedItemIds || [];
  const selectedItems = await fetchItemsByIds(selectedItemIds, wardrobeId);
  const items = mergeUniqueItems([firstPage.items, selectedItems]);

  return {
    success: true,
    wardrobe: access.wardrobe,
    categories: normalizedCategories,
    categoryNames,
    totalItems,
    items,
    selectedItems,
    priorityCategory: targetCategory,
    nextCursor: firstPage.nextCursor,
    hasMore: firstPage.hasMore,
    allItemsLoaded: !firstPage.hasMore
  };
}

async function getWardrobeItemsPage(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const limitRaw = Number(event.limit || data.limit || 20);
  const limit = Math.max(1, Math.min(limitRaw || 20, 50));
  const adminToken = event.adminToken || data.adminToken || "";
  const cursor = event.cursor || data.cursor || null;
  const useAdminAccess = !!adminToken && verifyAdminToken(adminToken);
  if (adminToken && !useAdminAccess) return { success: false, code: "UNAUTHORIZED_ADMIN" };
  const wxContext = cloud.getWXContext();
  const access = useAdminAccess
    ? await getWardrobeForAdmin(wardrobeId)
    : await getWardrobeForUser(wardrobeId, wxContext.OPENID);

  if (!access.ok) return { success: false, code: access.code };

  const _ = db.command;
  const res = await db.collection("wardrobe_items")
    .where(buildItemCursorWhere(_, wardrobeId, cursor))
    .orderBy("sort_order", "asc")
    .orderBy("_id", "asc")
    .limit(limit + 1)
    .get();
  const page = toItemPageResult(res.data || [], limit);

  return {
    success: true,
    items: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    limit
  };
}

const deleteWardrobe = async (event) => {
  const wardrobeId = normalizeText(event.wardrobeId || event.data && event.data.wardrobeId);
  if (!wardrobeId) {
    return { success: false, code: "MISSING_WARDROBE_ID" };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  let wardrobe = null;

  try {
    const hubRes = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
    wardrobe = hubRes.data;
  } catch (err) {
    return { success: false, code: "WARDROBE_NOT_FOUND" };
  }

  const ownerOpenId = wardrobe && (wardrobe.ownerOpenId || wardrobe.ownerOpenid || "");
  if (!ownerOpenId || ownerOpenId !== openid) {
    return { success: false, code: "FORBIDDEN" };
  }

  const categories = await getAllByWardrobe("wardrobe_categories", wardrobeId);
  const items = await getAllByWardrobe("wardrobe_items", wardrobeId);
  const fileResult = await deleteCloudFiles(collectItemFileIds(items));

  await removeDocs("wardrobe_categories", categories.map(item => item._id));
  await removeDocs("wardrobe_items", items.map(item => item._id));
  await db.collection("wardrobe_hubs").doc(wardrobeId).remove();

  return {
    success: true,
    deleted: {
      wardrobe: 1,
      categories: categories.length,
      items: items.length,
      files: fileResult
    }
  };
};

module.exports = {
  getWardrobeSnapshot,
  getWardrobeItemsPage,
  deleteWardrobe
};
