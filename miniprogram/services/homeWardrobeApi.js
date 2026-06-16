const db = wx.cloud.database();
const { isRecordOwner } = require("../utils/auth.js");

const DEFAULT_CATEGORIES = ["上衣", "下装", "连衣裙", "鞋子", "配饰"];

async function fetchWardrobes(user) {
  const ownedRes = await db.collection("wardrobe_hubs")
    .where({ ownerOpenId: user.openid })
    .orderBy("createTime", "desc")
    .get();
  const sharedRes = await db.collection("wardrobe_hubs")
    .where({ sharedOpenIds: user.openid })
    .orderBy("createTime", "desc")
    .get();

  const wardrobeMap = {};
  const rawWardrobes = [];
  (ownedRes.data || []).forEach(item => {
    wardrobeMap[item._id] = true;
    rawWardrobes.push({ ...item, accessRole: "owner" });
  });
  (sharedRes.data || []).forEach(item => {
    if (!wardrobeMap[item._id]) {
      rawWardrobes.push({ ...item, accessRole: "shared" });
    }
  });
  return rawWardrobes;
}

async function joinSharedWardrobe(user, shareCode) {
  const res = await db.collection("wardrobe_hubs")
    .where({ shareCode, shareEnabled: true })
    .limit(1)
    .get();
  if (!res.data || res.data.length === 0) {
    const err = new Error("SHARE_CODE_INVALID");
    err.code = "SHARE_CODE_INVALID";
    throw err;
  }

  const wardrobe = res.data[0];
  if (isRecordOwner(wardrobe, user)) {
    const err = new Error("OWN_WARDROBE");
    err.code = "OWN_WARDROBE";
    throw err;
  }

  const sharedOpenIds = wardrobe.sharedOpenIds || [];
  const sharedUsers = wardrobe.sharedUsers || [];
  if (sharedOpenIds.indexOf(user.openid) < 0) {
    sharedOpenIds.push(user.openid);
  }
  if (!sharedUsers.some(item => item && item.openid === user.openid)) {
    sharedUsers.push({
      openid: user.openid,
      nickName: user.nickName,
      avatarUrl: user.avatarUrl,
      joinedAt: Date.now()
    });
  }

  await db.collection("wardrobe_hubs").doc(wardrobe._id).update({
    data: { sharedOpenIds, sharedUsers }
  });
  return wardrobe;
}

async function deleteWardrobe(wardrobeId) {
  const callRes = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: {
      type: "deleteWardrobe",
      wardrobeId
    }
  });
  const result = callRes.result || {};
  if (!result.success) {
    const err = new Error(result.code || "DELETE_WARDROBE_UNAVAILABLE");
    err.code = result.code || "DELETE_WARDROBE_UNAVAILABLE";
    throw err;
  }
  return result;
}

async function createDefaultCategories(wardrobeId, user) {
  await Promise.all(DEFAULT_CATEGORIES.map((name, index) =>
    db.collection("wardrobe_categories").add({
      data: {
        name,
        wardrobeId,
        ownerOpenId: user.openid,
        sort_order: index,
        itemCount: 0,
        createTime: db.serverDate()
      }
    })
  ));
}

async function createWardrobe(user, name, desc) {
  const res = await db.collection("wardrobe_hubs").add({
    data: {
      name,
      desc,
      icon: "🧸",
      ownerOpenId: user.openid,
      ownerNickName: user.nickName,
      ownerAvatarUrl: user.avatarUrl,
      createTime: db.serverDate()
    }
  });
  await createDefaultCategories(res._id, user);
  return res;
}

module.exports = {
  DEFAULT_CATEGORIES,
  fetchWardrobes,
  joinSharedWardrobe,
  deleteWardrobe,
  createDefaultCategories,
  createWardrobe
};
