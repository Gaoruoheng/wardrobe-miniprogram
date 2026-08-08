const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "miniprogram");
const sourceBudgetBytes = Math.floor(1.8 * 1024 * 1024);
const singleFileBudgetBytes = 512 * 1024;

function listFiles(directory, files = []) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) listFiles(fullPath, files);
    else files.push({ path: fullPath, size: fs.statSync(fullPath).size });
  });
  return files;
}

test("miniprogram source keeps upload headroom below the 2 MiB limit", () => {
  const files = listFiles(sourceRoot);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const largest = files
    .sort((left, right) => right.size - left.size)
    .slice(0, 5)
    .map(file => `${path.relative(root, file.path)}=${Math.ceil(file.size / 1024)}KB`)
    .join(", ");

  assert.ok(
    totalBytes <= sourceBudgetBytes,
    `miniprogram source is ${Math.ceil(totalBytes / 1024)}KB; budget is ${Math.floor(sourceBudgetBytes / 1024)}KB. Largest: ${largest}`
  );
});

test("runtime source contains no unexpectedly large single asset", () => {
  const oversized = listFiles(sourceRoot)
    .filter(file => file.size > singleFileBudgetBytes)
    .map(file => path.relative(root, file.path));

  assert.deepEqual(oversized, []);
});
