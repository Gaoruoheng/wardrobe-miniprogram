const { cloud, db } = require("../shared/cloud.js");
const { normalizeText, uniqueIds } = require("../shared/core.js");
const { getWardrobeForUser } = require("../shared/access.js");
const { fetchItemsByIds } = require("../shared/items.js");
const {
  MAX_OUTFITS_PER_WARDROBE,
  normalizeOutfitInput,
  canManageOutfit
} = require("../shared/outfits.js");

function value(event, key) {
  return event[key] !== undefined ? event[key] : (event.data || {})[key];
}

async function requireAccess(event) {
  const wardrobeId = normalizeText(value(event, "wardrobeId"));
  const context = cloud.getWXContext();
  const openid = context.OPENID;
  const access = await getWardrobeForUser(wardrobeId, openid);
  return { wardrobeId, openid, access };
}

async function getOutfitDocument(outfitId, wardrobeId) {
  if (!outfitId) return { ok: false, code: "MISSING_OUTFIT_ID" };

  try {
    const result = await db.collection("wardrobe_outfits").doc(outfitId).get();
    const outfit = result.data;
    if (!outfit || outfit.wardrobeId !== wardrobeId) {
      return { ok: false, code: "OUTFIT_NOT_FOUND" };
    }
    return { ok: true, outfit };
  } catch (err) {
    return { ok: false, code: "OUTFIT_NOT_FOUND" };
  }
}

function timeValue(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function withPermissions(outfit, wardrobe, openid) {
  return {
    ...outfit,
    itemCount: (outfit.itemIds || []).length,
    canManage: canManageOutfit(outfit, wardrobe, openid)
  };
}

async function validateItems(itemIds, wardrobeId) {
  const items = await fetchItemsByIds(itemIds, wardrobeId);
  return items.length === itemIds.length;
}

async function listOutfits(event) {
  const { wardrobeId, openid, access } = await requireAccess(event);
  if (!access.ok) return { success: false, code: access.code };

  const result = await db.collection("wardrobe_outfits")
    .where({ wardrobeId })
    .limit(MAX_OUTFITS_PER_WARDROBE)
    .get();
  const outfits = (result.data || [])
    .sort((left, right) => timeValue(right.updateTime) - timeValue(left.updateTime));
  const coverIds = uniqueIds(outfits.reduce((ids, outfit) => {
    return ids.concat(outfit.coverItemIds || []);
  }, []));
  const coverItems = await fetchItemsByIds(coverIds, wardrobeId);
  const itemMap = new Map(coverItems.map(item => [item._id, item]));

  return {
    success: true,
    outfits: outfits.map(outfit => ({
      ...withPermissions(outfit, access.wardrobe, openid),
      coverItems: (outfit.coverItemIds || []).map(id => itemMap.get(id)).filter(Boolean)
    }))
  };
}

async function getOutfit(event) {
  const { wardrobeId, openid, access } = await requireAccess(event);
  if (!access.ok) return { success: false, code: access.code };

  const outfitResult = await getOutfitDocument(normalizeText(value(event, "outfitId")), wardrobeId);
  if (!outfitResult.ok) return { success: false, code: outfitResult.code };

  const outfit = outfitResult.outfit;
  const items = await fetchItemsByIds(outfit.itemIds || [], wardrobeId);
  return {
    success: true,
    outfit: {
      ...withPermissions(outfit, access.wardrobe, openid),
      items,
      needsCleanup: !!outfit.needsCleanup || items.length !== (outfit.itemIds || []).length
    }
  };
}

async function saveOutfit(event) {
  const { wardrobeId, openid, access } = await requireAccess(event);
  if (!access.ok) return { success: false, code: access.code };

  const normalized = normalizeOutfitInput({
    name: value(event, "name"),
    note: value(event, "note"),
    itemIds: value(event, "itemIds")
  });
  if (!normalized.ok) return { success: false, code: normalized.code };
  if (!await validateItems(normalized.itemIds, wardrobeId)) {
    return { success: false, code: "OUTFIT_ITEM_NOT_FOUND" };
  }

  const outfitId = normalizeText(value(event, "outfitId"));
  const now = Date.now();
  if (outfitId) {
    const outfitResult = await getOutfitDocument(outfitId, wardrobeId);
    if (!outfitResult.ok) return { success: false, code: outfitResult.code };

    const current = outfitResult.outfit;
    if (!canManageOutfit(current, access.wardrobe, openid)) {
      return { success: false, code: "FORBIDDEN" };
    }

    const version = Number(value(event, "version"));
    if (!Number.isInteger(version) || version !== Number(current.version || 1)) {
      return { success: false, code: "OUTFIT_VERSION_CONFLICT" };
    }

    const nextVersion = Number(current.version || 1) + 1;
    await db.collection("wardrobe_outfits").doc(outfitId).update({
      data: {
        name: normalized.name,
        note: normalized.note,
        itemIds: normalized.itemIds,
        coverItemIds: normalized.coverItemIds,
        needsCleanup: false,
        updateTime: db.serverDate(),
        version: nextVersion
      }
    });

    return {
      success: true,
      outfit: withPermissions({
        ...current,
        ...normalized,
        _id: outfitId,
        needsCleanup: false,
        updateTime: now,
        version: nextVersion
      }, access.wardrobe, openid)
    };
  }

  const countResult = await db.collection("wardrobe_outfits").where({ wardrobeId }).count();
  if ((countResult.total || 0) >= MAX_OUTFITS_PER_WARDROBE) {
    return { success: false, code: "OUTFIT_LIMIT_REACHED" };
  }

  const outfit = {
    wardrobeId,
    name: normalized.name,
    note: normalized.note,
    itemIds: normalized.itemIds,
    coverItemIds: normalized.coverItemIds,
    createdByOpenId: openid,
    createdByName: normalizeText(value(event, "createdByName") || "衣柜成员").slice(0, 20),
    createTime: db.serverDate(),
    updateTime: db.serverDate(),
    version: 1,
    needsCleanup: false
  };
  const addResult = await db.collection("wardrobe_outfits").add({ data: outfit });

  return {
    success: true,
    outfit: withPermissions({
      ...outfit,
      _id: addResult._id,
      createTime: now,
      updateTime: now
    }, access.wardrobe, openid)
  };
}

async function deleteOutfit(event) {
  const { wardrobeId, openid, access } = await requireAccess(event);
  if (!access.ok) return { success: false, code: access.code };

  const outfitId = normalizeText(value(event, "outfitId"));
  const outfitResult = await getOutfitDocument(outfitId, wardrobeId);
  if (!outfitResult.ok) return { success: false, code: outfitResult.code };
  if (!canManageOutfit(outfitResult.outfit, access.wardrobe, openid)) {
    return { success: false, code: "FORBIDDEN" };
  }

  await db.collection("wardrobe_outfits").doc(outfitId).remove();
  return { success: true, outfitId };
}

module.exports = {
  listOutfits,
  getOutfit,
  saveOutfit,
  deleteOutfit
};
