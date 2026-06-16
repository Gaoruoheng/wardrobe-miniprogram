const { isMissingFunctionError } = require("./auth.js");
const {
  getAdminTokenForCloud,
  setAdminModeActive
} = require("./adminMode.js");

function adminLongPress(page) {
  if (page.data.isAdminActive) {
    page.setData({ showAdminConsole: true });
    if (page.data.adminWardrobes.length === 0) {
      fetchAdminWardrobes(page);
    }
    return;
  }
  page.setData({
    showAdminPasswordModal: true,
    adminPassword: ""
  });
}

function adminClosePwdModal(page) {
  page.setData({
    showAdminPasswordModal: false,
    adminPassword: ""
  });
}

function adminPasswordInput(page, e) {
  page.setData({ adminPassword: e.detail.value });
}

function showAdminFetchError(result = {}, err) {
  const code = result.code || "";
  const detail = result.message || (err && (err.errMsg || err.message)) || "";
  let content = "管理员数据没有成功返回，请稍后重试。";

  if (!result || Object.keys(result).length === 0 || code === "UNKNOWN_FUNCTION_TYPE") {
    content = "云函数没有返回 getAdminAllWardrobes 的结果。请重新部署 quickstartFunctions 云函数。";
  } else if (code === "ADMIN_PASSWORD_NOT_CONFIGURED") {
    content = "云端管理员密码还没有配置。请在 quickstartFunctions 云函数环境变量里设置 KUMA_CLOSET_ADMIN_PASSWORD。";
  } else if (isMissingFunctionError(err)) {
    content = "没有找到 quickstartFunctions 云函数。请先在云开发里部署。";
  } else if (code === "UNAUTHORIZED_ADMIN") {
    setAdminModeActive(false);
    content = "管理员密码校验失败，或管理员登录已过期。请重新输入密码。";
  } else if (code === "FETCH_ADMIN_WARDROBES_FAILED") {
    content = "云函数读取 wardrobe_hubs 衣柜集合失败。" + (detail ? "\n" + detail : "");
  } else if (code) {
    content = code + (detail ? "\n" + detail : "");
  } else if (detail) {
    content = detail;
  }

  console.error("admin fetch failed", { result, err });
  wx.showModal({
    title: "拉取数据失败",
    content,
    showCancel: false,
    confirmText: "知道了"
  });
}

async function fetchAdminWardrobes(page, password) {
  wx.showLoading({ title: "拉取数据中...", mask: true });
  try {
    const res = await wx.cloud.callFunction({
      name: "quickstartFunctions",
      data: {
        type: "getAdminAllWardrobes",
        password: password || "",
        adminToken: password ? "" : getAdminTokenForCloud()
      }
    });
    const result = res.result || {};
    if (result.success) {
      setAdminModeActive(true, result.adminToken || getAdminTokenForCloud());
      page.setData({
        isAdminActive: true,
        showAdminConsole: true,
        adminWardrobes: result.wardrobes || []
      });
    } else {
      showAdminFetchError(result);
    }
  } catch (err) {
    showAdminFetchError({}, err);
  } finally {
    wx.hideLoading();
  }
}

async function adminVerifyPassword(page) {
  const password = page.data.adminPassword || "";
  if (!password) {
    wx.showToast({ title: "请输入密码", icon: "none" });
    return;
  }

  page.setData({ showAdminPasswordModal: false });
  await fetchAdminWardrobes(page, password);
}

function adminCloseConsole(page) {
  page.setData({
    showAdminConsole: false,
    adminWardrobes: []
  });
}

function adminQuit(page) {
  setAdminModeActive(false);
  page.setData({
    isAdminActive: false,
    showAdminConsole: false,
    adminWardrobes: []
  });
  wx.showToast({ title: "已退出管理", icon: "success" });
}

function adminEnterWardrobe(page, e) {
  const id = e.currentTarget.dataset.id;
  if (!id) return;
  page.setData({ showAdminConsole: false });
  wx.navigateTo({ url: "/pages/index/index?wardrobeId=" + id });
}

module.exports = {
  adminLongPress,
  adminClosePwdModal,
  adminPasswordInput,
  showAdminFetchError,
  fetchAdminWardrobes,
  adminVerifyPassword,
  adminCloseConsole,
  adminQuit,
  adminEnterWardrobe
};
