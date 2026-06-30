const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.wx = {
  cloud: {
    database() {
      return {
        collection() {
          return {};
        }
      };
    }
  },
  getStorageSync() {
    return null;
  },
  removeStorageSync() {}
};

const homeActions = require("../utils/homeWardrobeActions.js");

const homeWxml = fs.readFileSync(
  path.join(__dirname, "../pages/home/home.wxml"),
  "utf8"
);
const homeJs = fs.readFileSync(
  path.join(__dirname, "../pages/home/home.js"),
  "utf8"
);

test("home page does not auto-open login modal on show when user is not verified", () => {
  assert.match(homeJs, /showVerifyModal:\s*false/);
  assert.doesNotMatch(homeJs, /showVerifyModal:\s*!verifiedUser/);
});

test("logout keeps home page browsable without forcing login modal", () => {
  const updates = [];
  const page = {
    setData(data) {
      updates.push(data);
    }
  };

  homeActions.logoutVerify(page);

  assert.equal(updates.at(-1).showVerifyModal, false);
});

test("login modal provides an explicit skip action", () => {
  assert.match(homeWxml, /bindtap="closeVerifyModal"/);
  assert.match(homeWxml, />先逛逛</);
});
