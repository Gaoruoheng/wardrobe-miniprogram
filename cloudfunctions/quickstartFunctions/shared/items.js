const { db } = require("./cloud.js");
const { uniqueIds } = require("./core.js");

async function fetchItemsByIds(ids, wardrobeId) {
  const cleanIds = uniqueIds(ids);
  if (cleanIds.length === 0) return [];

  const results = [];
  for (let index = 0; index < cleanIds.length; index += 1) {
    try {
      const itemRes = await db.collection("wardrobe_items").doc(cleanIds[index]).get();
      const item = itemRes.data;
      if (item && item.wardrobeId === wardrobeId) results.push(item);
    } catch (err) {}
  }
  return results;
}

function mergeUniqueItems(groups) {
  const seen = {};
  const result = [];
  (groups || []).forEach(group => {
    (group || []).forEach(item => {
      if (!item || !item._id || seen[item._id]) return;
      seen[item._id] = true;
      result.push(item);
    });
  });
  return result;
}

module.exports = {
  fetchItemsByIds,
  mergeUniqueItems
};
