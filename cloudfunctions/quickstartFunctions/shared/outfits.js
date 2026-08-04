const MIN_OUTFIT_ITEMS = 2;
const MAX_OUTFIT_ITEMS = 20;
const MAX_OUTFITS_PER_WARDROBE = 50;

function normalizeText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function uniqueIds(ids) {
  const seen = new Set();
  const result = [];
  (ids || []).forEach(id => {
    const value = normalizeText(id);
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

function normalizeOutfitInput(input = {}) {
  const name = normalizeText(input.name).slice(0, 20);
  const note = normalizeText(input.note).slice(0, 60);
  const itemIds = uniqueIds(input.itemIds);

  if (!name) return { ok: false, code: "OUTFIT_NAME_REQUIRED" };
  if (itemIds.length < MIN_OUTFIT_ITEMS) {
    return { ok: false, code: "OUTFIT_TOO_SMALL" };
  }
  if (itemIds.length > MAX_OUTFIT_ITEMS) {
    return { ok: false, code: "OUTFIT_TOO_LARGE" };
  }

  return {
    ok: true,
    name,
    note,
    itemIds,
    coverItemIds: itemIds.slice(0, 3)
  };
}

function normalizeStatus(value) {
  if (value === "in_use" || value === "stored") return value;
  return "available";
}

function buildOutfitMerge(currentIds, outfitItemIds, items) {
  const selectedItemIds = uniqueIds(currentIds);
  const selected = new Set(selectedItemIds);
  const itemMap = new Map(
    (items || [])
      .filter(item => item && item._id)
      .map(item => [item._id, item])
  );
  const result = {
    selectedItemIds,
    addedIds: [],
    duplicateIds: [],
    inUseIds: [],
    missingIds: [],
    storedIds: []
  };

  uniqueIds(outfitItemIds).forEach(id => {
    if (selected.has(id)) {
      result.duplicateIds.push(id);
      return;
    }

    const item = itemMap.get(id);
    if (!item) {
      result.missingIds.push(id);
      return;
    }

    const status = normalizeStatus(item.wearStatus || item.status);
    if (status === "in_use") {
      result.inUseIds.push(id);
      return;
    }

    selected.add(id);
    result.selectedItemIds.push(id);
    result.addedIds.push(id);
    if (status === "stored") result.storedIds.push(id);
  });

  return result;
}

function canManageOutfit(outfit, wardrobe, openid) {
  if (!outfit || !wardrobe || !openid) return false;
  const ownerOpenId = wardrobe.ownerOpenId || wardrobe.ownerOpenid || "";
  return outfit.createdByOpenId === openid || ownerOpenId === openid;
}

module.exports = {
  MIN_OUTFIT_ITEMS,
  MAX_OUTFIT_ITEMS,
  MAX_OUTFITS_PER_WARDROBE,
  normalizeOutfitInput,
  buildOutfitMerge,
  canManageOutfit,
  uniqueIds
};
