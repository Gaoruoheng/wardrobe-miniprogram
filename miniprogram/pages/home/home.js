const { getVerifiedUser } = require("../../utils/auth.js");
const {
  DEFAULT_SKIN,
  SKIN_OPTIONS,
  getSelectedSkin,
  setSelectedSkin
} = require("../../utils/skin.js");
const {
  isAdminModeActive,
  setAdminModeActive
} = require("../../utils/adminMode.js");
const homeAdminActions = require("../../utils/homeAdminActions.js");
const homeWardrobeActions = require("../../utils/homeWardrobeActions.js");
const homeWardrobeView = require("../../utils/homeWardrobeView.js");

Page({
  data: {
    wardrobes: [],
    wardrobeCount: 0,
    isEmpty: true,
    selectedSkin: DEFAULT_SKIN,
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
    showAdminPasswordModal: false,
    showAdminConsole: false,
    adminPassword: "",
    adminWardrobes: [],
    isAdminActive: false,
    shareCodeInput: "",
    isJoiningShare: false
  },

  onShow() {
    const verifiedUser = getVerifiedUser();
    const isAdminActive = !!verifiedUser && isAdminModeActive();
    this.loadSkinPreference();
    const nextData = {
      isVerified: !!verifiedUser,
      verifiedUser,
      showVerifyModal: !verifiedUser,
      isVerifying: false,
      showAdminPasswordModal: false,
      adminPassword: "",
      isAdminActive
    };
    if (!isAdminActive) {
      nextData.showAdminConsole = false;
      nextData.adminWardrobes = [];
    }
    this.setData(nextData);
    if (verifiedUser) {
      const hasCache = this.hydrateWardrobesCache(verifiedUser);
      this.fetchWardrobes({ silent: hasCache });
    } else {
      setAdminModeActive(false);
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
    return homeWardrobeActions.ensureVerified(this);
  },

  formatText(value, fallback) {
    return homeWardrobeView.formatText(value, fallback);
  },

  getWardrobeName(item) {
    return homeWardrobeView.getWardrobeName(item);
  },

  decorateWardrobe(item, index) {
    return homeWardrobeView.decorateWardrobe(item, index);
  },

  getWardrobesCacheId(user) {
    return homeWardrobeView.getWardrobesCacheId(user);
  },

  hydrateWardrobesCache(user) {
    return homeWardrobeView.hydrateWardrobesCache(this, user);
  },

  applyWardrobes(rawWardrobes, user) {
    homeWardrobeView.applyWardrobes(this, rawWardrobes, user);
  },

  findWardrobe(id) {
    return homeWardrobeView.findWardrobe(this, id);
  },

  buildWardrobePreview(wardrobe) {
    return homeWardrobeView.buildWardrobePreview(wardrobe);
  },

  cacheWardrobeIndexPreview(id) {
    homeWardrobeView.cacheWardrobeIndexPreview(this, id);
  },

  cacheManagePreview(id) {
    homeWardrobeView.cacheManagePreview(this, id);
  },

  async fetchWardrobes(options = {}) {
    return homeWardrobeActions.fetchWardrobes(this, options);
  },

  

  adminLongPress() {
    homeAdminActions.adminLongPress(this);
  },

  adminClosePwdModal() {
    homeAdminActions.adminClosePwdModal(this);
  },

  adminPasswordInput(e) {
    homeAdminActions.adminPasswordInput(this, e);
  },

  showAdminFetchError(result = {}, err) {
    homeAdminActions.showAdminFetchError(result, err);
  },

  async fetchAdminWardrobes() {
    return homeAdminActions.fetchAdminWardrobes(this);
  },

  async adminVerifyPassword() {
    return homeAdminActions.adminVerifyPassword(this);
  },

  adminCloseConsole() {
    homeAdminActions.adminCloseConsole(this);
  },

  adminQuit() {
    homeAdminActions.adminQuit(this);
  },

  adminEnterWardrobe(e) {
    homeAdminActions.adminEnterWardrobe(this, e);
  },
  enterWardrobe(e) {
    homeWardrobeActions.enterWardrobe(this, e);
  },

  onLongPress(e) {
    homeWardrobeActions.onLongPress(this, e);
  },

  closeSheet() {
    homeWardrobeActions.closeSheet(this);
  },

  noop() {},

  verifyUser() {
    homeWardrobeActions.verifyUser(this);
  },

  logoutVerify() {
    homeWardrobeActions.logoutVerify(this);
  },

  openCreateModal() {
    homeWardrobeActions.openCreateModal(this);
  },

  openJoinModal() {
    homeWardrobeActions.openJoinModal(this);
  },

  closeJoinModal() {
    homeWardrobeActions.closeJoinModal(this);
  },

  onShareCodeInput(e) {
    homeWardrobeActions.onShareCodeInput(this, e);
  },

  normalizeShareCode(value) {
    return homeWardrobeView.normalizeShareCode(value);
  },

  async joinSharedWardrobe() {
    return homeWardrobeActions.joinSharedWardrobe(this);
  },

  closeCreateModal() {
    homeWardrobeActions.closeCreateModal(this);
  },

  onNewNameInput(e) {
    homeWardrobeActions.onNewNameInput(this, e);
  },

  onNewDescInput(e) {
    homeWardrobeActions.onNewDescInput(this, e);
  },

  goManage() {
    homeWardrobeActions.goManage(this);
  },

  deleteWardrobe() {
    homeWardrobeActions.deleteWardrobe(this);
  },

  async createDefaultCategories(wardrobeId, user) {
    return homeWardrobeActions.createDefaultCategories(wardrobeId, user);
  },

  createWardrobe() {
    homeWardrobeActions.createWardrobe(this);
  }
});
