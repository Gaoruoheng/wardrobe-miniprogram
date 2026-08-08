const { decorateItemStatus } = require("./itemStatus.js");

function uniqueIds(ids) {
  const cleanIds = [];
  (ids || []).forEach(id => {
    if (id && cleanIds.indexOf(id) === -1) cleanIds.push(id);
  });
  return cleanIds;
}

function buildSelectedItemsState(allItems, selectedItemIds, allItemsLoaded) {
  const itemMap = {};
  (allItems || []).forEach(item => {
    if (item && item._id) itemMap[item._id] = item;
  });

  const selectedItems = [];
  (selectedItemIds || []).forEach(id => {
    const item = itemMap[id];
    if (!item) return;
    const statusItem = decorateItemStatus(item);
    if (statusItem.isInUse) return;
    selectedItems.push({
      ...statusItem,
      selected_rank: selectedItems.length + 1
    });
  });

  const cleanSelectedItemIds = allItemsLoaded
    ? selectedItems.map(item => item._id)
    : selectedItemIds || [];

  return {
    selectedItemIds: cleanSelectedItemIds,
    selectedItems,
    pickPackagePreview: selectedItems.slice(0, 3),
    storedSelectedCount: selectedItems.filter(item => item.isStored).length
  };
}

module.exports = {
  uniqueIds,
  buildSelectedItemsState
};
