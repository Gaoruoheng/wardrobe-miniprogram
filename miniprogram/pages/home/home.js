const db = wx.cloud.database();
const {
  AUTH_CLOUD_FUNCTION_MISSING,
  clearVerification,
  getVerifiedUser,
  isMissingFunctionError,
  isRecordOwner,
  registerOrLoginUser
} = require("../../utils/auth.js");
const { getCache, setCache, removeCache } = require("../../utils/pageCache.js");
const {
  DEFAULT_SKIN,
  SKIN_OPTIONS,
  getSelectedSkin,
  setSelectedSkin
} = require("../../utils/skin.js");

const STICKERS = [
  "/images/home/bear-wave.png",
  "/images/home/bear-watermelon.png",
  "/images/home/bear-shopping.png",
  "/images/home/bear-toast.png",
  "/images/home/bear-snack.png",
  "/images/home/bear-costume.png"
];

const THEMES = [
  "theme-pink",
  "theme-cream",
  "theme-mint",
  "theme-lavender"
];
const DEFAULT_CATEGORIES = ["上衣", "下装", "连衣裙", "鞋子", "配饰"];

Page({
  data: {
    wardrobes: [],
    wardrobeCount: 0,
    isEmpty: true,
    selectedSkin: DEFAULT_SKIN,
    showAdminPasswordModal: false,
    showAdminConsole: false,
    adminPassword: "",
    adminWardrobes: [],
    skinOptions: SKIN_OPTIONS,
    showSkinSheet: false,
    showActionSheet: false,
    showCreateModal: false,
    selectedId: "",
    selectedName: "",
    newWardrobeName: "",
    newWardrobeDesc: "",
    isVerified: false,
    verifiedUser: null,
    showVerifyModal: false,
    isVerifying: false,
    showJoinModal: false,
    shareCodeInput: "",
    isJoiningShare: false
  },

  onShow() {
    const verifiedUser = getVerifiedUser();
    this.loadSkinPreference();
    this.setData({
      isVerified: !!verifiedUser,
      verifiedUser,
      showVerifyModal: !verifiedUser,
      isVerifying: false,
      
      showAdminPasswordModal: false,
      showAdminConsole: false,
      adminPassword: "",
      adminWardrobes: []
    });
    if (verifiedUser) {
      const hasCache = this.hydrateWardrobesCache(verifiedUser);
      this.fetchWardrobes({ silent: hasCache });
    } else {
      this.setData({
        wardrobes: [],
        wardrobeCount: 0,
        isEmpty: true
      });
    }
  },

  loadSkinPreference() {
    const selectedSkin = getSelectedSkin();
    if (selectedSkin !== this.data.selectedSkin) {
      this.setData({ selectedSkin });
    }
  },

  openSkinSheet() {
    this.setData({ showSkinSheet: true });
  },

  closeSkinSheet() {
    this.setData({ showSkinSheet: false });
  },

  selectSkin(e) {
    const selectedSkin = setSelectedSkin(e.currentTarget.dataset.skin);
    this.setData({
      selectedSkin,
      showSkinSheet: false
    });
  },

  ensureVerified() {
    if (this.data.isVerified) return true;
    this.setData({ showVerifyModal: true });
    wx.showToast({ title: "请先完成身份验证", icon: "none" });
    return false;
  },

  formatText(value, fallback) {
    if (typeof value === "number") return String(value);
    if (typeof value !== "string") return fallback;
    const text = value.replace(/\s+/g, " ").trim();
    return text || fallback;
  },

  getWardrobeName(item) {
    return this.formatText(
      item.name || item.wardrobeName || item.closetName || item.title,
      "未命名衣柜"
    );
  },

  decorateWardrobe(item, index) {
    const name = this.getWardrobeName(item);
    const isShared = item.accessRole === "shared";
    return {
      ...item,
      displayName: name,
      displayDesc: this.formatText(item.desc, "这里还没有备注，长按可以管理。"),
      displayIcon: this.formatText(item.icon, "🧸"),
      rankText: (isShared ? "共享 " : "衣柜 ") + (index + 1),
      sticker: STICKERS[index % STICKERS.length],
      themeClass: THEMES[index % THEMES.length],
      isShared,
      roleText: isShared ? "共享衣柜" : "我的衣柜"
    };
  },

  getWardrobesCacheId(user) {
    return user && user.openid ? user.openid : "";
  },

  hydrateWardrobesCache(user) {
    const cached = getCache("home-wardrobes", this.getWardrobesCacheId(user));
    if (!cached || !cached.wardrobes) return false;

    const wardrobes = cached.wardrobes.map((item, index) => this.decorateWardrobe(item, index));
    this.setData({
      wardrobes,
      wardrobeCount: wardrobes.length,
      isEmpty: wardrobes.length === 0
    });
    return true;
  },

  applyWardrobes(rawWardrobes, user) {
    const wardrobes = rawWardrobes.map((item, index) => this.decorateWardrobe(item, index));
    this.setData({
      wardrobes,
      wardrobeCount: wardrobes.length,
      isEmpty: wardrobes.length === 0
    });
    const sourceUpdatedAt = rawWardrobes
      .map(item => item.updatedAt || item.createTime || "")
      .join("|");
    setCache("home-wardrobes", this.getWardrobesCacheId(user), {
      wardrobes: rawWardrobes,
      sourceUpdatedAt
    }, { sourceUpdatedAt });
  },

  findWardrobe(id) {
    return this.data.wardrobes.find(item => item && item._id === id) || null;
  },

  buildWardrobePreview(wardrobe) {
    if (!wardrobe) return null;
    return {
      ...wardrobe,
      _id: wardrobe._id,
      name: wardrobe.name || wardrobe.displayName || "我的衣柜",
      desc: wardrobe.desc || wardrobe.displayDesc || "",
      icon: wardrobe.icon || wardrobe.displayIcon || "🧸"
    };
  },

  cacheWardrobeIndexPreview(id) {
    const user = getVerifiedUser();
    if (!user || !user.openid || !id) return;

    const cacheId = [user.openid, id].join(":");
    const cached = getCache("wardrobe-index", cacheId) || {};
    const wardrobe = this.buildWardrobePreview(this.findWardrobe(id));
    if (!wardrobe) return;

    setCache("wardrobe-index", cacheId, {
      ...cached,
      wardrobe: {
        ...(cached.wardrobe || {}),
        ...wardrobe
      },
      categories: cached.categories || [],
      items: cached.items || []
    });
  },

  cacheManagePreview(id) {
    const user = getVerifiedUser();
    if (!user || !user.openid || !id) return;

    const wardrobe = this.buildWardrobePreview(this.findWardrobe(id));
    if (!wardrobe) return;
    setCache("manage-preview", [user.openid, id].join(":"), {
      wardrobe,
      categories: [],
      totalItems: 0
    });
  },

  async fetchWardrobes(options = {}) {
    const user = getVerifiedUser();
    if (!user) return;

    const shouldShowLoading = !options.silent && this.data.wardrobes.length === 0;
    if (shouldShowLoading) wx.showLoading({ title: "加载中", mask: true });
    try {
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
      this.applyWardrobes(rawWardrobes, user);
    } catch (err) {
      console.error(err);
      if (!options.silent) wx.showToast({ title: "加载失败", icon: "error" });
    } finally {
      if (shouldShowLoading) wx.hideLoading();
    }
  },


  onAdminLongPress() {
    this.setData({
      showAdminPasswordModal: true,
      adminPassword: ""
    });
  },

  onAdminPasswordInput(e) {
    this.setData({ adminPassword: e.detail.value });
  },

  closeAdminPasswordModal() {
    this.setData({
      showAdminPasswordModal: false,
      adminPassword: ""
    });
  },

  async verifyAdminPassword() {
    const pwd = this.data.adminPassword;
    if (pwd !== "20060216") {
      wx.showToast({ title: "密码错误", icon: "error" });
      return;
    }

    this.setData({ showAdminPasswordModal: false });
    wx.showLoading({ title: "拉取数据中...", mask: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "getAdminAllWardrobes",
          password: pwd
        }
      });
      wx.hideLoading();

      const result = res.result || {};
      if (result.success) {
        this.setData({
          showAdminConsole: true,
          adminWardrobes: result.wardrobes || []
        });
      } else {
        wx.showToast({ title: result.code || "获取失败", icon: "none" });
      }
    } catch (err) {
      wx.hideLoading();
      console.error("fetch admin data failed", err);
      wx.showToast({ title: "接口调用失败", icon: "none" });
    }
  },
  closeAdminConsole() {
    this.setData({
      showAdminConsole: false,
      adminWardrobes: []
    });
  },

  adminEnterWardrobe(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ showAdminConsole: false });
    wx.navigateTo({
      url: "/pages/index/index?wardrobeId=" + id
    });
  },

  enterWardrobe(e) {
    if (!this.ensureVerified()) return;
    if (this.data.showActionSheet) return;
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: "衣柜信息缺失，请刷新重试", icon: "none" });
      return;
    }
    this.cacheWardrobeIndexPreview(id);
    wx.navigateTo({
      url: "/pages/index/index?wardrobeId=" + id,
      fail: (err) => {
        console.error("enter wardrobe failed", err);
        wx.showToast({ title: "进入衣柜失败，请重新编译", icon: "none" });
      }
    });
  },

  onLongPress(e) {
    if (!this.ensureVerified()) return;
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || "这个衣柜";
    this.setData({
      showActionSheet: true,
      selectedId: id,
      selectedName: name
    });
  },

  closeSheet() {
    this.setData({
      showActionSheet: false,
      selectedId: "",
      selectedName: ""
    });
  },

  noop() {},

  verifyUser() {
    if (this.data.isVerifying) return;

    this.setData({ isVerifying: true });
    registerOrLoginUser().then((verifiedUser) => {
      this.setData({
        isVerified: true,
        verifiedUser,
        showVerifyModal: false,
        isVerifying: false
      });
      wx.showToast({ title: "登录成功", icon: "success" });
      this.fetchWardrobes();
    }).catch((err) => {
      this.setData({ isVerifying: false });
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
  },

  logoutVerify() {
    const user = getVerifiedUser();
    if (user) removeCache("home-wardrobes", this.getWardrobesCacheId(user));
    clearVerification();
    this.setData({
      isVerified: false,
      verifiedUser: null,
      showVerifyModal: true,
      wardrobes: [],
      wardrobeCount: 0,
      isEmpty: true
    });
  },

  openCreateModal() {
    if (!this.ensureVerified()) return;
    this.setData({
      showCreateModal: true,
      newWardrobeName: "",
      newWardrobeDesc: ""
    });
  },

  openJoinModal() {
    if (!this.ensureVerified()) return;
    this.setData({
      showJoinModal: true,
      shareCodeInput: "",
      isJoiningShare: false
    });
  },

  closeJoinModal() {
    this.setData({
      showJoinModal: false,
      shareCodeInput: "",
      isJoiningShare: false
    });
  },

  onShareCodeInput(e) {
    this.setData({ shareCodeInput: e.detail.value });
  },

  normalizeShareCode(value) {
    return this.formatText(value, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  },

  async joinSharedWardrobe() {
    const user = getVerifiedUser();
    const shareCode = this.normalizeShareCode(this.data.shareCodeInput);
    if (!user) return;
    if (!shareCode) {
      wx.showToast({ title: "请输入共享码", icon: "none" });
      return;
    }
    if (this.data.isJoiningShare) return;

    this.setData({ isJoiningShare: true });
    wx.showLoading({ title: "加入中", mask: true });
    try {
      const res = await db.collection("wardrobe_hubs")
        .where({ shareCode, shareEnabled: true })
        .limit(1)
        .get();
      if (!res.data || res.data.length === 0) {
        wx.showToast({ title: "共享码无效", icon: "none" });
        return;
      }

      const wardrobe = res.data[0];
      if (isRecordOwner(wardrobe, user)) {
        wx.showToast({ title: "这是你自己的衣柜", icon: "none" });
        return;
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
      wx.showToast({ title: "已加入共享衣柜", icon: "success" });
      this.closeJoinModal();
      this.fetchWardrobes();
    } catch (err) {
      console.error(err);
      wx.showToast({ title: "加入失败", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ isJoiningShare: false });
    }
  },

  closeCreateModal() {
    this.setData({
      showCreateModal: false,
      newWardrobeName: "",
      newWardrobeDesc: ""
    });
  },

  onNewNameInput(e) {
    this.setData({ newWardrobeName: e.detail.value });
  },

  onNewDescInput(e) {
    this.setData({ newWardrobeDesc: e.detail.value });
  },

  goManage() {
    if (!this.ensureVerified()) return;
    const id = this.data.selectedId;
    if (!id) {
      wx.showToast({ title: "请先选择衣柜", icon: "none" });
      return;
    }
    this.cacheManagePreview(id);
    this.closeSheet();
    wx.navigateTo({
      url: "/pages/manage/manage?wardrobeId=" + id,
      fail: (err) => {
        console.error("go manage failed", err);
        wx.showToast({ title: "打开管理失败，请重新编译", icon: "none" });
      }
    });
  },

  deleteWardrobe() {
    if (!this.ensureVerified()) return;
    const id = this.data.selectedId;
    const name = this.data.selectedName || "这个衣柜";
    if (!id) return;
    const wardrobe = this.data.wardrobes.find(item => item._id === id);
    if (wardrobe && wardrobe.isShared) {
      this.closeSheet();
      wx.showToast({ title: "共享衣柜不能删除", icon: "none" });
      return;
    }

    this.closeSheet();
    wx.showModal({
      title: "删除衣柜",
      content: "确定删除「" + name + "」吗？这个操作不能撤销。",
      confirmText: "删除",
      confirmColor: "#E76F7A",
      cancelText: "取消",
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: "删除中", mask: true });
        try {
          const callRes = await wx.cloud.callFunction({
            name: "quickstartFunctions",
            data: {
              type: "deleteWardrobe",
              wardrobeId: id
            }
          });
          const result = callRes.result || {};
          if (!result.success) {
            const deleteErr = new Error(result.code || "DELETE_WARDROBE_UNAVAILABLE");
            deleteErr.code = result.code || "DELETE_WARDROBE_UNAVAILABLE";
            throw deleteErr;
          }

          const user = getVerifiedUser();
          if (user) {
            removeCache("home-wardrobes", this.getWardrobesCacheId(user));
            const cacheId = [user.openid, id].join(":");
            removeCache("wardrobe-index", cacheId);
            removeCache("manage-wardrobe", cacheId);
            removeCache("manage-preview", cacheId);
          }
          removeCache("wardrobe-index", id);
          wx.hideLoading();
          wx.showToast({ title: "已删除", icon: "success" });
          this.fetchWardrobes();
        } catch (err) {
          console.error(err);
          wx.hideLoading();
          if (err && err.code === "FORBIDDEN") {
            wx.showToast({ title: "只有主人可以删除", icon: "none" });
          } else if (err && err.code === "WARDROBE_NOT_FOUND") {
            wx.showToast({ title: "衣柜不存在", icon: "none" });
          } else if ((err && err.code === "DELETE_WARDROBE_UNAVAILABLE") || isMissingFunctionError(err)) {
            wx.showToast({ title: "请重新部署云函数", icon: "none" });
          } else {
            wx.showToast({ title: "删除失败", icon: "error" });
          }
        }
      }
    });
  },

  async createDefaultCategories(wardrobeId, user) {
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
  },

  createWardrobe() {
    if (!this.ensureVerified()) return;
    const user = getVerifiedUser();
    if (!user) return;
    const name = this.formatText(this.data.newWardrobeName, "");
    const desc = this.formatText(this.data.newWardrobeDesc, "");

    if (!name) {
      wx.showToast({ title: "先写衣柜名", icon: "none" });
      return;
    }

    wx.showLoading({ title: "创建中", mask: true });
    db.collection("wardrobe_hubs").add({
      data: {
        name,
        desc,
        icon: "🧸",
        ownerOpenId: user.openid,
        ownerNickName: user.nickName,
        ownerAvatarUrl: user.avatarUrl,
        createTime: db.serverDate()
      }
    }).then(async (res) => {
      await this.createDefaultCategories(res._id, user);
      wx.hideLoading();
      this.closeCreateModal();
      wx.showToast({ title: "已创建", icon: "success" });
      this.fetchWardrobes();
    }).catch((err) => {
      console.error(err);
      wx.hideLoading();
      wx.showToast({ title: "创建失败", icon: "error" });
    });
  }
});
