const test = require("node:test");
const assert = require("node:assert/strict");

const { mergeLegacyPlans } = require("../utils/planningState.js");

test("merges every legacy task into plans while keeping checklist state", () => {
  const result = mergeLegacyPlans(
    [{ id: 1, text: "周末整理", done: true }],
    [{ id: 1, text: "带伞", done: false }, { text: "取快递", done: true }]
  );

  assert.equal(result.migrated, true);
  assert.deepEqual(result.plans.map(item => [item.text, item.done]), [
    ["周末整理", true],
    ["带伞", false],
    ["取快递", true]
  ]);
  assert.equal(new Set(result.plans.map(item => item.id)).size, 3);
});

test("does not request migration when no legacy tasks exist", () => {
  const result = mergeLegacyPlans([{ id: 7, text: "试穿套装", done: false }], []);

  assert.equal(result.migrated, false);
  assert.deepEqual(result.plans, [{ id: 7, text: "试穿套装", done: false }]);
});
