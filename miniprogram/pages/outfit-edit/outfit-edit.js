const { getVerifiedUser, requireVerifiedPage } = require("../../utils/auth.js");
const { backToWardrobe } = require("../../utils/navigation.js");
const { DEFAULT_SKIN, syncPageSkin } = require("../../utils/skin.js");
const { normalizeItems, mergeItems } = require("../../utils/indexItemView.js");
const { removeOutfitCache } = require("../../utils/outfitCache.js");
const { reconcileOutfitItemIds } = require("../../utils/outfitView.js");
const wardrobeIndexApi = require("../../services/wardrobeIndexApi.js");
const outfitApi = require("../../services/outfitApi.js");

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueIds(ids) {
  const result = [];
  (ids || []).forEach(id => {
    if (id && result.indexOf(id) < 0) result.push(id);
  });
  return result;
}

Page({
  data: {
    selectedSkin: DEFAULT_SKIN,
    wardrobeId: "",
    outfitId: "",
    version: 0,
    name: "",
    note: "",
    allItems: [],
    groupedItems: [],
    selectedItemIds: [],
    selectedCategory: "",
    loading: true,
    loadError: false,
    saving: false
  },

  async onLoad(options) {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
    const wardrobeId = options.wardrobeId || "";
    const outfitId = options.outfitId || "";
    this.setData({ wardrobeId, outfitId });

    if (!wardrobeId) {
      this.setData({ loading: false, loadError: true });
      return;
    }

    try {
      await Promise.all([
        this.loadAllItems(),
        outfitId ? this.loadOutfit(outfitId) : Promise.resolve()
      ]);
      this.reconcileSelection();
      this.rebuildGroups();
      this.setData({ loading: false, loadError: false });
    } catch (error) {
      console.error("load outfit editor failed", error);
      this.setData({ loading: false, loadError: true });
    }
  },

  onShow() {
    if (!requireVerifiedPage()) return;
    syncPageSkin(this);
  },

  async loadOutfit(outfitId) {
    const result = await outfitApi.getOutfit({
      wardrobeId: this.data.wardrobeId,
      outfitId
    });
    const outfit = result.outfit || {};
    this.setData({
      name: outfit.name || "",
      note: outfit.note || "",
      version: Number(outfit.version || 1),
      selectedItemIds: uniqueIds(outfit.itemIds)
    });
  },

  async loadAllItems() {
    let cursor = null;
    let hasMore = true;
    let allItems = [];

    while (hasMore) {
      const page = await wardrobeIndexApi.fetchItemsPage(
        this.data.wardrobeId,
        cursor,
        50
      );
      allItems = mergeItems(allItems, normalizeItems(page.items || []));
      this.setData({ allItems }, () => this.rebuildGroups());
      cursor = page.nextCursor || null;
      hasMore = !!page.hasMore;
    }
  },

  rebuildGroups() {
    const selectedIds = this.data.selectedItemIds || [];
    const selectedMap = {};
    selectedIds.forEach((id, index) => {
      selectedMap[id] = index + 1;
    });

    const categoryMap = {};
    const groups = [];
    (this.data.allItems || []).forEach(item => {
      const category = item.category || "未分类";
      if (!categoryMap[category]) {
        categoryMap[category] = {
          name: category,
          items: []
        };
        groups.push(categoryMap[category]);
      }
      categoryMap[category].items.push({
        ...item,
        outfitSelected: !!selectedMap[item._id],
        outfitRank: selectedMap[item._id] || 0
      });
    });
    this.setData({ groupedItems: groups });
  },

  reconcileSelection() {
    const selectedItemIds = reconcileOutfitItemIds(
      this.data.selectedItemIds,
      this.data.allItems
    );
    this.setData({ selectedItemIds });
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value });
  },

  onNoteInput(event) {
    this.setData({ note: event.detail.value });
  },

  selectCategory(event) {
    this.setData({ selectedCategory: event.currentTarget.dataset.category || "" });
  },

  toggleItem(event) {
    const itemId = event.currentTarget.dataset.id;
    if (!itemId) return;
    const ids = uniqueIds(this.data.selectedItemIds);
    const index = ids.indexOf(itemId);
    if (index >= 0) {
      ids.splice(index, 1);
    } else {
      if (ids.length >= 20) {
        wx.showToast({ title: "一套最多选择 20 件衣物", icon: "none" });
        return;
      }
      ids.push(itemId);
    }
    this.setData({ selectedItemIds: ids }, () => this.rebuildGroups());
  },

  validationMessage() {
    const name = normalizeText(this.data.name);
    const selectedCount = this.data.selectedItemIds.length;
    if (!name) return "请填写套装名称";
    if (selectedCount < 2) return "至少选择两件衣物";
    if (selectedCount > 20) return "一套最多选择 20 件衣物";
    return "";
  },

  saveErrorMessage(error) {
    const code = error && error.code || "";
    if (code === "OUTFIT_VERSION_CONFLICT") {
      return "套装已被其他成员更新，请返回后重新打开";
    }
    if (code === "OUTFIT_LIMIT_REACHED") {
      return "这个衣柜最多保存 50 套";
    }
    if (code === "OUTFIT_ITEM_NOT_FOUND") {
      return "部分衣物已不存在，请重新选择";
    }
    if (code === "FORBIDDEN") return "你没有权限修改这个套装";
    return "保存失败，请重试";
  },

  notifyPreviousPage(outfit) {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    for (let index = pages.length - 2; index >= 0; index -= 1) {
      const page = pages[index];
      if (page && typeof page.applyOutfitMutationFromChild === "function") {
        page.applyOutfitMutationFromChild({ type: "upsert", outfit });
        return true;
      }
    }
    return false;
  },

  async saveOutfit() {
    if (this.data.saving) return;
    const validationMessage = this.validationMessage();
    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: "none" });
      return;
    }

    const user = getVerifiedUser() || {};
    this.setData({ saving: true });
    try {
      const result = await outfitApi.saveOutfit({
        wardrobeId: this.data.wardrobeId,
        outfitId: this.data.outfitId || undefined,
        version: this.data.version || undefined,
        name: normalizeText(this.data.name),
        note: normalizeText(this.data.note),
        itemIds: uniqueIds(this.data.selectedItemIds),
        createdByName: user.nickName || "衣柜成员"
      });
      removeOutfitCache(user, this.data.wardrobeId);
      this.notifyPreviousPage(result.outfit);
      wx.showToast({ title: "套装已保存", icon: "success" });
      setTimeout(() => backToWardrobe(this.data.wardrobeId), 350);
    } catch (error) {
      console.error("save outfit failed", error);
      wx.showToast({ title: this.saveErrorMessage(error), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadError: false, allItems: [], groupedItems: [] });
    Promise.all([
      this.loadAllItems(),
      this.data.outfitId ? this.loadOutfit(this.data.outfitId) : Promise.resolve()
    ]).then(() => {
      this.reconcileSelection();
      this.rebuildGroups();
      this.setData({ loading: false });
    }).catch(error => {
      console.error("retry outfit editor failed", error);
      this.setData({ loading: false, loadError: true });
    });
  },

  goBack() {
    backToWardrobe(this.data.wardrobeId);
  }
});
