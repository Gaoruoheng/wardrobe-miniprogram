const { db } = require("../shared/cloud.js");
const {
  hasAdminPasswordConfigured,
  issueAdminToken,
  verifyAdminPassword,
  verifyAdminToken
} = require("../shared/adminAuth.js");
const { getCloudErrorMessage } = require("../shared/utils.js");

async function getAdminAllWardrobes(event) {
  const data = event.data || {};
  const pass = data.password || event.password || "";
  const adminToken = data.adminToken || event.adminToken || "";
  const passwordValid = verifyAdminPassword(pass);
  const tokenValid = verifyAdminToken(adminToken);

  if (!hasAdminPasswordConfigured()) {
    return { success: false, code: "ADMIN_PASSWORD_NOT_CONFIGURED" };
  }
  if (!passwordValid && !tokenValid) {
    return { success: false, code: "UNAUTHORIZED_ADMIN" };
  }

  let users = [];
  let userFetchMessage = "";
  try {
    const userRes = await db.collection("wardrobe_users").limit(1000).get();
    users = userRes.data || [];
  } catch (err) {
    console.error("fetch admin users error", err);
    userFetchMessage = getCloudErrorMessage(err);
  }

  const userMap = {};
  users.forEach(u => {
    if (u.openid) {
      userMap[u.openid] = u.nickName || "衣柜用户";
    }
  });

  let wardrobes = [];
  try {
    const hubsRes = await db.collection("wardrobe_hubs").orderBy("createTime", "desc").limit(1000).get();
    wardrobes = hubsRes.data || [];
  } catch (err) {
    console.error("fetch admin wardrobes error", err);
    return {
      success: false,
      code: "FETCH_ADMIN_WARDROBES_FAILED",
      message: getCloudErrorMessage(err)
    };
  }

  const result = wardrobes.map(w => {
    const ownerOpenId = w.ownerOpenId || w.ownerOpenid || "";
    const ownerName = userMap[ownerOpenId] || w.ownerNickName || "衣柜用户";
    return {
      _id: w._id,
      name: w.name || "未命名衣柜",
      desc: w.desc || "",
      icon: w.icon || "衣",
      ownerOpenId,
      ownerName,
      createTime: w.createTime || "",
      shareCode: w.shareCode || "",
      sharedCount: (w.sharedOpenIds || []).length
    };
  });

  return {
    success: true,
    adminToken: passwordValid ? issueAdminToken() : adminToken,
    wardrobes: result,
    warningCode: userFetchMessage ? "FETCH_ADMIN_USERS_FAILED" : "",
    warningMessage: userFetchMessage
  };
}

module.exports = {
  getAdminAllWardrobes
};
