const STORAGE_KEY = "kuma_closet_auth_user";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const USERS_COLLECTION = "wardrobe_users";
const AUTH_CLOUD_FUNCTION_MISSING = "AUTH_CLOUD_FUNCTION_MISSING";
let authRedirectPending = false;

function now() {
  return Date.now();
}

function isMissingCollectionError(err) {
  const message = err && (err.errMsg || err.message || "");
  return message.indexOf("collection not exists") >= 0 ||
    message.indexOf("Db or Table not exist") >= 0;
}

function isMissingFunctionError(err) {
  const message = err && (err.errMsg || err.message || "");
  return message.indexOf("FUNCTION_NOT_FOUND") >= 0 ||
    message.indexOf("FunctionName parameter could not be found") >= 0 ||
    message.indexOf("-501000") >= 0;
}

function createAuthError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normalizeUserInfo(userInfo) {
  const info = userInfo || {};
  return {
    nickName: info.nickName || "衣柜用户",
    avatarUrl: info.avatarUrl || ""
  };
}

function getStoredUser() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null;
  } catch (err) {
    console.error("read auth user failed", err);
    return null;
  }
}

function saveAuthUser(userInfo) {
  const currentTime = now();
  const user = {
    userId: userInfo.userId || "",
    openid: userInfo.openid || userInfo.openId || "",
    nickName: userInfo.nickName || "衣柜用户",
    avatarUrl: userInfo.avatarUrl || "",
    registeredAt: userInfo.registeredAt || currentTime,
    lastLoginAt: currentTime,
    expiresAt: currentTime + SESSION_MS
  };
  wx.setStorageSync(STORAGE_KEY, user);
  return user;
}

function getVerifiedUser() {
  const user = getStoredUser();
  if (!user || !user.openid || !user.expiresAt || user.expiresAt <= now()) {
    clearVerification();
    return null;
  }
  return user;
}

function isVerified() {
  return !!getVerifiedUser();
}

function clearVerification() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (err) {
    console.error("clear auth user failed", err);
  }
}

function getUserProfile() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: "用于注册并确认衣柜用户身份",
      success: res => resolve(normalizeUserInfo(res.userInfo)),
      fail: reject
    });
  });
}

async function getOpenId() {
  try {
    const res = await wx.cloud.callFunction({
      name: "quickstartFunctions",
      data: { type: "getOpenId" }
    });
    const result = res.result || {};
    if (!result.openid) throw new Error("openid missing");
    return result.openid;
  } catch (err) {
    if (isMissingFunctionError(err)) {
      throw createAuthError(
        AUTH_CLOUD_FUNCTION_MISSING,
        "请先部署云函数 quickstartFunctions"
      );
    }
    throw err;
  }
}

async function registerWithCloudFunction(userInfo) {
  try {
    const res = await wx.cloud.callFunction({
      name: "quickstartFunctions",
      data: {
        type: "registerUser",
        userInfo
      }
    });
    const result = res.result || {};
    if (!result.success || !result.user || !result.user.openid) {
      throw new Error("registerUser cloud function unavailable");
    }
    return result.user;
  } catch (err) {
    if (isMissingFunctionError(err)) {
      throw createAuthError(
        AUTH_CLOUD_FUNCTION_MISSING,
        "请先部署云函数 quickstartFunctions"
      );
    }
    throw err;
  }
}

async function registerWithClient(openid, userInfo) {
  const db = wx.cloud.database();
  const currentTime = now();
  const baseUser = {
    openid,
    nickName: userInfo.nickName,
    avatarUrl: userInfo.avatarUrl,
    registeredAt: currentTime,
    lastLoginAt: currentTime
  };

  try {
    const res = await db.collection(USERS_COLLECTION).where({ openid }).limit(1).get();
    if (res.data && res.data.length > 0) {
      const doc = res.data[0];
      await db.collection(USERS_COLLECTION).doc(doc._id).update({
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          lastLoginAt: db.serverDate()
        }
      });
      return {
        ...baseUser,
        userId: doc._id,
        registeredAt: doc.registeredAt || currentTime
      };
    }

    const addRes = await db.collection(USERS_COLLECTION).add({
      data: {
        openid,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        registeredAt: db.serverDate(),
        lastLoginAt: db.serverDate()
      }
    });
    return {
      ...baseUser,
      userId: addRes._id
    };
  } catch (err) {
    if (!isMissingCollectionError(err)) {
      console.error("client register user failed", err);
    }
    return baseUser;
  }
}

async function registerOrLoginUser() {
  const userInfo = await getUserProfile();

  try {
    const cloudUser = await registerWithCloudFunction(userInfo);
    return saveAuthUser(cloudUser);
  } catch (err) {
    const openid = await getOpenId();
    const clientUser = await registerWithClient(openid, userInfo);
    return saveAuthUser(clientUser);
  }
}

function requireVerifiedPage() {
  if (isVerified()) return true;
  if (authRedirectPending) return false;
  authRedirectPending = true;
  wx.showToast({ title: "先回首页逛逛，想用这个功能时再登录", icon: "none" });
  const releaseRedirectLock = () => {
    setTimeout(() => {
      authRedirectPending = false;
    }, 300);
  };
  wx.reLaunch({
    url: "/pages/home/home?loginTip=1",
    success: releaseRedirectLock,
    fail: releaseRedirectLock
  });
  return false;
}

function canAccessOwnedRecord(record, user) {
  if (!record || !user) return false;
  const ownerOpenId = record.ownerOpenId || record.ownerOpenid || "";
  if (ownerOpenId === user.openid) return true;
  if ((record.sharedOpenIds || []).indexOf(user.openid) >= 0) return true;
  return (record.sharedUsers || []).some(item => item && item.openid === user.openid);
}

function isRecordOwner(record, user) {
  if (!record || !user) return false;
  const ownerOpenId = record.ownerOpenId || record.ownerOpenid || "";
  return ownerOpenId === user.openid;
}

module.exports = {
  AUTH_CLOUD_FUNCTION_MISSING,
  SESSION_DAYS,
  canAccessOwnedRecord,
  clearVerification,
  getVerifiedUser,
  isMissingFunctionError,
  isMissingCollectionError,
  isVerified,
  isRecordOwner,
  registerOrLoginUser,
  requireVerifiedPage,
  saveAuthUser
};
