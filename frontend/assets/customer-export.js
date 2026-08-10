(() => {
  "use strict";
  const button = document.querySelector("#customer-regional-export");
  if (!button || !window.FarockAPI) return;
  button.addEventListener("click", async () => {
    const city = document.querySelector('[data-customer-filter="city"]')?.value || "";
    const dealerGroupId = document.querySelector('[data-customer-filter="dealer-group"]')?.value || "";
    if (!city && !dealerGroupId) {
      button.title = "请先选择城市或代理商分组";
      button.textContent = "请先选择地区";
      setTimeout(() => { button.innerHTML = '<span class="material-symbols-outlined">download</span><span>导出地区名单</span>'; }, 2200);
      return;
    }
    const query = new URLSearchParams();
    if (city) query.set("city", city);
    if (dealerGroupId) query.set("dealerGroupId", dealerGroupId);
    button.disabled = true;
    try {
      const { blob } = await window.FarockAPI.download(`/customers/export-regional?${query}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `法洛可地区客户名单-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      button.textContent = error.message || "导出失败";
      setTimeout(() => { button.innerHTML = '<span class="material-symbols-outlined">download</span><span>导出地区名单</span>'; }, 2500);
    } finally { button.disabled = false; }
  });
})();
