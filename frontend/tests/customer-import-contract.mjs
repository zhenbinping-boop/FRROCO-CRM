import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, http, page] = await Promise.all([
  readFile(new URL("../assets/customer-import.js", import.meta.url), "utf8"),
  readFile(new URL("../../backend/src/lib/http.ts", import.meta.url), "utf8"),
  readFile(new URL("../customers.html", import.meta.url), "utf8"),
]);

assert.match(source, /IMPORT_BATCH_SIZE\s*=\s*200/);
assert.match(source, /customers\.slice\(offset, offset \+ IMPORT_BATCH_SIZE\)/);
assert.match(source, /for \(let offset = 0; offset < customers\.length; offset \+= IMPORT_BATCH_SIZE\)/);
assert.match(source, /已导入 \$\{imported\} 位客户/);
assert.match(source, /后续批次未完成/);
assert.match(page, /id="customer-import-progress"/);
assert.match(page, /id="customer-import-progress-track"[^>]*role="progressbar"/);
assert.match(page, /transition-\[width\][^>]*id="customer-import-progress-bar"/);
assert.match(page, /id="customer-import-progress-text"/);
assert.match(source, /function updateImportProgress\(completed, total\)/);
assert.match(source, /Math\.round\(\(completed \/ total\) \* 100\)/);
assert.match(source, /progressBar\.style\.width\s*=\s*`\$\{percent\}%`/);
assert.match(source, /progressText\.textContent\s*=\s*`已处理 \$\{completed\} \/ \$\{total\} 位客户`/);
assert.match(source, /let completed\s*=\s*0/);
assert.match(source, /completed\s*\+=\s*batch\.length\s*;\s*updateImportProgress\(completed, customers\.length\)/s);
assert.match(source, /function updateScanProgress\(/);
assert.match(source, /正在扫描表格/);
assert.match(source, /progressPercent\.textContent\s*=\s*`\$\{percent\}%`/);
assert.match(source, /progressBar\.classList\.add\("animate-pulse"\)/);
assert.ok((source.match(/updateScanProgress\(/g) || []).length >= 6, "scan progress must update through real parsing stages");
assert.match(source, /updateScanProgress\(100, "表格扫描完成"\);\s*elements\.progressBar\.classList\.remove\("animate-pulse"\)/s);
const fileChangeStart = source.indexOf('elements.input.addEventListener("change"');
const fileChangeEnd = source.indexOf('elements.confirm.addEventListener("click"', fileChangeStart);
const fileChangeHandler = source.slice(fileChangeStart, fileChangeEnd);
assert.ok(fileChangeStart >= 0 && fileChangeEnd > fileChangeStart, "customer import file change handler must remain covered");
assert.match(fileChangeHandler, /openModal\(file\.name\)[\s\S]*updateScanProgress\(5, "正在准备扫描表格/);
assert.match(fileChangeHandler, /await nextFrame\(\);[\s\S]*await handleFile\(file\)/);
assert.match(fileChangeHandler, /catch \(error\) \{ resetImportProgress\(\)/);
const failureMarker = source.indexOf("后续批次未完成");
const failureStart = source.lastIndexOf("catch (error)", failureMarker);
const failureEnd = source.indexOf("\n    }", failureMarker);
const importFailureHandler = source.slice(failureStart, failureEnd);
assert.ok(failureMarker >= 0 && failureStart >= 0 && failureEnd > failureStart, "customer import failure handler must remain covered");
assert.doesNotMatch(importFailureHandler, /updateImportProgress\(0\s*,/);
assert.match(http, /error\?\.type === "entity\.too\.large"/);
assert.match(http, /PAYLOAD_TOO_LARGE/);
assert.match(http, /response\.status\(413\)/);

console.log("customer import batch contract: pass");
