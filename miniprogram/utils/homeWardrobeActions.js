const {
  AUTH_CLOUD_FUNCTION_MISSING,
  clearVerification,
  getVerifiedUser,
  isMissingFunctionError,
  registerOrLoginUser
} = require("./auth.js");
const { removeCache } = require("./pageCache.js");
const { setAdminModeActive } = require("./adminMode.js");
const homeWardrobeApi = require("../services/homeWardrobeApi.js");
const homeWardrobeView = require("./homeWardrobeView.js");

function ensureVerified(page) {
  if (page.data.isVerified) return true;
  page.setData({ showVerifyModal: true });
  wx.showToast({ title: "请先完成身份验证", icon: "none" });
  return false;
}

async function fetchWardrobes(page, options = {}) {
  const user = getVerifiedUser();
  if (!user) return;

  const shouldShowLoading = !options.silent && page.data.wardrobes.length === 0;
  let toast = null;
  if (shouldShowLoading) wx.showLoading({ title: "加载中", mask: true });
  try {
    const rawWardrobes = await homeWardrobeApi.fetchWardrobes(user);
    homeWardrobeView.applyWardrobes(page, rawWardrobes, user);
  } catch (err) {
    console.error(err);
    if (!options.silent) toast = { title: "加载失败", icon: "error" };
  } finally {
    if (shouldShowLoading) wx.hideLoading();
  }
  if (toast) wx.showToast(toast);
}

function enterWardrobe(page, e) {
  if (!ensureVerified(page)) return;
  if (page.data.showActionSheet) return;
  const id = e.currentTarget.dataset.id;
  if (!id) {
    wx.showToast({ title: "衣柜信息缺失，请刷新重试", icon: "none" });
    return;
  }
  homeWardrobeView.cacheWardrobeIndexPreview(page, id);
  wx.navigateTo({
    url: "/pages/index/index?wardrobeId=" + id,
    fail: (err) => {
      console.error("enter wardrobe failed", err);
      wx.showToast({ title: "进入衣柜失败，请重新编译", icon: "none" });
    }
  });
}

function onLongPress(page, e) {
  if (!ensureVerified(page)) return;
  const id = e.currentTarget.dataset.id;
  const name = e.currentTarget.dataset.name || "这个衣柜";
  page.setData({
    showActionSheet: true,
    selectedId: id,
    selectedName: name
  });
}

function closeSheet(page) {
  page.setData({
    showActionSheet: false,
    selectedId: "",
    selectedName: ""
  });
}

function verifyUser(page) {
  if (page.data.isVerifying) return;

  page.setData({ isVerifying: true });
  registerOrLoginUser().then((verifiedUser) => {
    page.setData({
      isVerified: true,
      verifiedUser,
      showVerifyModal: false,
      isVerifying: false
    });
    wx.showToast({ title: "登录成功", icon: "success" });
    fetchWardrobes(page);
  }).catch((err) => {
    page.setData({ isVerifying: false });
    if (err && err.code === AUTH_CLOUD_FUNCTION_MISSING) {
      wx.showModal({
        title: "需要部署云函数",
        content: "用户注册登录需要 quickstartFunctions 云函数。请在云开发里部署后再登录。",
        showCancel: false,
        confirmText: "知道了"
      });
      return;
    }
    console.error("login failed", err);
    wx.showToast({ title: "登录失败", icon: "none" });
  });
}

function logoutVerify(page) {
  const user = getVerifiedUser();
  if (user) removeCache("home-wardrobes", homeWardrobeView.getWardrobesCacheId(user));
  setAdminModeActive(false);
  clearVerification();
  page.setData({
    isVerified: false,
    verifiedUser: null,
    showVerifyModal: true,
    wardrobes: [],
    wardrobeCount: 0,
    isEmpty: true
  });
}

function openCreateModal(page) {
  if (!ensureVerified(page)) return;
  page.setData({
    showCreateModal: true,
    newWardrobeName: "",
    newWardrobeDesc: ""
  });
}

function openJoinModal(page) {
  if (!ensureVerified(page)) return;
  page.setData({
    showJoinModal: true,
    shareCodeInput: "",
    isJoiningShare: false
  });
}

function closeJoinModal(page) {
  page.setData({
    showJoinModal: false,
    shareCodeInput: "",
    isJoiningShare: false
  });
}

function onShareCodeInput(page, e) {
  page.setData({ shareCodeInput: e.detail.value });
}

async function joinSharedWardrobe(page) {
  const user = getVerifiedUser();
  const shareCode = homeWardrobeView.normalizeShareCode(page.data.shareCodeInput);
  if (!user) return;
  if (!shareCode) {
    wx.showToast({ title: "请输入共享码", icon: "none" });
    return;
  }
  if (page.data.isJoiningShare) return;

  page.setData({ isJoiningShare: true });
  let toast = null;
  let shouldRefresh = false;
  wx.showLoading({ title: "加入中", mask: true });
  try {
    await homeWardrobeApi.joinSharedWardrobe(user, shareCode);
    toast = { title: "已加入共享衣柜", icon: "success" };
    closeJoinModal(page);
    shouldRefresh = true;
  } catch (err) {
    console.error(err);
    if (err && err.code === "SHARE_CODE_INVALID") {
      toast = { title: "共享码无效", icon: "none" };
    } else if (err && err.code === "OWN_WARDROBE") {
      toast = { title: "这是你自己的衣柜", icon: "none" };
    } else {
      toast = { title: "加入失败", icon: "none" };
    }
  } finally {
    wx.hideLoading();
    page.setData({ isJoiningShare: false });
  }
  if (toast) wx.showToast(toast);
  if (shouldRefresh) fetchWardrobes(page);
}

function closeCreateModal(page) {
  page.setData({
    showCreateModal: false,
    newWardrobeName: "",
    newWardrobeDesc: ""
  });
}

function onNewNameInput(page, e) {
  page.setData({ newWardrobeName: e.detail.value });
}

function onNewDescInput(page, e) {
  page.setData({ newWardrobeDesc: e.detail.value });
}

function goManage(page) {
  if (!ensureVerified(page)) return;
  const id = page.data.selectedId;
  if (!id) {
    wx.showToast({ title: "请先选择衣柜", icon: "none" });
    return;
  }
  homeWardrobeView.cacheManagePreview(page, id);
  closeSheet(page);
  wx.navigateTo({
    url: "/pages/manage/manage?wardrobeId=" + id,
    fail: (err) => {
      console.error("go manage failed", err);
      wx.showToast({ title: "打开管理失败，请重新编译", icon: "none" });
    }
  });
}

function deleteErrorToast(err) {
  if (err && err.code === "FORBIDDEN") {
    return { title: "只有主人可以删除", icon: "none" };
  } else if (err && err.code === "WARDROBE_NOT_FOUND") {
    return { title: "衣柜不存在", icon: "none" };
  } else if ((err && err.code === "DELETE_WARDROBE_UNAVAILABLE") || isMissingFunctionError(err)) {
    return { title: "请重新部署云函数", icon: "none" };
  }
  return { title: "删除失败", icon: "error" };
}

function deleteWardrobe(page) {
  if (!ensureVerified(page)) return;
  const id = page.data.selectedId;
  const name = page.data.selectedName || "这个衣柜";
  if (!id) return;
  const wardrobe = homeWardrobeView.findWardrobe(page, id);
  if (wardrobe && wardrobe.isShared) {
    closeSheet(page);
    wx.showToast({ title: "共享衣柜不能删除", icon: "none" });
    return;
  }

  closeSheet(page);
  wx.showModal({
    title: "删除衣柜",
    content: "确定删除「" + name + "」吗？这个操作不能撤销。",
    confirmText: "删除",
    confirmColor: "#E76F7A",
    cancelText: "取消",
    success: async (res) => {
      if (!res.confirm) return;
      let toast = null;
      let shouldRefresh = false;
      wx.showLoading({ title: "删除中", mask: true });
      try {
        await homeWardrobeApi.deleteWardrobe(id);
        homeWardrobeView.removeWardrobeCaches(getVerifiedUser(), id);
        toast = { title: "已删除", icon: "success" };
        shouldRefresh = true;
      } catch (err) {
        console.error(err);
        toast = deleteErrorToast(err);
      } finally {
        wx.hideLoading();
      }
      if (toast) wx.showToast(toast);
      if (shouldRefresh) fetchWardrobes(page);
    }
  });
}

async function createDefaultCategories(wardrobeId, user) {
  return homeWardrobeApi.createDefaultCategories(wardrobeId, user);
}

async function createWardrobe(page) {
  if (!ensureVerified(page)) return;
  const user = getVerifiedUser();
  if (!user) return;
  const name = homeWardrobeView.formatText(page.data.newWardrobeName, "");
  const desc = homeWardrobeView.formatText(page.data.newWardrobeDesc, "");

  if (!name) {
    wx.showToast({ title: "先写衣柜名", icon: "none" });
    return;
  }

  let toast = null;
  let shouldRefresh = false;
  wx.showLoading({ title: "创建中", mask: true });
  try {
    await homeWardrobeApi.createWardrobe(user, name, desc);
    closeCreateModal(page);
    toast = { title: "已创建", icon: "success" };
    shouldRefresh = true;
  } catch (err) {
    console.error(err);
    toast = { title: "创建失败", icon: "error" };
  } finally {
    wx.hideLoading();
  }
  if (toast) wx.showToast(toast);
  if (shouldRefresh) fetchWardrobes(page);
}

module.exports = {
  ensureVerified,
  fetchWardrobes,
  enterWardrobe,
  onLongPress,
  closeSheet,
  verifyUser,
  logoutVerify,
  openCreateModal,
  openJoinModal,
  closeJoinModal,
  onShareCodeInput,
  joinSharedWardrobe,
  closeCreateModal,
  onNewNameInput,
  onNewDescInput,
  goManage,
  deleteWardrobe,
  createDefaultCategories,
  createWardrobe
};
