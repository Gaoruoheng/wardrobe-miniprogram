const { getVerifiedUser } = require("./auth.js");
const { getCache, setCache, removeCache } = require("./pageCache.js");

const STICKERS = [
  "/images/home/bear-wave.png",
  "/images/home/bear-watermelon.png",
  "/images/home/bear-shopping.png",
  "/images/home/bear-toast.png",
  "/images/home/bear-snack.png",
  "/images/home/bear-costume.png"
];

const THEMES = [
  "theme-pink",
  "theme-cream",
  "theme-mint",
  "theme-lavender"
];

function formatText(value, fallback) {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim();
  return text || fallback;
}

function getWardrobeName(item) {
  return formatText(
    item.name || item.wardrobeName || item.closetName || item.title,
    "未命名衣柜"
  );
}

function decorateWardrobe(item, index) {
  const name = getWardrobeName(item);
  const isShared = item.accessRole === "shared";
  return {
    ...item,
    displayName: name,
    displayDesc: formatText(item.desc, "这里还没有备注，长按可以管理。"),
    displayIcon: formatText(item.icon, "🧸"),
    rankText: (isShared ? "共享 " : "衣柜 ") + (index + 1),
    sticker: STICKERS[index % STICKERS.length],
    themeClass: THEMES[index % THEMES.length],
    isShared,
    roleText: isShared ? "共享衣柜" : "我的衣柜"
  };
}

function getWardrobesCacheId(user) {
  return user && user.openid ? user.openid : "";
}

function hydrateWardrobesCache(page, user) {
  const cached = getCache("home-wardrobes", getWardrobesCacheId(user));
  if (!cached || !cached.wardrobes) return false;

  const wardrobes = cached.wardrobes.map((item, index) => decorateWardrobe(item, index));
  page.setData({
    wardrobes,
    wardrobeCount: wardrobes.length,
    isEmpty: wardrobes.length === 0
  });
  return true;
}

function applyWardrobes(page, rawWardrobes, user) {
  const wardrobes = rawWardrobes.map((item, index) => decorateWardrobe(item, index));
  page.setData({
    wardrobes,
    wardrobeCount: wardrobes.length,
    isEmpty: wardrobes.length === 0
  });
  const sourceUpdatedAt = rawWardrobes
    .map(item => item.updatedAt || item.createTime || "")
    .join("|");
  setCache("home-wardrobes", getWardrobesCacheId(user), {
    wardrobes: rawWardrobes,
    sourceUpdatedAt
  }, { sourceUpdatedAt });
}

function findWardrobe(page, id) {
  return page.data.wardrobes.find(item => item && item._id === id) || null;
}

function buildWardrobePreview(wardrobe) {
  if (!wardrobe) return null;
  return {
    ...wardrobe,
    _id: wardrobe._id,
    name: wardrobe.name || wardrobe.displayName || "我的衣柜",
    desc: wardrobe.desc || wardrobe.displayDesc || "",
    icon: wardrobe.icon || wardrobe.displayIcon || "🧸"
  };
}

function cacheWardrobeIndexPreview(page, id) {
  const user = getVerifiedUser();
  if (!user || !user.openid || !id) return;

  const cacheId = [user.openid, id].join(":");
  const cached = getCache("wardrobe-index", cacheId) || {};
  const wardrobe = buildWardrobePreview(findWardrobe(page, id));
  if (!wardrobe) return;

  setCache("wardrobe-index", cacheId, {
    ...cached,
    wardrobe: {
      ...(cached.wardrobe || {}),
      ...wardrobe
    },
    categories: cached.categories || [],
    items: cached.items || []
  });
}

function cacheManagePreview(page, id) {
  const user = getVerifiedUser();
  if (!user || !user.openid || !id) return;

  const wardrobe = buildWardrobePreview(findWardrobe(page, id));
  if (!wardrobe) return;
  setCache("manage-preview", [user.openid, id].join(":"), {
    wardrobe,
    categories: [],
    totalItems: 0
  });
}

function removeWardrobeCaches(user, id) {
  if (user) {
    removeCache("home-wardrobes", getWardrobesCacheId(user));
    const cacheId = [user.openid, id].join(":");
    removeCache("wardrobe-index", cacheId);
    removeCache("manage-wardrobe", cacheId);
    removeCache("manage-preview", cacheId);
  }
  removeCache("wardrobe-index", id);
}

function normalizeShareCode(value) {
  return formatText(value, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

module.exports = {
  STICKERS,
  THEMES,
  formatText,
  getWardrobeName,
  decorateWardrobe,
  getWardrobesCacheId,
  hydrateWardrobesCache,
  applyWardrobes,
  findWardrobe,
  buildWardrobePreview,
  cacheWardrobeIndexPreview,
  cacheManagePreview,
  removeWardrobeCaches,
  normalizeShareCode
};
