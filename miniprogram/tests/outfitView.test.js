const test = require("node:test");
const assert = require("node:assert/strict");

const {
  decorateOutfit,
  formatApplyResult
} = require("../utils/outfitView.js");

test("decorates outfit permissions and three cover slots", () => {
  const outfit = decorateOutfit(
    {
      _id: "o1",
      name: "约会套装",
      itemIds: ["a", "b"],
      coverItems: [{ _id: "a", thumbUrl: "a.png" }],
      createdByOpenId: "u1"
    },
    { ownerOpenId: "owner" },
    "u1"
  );

  assert.equal(outfit.canManage, true);
  assert.equal(outfit.itemCount, 2);
  assert.equal(outfit.coverSlots.length, 3);
  assert.equal(outfit.coverSlots[0].url, "a.png");
  assert.equal(outfit.coverSlots[1].empty, true);
  assert.notEqual(outfit.coverSlots[0].key, outfit.coverSlots[1].key);
});

test("formats merge summary", () => {
  assert.equal(
    formatApplyResult({
      addedIds: ["a", "b"],
      duplicateIds: ["c"],
      inUseIds: ["d"],
      missingIds: []
    }),
    "已加入 2 件，跳过 1 件重复衣物，1 件正在使用中未加入"
  );
  assert.equal(
    formatApplyResult({
      addedIds: [],
      duplicateIds: ["a"],
      inUseIds: [],
      missingIds: []
    }),
    "这套衣服已经都在清单里了"
  );
});
