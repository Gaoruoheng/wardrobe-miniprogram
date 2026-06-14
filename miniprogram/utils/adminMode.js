const ADMIN_MODE_STORAGE_KEY = "kuma_closet_admin_mode";
const ADMIN_PASSWORD = "20060216";

function isAdminModeActive() {
  try {
    return wx.getStorageSync(ADMIN_MODE_STORAGE_KEY) === true;
  } catch (err) {
    console.error("read admin mode failed", err);
    return false;
  }
}

function setAdminModeActive(active) {
  try {
    if (active) {
      wx.setStorageSync(ADMIN_MODE_STORAGE_KEY, true);
    } else {
      wx.removeStorageSync(ADMIN_MODE_STORAGE_KEY);
    }
  } catch (err) {
    console.error("write admin mode failed", err);
  }
}

function getAdminPasswordForCloud() {
  return isAdminModeActive() ? ADMIN_PASSWORD : "";
}

module.exports = {
  ADMIN_PASSWORD,
  getAdminPasswordForCloud,
  isAdminModeActive,
  setAdminModeActive
};
