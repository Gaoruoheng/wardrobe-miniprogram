const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCategoryItemCursorWhere,
  buildIdCursorWhere,
  createItemCursor,
  normalizeItemCursor,
  toItemPageResult
} = require("../utils/itemPagination.js");

test("creates stable cursor from sort order and document id", () => {
  assert.deepEqual(createItemCursor({ _id: "item-a", sort_order: 3 }), {
    sortOrder: 3,
    id: "item-a"
  });
  assert.equal(createItemCursor({ _id: "", sort_order: 3 }), null);
});

test("page result uses limit plus one to report hasMore without skip", () => {
  const fetched = [
    { _id: "a", sort_order: 1 },
    { _id: "b", sort_order: 2 },
    { _id: "c", sort_order: 3 }
  ];
  const result = toItemPageResult(fetched, 2);

  assert.deepEqual(result.items.map(item => item._id), ["a", "b"]);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.nextCursor, { sortOrder: 2, id: "b" });
});

test("normalizes invalid cursors to null", () => {
  assert.equal(normalizeItemCursor(null), null);
  assert.equal(normalizeItemCursor({ sortOrder: "x", id: "a" }), null);
  assert.deepEqual(normalizeItemCursor({ sortOrder: "4", id: "a" }), {
    sortOrder: 4,
    id: "a"
  });
});

test("builds category cursor query without skip", () => {
  const fakeCommand = {
    and: clauses => ({ and: clauses }),
    or: clauses => ({ or: clauses }),
    gt: value => ({ gt: value })
  };

  assert.deepEqual(
    buildCategoryItemCursorWhere(fakeCommand, "wardrobe-1", "上衣", { sortOrder: 2, id: "b" }),
    {
      and: [
        { wardrobeId: "wardrobe-1", category: "上衣" },
        {
          or: [
            { sort_order: { gt: 2 } },
            {
              and: [
                { sort_order: 2 },
                { _id: { gt: "b" } }
              ]
            }
          ]
        }
      ]
    }
  );
});

test("builds id cursor query for generic collection scans", () => {
  const fakeCommand = {
    and: clauses => ({ and: clauses }),
    gt: value => ({ gt: value })
  };

  assert.deepEqual(buildIdCursorWhere(fakeCommand, "wardrobe-1", "doc-b"), {
    and: [
      { wardrobeId: "wardrobe-1" },
      { _id: { gt: "doc-b" } }
    ]
  });
  assert.deepEqual(buildIdCursorWhere(fakeCommand, "wardrobe-1", ""), {
    wardrobeId: "wardrobe-1"
  });
});
