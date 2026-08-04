const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("cloud entry registers outfit operations", () => {
  const source = read("cloudfunctions/quickstartFunctions/index.js");
  ["listOutfits", "getOutfit", "saveOutfit", "deleteOutfit", "applyOutfit"].forEach(name => {
    assert.match(source, new RegExp("\\b" + name + "\\b"));
  });
});

test("wardrobe deletion removes outfit documents", () => {
  const source = read("cloudfunctions/quickstartFunctions/handlers/wardrobe.js");
  assert.match(source, /getAllByWardrobe\("wardrobe_outfits"/);
  assert.match(source, /removeDocs\("wardrobe_outfits"/);
});

test("item deletion marks affected outfits for cleanup", () => {
  const source = read("cloudfunctions/quickstartFunctions/handlers/item.js");
  assert.match(source, /collection\("wardrobe_outfits"\)/);
  assert.match(source, /needsCleanup:\s*true/);
  assert.match(source, /version:\s*db\.command\.inc\(1\)/);
  assert.match(source, /mark outfit cleanup failed/);
});
