(() => {
  "use strict";

  const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const MATCH_THRESHOLD = 0.74;
  const aliases = {
    name: ["姓名", "客户姓名", "客户名称", "顾客姓名", "业主姓名", "name"],
    phone: ["手机号", "手机号码", "联系电话", "联系方式", "客户电话", "客户联系方式", "电话", "phone", "mobile"],
    wechat: ["微信", "微信号", "微信号码", "wechat"],
    ageGroup: ["年龄", "年龄段", "客户年龄", "agegroup"],
    province: ["省份", "省", "所在省", "province"],
    city: ["城市", "市", "所在城市", "city"],
    district: ["区县", "区", "区域", "所在区县", "district"],
    community: ["小区", "地址", "项目地址", "详细地址", "楼盘", "项目名称", "community"],
    houseType: ["户型", "房屋户型", "housetype"],
    storeType: ["经营模式", "运营模式", "门店类型", "客户类型", "storetype", "operationmode"],
    store: ["门店", "门店名称", "门店编码", "归属门店", "归属机构", "店面", "store"],
    dealerGroup: ["代理商分组", "代理商", "经销商", "加盟商", "dealer", "dealergroup"],
    dealYear: ["订购年份", "下单年份", "签约年份", "年份", "dealyear"],
    totalAmount: ["订购金额", "成交金额", "合同金额", "订单金额", "下单金额", "totalamount"],
    depositAmount: ["已付定金", "定金", "已付金额", "交款金额", "交款退款金额", "收款金额", "depositamount"],
    productSeries: ["产品系列", "订购系列", "产品品类", "订单性质", "productseries"],
    whyFarock: ["为什么选择法洛可", "选择原因", "客户来源", "来源", "whyfarock"],
    tier: ["客户分级", "客户等级", "客户级别", "分级", "等级", "tier"],
    personaSummary: ["用户画像", "客户画像", "画像", "备注", "personasummary"],
  };

  const normalize = (value) => String(value ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\r\n\t·•,，。:：;；/\\|_\-—+（）()【】\[\]{}<>《》"'“”‘’]/g, "");

  function editDistance(left, right) {
    if (!left) return right.length;
    if (!right) return left.length;
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const above = previous[j];
        previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return previous[right.length];
  }

  function headerScore(value, alias) {
    const header = normalize(value);
    const target = normalize(alias);
    if (!header || !target) return 0;
    if (header === target) return 1;
    if (header.includes(target) && target.length >= 2) return 0.92;
    if (target.includes(header) && header.length >= 2) return 0.86;
    if (Math.min(header.length, target.length) < 3) return 0;
    return 1 - editDistance(header, target) / Math.max(header.length, target.length);
  }

  function bestFieldMatch(value) {
    let best = { field: "", score: 0 };
    Object.entries(aliases).forEach(([field, names]) => {
      names.forEach((alias) => {
        const score = headerScore(value, alias);
        if (score > best.score) best = { field, score };
      });
    });
    return best;
  }

  function buildHeaderMapping(primaryRow, secondaryRow = []) {
    const candidates = [];
    const columnCount = Math.max(primaryRow?.length || 0, secondaryRow?.length || 0);
    for (let column = 0; column < columnCount; column += 1) {
      const primary = primaryRow?.[column] ?? "";
      const secondary = secondaryRow?.[column] ?? "";
      const variants = [primary, primary && secondary ? `${primary} ${secondary}` : "", secondary].filter(Boolean);
      Object.keys(aliases).forEach((field) => {
        const score = Math.max(...variants.flatMap((value) => aliases[field].map((alias) => headerScore(value, alias))), 0);
        if (score >= MATCH_THRESHOLD) candidates.push({ column, field, score });
      });
    }
    candidates.sort((left, right) => right.score - left.score);
    const fields = new Set();
    const columns = new Set();
    const mapping = new Map();
    candidates.forEach(({ column, field }) => {
      if (fields.has(field) || columns.has(column)) return;
      fields.add(field);
      columns.add(column);
      mapping.set(column, field);
    });
    return mapping;
  }

  function detectHeaderRow(matrix) {
    let best = { index: -1, score: 0, mapping: new Map() };
    matrix.slice(0, 20).forEach((row, index) => {
      const mapping = buildHeaderMapping(row);
      const fields = new Set(mapping.values());
      if (!fields.has("name") || !fields.has("phone") || fields.size < 3) return;
      const score = [...row].reduce((total, value) => total + bestFieldMatch(value).score, 0);
      if (score > best.score) best = { index, score, mapping };
    });
    return best.index;
  }

  function valueFor(row, field) {
    if (Object.prototype.hasOwnProperty.call(row, field)) return String(row[field] ?? "").trim();
    const key = Object.keys(row).find((candidate) => aliases[field].some((alias) => headerScore(candidate, alias) >= MATCH_THRESHOLD));
    return key ? String(row[key] ?? "").trim() : "";
  }

  function normalizedContains(left, right) {
    const a = normalize(left);
    const b = normalize(right);
    return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
  }

  function uniqueBestStore(stores, text) {
    const hint = normalize(text);
    if (!hint) return null;
    const ranked = stores.map((store) => {
      const values = [store.id, store.code, store.storeName].filter(Boolean).map(normalize);
      const score = values.some((value) => value === hint) ? 1 : values.some((value) => normalizedContains(value, hint)) ? 0.85 : 0;
      return { store, score };
    }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score);
    if (!ranked.length || (ranked[1] && ranked[0].score === ranked[1].score)) return null;
    return ranked[0].store;
  }

  function matchStore(row, stores, storeType, province, city) {
    const explicit = uniqueBestStore(stores, valueFor(row, "store"));
    if (explicit) return explicit;
    const hinted = uniqueBestStore(stores, row.__sheetName);
    if (hinted) return hinted;
    const candidates = stores.filter((store) => store.storeType === storeType && store.regionProvince === province && store.regionCity === city);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function extractRows(XLSX, workbook) {
    const rows = [];
    workbook.SheetNames.forEach((sheetName) => {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
      const headerIndex = detectHeaderRow(matrix);
      if (headerIndex < 0) return;
      const mapping = buildHeaderMapping(matrix[headerIndex], matrix[headerIndex + 1]);
      const titleYear = String(matrix[0]?.[0] ?? "").match(/(?:19|20)\d{2}/)?.[0] || "";
      matrix.slice(headerIndex + 1).forEach((cells, offset) => {
        const row = { __sheetName: sheetName, __rowNumber: headerIndex + offset + 2, __dealYear: titleYear };
        mapping.forEach((field, column) => { row[field] = cells[column] ?? ""; });
        if (!valueFor(row, "name") && !valueFor(row, "phone")) return;
        rows.push(row);
      });
    });
    return rows;
  }

  function runSelfCheck() {
    const matrix = [
      ["2021年门店客户详情表"],
      ["序号", " 客户姓明\n", "客户联系方式（手机）", "地址", "下单金额", "交款/退款金额"],
      [1, "张三", "13800138000", "朝阳区", 100000, 20000],
    ];
    const index = detectHeaderRow(matrix);
    const mapping = buildHeaderMapping(matrix[index], matrix[index + 1]);
    if (index !== 1 || mapping.get(1) !== "name" || mapping.get(2) !== "phone" || mapping.get(4) !== "totalAmount" || mapping.get(5) !== "depositAmount") {
      throw new Error("customer-import header matching self-check failed");
    }
    if (new Set(mapping.values()).size !== mapping.size) throw new Error("customer-import unique mapping self-check failed");
    console.log("customer-import self-check passed");
  }

  if (typeof document === "undefined") {
    runSelfCheck();
    return;
  }

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

  function validateRows(sourceRows, stores, existingCustomers) {
    const existingPhones = new Set(existingCustomers.map((customer) => String(customer.phone || "").replace(/\D/g, "")));
    const filePhones = new Set();
    return sourceRows.map((row) => {
      const initialType = normalizeStoreType(valueFor(row, "storeType"));
      const initialProvince = valueFor(row, "province");
      const initialCity = valueFor(row, "city");
      const store = matchStore(row, stores, initialType, initialProvince, initialCity);
      const storeType = initialType || store?.storeType || "";
      const province = initialProvince || store?.regionProvince || "";
      const city = initialCity || store?.regionCity || "";
      const district = valueFor(row, "district") || store?.regionDistrict || "";
      const phone = valueFor(row, "phone");
      const normalizedPhone = phone.replace(/\D/g, "");
      const customer = {
        name: valueFor(row, "name"), phone, wechat: valueFor(row, "wechat") || undefined,
        ageGroup: valueFor(row, "ageGroup") || undefined, storeType, regionProvince: province, regionCity: city,
        regionDistrict: district, community: valueFor(row, "community") || undefined,
        houseType: valueFor(row, "houseType") || undefined, dealYear: numberFor(valueFor(row, "dealYear") || row.__dealYear) || undefined,
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
      if (!store) reasons.push("无法唯一匹配门店，请填写门店编码、名称或使用对应工作表名");
      if (storeType === "DEALER" && !customer.dealerGroupId) reasons.push("代理商门店未关联代理商分组");
      if (normalizedPhone) filePhones.add(normalizedPhone);
      return { sheetName: row.__sheetName, rowNumber: row.__rowNumber, customer, storeName: store?.storeName || "-", reasons, valid: reasons.length === 0 };
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
      tr.append(cell(`${row.sheetName} ${row.rowNumber}`), cell(row.customer.name || "-"), cell(row.customer.phone || "-"),
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
    const rows = extractRows(XLSX, workbook);
    if (!rows.length) throw new Error("所有工作表均未识别到包含姓名和联系方式的客户数据");
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
