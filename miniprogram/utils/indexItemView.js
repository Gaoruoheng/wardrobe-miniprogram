const { getDisplayImage, getListImage } = require("./cloudImage.js");
const {
  STATUS_IN_USE,
  STATUS_STORED,
  normalizeItemStatus,
  decorateItemStatus
} = require("./itemStatus.js");

function itemOrder(item, fallbackIndex) {
  return typeof item.sort_order === "number" ? item.sort_order : 999999 + fallbackIndex;
}

function clothRowClass(selected, isPlaceholder, isOver, status) {
  let cls = "cloth-row";
  if (selected) cls += " selected";
  if (isPlaceholder) cls += " drag-placeholder";
  if (isOver) cls += " drag-over";
  const normalized = normalizeItemStatus(status);
  if (normalized === STATUS_IN_USE) cls += " status-in-use-row";
  if (normalized === STATUS_STORED) cls += " status-stored-row";
  return cls;
}

function normalizeItems(items) {
  return (items || [])
    .map((item, index) => ({
      ...decorateItemStatus(item),
      url: getDisplayImage(item.url),
      displayUrl: getListImage(item),
      sort_order: itemOrder(item, index)
    }))
    .sort((left, right) => left.sort_order - right.sort_order);
}

function mergeItems(baseItems, nextItems) {
  const map = {};
  const result = [];

  (baseItems || []).forEach(item => {
    if (!item || !item._id || map[item._id]) return;
    map[item._id] = true;
    result.push(item);
  });

  (nextItems || []).forEach(item => {
    if (!item || !item._id) return;
    if (map[item._id]) {
      for (let index = 0; index < result.length; index += 1) {
        if (result[index]._id === item._id) {
          result[index] = item;
          break;
        }
      }
      return;
    }
    map[item._id] = true;
    result.push(item);
  });

  return normalizeItems(result);
}

function makeSelectedMap(ids) {
  const map = {};
  (ids || []).forEach(id => {
    map[id] = true;
  });
  return map;
}

function getVisibleCategories(cats, items) {
  const names = [];
  const seen = new Set();
  (cats || []).forEach(cat => {
    if (cat && !seen.has(cat)) {
      seen.add(cat);
      names.push(cat);
    }
  });
  (items || []).forEach(item => {
    const category = item && item.category;
    if (category && !seen.has(category)) {
      seen.add(category);
      names.push(category);
    }
  });
  return names;
}

module.exports = {
  clothRowClass,
  normalizeItems,
  mergeItems,
  makeSelectedMap,
  getVisibleCategories
};
