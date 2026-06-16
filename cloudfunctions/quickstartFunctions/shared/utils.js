function getCloudErrorMessage(err) {
  if (!err) return "";
  return err.errMsg || err.message || String(err);
}

module.exports = {
  getCloudErrorMessage
};
