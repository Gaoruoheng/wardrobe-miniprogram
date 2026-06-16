const {
  calcTaskBadgeCount,
  uniqueIds,
  buildSelectedItemsState
} = require("./selectionState.js");
const wardrobeIndexApi = require("../services/wardrobeIndexApi.js");

function formatNow() {
  const date = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return month + "月" + day + "日 " + hour + ":" + minute;
}

function refreshSelectedItems(page) {
  page.setData(buildSelectedItemsState(
    page.data.allItems,
    page.data.selectedItemIds,
    page.data.tasks,
    page.data.allItemsLoaded
  ));
}

function setSelection(page, ids, shouldSave) {
  const cleanIds = uniqueIds(ids);

  page.setData({ selectedItemIds: cleanIds }, () => {
    refreshSelectedItems(page);
    page.buildGrouped(page.data.categoryNames, page.data.allItems);
    page.cacheCurrentWardrobeState({ selectedItemIds: cleanIds });
  });

  if (shouldSave) saveSelectedItems(page, cleanIds);
}

async function saveItemSelection(page, itemId, selected, rollbackIds) {
  const selectedUpdatedText = formatNow();
  try {
    const result = await wardrobeIndexApi.setItemSelection({
      wardrobeId: page.data.wardrobeId,
      itemId,
      selected,
      selectedUpdatedText
    });
    const selectedItemIds = result.selectedItemIds || [];
    page.setData({ selectedItemIds, selectedUpdatedText }, () => {
      refreshSelectedItems(page);
      page.buildGrouped(page.data.categoryNames, page.data.allItems);
      page.cacheCurrentWardrobeState({ selectedItemIds, selectedUpdatedText });
    });
    return true;
  } catch (err) {
    console.error(err);
    setSelection(page, rollbackIds || [], false);
    page.showWriteError(err, "保存失败");
    return false;
  }
}

function toggleClothSelection(page, e) {
  if (page.data.isDragging || page._suppressTap) return;

  const itemId = e.currentTarget.dataset.id;
  if (!itemId) return;
  const item = page.findItemById(itemId);
  if (item && item.isInUse) {
    wx.showToast({ title: "这件正在使用中", icon: "none", duration: 900 });
    return;
  }

  const oldIds = page.data.selectedItemIds.slice();
  const ids = page.data.selectedItemIds.slice();
  const index = ids.indexOf(itemId);
  const selected = index < 0;
  if (index >= 0) {
    ids.splice(index, 1);
    wx.showToast({ title: "已取消选择", icon: "none", duration: 700 });
  } else {
    ids.push(itemId);
    wx.showToast({ title: "已加入清单", icon: "none", duration: 700 });
  }

  setSelection(page, ids, false);
  saveItemSelection(page, itemId, selected, oldIds);
}

function removeSelectedItem(page, e) {
  const itemId = e.currentTarget.dataset.id;
  const oldIds = page.data.selectedItemIds.slice();
  const ids = page.data.selectedItemIds.filter(id => id !== itemId);
  setSelection(page, ids, false);
  saveItemSelection(page, itemId, false, oldIds);
}

function openPickPanel(page) {
  page.setData({ showPickPanel: true });
}

function closePickPanel(page) {
  page.setData({ showPickPanel: false });
}

function clearSelection(page) {
  wx.showModal({
    title: "清空清单",
    content: "确定清空已经选择的衣服吗？",
    confirmText: "清空",
    confirmColor: "#FF8FAB",
    success: (res) => {
      if (!res.confirm) return;
      setSelection(page, [], true);
      page.setData({ showPickPanel: false });
    }
  });
}

async function confirmSelection(page) {
  const ok = await saveSelectedItems(page, page.data.selectedItemIds);
  if (ok) wx.showToast({ title: "清单已保存", icon: "success" });
}

async function saveSelectedItems(page, ids) {
  if (!page.data.wardrobeId) return false;
  const selectedUpdatedText = formatNow();
  try {
    const result = await wardrobeIndexApi.saveSelectedItems({
      wardrobeId: page.data.wardrobeId,
      selectedItemIds: ids,
      selectedUpdatedText
    });
    const savedIds = result.selectedItemIds || ids;
    page.setData({
      selectedItemIds: savedIds,
      selectedUpdatedText,
      taskBadgeCount: calcTaskBadgeCount(page.data.tasks, page.data.selectedItems)
    }, () => {
      refreshSelectedItems(page);
      page.buildGrouped(page.data.categoryNames, page.data.allItems);
      page.cacheCurrentWardrobeState({ selectedItemIds: savedIds, selectedUpdatedText });
    });
    return true;
  } catch (err) {
    console.error(err);
    page.showWriteError(err, "保存失败");
    return false;
  }
}

module.exports = {
  formatNow,
  refreshSelectedItems,
  setSelection,
  saveItemSelection,
  toggleClothSelection,
  removeSelectedItem,
  openPickPanel,
  closePickPanel,
  clearSelection,
  confirmSelection,
  saveSelectedItems
};
