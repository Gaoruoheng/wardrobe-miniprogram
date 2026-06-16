const { cloud } = require("./cloud.js");
const { DELETE_FILE_BATCH_SIZE } = require("./constants.js");
const { chunkList, normalizeText } = require("./core.js");

function isCloudFileId(value) {
  return normalizeText(value).indexOf("cloud://") === 0;
}

async function deleteCloudFiles(fileList) {
  const uniqueMap = {};
  (fileList || []).forEach(fileId => {
    if (isCloudFileId(fileId)) uniqueMap[fileId] = true;
  });

  const uniqueFiles = Object.keys(uniqueMap);
  let deletedCount = 0;
  let failedCount = 0;
  const chunks = chunkList(uniqueFiles, DELETE_FILE_BATCH_SIZE);

  for (let index = 0; index < chunks.length; index += 1) {
    try {
      const res = await cloud.deleteFile({ fileList: chunks[index] });
      const fileResults = res.fileList || [];
      const chunkDeletedCount = fileResults.length > 0
        ? fileResults.filter(item => item && item.status === 0).length
        : chunks[index].length;
      deletedCount += chunkDeletedCount;
      failedCount += chunks[index].length - chunkDeletedCount;
    } catch (err) {
      console.error("delete wardrobe cloud files failed", err);
      failedCount += chunks[index].length;
    }
  }

  return {
    total: uniqueFiles.length,
    deletedCount,
    failedCount
  };
}

function collectItemFileIds(items) {
  const fileIds = [];
  (items || []).forEach(item => {
    if (isCloudFileId(item.url)) fileIds.push(item.url);
    if (isCloudFileId(item.thumbUrl)) fileIds.push(item.thumbUrl);
  });
  return fileIds;
}

function collectUnusedItemFiles(oldItem, nextData) {
  const oldFiles = collectItemFileIds([oldItem]);
  const nextFiles = collectItemFileIds([nextData]);
  return oldFiles.filter(fileId => nextFiles.indexOf(fileId) < 0);
}

module.exports = {
  deleteCloudFiles,
  collectItemFileIds,
  collectUnusedItemFiles
};
