const { db, _ } = require("./cloud.js");
const { DEFAULT_CATEGORIES } = require("./constants.js");
const { normalizeText } = require("./core.js");

async function ensureCategory(wardrobeId, name, ownerOpenId, sortOrder) {
  const categoryName = normalizeText(name);
  if (!wardrobeId || !categoryName) return null;

  const existed = await db.collection("wardrobe_categories")
    .where({ wardrobeId, name: categoryName })
    .limit(1)
    .get();
  if (existed.data && existed.data.length > 0) return existed.data[0];

  let nextSortOrder = sortOrder;
  if (typeof nextSortOrder !== "number") {
    const countRes = await db.collection("wardrobe_categories")
      .where({ wardrobeId })
      .count();
    nextSortOrder = countRes.total || 0;
  }

  const addRes = await db.collection("wardrobe_categories").add({
    data: {
      name: categoryName,
      wardrobeId,
      ownerOpenId,
      sort_order: nextSortOrder,
      itemCount: 0,
      createTime: db.serverDate()
    }
  });

  return {
    _id: addRes._id,
    name: categoryName,
    wardrobeId,
    ownerOpenId,
    sort_order: nextSortOrder,
    itemCount: 0
  };
}

async function getCategoryItemCount(wardrobeId, categoryName) {
  const countRes = await db.collection("wardrobe_items")
    .where({ wardrobeId, category: categoryName })
    .count();
  return countRes.total || 0;
}

async function resolveCategoryCount(wardrobeId, category) {
  if (typeof category.itemCount === "number") return category.itemCount;
  if (typeof category.count === "number") return category.count;

  const itemCount = await getCategoryItemCount(wardrobeId, category.name);
  try {
    await db.collection("wardrobe_categories").doc(category._id).update({
      data: { itemCount }
    });
  } catch (err) {
    console.error("backfill category count failed", err);
  }
  return itemCount;
}

async function normalizeCategoriesWithCounts(wardrobeId, categories) {
  return await Promise.all((categories || []).map(async (category, index) => {
    const itemCount = await resolveCategoryCount(wardrobeId, category);
    return {
      ...category,
      itemCount,
      count: itemCount,
      sort_order: typeof category.sort_order === "number" ? category.sort_order : index
    };
  }));
}

async function adjustCategoryItemCount(wardrobeId, categoryName, delta) {
  const name = normalizeText(categoryName);
  if (!wardrobeId || !name || !delta) return;
  try {
    await db.collection("wardrobe_categories")
      .where({ wardrobeId, name })
      .update({
        data: {
          itemCount: _.inc(delta)
        }
      });
  } catch (err) {
    console.error("adjust category item count failed", err);
  }
}

async function createDefaultCategoriesForWardrobe(wardrobeId, ownerOpenId) {
  await Promise.all(DEFAULT_CATEGORIES.map((name, index) =>
    ensureCategory(wardrobeId, name, ownerOpenId, index)
  ));
  const catRes = await db.collection("wardrobe_categories")
    .where({ wardrobeId })
    .orderBy("sort_order", "asc")
    .get();
  return catRes.data || [];
}

module.exports = {
  ensureCategory,
  getCategoryItemCount,
  normalizeCategoriesWithCounts,
  adjustCategoryItemCount,
  createDefaultCategoriesForWardrobe
};
