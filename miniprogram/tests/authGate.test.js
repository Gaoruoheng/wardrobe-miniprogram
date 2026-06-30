const test = require("node:test");
const assert = require("node:assert/strict");

test("requireVerifiedPage uses friendly login guidance and returns home", () => {
  let toastTitle = "";
  let relaunchedUrl = "";
  global.wx = {
    getStorageSync() {
      return null;
    },
    removeStorageSync() {},
    showToast(options) {
      toastTitle = options.title;
    },
    reLaunch(options) {
      relaunchedUrl = options.url;
    }
  };

  const { requireVerifiedPage } = require("../utils/auth.js");

  assert.equal(requireVerifiedPage(), false);
  assert.equal(toastTitle, "先回首页逛逛，想用这个功能时再登录");
  assert.equal(relaunchedUrl, "/pages/home/home?loginTip=1");

  delete require.cache[require.resolve("../utils/auth.js")];
  delete global.wx;
});

test("requireVerifiedPage suppresses duplicate redirect while one is already in flight", () => {
  let relaunchCount = 0;
  global.wx = {
    getStorageSync() {
      return null;
    },
    removeStorageSync() {},
    showToast() {},
    reLaunch(options) {
      relaunchCount += 1;
      assert.equal(options.url, "/pages/home/home?loginTip=1");
    }
  };

  const { requireVerifiedPage } = require("../utils/auth.js");

  assert.equal(requireVerifiedPage(), false);
  assert.equal(requireVerifiedPage(), false);
  assert.equal(relaunchCount, 1);

  delete require.cache[require.resolve("../utils/auth.js")];
  delete global.wx;
});

test("ensureVerified opens login modal with softer copy", () => {
  let toastTitle = "";
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
    removeStorageSync() {},
    showToast(options) {
      toastTitle = options.title;
    }
  };

  const homeActions = require("../utils/homeWardrobeActions.js");
  const updates = [];
  const page = {
    data: { isVerified: false },
    setData(data) {
      updates.push(data);
    }
  };

  assert.equal(homeActions.ensureVerified(page), false);
  assert.equal(updates.at(-1).showVerifyModal, true);
  assert.equal(toastTitle, "先逛逛首页，想创建或进入衣柜时再登录");

  delete require.cache[require.resolve("../utils/homeWardrobeActions.js")];
  delete require.cache[require.resolve("../services/homeWardrobeApi.js")];
  delete global.wx;
});
