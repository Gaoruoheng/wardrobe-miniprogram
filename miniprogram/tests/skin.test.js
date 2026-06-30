const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SKIN,
  SKIN_OPTIONS,
  getSelectedSkin,
  setSelectedSkin
} = require("../utils/skin.js");

test("skin options exclude obsolete ink landscape skin", () => {
  assert.deepEqual(
    SKIN_OPTIONS.map(item => item.id),
    [DEFAULT_SKIN, "princess-castle"]
  );
});

test("invalid stored skin falls back to default skin", () => {
  global.wx = {
    getStorageSync(key) {
      assert.equal(key, "selectedSkin");
      return "jianghu-swordsman";
    },
    setStorageSync() {}
  };

  assert.equal(getSelectedSkin(), DEFAULT_SKIN);

  delete global.wx;
});

test("setting obsolete skin stores default skin instead", () => {
  let storedValue = null;
  global.wx = {
    getStorageSync() {
      return "";
    },
    setStorageSync(key, value) {
      assert.equal(key, "selectedSkin");
      storedValue = value;
    }
  };

  assert.equal(setSelectedSkin("jianghu-swordsman"), DEFAULT_SKIN);
  assert.equal(storedValue, DEFAULT_SKIN);

  delete global.wx;
});
