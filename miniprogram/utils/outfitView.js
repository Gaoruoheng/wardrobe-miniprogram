function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function coverUrl(item) {
  if (!item) return "";
  return item.thumbUrl || item.imageUrl || item.fileID || item.fileId || "";
}

function decorateOutfit(outfit = {}, wardrobe = {}, openid = "") {
  const itemIds = safeList(outfit.itemIds);
  const coverItems = safeList(outfit.coverItems);
  const ownerOpenId = wardrobe.ownerOpenId || wardrobe.ownerOpenid || "";
  const canManage = !!openid && (
    outfit.createdByOpenId === openid || ownerOpenId === openid
  );

  return {
    ...outfit,
    _id: outfit._id || "",
    name: outfit.name || "未命名套装",
    note: outfit.note || "",
    createdByName: outfit.createdByName || "衣柜成员",
    itemIds,
    coverItems,
    itemCount: itemIds.length,
    canManage,
    needsCleanup: !!outfit.needsCleanup,
    coverSlots: [0, 1, 2].map(index => {
      const item = coverItems[index] || null;
      return {
        key: "cover-" + index,
        itemId: item && item._id || "",
        url: coverUrl(item),
        empty: !item
      };
    })
  };
}

function formatApplyResult(result = {}) {
  const added = safeList(result.addedIds).length;
  const duplicate = safeList(result.duplicateIds).length;
  const inUse = safeList(result.inUseIds).length;
  const missing = safeList(result.missingIds).length;

  if (added === 0 && duplicate > 0 && inUse === 0 && missing === 0) {
    return "这套衣服已经都在清单里了";
  }
  if (added === 0 && duplicate === 0 && inUse + missing > 0) {
    return "套装中的衣物当前都无法加入清单";
  }

  const parts = [];
  if (added > 0) parts.push("已加入 " + added + " 件");
  if (duplicate > 0) parts.push("跳过 " + duplicate + " 件重复衣物");
  if (inUse > 0) parts.push(inUse + " 件正在使用中未加入");
  if (missing > 0) parts.push(missing + " 件衣物已失效");
  return parts.join("，") || "没有可加入的衣物";
}

function reconcileOutfitItemIds(itemIds, items) {
  const available = new Set(
    safeList(items).map(item => item && item._id).filter(Boolean)
  );
  return safeList(itemIds).filter(id => available.has(id));
}

function mergeAppliedOutfitItems(currentItems, fetchedItems) {
  const fetchedMap = new Map(
    safeList(fetchedItems)
      .filter(item => item && item._id)
      .map(item => [item._id, item])
  );
  const result = safeList(currentItems)
    .filter(item => item && item._id)
    .map(item => fetchedMap.get(item._id) || item);
  const existing = new Set(result.map(item => item._id));
  safeList(fetchedItems).forEach(item => {
    if (!item || !item._id || existing.has(item._id)) return;
    existing.add(item._id);
    result.push(item);
  });
  return result;
}

module.exports = {
  decorateOutfit,
  formatApplyResult,
  reconcileOutfitItemIds,
  mergeAppliedOutfitItems
};
