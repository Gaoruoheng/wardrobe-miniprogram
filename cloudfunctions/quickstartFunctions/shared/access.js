const { db } = require("./cloud.js");

function canAccessWardrobe(wardrobe, openid) {
  if (!wardrobe || !openid) return false;
  const ownerOpenId = wardrobe.ownerOpenId || wardrobe.ownerOpenid || "";
  if (ownerOpenId === openid) return true;
  if ((wardrobe.sharedOpenIds || []).indexOf(openid) >= 0) return true;
  return (wardrobe.sharedUsers || []).some(item => item && item.openid === openid);
}

async function getWardrobeForUser(wardrobeId, openid) {
  if (!wardrobeId || !openid) {
    return { ok: false, code: "MISSING_WARDROBE_ID" };
  }

  try {
    const hubRes = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
    if (!canAccessWardrobe(hubRes.data, openid)) {
      return { ok: false, code: "FORBIDDEN" };
    }
    return { ok: true, wardrobe: hubRes.data };
  } catch (err) {
    return { ok: false, code: "WARDROBE_NOT_FOUND" };
  }
}

async function getWardrobeForAdmin(wardrobeId) {
  if (!wardrobeId) {
    return { ok: false, code: "MISSING_WARDROBE_ID" };
  }

  try {
    const hubRes = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
    return { ok: true, wardrobe: hubRes.data };
  } catch (err) {
    return { ok: false, code: "WARDROBE_NOT_FOUND" };
  }
}

async function getItemForUser(itemId, wardrobeId, openid) {
  const access = await getWardrobeForUser(wardrobeId, openid);
  if (!access.ok) return access;

  try {
    const itemRes = await db.collection("wardrobe_items").doc(itemId).get();
    const item = itemRes.data;
    if (!item || item.wardrobeId !== wardrobeId) {
      return { ok: false, code: "ITEM_NOT_FOUND" };
    }
    return { ok: true, wardrobe: access.wardrobe, item };
  } catch (err) {
    return { ok: false, code: "ITEM_NOT_FOUND" };
  }
}

module.exports = {
  getWardrobeForUser,
  getWardrobeForAdmin,
  getItemForUser
};
