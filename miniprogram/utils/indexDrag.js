const { normalizeText } = require("./indexSearch.js");
const { clothRowClass } = require("./indexItemView.js");

function applyDragClasses(groupedItems, dragCategory, dragIndex, overIndex) {
  return groupedItems.map(group => {
    if (group.name !== dragCategory) return group;
    let changed = false;
    const items = group.items.map((cloth, itemIndex) => {
      const nextCls = clothRowClass(
        !!cloth.selected,
        itemIndex === dragIndex,
        itemIndex === overIndex && itemIndex !== dragIndex,
        cloth.wearStatus
      );
      if (nextCls === cloth.cls) return cloth;
      changed = true;
      return {
        ...cloth,
        cls: nextCls
      };
    });
    if (!changed) return group;
    return {
      ...group,
      items
    };
  });
}

function cacheDragBounds(page, groupIndex) {
  return new Promise(resolve => {
    wx.createSelectorQuery().in(page)
      .selectAll(".index-drag-row-" + groupIndex)
      .boundingClientRect(rects => {
        const rows = (rects || []).filter(rect => !!rect);
        if (rows.length > 0) {
          const firstRow = rows[0];
          const lastRow = rows[rows.length - 1];
          const step = rows.length > 1
            ? Math.max(1, rows[1].top - firstRow.top)
            : Math.max(1, firstRow.height);

          page._dragListTop = firstRow.top;
          page._dragListBottom = lastRow.top + step;
          page._dragItemHeight = step;
          page.setData({
            floatLeft: firstRow.left,
            floatWidth: firstRow.width
          });
        }
        resolve();
      })
      .exec();
  });
}

function getTouchY(page, e) {
  const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  return touch ? touch.clientY : page._lastTouchY;
}

function clampDragTop(page, touchY) {
  const minTop = page._dragListTop;
  const maxTop = page._dragListBottom - page._dragItemHeight;
  return Math.max(minTop, Math.min(touchY - page._dragTouchOffset, maxTop));
}

function getOverIndex(page, floatTop, itemCount) {
  const centerY = floatTop + page._dragItemHeight / 2;
  const rawIndex = Math.floor((centerY - page._dragListTop) / page._dragItemHeight);
  return Math.min(itemCount - 1, Math.max(0, rawIndex));
}

function onDragTouchStart(page, e) {
  page._lastTouchY = getTouchY(page, e);
}

async function onDragStart(page, e) {
  if (page.data.isDragging) return;
  page._suppressTap = true;
  setTimeout(() => {
    if (!page.data.isDragging) page._suppressTap = false;
  }, 350);

  if (normalizeText(page.data.searchKeyword)) {
    wx.showToast({ title: "搜索时先退出再排序", icon: "none" });
    return;
  }
  if (!page.data.allItemsLoaded) {
    wx.showToast({ title: "衣服同步中，稍后再排", icon: "none" });
    return;
  }

  const groupIndex = Number(e.currentTarget.dataset.groupIndex);
  const index = Number(e.currentTarget.dataset.index);
  const group = page.data.groupedItems[groupIndex];
  if (!group || Number.isNaN(index) || group.items.length <= 1) return;

  await cacheDragBounds(page, groupIndex);
  const itemTop = page._dragListTop + index * page._dragItemHeight;
  const touchY = getTouchY(page, e) || itemTop + page._dragItemHeight / 2;
  page._lastTouchY = touchY;
  page._dragTouchOffset = Math.max(
    8,
    Math.min(touchY - itemTop, page._dragItemHeight - 8)
  );
  page._overIndex = index;
  page.setData({
    groupedItems: applyDragClasses(page.data.groupedItems, group.name, index, index),
    isDragging: true,
    dragCategory: group.name,
    dragCategoryIndex: groupIndex,
    dragIndex: index,
    floatY: itemTop,
    floatItem: group.items[index],
    floatRank: index + 1,
    showPickPanel: false
  });
}

function onDragMove(page, e) {
  if (!page.data.isDragging || !e.touches || e.touches.length === 0) return;
  const touchY = getTouchY(page, e);
  const group = page.data.groupedItems[page.data.dragCategoryIndex];
  if (!group) return;

  page._lastTouchY = touchY;
  const floatTop = clampDragTop(page, touchY);
  const overIndex = getOverIndex(page, floatTop, group.items.length);
  if (overIndex !== page._overIndex) {
    page._overIndex = overIndex;
    page.setData({
      groupedItems: applyDragClasses(
        page.data.groupedItems,
        page.data.dragCategory,
        page.data.dragIndex,
        overIndex
      ),
      floatY: floatTop,
      floatRank: overIndex + 1
    });
    return;
  }

  page.setData({ floatY: floatTop });
}

function onDragEnd(page) {
  if (!page.data.isDragging) return;

  const fromIndex = page.data.dragIndex;
  const toIndex = page._overIndex >= 0 ? page._overIndex : fromIndex;
  const dragCategory = page.data.dragCategory;
  const resetData = {
    isDragging: false,
    dragCategory: "",
    dragCategoryIndex: -1,
    dragIndex: -1,
    floatItem: null,
    floatRank: 1
  };

  page._overIndex = -1;
  page._suppressTap = true;
  setTimeout(() => {
    page._suppressTap = false;
  }, 350);

  if (fromIndex === toIndex) {
    page.setData({
      ...resetData,
      groupedItems: applyDragClasses(page.data.groupedItems, "", -1, -1)
    }, () => {
      page.scheduleSectionMeasure();
    });
    return;
  }

  const categoryItems = page.data.allItems
    .filter(item => item.category === dragCategory)
    .sort((left, right) => left.sort_order - right.sort_order);
  const movedItem = categoryItems.splice(fromIndex, 1)[0];
  if (!movedItem) {
    page.setData(resetData);
    return;
  }
  categoryItems.splice(toIndex, 0, movedItem);

  const orderedItems = categoryItems.map((item, index) => ({
    ...item,
    sort_order: index
  }));
  const orderMap = {};
  orderedItems.forEach(item => {
    orderMap[item._id] = item.sort_order;
  });

  const nextAllItems = page.data.allItems.map(item => {
    if (typeof orderMap[item._id] !== "number") return item;
    return {
      ...item,
      sort_order: orderMap[item._id]
    };
  });

  page.setData({
    ...resetData,
    allItems: nextAllItems
  }, () => {
    page.refreshSelectedItems();
    page.buildGrouped(page.data.categoryNames, nextAllItems);
    page.cacheCurrentWardrobeState();
  });

  return { orderedItems };
}

module.exports = {
  applyDragClasses,
  cacheDragBounds,
  getTouchY,
  clampDragTop,
  getOverIndex,
  onDragTouchStart,
  onDragStart,
  onDragMove,
  onDragEnd
};
