const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOutfitInput,
  buildOutfitMerge,
  canManageOutfit
} = require("../../cloudfunctions/quickstartFunctions/shared/outfits.js");

test("normalizes outfit name and unique item order", () => {
  assert.deepEqual(
    normalizeOutfitInput({
      name: "  粉色 约会  ",
      note: "  春天 ",
      itemIds: ["a", "b", "a"]
    }),
    {
      ok: true,
      name: "粉色 约会",
      note: "春天",
      itemIds: ["a", "b"],
      coverItemIds: ["a", "b"]
    }
  );
});

test("rejects outfit outside item limits", () => {
  assert.equal(
    normalizeOutfitInput({ name: "单件", itemIds: ["a"] }).code,
    "OUTFIT_TOO_SMALL"
  );
  assert.equal(
    normalizeOutfitInput({
      name: "太多",
      itemIds: Array.from({ length: 21 }, (_, index) => "i" + index)
    }).code,
    "OUTFIT_TOO_LARGE"
  );
});

test("merges without replacing current selection", () => {
  const result = buildOutfitMerge(
    ["existing", "duplicate"],
    ["duplicate", "available", "stored", "busy", "missing"],
    [
      { _id: "available", wearStatus: "available" },
      { _id: "stored", wearStatus: "stored" },
      { _id: "busy", wearStatus: "in_use" }
    ]
  );

  assert.deepEqual(result.selectedItemIds, ["existing", "duplicate", "available", "stored"]);
  assert.deepEqual(result.addedIds, ["available", "stored"]);
  assert.deepEqual(result.duplicateIds, ["duplicate"]);
  assert.deepEqual(result.inUseIds, ["busy"]);
  assert.deepEqual(result.missingIds, ["missing"]);
  assert.deepEqual(result.storedIds, ["stored"]);
});

test("creator and wardrobe owner can manage outfit", () => {
  const outfit = { createdByOpenId: "creator" };
  const wardrobe = { ownerOpenId: "owner" };
  assert.equal(canManageOutfit(outfit, wardrobe, "creator"), true);
  assert.equal(canManageOutfit(outfit, wardrobe, "owner"), true);
  assert.equal(canManageOutfit(outfit, wardrobe, "member"), false);
});
