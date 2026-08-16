import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ordersHtml, channelHtml, orderActions, channelAnalysis, customerDetail, moduleShell, layout] = await Promise.all([
  readFile(new URL("../orders-payments.html", import.meta.url), "utf8"),
  readFile(new URL("../channel-analysis.html", import.meta.url), "utf8"),
  readFile(new URL("../assets/order-actions.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/channel-analysis.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/customer-detail.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/module-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/layout.js", import.meta.url), "utf8"),
]);

for (const marker of ["data-order-summary-outstanding", "data-order-summary-paid", "data-order-summary-pending"]) {
  assert.match(ordersHtml, new RegExp(marker));
}
assert.doesNotMatch(ordersHtml, /Stellar Architecture|Apex Developments|Nova Build Group|Lumina Spaces/);
assert.match(orderActions, /\/orders\/overview/);
assert.match(orderActions, /source === "CUSTOMER"/);
assert.match(orderActions, /customer-detail\.html\?id=/);

for (const marker of ["data-analysis-total-leads", "data-analysis-revenue-chart", "data-analysis-source-table"]) {
  assert.match(channelHtml, new RegExp(marker));
}
assert.match(channelHtml, /data-analysis-source-total/);
assert.match(channelHtml, /assets\/api\.js/);
assert.match(channelHtml, /assets\/channel-analysis\.js/);
assert.doesNotMatch(channelHtml, /Xiaohongshu|Douyin|Referrals|Direct Web|\$504,560/);
assert.match(channelAnalysis, /\/analytics\/dashboard/);
assert.match(channelAnalysis, /sourcePerformance/);
assert.match(channelAnalysis, /sourceTotal\.textContent/);
assert.doesNotMatch(channelAnalysis, /bg-surface-white text-center/);
assert.doesNotMatch(channelAnalysis, /Math\.max\(8,/);
assert.doesNotMatch(channelHtml, /Last 30 Days Trajectory|Weekly|Monthly|vs last month/);
assert.match(moduleShell, /"channel-analysis\.html": \{ scripts: \["channel-analysis\.js"\]/);
assert.match(layout, /data-order-payment-shortcut/);
assert.doesNotMatch(layout, /payment: '<a[^']+payment-entry\.html/);
assert.match(layout, /customer-create-order-button/);
assert.match(customerDetail, /api\.post\("\/orders"/);
assert.match(customerDetail, /values\.customerId = id/);
assert.match(customerDetail, /hasImportedFinance/);

console.log("real data modules frontend contract: pass");
