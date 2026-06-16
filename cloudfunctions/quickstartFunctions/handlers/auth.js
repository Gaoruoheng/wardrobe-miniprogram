const { cloud, db } = require("../shared/cloud.js");

const ensureCollection = async (name) => {
  try {
    await db.createCollection(name);
  } catch (e) {}
};

const getOpenId = async () => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

const registerUser = async (event) => {
  await ensureCollection("wardrobe_users");

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const userInfo = event.userInfo || {};
  const userData = {
    openid,
    nickName: userInfo.nickName || "衣柜用户",
    avatarUrl: userInfo.avatarUrl || "",
    lastLoginAt: db.serverDate()
  };

  const existed = await db.collection("wardrobe_users")
    .where({ openid })
    .limit(1)
    .get();

  if (existed.data && existed.data.length > 0) {
    const doc = existed.data[0];
    await db.collection("wardrobe_users").doc(doc._id).update({
      data: userData
    });
    return {
      success: true,
      user: {
        userId: doc._id,
        openid,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        registeredAt: doc.registeredAt || Date.now()
      }
    };
  }

  const addRes = await db.collection("wardrobe_users").add({
    data: {
      ...userData,
      registeredAt: db.serverDate()
    }
  });

  return {
    success: true,
    user: {
      userId: addRes._id,
      openid,
      nickName: userData.nickName,
      avatarUrl: userData.avatarUrl,
      registeredAt: Date.now()
    }
  };
};

module.exports = {
  getOpenId,
  registerUser
};
