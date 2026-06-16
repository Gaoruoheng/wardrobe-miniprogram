const { isMissingFunctionError } = require("./auth.js");
const {
  STATUS_IN_USE,
  normalizeItemStatus,
  decorateItemStatus
} = require("./itemStatus.js");
const wardrobeIndexApi = require("../services/wardrobeIndexApi.js");

function findItemById(page, itemId) {
  const item = page.data.allItems.find(cloth => cloth._id === itemId);
  return item ? decorateItemStatus(item) : null;
}

function showWriteError(err, fallback) {
  if (err && err.code === "FORBIDDEN") {
    wx.showToast({ title: "无权操作这个衣柜", icon: "none" });
  } else if (err && err.code === "ITEM_NOT_FOUND") {
    wx.showToast({ title: "衣服不存在", icon: "none" });
  } else if (err && err.code === "ITEM_IN_USE") {
    wx.showToast({ title: "这件正在使用中", icon: "none" });
  } else if (isMissingFunctionError(err) || (err && err.code === "WRITE_UNAVAILABLE")) {
    wx.showToast({ title: "请重新部署云函数", icon: "none" });
  } else {
    wx.showToast({ title: fallback, icon: "none" });
  }
}

function openItemPanel(page, e) {
  if (page.data.isDragging || page._suppressTap) return;

  const itemId = e.currentTarget.dataset.id;
  const item = findItemById(page, itemId);
  if (!item) return;

  page.setData({
    panelItem: item,
    showItemPanel: true,
    showPickPanel: false
  });
}

function closeItemPanel(page) {
  page.setData({
    showItemPanel: false,
    panelItem: null
  });
}

function editPanelItem(page) {
  const item = page.data.panelItem;
  if (!item || !item._id) return;
  page.setData({ showItemPanel: false });
  page.cacheItemDetail(item);
  wx.navigateTo({
    url: "/pages/item-detail/item-detail?itemId=" + item._id +
      "&wardrobeId=" + page.data.wardrobeId +
      "&from=index"
  });
}

function markPanelItemStatus(page, e) {
  const item = page.data.panelItem;
  if (!item || !item._id) return;
  const status = (e.detail && e.detail.status) || e.currentTarget.dataset.status;
  updateItemStatus(page, item._id, status);
}

async function updateItemStatus(page, itemId, status) {
  const wearStatus = normalizeItemStatus(status);
  const oldItem = findItemById(page, itemId);
  if (!oldItem) return;
  if (oldItem.wearStatus === wearStatus) {
    wx.showToast({ title: "状态未变化", icon: "none", duration: 700 });
    return;
  }

  wx.showLoading({ title: "更新中", mask: true });
  let toast = null;
  try {
    const selectedUpdatedText = page.formatNow();
    const result = await wardrobeIndexApi.updateItemStatus({
      wardrobeId: page.data.wardrobeId,
      itemId,
      status: wearStatus,
      selectedUpdatedText
    });

    const nextAllItems = page.data.allItems.map(item =>
      item._id === itemId ? decorateItemStatus({ ...item, wearStatus }) : item
    );
    const nextPanelItem = page.data.panelItem && page.data.panelItem._id === itemId
      ? decorateItemStatus({ ...page.data.panelItem, wearStatus })
      : page.data.panelItem;
    const selectedIds = wearStatus === STATUS_IN_USE
      ? result.selectedItemIds || page.data.selectedItemIds.filter(id => id !== itemId)
      : page.data.selectedItemIds;
    const selectionChanged = selectedIds.length !== page.data.selectedItemIds.length;

    page.setData({
      allItems: nextAllItems,
      panelItem: nextPanelItem,
      selectedUpdatedText: selectionChanged ? selectedUpdatedText : page.data.selectedUpdatedText
    }, () => {
      if (selectionChanged) {
        page.setSelection(selectedIds, false);
      } else {
        page.refreshSelectedItems();
        page.buildGrouped(page.data.categoryNames, nextAllItems);
        page.cacheCurrentWardrobeState();
      }
    });

    toast = {
      title: "已标记为" + decorateItemStatus({ ...oldItem, wearStatus }).wearStatusText,
      icon: "success",
      duration: 900
    };
  } catch (err) {
    console.error("update item status failed", err);
    toast = { err, fallback: "状态更新失败" };
  } finally {
    wx.hideLoading();
  }
  if (toast && toast.err) {
    showWriteError(toast.err, toast.fallback);
  } else if (toast) {
    wx.showToast(toast);
  }
}

function toggleSearch(page) {
  const showSearch = !page.data.showSearch;
  page.setData({
    showSearch,
    searchKeyword: "",
    searchResultText: "",
    searchMode: "",
    searchTargetCategory: ""
  }, () => {
    page.buildGrouped(page.data.categoryNames, page.data.allItems, { resetActive: true });
  });
}

function onSearch(page, e) {
  const keyword = e.detail.value || "";
  page.setData({ searchKeyword: keyword });
  page.buildGrouped(page.data.categoryNames, page.data.allItems, {
    keyword,
    resetActive: true
  });
}

function clearSearch(page) {
  page.setData({
    searchKeyword: "",
    searchResultText: "",
    searchMode: "",
    searchTargetCategory: ""
  }, () => {
    page.buildGrouped(page.data.categoryNames, page.data.allItems, { resetActive: true });
  });
}

module.exports = {
  findItemById,
  showWriteError,
  openItemPanel,
  closeItemPanel,
  editPanelItem,
  markPanelItemStatus,
  updateItemStatus,
  toggleSearch,
  onSearch,
  clearSearch
};
