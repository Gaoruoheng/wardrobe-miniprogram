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

test("outfit access bootstraps its collection once per cloud instance", () => {
  const source = read("cloudfunctions/quickstartFunctions/handlers/outfit.js");
  const accessSection = source.slice(
    source.indexOf("async function requireAccess"),
    source.indexOf("async function getOutfitDocument")
  );

  assert.match(source, /let\s+outfitCollectionReady\s*=\s*null/);
  assert.match(source, /if\s*\(!outfitCollectionReady\)/);
  assert.match(source, /db\.createCollection\("wardrobe_outfits"\)/);
  assert.match(accessSection, /if\s*\(access\.ok\)\s*await\s+ensureOutfitCollection\(\)/);
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

test("outfit updates compare and increment version inside a transaction", () => {
  const source = read("cloudfunctions/quickstartFunctions/handlers/outfit.js");
  const saveSection = source.slice(
    source.indexOf("async function saveOutfit"),
    source.indexOf("async function deleteOutfit")
  );
  assert.match(saveSection, /db\.runTransaction/);
  assert.match(saveSection, /OUTFIT_VERSION_CONFLICT/);
  assert.match(saveSection, /coverItems/);
});
