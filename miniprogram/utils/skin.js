var STORAGE_KEY = 'selectedSkin';

var DEFAULT_SKIN = '';

var SKIN_OPTIONS = [
  { id: '', name: '甜蜜小窝', desc: '温馨可爱' },
  { id: 'princess-castle', name: '公主城堡', desc: '梦幻粉紫' }
];

function normalizeSkin(skin) {
  var value = skin || DEFAULT_SKIN;
  return SKIN_OPTIONS.some(function(option) {
    return option.id === value;
  }) ? value : DEFAULT_SKIN;
}

function getSelectedSkin() {
  try {
    return normalizeSkin(wx.getStorageSync(STORAGE_KEY));
  } catch (e) {
    return DEFAULT_SKIN;
  }
}

function setSelectedSkin(skin) {
  var value = normalizeSkin(skin);
  try {
    wx.setStorageSync(STORAGE_KEY, value);
  } catch (e) {}
  return value;
}

function syncPageSkin(page) {
  var skin = getSelectedSkin();
  if (skin !== page.data.selectedSkin) {
    page.setData({ selectedSkin: skin });
  }
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  DEFAULT_SKIN: DEFAULT_SKIN,
  SKIN_OPTIONS: SKIN_OPTIONS,
  getSelectedSkin: getSelectedSkin,
  setSelectedSkin: setSelectedSkin,
  syncPageSkin: syncPageSkin
};
