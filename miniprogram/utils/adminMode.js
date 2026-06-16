const ADMIN_MODE_STORAGE_KEY = "kuma_closet_admin_mode";
const ADMIN_TOKEN_STORAGE_KEY = "kuma_closet_admin_token";

function isAdminModeActive() {
  try {
    return wx.getStorageSync(ADMIN_MODE_STORAGE_KEY) === true;
  } catch (err) {
    console.error("read admin mode failed", err);
    return false;
  }
}

function setAdminModeActive(active, token) {
  try {
    if (active) {
      wx.setStorageSync(ADMIN_MODE_STORAGE_KEY, true);
      if (token) wx.setStorageSync(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      wx.removeStorageSync(ADMIN_MODE_STORAGE_KEY);
      wx.removeStorageSync(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch (err) {
    console.error("write admin mode failed", err);
  }
}

function getAdminTokenForCloud() {
  if (!isAdminModeActive()) return "";
  try {
    const token = wx.getStorageSync(ADMIN_TOKEN_STORAGE_KEY) || "";
    if (!token) setAdminModeActive(false);
    return token;
  } catch (err) {
    console.error("read admin token failed", err);
    return "";
  }
}

module.exports = {
  getAdminTokenForCloud,
  isAdminModeActive,
  setAdminModeActive
};
