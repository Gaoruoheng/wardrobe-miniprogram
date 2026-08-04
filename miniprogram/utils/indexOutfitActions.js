const { getVerifiedUser } = require("./auth.js");
const outfitApi = require("../services/outfitApi.js");
const {
  getOutfitCache,
  setOutfitCache
} = require("./outfitCache.js");
const { decorateOutfit, formatApplyResult } = require("./outfitView.js");

function currentContext(page) {
  const user = getVerifiedUser() || {};
  return {
    user,
    wardrobe: page._wardrobeForCache || {},
    wardrobeId: page.data.wardrobeId,
    openid: user.openid || ""
  };
}

function decorateForPage(page, outfit) {
  const context = currentContext(page);
  const coverItems = outfit.coverItems || (outfit.items || []).slice(0, 3);
  return decorateOutfit({ ...outfit, coverItems }, context.wardrobe, context.openid);
}

function cachePageOutfits(page, outfits) {
  const context = currentContext(page);
  setOutfitCache(context.user, context.wardrobeId, outfits);
}

function hydrateOutfitCache(page) {
  const context = currentContext(page);
  const cached = getOutfitCache(context.user, context.wardrobeId);
  if (!cached) return false;
  page.setData({ outfits: cached.map(outfit => decorateForPage(page, outfit)) });
  page._outfitsLoaded = true;
  return true;
}

async function loadOutfits(page, options = {}) {
  const hasCache = options.skipCache ? false : hydrateOutfitCache(page);
  page.setData({
    outfitsLoading: !hasCache,
    outfitLoadError: false
  });

  try {
    const result = await outfitApi.listOutfits({ wardrobeId: page.data.wardrobeId });
    const outfits = (result.outfits || []).map(outfit => decorateForPage(page, outfit));
    page._outfitsLoaded = true;
    page.setData({ outfits, outfitsLoading: false, outfitLoadError: false });
    cachePageOutfits(page, outfits);
    return outfits;
  } catch (error) {
    console.error("load outfits failed", error);
    page.setData({ outfitsLoading: false, outfitLoadError: true });
    return null;
  }
}

async function openOutfitDetail(page, event) {
  const outfitId = event && event.currentTarget && event.currentTarget.dataset.id ||
    event && event.detail && event.detail.id || "";
  const summary = (page.data.outfits || []).find(outfit => outfit._id === outfitId);
  if (!summary) return;

  page.setData({ selectedOutfit: summary, showOutfitDetail: true });
  try {
    const result = await outfitApi.getOutfit({
      wardrobeId: page.data.wardrobeId,
      outfitId
    });
    if (!page.data.selectedOutfit || page.data.selectedOutfit._id !== outfitId) return;
    page.setData({ selectedOutfit: decorateForPage(page, result.outfit || summary) });
  } catch (error) {
    console.error("load outfit detail failed", error);
    wx.showToast({ title: "套装详情加载失败，请重试", icon: "none" });
  }
}

function closeOutfitDetail(page) {
  page.setData({ showOutfitDetail: false, selectedOutfit: null });
}

function openQuickSaveOutfit(page) {
  if ((page.data.selectedItemIds || []).length < 2) {
    wx.showToast({ title: "至少选择 2 件衣物才能保存套装", icon: "none" });
    return;
  }
  page.setData({ showOutfitQuickSave: true });
}

function closeQuickSaveOutfit(page) {
  if (page.data.outfitSaving) return;
  page.setData({ showOutfitQuickSave: false });
}

async function saveQuickOutfit(page, event) {
  const detail = event && event.detail || {};
  const user = getVerifiedUser() || {};
  page.setData({ outfitSaving: true });
  try {
    const result = await outfitApi.saveOutfit({
      wardrobeId: page.data.wardrobeId,
      name: detail.name,
      note: detail.note,
      itemIds: page.data.selectedItemIds || [],
      createdByName: user.nickName || "衣柜成员"
    });
    applyOutfitMutationFromChild(page, { type: "upsert", outfit: result.outfit });
    page.setData({ showOutfitQuickSave: false });
    wx.showToast({ title: "套装已保存", icon: "success" });
  } catch (error) {
    console.error("quick save outfit failed", error);
    page.showWriteError(error, "套装保存失败");
  } finally {
    page.setData({ outfitSaving: false });
  }
}

async function applyCurrentOutfit(page) {
  const outfit = page.data.selectedOutfit;
  if (!outfit || page.data.outfitApplying) return;
  page.setData({ outfitApplying: true });
  try {
    const selectedUpdatedText = page.formatNow();
    const result = await outfitApi.applyOutfit({
      wardrobeId: page.data.wardrobeId,
      outfitId: outfit._id,
      selectedUpdatedText
    });
    page.setSelection(result.selectedItemIds || [], false);
    page.setData({ selectedUpdatedText, showOutfitDetail: false, selectedOutfit: null });
    page.cacheCurrentWardrobeState({
      selectedItemIds: result.selectedItemIds || [],
      selectedUpdatedText
    });
    wx.showModal({
      title: "已合并到拿衣清单",
      content: formatApplyResult(result),
      showCancel: false,
      confirmText: "知道了"
    });
  } catch (error) {
    console.error("apply outfit failed", error);
    page.showWriteError(error, "套装加入失败");
  } finally {
    page.setData({ outfitApplying: false });
  }
}

function confirmDelete() {
  return new Promise(resolve => {
    wx.showModal({
      title: "删除套装",
      content: "只会删除这个搭配模板，不会删除衣物。",
      confirmText: "删除",
      confirmColor: "#A66A79",
      success: result => resolve(!!result.confirm),
      fail: () => resolve(false)
    });
  });
}

async function deleteCurrentOutfit(page) {
  const outfit = page.data.selectedOutfit;
  if (!outfit || !outfit.canManage || !await confirmDelete()) return;
  try {
    await outfitApi.deleteOutfit({
      wardrobeId: page.data.wardrobeId,
      outfitId: outfit._id
    });
    applyOutfitMutationFromChild(page, { type: "remove", outfitId: outfit._id });
    closeOutfitDetail(page);
    wx.showToast({ title: "套装已删除", icon: "success" });
  } catch (error) {
    console.error("delete outfit failed", error);
    page.showWriteError(error, "套装删除失败");
  }
}

function goCreateOutfit(page) {
  wx.navigateTo({
    url: "/pages/outfit-edit/outfit-edit?wardrobeId=" + page.data.wardrobeId
  });
}

function goEditOutfit(page) {
  const outfit = page.data.selectedOutfit;
  if (!outfit || !outfit.canManage) return;
  wx.navigateTo({
    url: "/pages/outfit-edit/outfit-edit?wardrobeId=" + page.data.wardrobeId +
      "&outfitId=" + outfit._id
  });
}

function applyOutfitMutationFromChild(page, change = {}) {
  let outfits = (page.data.outfits || []).slice();
  if (change.type === "remove") {
    outfits = outfits.filter(outfit => outfit._id !== change.outfitId);
  } else if (change.type === "upsert" && change.outfit) {
    const next = decorateForPage(page, change.outfit);
    outfits = [next].concat(outfits.filter(outfit => outfit._id !== next._id));
  }
  page._outfitsLoaded = true;
  page.setData({ outfits });
  cachePageOutfits(page, outfits);
}

module.exports = {
  hydrateOutfitCache,
  loadOutfits,
  openOutfitDetail,
  closeOutfitDetail,
  openQuickSaveOutfit,
  closeQuickSaveOutfit,
  saveQuickOutfit,
  applyCurrentOutfit,
  deleteCurrentOutfit,
  goCreateOutfit,
  goEditOutfit,
  applyOutfitMutationFromChild
};
