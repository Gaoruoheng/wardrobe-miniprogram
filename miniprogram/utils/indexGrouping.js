const {
  normalizeText,
  itemMatchesKeyword,
  findMatchingCategoryIndex
} = require("./indexSearch.js");
const {
  clothRowClass,
  makeSelectedMap,
  getVisibleCategories
} = require("./indexItemView.js");
const { decorateItemStatus } = require("./itemStatus.js");

function buildGrouped(page, cats, items, options = {}) {
  const keyword = typeof options.keyword === "string"
    ? options.keyword
    : page.data.searchKeyword;
  const isSearching = normalizeText(keyword).length > 0;
  const selectedMap = makeSelectedMap(page.data.selectedItemIds);
  const visibleCats = getVisibleCategories(cats, items);
  const matchedCategoryIndex = findMatchingCategoryIndex(visibleCats, keyword);
  const isCategorySearch = isSearching && matchedCategoryIndex >= 0;
  const filtered = isCategorySearch
    ? items
    : isSearching
    ? items.filter(item => itemMatchesKeyword(item, keyword))
    : items;

  const groupedMap = new Map();
  visibleCats.forEach(cat => {
    groupedMap.set(cat, []);
  });
  filtered.forEach(item => {
    const bucket = groupedMap.get(item.category);
    if (bucket) bucket.push(item);
  });

  const grouped = visibleCats.map((cat, index) => {
    const catItems = (groupedMap.get(cat) || [])
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((item, itemIndex) => {
        const statusItem = decorateItemStatus(item);
        const selected = !!selectedMap[item._id] && !statusItem.isInUse;
        return {
          ...statusItem,
          display_rank: itemIndex + 1,
          selected,
          selectText: statusItem.isInUse ? "使用中" : selected ? "OK" : "+",
          canSelect: !statusItem.isInUse,
          cls: clothRowClass(selected, false, false, statusItem.wearStatus)
        };
      });

    return {
      id: "cat" + index,
      name: cat,
      items: catItems
    };
  });
  const firstMatchedGroupIndex = grouped.findIndex(group => group.items.length > 0);

  const nextData = {
    groupedItems: grouped,
    count: filtered.length,
    searchResultText: isCategorySearch
      ? "分类：" + visibleCats[matchedCategoryIndex]
      : isSearching
      ? "找到 " + filtered.length + " 件"
      : "",
    searchMode: isCategorySearch ? "category" : isSearching ? "item" : "",
    searchTargetCategory: isCategorySearch ? visibleCats[matchedCategoryIndex] : ""
  };

  let focusIndex = -1;
  let focusGroupId = "";
  if (options.resetActive) {
    const activeIndex = isCategorySearch
      ? matchedCategoryIndex
      : isSearching && firstMatchedGroupIndex >= 0
      ? firstMatchedGroupIndex
      : 0;
    const activeGroup = grouped[activeIndex];
    focusIndex = activeGroup ? activeIndex : -1;
    focusGroupId = activeGroup ? activeGroup.id : "";
    nextData.activeCat = activeIndex;
    nextData.sideScrollIntoView = "side-cat-" + activeIndex;
    nextData.scrollIntoView = "";
  }

  page.setData(nextData, () => {
    if (focusIndex >= 0 && focusGroupId) {
      page.focusCategory(focusIndex, focusGroupId);
    } else {
      page.scheduleSectionMeasure();
    }
  });
}

module.exports = {
  buildGrouped
};
