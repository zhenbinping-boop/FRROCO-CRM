(() => {
  "use strict";

  const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const aliases = {
    name: ["姓名", "name"], phone: ["手机号", "联系电话", "phone"], wechat: ["微信", "微信号", "wechat"],
    ageGroup: ["年龄段", "agegroup"], province: ["省份", "省", "province"], city: ["城市", "市", "city"],
    district: ["区县", "区", "district"], community: ["小区", "community"], houseType: ["户型", "housetype"],
    storeType: ["经营模式", "运营模式", "storetype", "operationmode"], store: ["门店", "门店编码", "归属机构", "store"],
    dealerGroup: ["代理商分组", "代理商", "dealer", "dealergroup"], dealYear: ["订购年份", "年份", "dealyear"],
    totalAmount: ["订购金额", "成交金额", "totalamount"], depositAmount: ["已付定金", "定金", "depositamount"],
    productSeries: ["产品系列", "订购系列", "productseries"], whyFarock: ["为什么选择法洛可", "选择原因", "whyfarock"],
    tier: ["客户分级", "客户等级", "tier"], personaSummary: ["用户画像", "画像", "personasummary"],
  };
  const elements = {
    button: document.querySelector("#customer-import-button"), input: document.querySelector("#customer-import-file"),
    modal: document.querySelector("#customer-import-modal"), close: document.querySelector("#customer-import-close"),
    cancel: document.querySelector("#customer-import-cancel"), confirm: document.querySelector("#customer-import-confirm"),
    fileName: document.querySelector("#customer-import-file-name"), total: document.querySelector("#customer-import-total"),
    valid: document.querySelector("#customer-import-valid"), invalid: document.querySelector("#customer-import-invalid"),
    error: document.querySelector("#customer-import-error"), preview: document.querySelector("#customer-import-preview"),
  };
  if (Object.values(elements).some((element) => !element)) return;

  let parsedRows = [];
  let sheetJsPromise;

  const normalize = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
  const valueFor = (row, field) => {
    const key = Object.keys(row).find((candidate) => aliases[field].includes(normalize(candidate)));
    return key ? String(row[key] ?? "").trim() : "";
  };
  const numberFor = (value) => Number(String(value || "0").replaceAll(",", "")) || 0;
  const normalizeStoreType = (value) => /dealer|代理|经销/i.test(value) ? "DEALER" : /direct|直营/i.test(value) ? "DIRECT" : "";
  const normalizeTier = (value) => ["S", "A", "B", "C"].includes(String(value).trim().charAt(0).toUpperCase()) ? String(value).trim().charAt(0).toUpperCase() : "B";

  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (sheetJsPromise) return sheetJsPromise;
    sheetJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SHEETJS_URL;
      script.async = true;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("表格解析组件加载失败"));
      script.onerror = () => reject(new Error("表格解析组件加载失败，请检查网络后重试"));
      document.head.appendChild(script);
    });
    return sheetJsPromise;
  }

  function matchStore(row, stores, storeType, province, city) {
    const storeText = valueFor(row, "store");
    if (storeText) {
      const exact = stores.find((store) => store.id === storeText || store.code === storeText || store.storeName === storeText);
      if (exact) return exact;
    }
    const candidates = stores.filter((store) => store.storeType === storeType && store.regionProvince === province && store.regionCity === city);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function validateRows(sourceRows, stores, existingCustomers) {
    const existingPhones = new Set(existingCustomers.map((customer) => String(customer.phone || "").replace(/\D/g, "")));
    const filePhones = new Set();
    return sourceRows.filter((row) => Object.values(row).some((value) => String(value ?? "").trim())).map((row, index) => {
      const storeType = normalizeStoreType(valueFor(row, "storeType"));
      const province = valueFor(row, "province");
      const city = valueFor(row, "city");
      const store = matchStore(row, stores, storeType, province, city);
      const phone = valueFor(row, "phone");
      const normalizedPhone = phone.replace(/\D/g, "");
      const customer = {
        name: valueFor(row, "name"), phone, wechat: valueFor(row, "wechat") || undefined,
        ageGroup: valueFor(row, "ageGroup") || undefined, storeType, regionProvince: province, regionCity: city,
        regionDistrict: valueFor(row, "district"), community: valueFor(row, "community") || undefined,
        houseType: valueFor(row, "houseType") || undefined, dealYear: numberFor(valueFor(row, "dealYear")) || undefined,
        totalAmount: numberFor(valueFor(row, "totalAmount")), depositAmount: numberFor(valueFor(row, "depositAmount")),
        productSeries: valueFor(row, "productSeries").split(/[,，、;；]/).map((value) => value.trim()).filter(Boolean),
        whyFarock: valueFor(row, "whyFarock") || undefined, tier: normalizeTier(valueFor(row, "tier")),
        personaSummary: valueFor(row, "personaSummary") || undefined, storeId: store?.id || "",
        dealerGroupId: storeType === "DEALER" ? store?.dealerGroupId || "" : undefined,
      };
      const reasons = [];
      if (!customer.name) reasons.push("缺少姓名");
      if (!phone) reasons.push("缺少手机号");
      else if (!/^[+\d][\d\s()-]{5,19}$/.test(phone)) reasons.push("手机号格式不正确");
      else if (existingPhones.has(normalizedPhone)) reasons.push("手机号已存在");
      else if (filePhones.has(normalizedPhone)) reasons.push("文件内手机号重复");
      if (!storeType) reasons.push("经营模式应为直营或代理商");
      if (!province || !city || !customer.regionDistrict) reasons.push("省/市/区不能为空");
      if (!store) reasons.push("无法唯一匹配门店，请填写门店编码或名称");
      if (storeType === "DEALER" && !customer.dealerGroupId) reasons.push("代理商门店未关联代理商分组");
      if (normalizedPhone) filePhones.add(normalizedPhone);
      return { rowNumber: index + 2, customer, storeName: store?.storeName || "-", reasons, valid: reasons.length === 0 };
    });
  }

  function cell(text, className = "px-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap") {
    const td = document.createElement("td");
    td.className = className;
    td.textContent = text;
    return td;
  }

  function renderPreview() {
    const validCount = parsedRows.filter((row) => row.valid).length;
    elements.total.textContent = String(parsedRows.length);
    elements.valid.textContent = String(validCount);
    elements.invalid.textContent = String(parsedRows.length - validCount);
    elements.confirm.disabled = validCount === 0;
    elements.preview.replaceChildren();
    parsedRows.forEach((row) => {
      const tr = document.createElement("tr");
      if (!row.valid) tr.className = "bg-error-container/30";
      tr.append(cell(String(row.rowNumber)), cell(row.customer.name || "-"), cell(row.customer.phone || "-"),
        cell([row.customer.regionCity, row.customer.community].filter(Boolean).join(" / ") || "-"), cell(row.storeName),
        cell(row.customer.tier), cell(row.valid ? "有效" : row.reasons.join("；"), row.valid ? "px-4 py-3 text-on-secondary-container whitespace-nowrap" : "px-4 py-3 text-on-error-container whitespace-nowrap"));
      elements.preview.appendChild(tr);
    });
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.classList.remove("hidden");
  }
  function openModal(fileName) {
    elements.fileName.textContent = fileName;
    elements.error.classList.add("hidden");
    elements.modal.classList.remove("hidden");
    elements.modal.classList.add("flex");
    elements.close.focus();
  }
  function closeModal() {
    elements.modal.classList.add("hidden");
    elements.modal.classList.remove("flex");
    elements.input.value = "";
    parsedRows = [];
    elements.button.focus();
  }

  async function handleFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(extension)) throw new Error("仅支持 .xlsx、.xls 或 .csv 文件");
    const XLSX = await loadSheetJs();
    const storesPayload = await window.FarockAPI.get("/stores");
    const customersPayload = await window.FarockAPI.get("/customers?page=1&pageSize=100");
    const buffer = await file.arrayBuffer();
    const workbook = extension === "csv" ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" }) : XLSX.read(buffer, { type: "array" });
    if (!workbook.SheetNames.length) throw new Error("文件中没有可读取的工作表");
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
    if (!rows.length) throw new Error("首个工作表没有可导入的数据");
    parsedRows = validateRows(rows, storesPayload.data, customersPayload.data);
    openModal(file.name);
    renderPreview();
  }

  elements.button.addEventListener("click", () => elements.input.click());
  elements.input.addEventListener("change", async () => {
    const file = elements.input.files[0];
    if (!file) return;
    elements.button.disabled = true;
    try { await handleFile(file); }
    catch (error) { openModal(file.name); parsedRows = []; renderPreview(); showError(error.message || "文件解析失败，请检查格式后重试"); }
    finally { elements.button.disabled = false; }
  });
  elements.confirm.addEventListener("click", async () => {
    const customers = parsedRows.filter((row) => row.valid).map((row) => row.customer);
    if (!customers.length) return;
    elements.confirm.disabled = true;
    elements.confirm.textContent = "正在导入...";
    try {
      const result = await window.FarockAPI.post("/customers/import", { customers });
      elements.confirm.textContent = `已导入 ${result.data.imported} 位客户`;
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      showError(error.message || "客户导入失败");
      elements.confirm.disabled = false;
      elements.confirm.textContent = "确认导入";
    }
  });
  [elements.close, elements.cancel].forEach((button) => button.addEventListener("click", closeModal));
  elements.modal.addEventListener("click", (event) => { if (event.target === elements.modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !elements.modal.classList.contains("hidden")) closeModal(); });
})();
