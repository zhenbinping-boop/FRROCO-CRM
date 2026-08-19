(() => {
  "use strict";

  const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const IMPORT_BATCH_SIZE = 200;
  const MATCH_THRESHOLD = 0.74;
  const aliases = {
    name: ["姓名", "客户姓名", "客户名称", "顾客姓名", "业主姓名", "name"],
    phone: ["手机号", "手机号码", "联系电话", "联系方式", "客户电话", "客户联系方式", "电话", "phone", "mobile"],
    wechat: ["微信", "微信号", "微信号码", "wechat"],
    birthday: ["生日", "出生日期", "客户生日", "birthday"],
    isReturningCustomer: ["老客户", "老客户是否", "是否老客户", "复购客户"],
    ageGroup: ["年龄", "年龄段", "客户年龄", "agegroup"],
    province: ["省份", "省", "所在省", "province"],
    city: ["城市", "市", "所在城市", "city"],
    district: ["区县", "区", "区域", "所在区县", "district"],
    address: ["地址", "项目地址", "详细地址", "房屋地址", "门牌地址"],
    community: ["小区", "楼盘", "项目名称", "community"],
    houseType: ["户型", "房屋户型", "housetype"],
    storeType: ["经营模式", "运营模式", "门店类型", "客户类型", "storetype", "operationmode"],
    store: ["门店", "门店名称", "门店编码", "归属门店", "归属机构", "店面", "store"],
    dealerGroup: ["代理商分组", "代理商", "经销商", "加盟商", "dealer", "dealergroup"],
    dealYear: ["订购年份", "下单年份", "签约年份", "年份", "dealyear"],
    totalAmount: ["订购金额", "成交金额", "合同金额", "订单金额", "下单金额", "totalamount"],
    depositAmount: ["已付定金", "定金", "已付金额", "depositamount"],
    productSeries: ["产品系列", "订购系列", "产品品类", "订单性质", "productseries"],
    customerSource: ["客户来源", "渠道来源", "来源渠道", "装饰公司", "来源"],
    whyFarock: ["为什么选择法洛可", "选择法洛可原因", "选择原因", "whyfarock"],
    salesRepName: ["导购", "导购员", "销售", "销售顾问"],
    designerName: ["设计师", "内部设计师", "负责设计师"],
    referralDesignerName: ["带单设计师", "推荐设计师", "外部设计师", "返款人"],
    dealDate: ["下单日期", "建单日期", "签约日期", "日期"],
    designRebateAmount: ["设计返点金额", "返点金额", "返款金额", "佣金金额"],
    designRebateStatus: ["设计返点状态", "返点状态", "设计返点"],
    invoiceAmount: ["开发票金额", "开票金额", "发票金额"],
    notes: ["备注", "补充说明", "说明"],
    transactionAmount: ["交款退款金额", "交款金额", "退款金额", "流水金额", "收款金额"],
    transactionChannel: ["交款退款渠道", "交款渠道", "退款渠道", "支付方式", "付款方式"],
    transactionProgress: ["交款进度", "付款进度", "款项阶段", "付款阶段"],
    transactionDate: ["交款下单日期", "交款退款日期", "交款日期", "退款日期", "入账日期", "打款日期"],
    designRebateRate: ["返点比率", "返点比例", "设计返点比例"],
    tier: ["客户分级", "客户等级", "客户级别", "分级", "等级", "tier"],
    personaSummary: ["用户画像", "客户画像", "画像", "personasummary"],
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
      if (!fields.has("name") || fields.size < 2) return;
      const score = [...row].reduce((total, value) => total + bestFieldMatch(value).score, 0);
      if (score > best.score) best = { index, score, mapping };
    });
    return best.index;
  }

  function detectHeaderRows(matrix) {
    return matrix.map((row, index) => ({ index, mapping: buildHeaderMapping(row) })).filter(({ mapping }) => {
      const fields = new Set(mapping.values());
      return fields.has("name") && fields.size >= 2;
    }).map(({ index }) => index);
  }

  function valueFor(row, field) {
    if (Object.prototype.hasOwnProperty.call(row, field)) return String(row[field] ?? "").trim();
    const key = Object.keys(row).find((candidate) => aliases[field].some((alias) => headerScore(candidate, alias) >= MATCH_THRESHOLD));
    return key ? String(row[key] ?? "").trim() : "";
  }

  function rawValueFor(row, field) {
    if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
    const key = Object.keys(row).find((candidate) => aliases[field].some((alias) => headerScore(candidate, alias) >= MATCH_THRESHOLD));
    return key ? row[key] : undefined;
  }

  function optionalNumberFor(value) {
    if (value === undefined || value === null || String(value).trim() === "") return undefined;
    const match = String(value).replaceAll(",", "").match(/[-+]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  }
  function optionalMoneyFor(value) {
    if (value === undefined || value === null || String(value).trim() === "") return undefined;
    const text = String(value).replaceAll(",", "").replace(/\s/g, "");
    const parts = text.match(/[-+]?\d+(?:\.\d+)?/g);
    if (!parts?.length) return undefined;
    const amount = parts.reduce((sum, part) => sum + Number(part), 0);
    return /万/.test(text) && parts.length === 1 ? amount * 10000 : amount;
  }
  const numberFor = (value) => optionalMoneyFor(value) || 0;
  const depositFor = (row, totalAmount) => Math.min(Math.max(numberFor(valueFor(row, "depositAmount")), 0), totalAmount);

  function dateFor(value, fallbackYear) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "number" && value > 1) {
      if (fallbackYear && value < 13 && !Number.isInteger(value)) {
        const [month, rawDay] = String(value).split(".");
        const day = rawDay.length === 1 && /^[123]$/.test(rawDay) ? Number(rawDay) * 10 : Number(rawDay);
        return dateFor(`${month}.${day}`, fallbackYear);
      }
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    const text = String(value ?? "").trim();
    if (!text) return undefined;
    const parts = text.replace(/[年月]/g, ".").replace(/日/g, "").split(/[.\/-]/).filter(Boolean).map((part) => Number(part));
    let year; let month; let day;
    if (parts.length >= 3 && parts[0] >= 1900 && parts[0] <= 2100) [year, month, day] = parts;
    else if (parts.length >= 3 && fallbackYear) [year, month, day] = [Number(fallbackYear), parts[1], parts[2]];
    else if (parts.length >= 2 && fallbackYear) [year, month, day] = [Number(fallbackYear), parts[0], parts[1]];
    if (!year || !month || !day) return undefined;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString() : undefined;
  }

  const booleanFor = (value) => /^(是|有|老客户|复购|yes|true|1)$/i.test(String(value ?? "").trim());
  const normalizeStoreType = (value) => /dealer|代理|经销/i.test(value) ? "DEALER" : /direct|直营/i.test(value) ? "DIRECT" : "";

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

  function resolveStore(row, stores, mappedStoreId) {
    return matchStore(row, stores, normalizeStoreType(valueFor(row, "storeType")), valueFor(row, "province"), valueFor(row, "city"))
      || stores.find((store) => store.id === mappedStoreId);
  }

  function extractRows(XLSX, workbook) {
    const rows = [];
    workbook.SheetNames.forEach((sheetName) => {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
      const titleYear = String(matrix[0]?.[0] ?? "").match(/(?:19|20)\d{2}/)?.[0] || "";
      const headerIndexes = detectHeaderRows(matrix);
      headerIndexes.forEach((headerIndex, sectionIndex) => {
        const mapping = buildHeaderMapping(matrix[headerIndex], matrix[headerIndex + 1]);
        const sectionEnd = headerIndexes[sectionIndex + 1] ?? matrix.length;
        const fields = new Set(mapping.values());
        const isRebateTable = fields.has("designRebateRate") || fields.has("referralDesignerName") && fields.has("designRebateAmount") && !fields.has("transactionProgress");
        const customersByName = new Map();
        const customersByPhone = new Map();
        let currentCustomer;
        matrix.slice(headerIndex + 1, sectionEnd).forEach((cells, offset) => {
          const rowNumber = headerIndex + offset + 2;
          const row = { __sheetName: sheetName, __rowNumber: rowNumber, __dealYear: titleYear };
          mapping.forEach((field, column) => { row[field] = cells[column] ?? ""; });
          const name = valueFor(row, "name");
          const phone = valueFor(row, "phone");

          if (isRebateTable && name) {
            const key = normalize(name);
            currentCustomer = customersByName.get(key);
            if (!currentCustomer) {
              row.__transactions = [];
              row.__isRebateTable = true;
              row.__rebateDetails = [];
              row.__referralDesignerNames = [];
              row.totalAmount = rawValueFor(row, "transactionAmount");
              currentCustomer = row;
              customersByName.set(key, row);
              rows.push(row);
            } else if (!valueFor(currentCustomer, "phone") && phone) {
              currentCustomer.phone = rawValueFor(row, "phone");
            }
            const recipient = valueFor(row, "referralDesignerName");
            const rebateAmount = Math.max(optionalMoneyFor(rawValueFor(row, "designRebateAmount")) || 0, 0);
            const rebateRate = optionalNumberFor(rawValueFor(row, "designRebateRate"));
            if (recipient && !currentCustomer.__referralDesignerNames.includes(recipient)) currentCustomer.__referralDesignerNames.push(recipient);
            if (recipient || rebateAmount || rebateRate !== undefined) currentCustomer.__rebateDetails.push({ recipient, amount: rebateAmount, rate: rebateRate });
            currentCustomer.__designRebateAmount = (currentCustomer.__designRebateAmount || 0) + rebateAmount;
            return;
          }

          if (name || phone) {
            const phoneKey = phone.replace(/\D/g, "");
            const existingCustomer = phoneKey.length >= 6 ? customersByPhone.get(phoneKey) : undefined;
            if (existingCustomer) {
              currentCustomer = existingCustomer;
              mapping.forEach((field) => {
                if (!valueFor(currentCustomer, field) && valueFor(row, field)) currentCustomer[field] = rawValueFor(row, field);
              });
            } else {
              row.__transactions = [];
              currentCustomer = row;
              rows.push(row);
              if (phoneKey.length >= 6) customersByPhone.set(phoneKey, row);
            }
          }
          const amount = optionalMoneyFor(rawValueFor(row, "transactionAmount"));
          if (currentCustomer && amount !== undefined && amount !== 0) currentCustomer.__transactions.push({
            amount,
            channel: valueFor(row, "transactionChannel") || undefined,
            progress: valueFor(row, "transactionProgress") || undefined,
            occurredAt: dateFor(rawValueFor(row, "transactionDate"), titleYear),
            sourceSheet: sheetName,
            sourceRow: rowNumber,
          });
        });
      });
    });
    const primaryByName = new Map();
    rows.filter((row) => !row.__isRebateTable).forEach((row) => {
      const key = normalize(valueFor(row, "name"));
      if (!key) return;
      const matches = primaryByName.get(key) || [];
      matches.push(row);
      primaryByName.set(key, matches);
    });
    return rows.filter((row) => {
      if (!row.__isRebateTable) return true;
      const matches = primaryByName.get(normalize(valueFor(row, "name"))) || [];
      if (matches.length !== 1) return true;
      const target = matches[0];
      target.__designRebateAmount = (target.__designRebateAmount || 0) + (row.__designRebateAmount || 0);
      target.__rebateDetails = [...(target.__rebateDetails || []), ...(row.__rebateDetails || [])];
      target.__referralDesignerNames = [...new Set([...(target.__referralDesignerNames || []), ...(row.__referralDesignerNames || [])])];
      if (!valueFor(target, "phone") && valueFor(row, "phone")) target.phone = rawValueFor(row, "phone");
      if (!valueFor(target, "totalAmount") && valueFor(row, "totalAmount")) target.totalAmount = rawValueFor(row, "totalAmount");
      return false;
    });
  }

  function runSelfCheck() {
    const matrix = [
      ["2021年门店客户详情表"],
      ["序号", " 客户姓明\n", "客户联系方式（手机）", "地址", "下单金额", "交款/退款金额", "已付定金"],
      [1, "张三", "13800138000", "朝阳区", 100000, -20000, 120000],
    ];
    const index = detectHeaderRow(matrix);
    const mapping = buildHeaderMapping(matrix[index], matrix[index + 1]);
    if (index !== 1 || mapping.get(1) !== "name" || mapping.get(2) !== "phone" || mapping.get(4) !== "totalAmount" || mapping.get(5) !== "transactionAmount" || mapping.get(6) !== "depositAmount") {
      throw new Error("customer-import header matching self-check failed");
    }
    const row = { depositAmount: matrix[2][6] };
    if (depositFor(row, matrix[2][4]) !== matrix[2][4]) throw new Error("customer-import deposit bounds self-check failed");
    if (new Set(mapping.values()).size !== mapping.size) throw new Error("customer-import unique mapping self-check failed");
    if (!dateFor("1.30", "2021")?.startsWith("2021-01-30")) throw new Error("customer-import date parsing self-check failed");
    if (!dateFor(1.12, "2021")?.startsWith("2021-01-12") || !dateFor(1.08, "2021")?.startsWith("2021-01-08") || !dateFor(1.3, "2021")?.startsWith("2021-01-30") || !dateFor(1.7, "2021")?.startsWith("2021-01-07")) throw new Error("customer-import numeric month-day self-check failed");
    if (!dateFor(44197)?.startsWith("2021-01-01")) throw new Error("customer-import Excel serial date self-check failed");
    if (!dateFor("2021..1.3", "2021")?.startsWith("2021-01-03") || !dateFor("20201.1.20", "2021")?.startsWith("2021-01-20")) throw new Error("customer-import malformed date self-check failed");
    if (optionalMoneyFor("9,100+900券") !== 10000 || optionalMoneyFor("1.5万") !== 15000) throw new Error("customer-import money parsing self-check failed");
    const multiTableMatrix = [
      ["2021年客户表"],
      ["客户姓名", "客户联系方式", "交款/退款金额", "交款进度"],
      ["甲客户", "13800138000", 100, "第一笔"],
      ["", "", -20, "退款"],
      ["甲客户", "13800138000", 50, "第二笔"],
      ["客户姓名", "联系电话", "返款人", "交款金额", "返点比率", "返款金额"],
      ["乙客户", "", "设计师甲", 1000, 0.05, 50],
      ["乙客户", "13900139000", "设计师乙", 1000, 0.03, 30],
    ];
    const extracted = extractRows({ utils: { sheet_to_json: () => multiTableMatrix } }, { SheetNames: ["测试门店"], Sheets: { 测试门店: {} } });
    if (extracted.length !== 2 || extracted[0].__transactions.length !== 3 || extracted[1].phone !== "13900139000" || extracted[1].__designRebateAmount !== 80) {
      throw new Error("customer-import multi-table aggregation self-check failed");
    }
    const crossSheetWorkbook = {
      SheetNames: ["主表", "返点表"],
      Sheets: {
        主表: { matrix: [["2021年主表"], ["客户姓名", "客户联系方式", "地址"], ["张红博", "13800138000", "测试小区"]] },
        返点表: { matrix: [["2021年返点表"], ["客户姓名", "联系电话", "返款人", "返点比率", "返款金额"], ["张红博", "", "设计师甲", 0.05, 500]] },
      },
    };
    const crossSheetRows = extractRows({ utils: { sheet_to_json: (sheet) => sheet.matrix } }, crossSheetWorkbook);
    if (crossSheetRows.length !== 1 || crossSheetRows[0].__designRebateAmount !== 500 || crossSheetRows[0].__referralDesignerNames[0] !== "设计师甲") {
      throw new Error("customer-import cross-sheet rebate self-check failed");
    }
    const noPhoneRows = extractRows({ utils: { sheet_to_json: () => [["客户姓名", "地址"], ["无电话客户", "测试地址"]] } }, { SheetNames: ["测试门店"], Sheets: { 测试门店: {} } });
    if (noPhoneRows.length !== 1 || valueFor(noPhoneRows[0], "name") !== "无电话客户") throw new Error("customer-import optional phone self-check failed");
    const mappedStore = { id: "store-1", storeName: "待选择门店", storeType: "DIRECT", regionProvince: "北京市", regionCity: "北京市", regionDistrict: "朝阳区" };
    if (resolveStore({ __sheetName: "未知工作表" }, [mappedStore], mappedStore.id) !== mappedStore) throw new Error("customer-import sheet store mapping self-check failed");
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
    progress: document.querySelector("#customer-import-progress"), progressTrack: document.querySelector("#customer-import-progress-track"),
    progressBar: document.querySelector("#customer-import-progress-bar"), progressText: document.querySelector("#customer-import-progress-text"),
    progressPercent: document.querySelector("#customer-import-progress-percent"),
    storeMapping: document.querySelector("#customer-import-store-mapping"), storeMappingList: document.querySelector("#customer-import-store-mapping-list"),
    storeForm: document.querySelector("#customer-import-store-form"), storeFormSheet: document.querySelector("#customer-import-store-form-sheet"),
    storeFormCancel: document.querySelector("#customer-import-store-cancel"), storeFormSubmit: document.querySelector("#customer-import-store-submit"),
  };
  if (Object.values(elements).some((element) => !element)) return;

  let parsedRows = [];
  let sourceRows = [];
  let availableStores = [];
  let availableDealerGroups = [];
  let existingCustomers = [];
  const storeIdsBySheet = new Map();
  let activeSheetName = "";
  let sheetJsPromise;
  const normalizeTier = (value) => ["S", "A", "B", "C"].includes(String(value).trim().charAt(0).toUpperCase()) ? String(value).trim().charAt(0).toUpperCase() : "B";

  function updateImportProgress(completed, total) {
    const percent = total ? Math.round((completed / total) * 100) : 0;
    elements.progress.classList.remove("hidden");
    elements.progressBar.style.width = `${percent}%`;
    elements.progressTrack.setAttribute("aria-valuenow", String(percent));
    elements.progressText.textContent = `已处理 ${completed} / ${total} 位客户`;
    elements.progressPercent.textContent = `${percent}%`;
  }

  function resetImportProgress() {
    elements.progress.classList.add("hidden");
    elements.progressBar.style.width = "0%";
    elements.progressTrack.setAttribute("aria-valuenow", "0");
    elements.progressText.textContent = "准备导入";
    elements.progressPercent.textContent = "0%";
  }

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

  function validateRows(rows, stores, customers) {
    const existingPhones = new Set(customers.map((customer) => String(customer.phone || "").replace(/\D/g, "")).filter(Boolean));
    const filePhones = new Set();
    return rows.map((row) => {
      const initialType = normalizeStoreType(valueFor(row, "storeType"));
      const initialProvince = valueFor(row, "province");
      const initialCity = valueFor(row, "city");
      const store = resolveStore(row, stores, storeIdsBySheet.get(row.__sheetName));
      const storeType = initialType || store?.storeType || "";
      const province = initialProvince || store?.regionProvince || "";
      const city = initialCity || store?.regionCity || "";
      const district = valueFor(row, "district") || store?.regionDistrict || "";
      const phone = valueFor(row, "phone");
      const normalizedPhone = phone.replace(/\D/g, "");
      const totalAmount = Math.max(numberFor(valueFor(row, "totalAmount")), 0);
      const dealDate = dateFor(rawValueFor(row, "dealDate"), row.__dealYear);
      const rebateAmountRaw = rawValueFor(row, "designRebateAmount");
      const rebateStatusRaw = valueFor(row, "designRebateStatus") || (optionalMoneyFor(rebateAmountRaw) === undefined ? String(rebateAmountRaw ?? "").trim() : "");
      const rebateDetails = row.__rebateDetails || [];
      const rebateNotes = rebateDetails.map((item) => [
        item.recipient || "未注明返款人",
        item.rate === undefined ? "" : `${item.rate * 100}%`,
        item.amount ? `${item.amount} 元` : "",
      ].filter(Boolean).join(" / ")).join("；");
      const sourceNotes = valueFor(row, "notes");
      const customer = {
        name: valueFor(row, "name"), phone: phone || undefined, wechat: valueFor(row, "wechat") || undefined,
        birthday: dateFor(rawValueFor(row, "birthday")),
        isReturningCustomer: booleanFor(valueFor(row, "isReturningCustomer")),
        address: valueFor(row, "address") || undefined,
        ageGroup: valueFor(row, "ageGroup") || undefined, storeType, regionProvince: province, regionCity: city,
        regionDistrict: district, community: valueFor(row, "community") || undefined,
        houseType: valueFor(row, "houseType") || undefined,
        dealYear: numberFor(valueFor(row, "dealYear") || row.__dealYear || dealDate?.slice(0, 4)) || undefined,
        dealDate,
        totalAmount, depositAmount: depositFor(row, totalAmount),
        productSeries: valueFor(row, "productSeries").split(/[,，、;；]/).map((value) => value.trim()).filter(Boolean),
        whyFarock: valueFor(row, "whyFarock") || undefined, tier: normalizeTier(valueFor(row, "tier")),
        personaSummary: valueFor(row, "personaSummary") || undefined,
        customerSource: valueFor(row, "customerSource") || undefined,
        sourceSheet: row.__sheetName,
        salesRepName: valueFor(row, "salesRepName") || undefined,
        designerName: valueFor(row, "designerName") || undefined,
        referralDesignerName: row.__referralDesignerNames?.join("、") || valueFor(row, "referralDesignerName") || undefined,
        designRebateAmount: row.__designRebateAmount ?? Math.max(optionalMoneyFor(rebateAmountRaw) || 0, 0),
        designRebateStatus: rebateStatusRaw || (row.__designRebateAmount > 0 ? "已返点" : undefined),
        invoiceAmount: Math.max(numberFor(valueFor(row, "invoiceAmount")), 0),
        notes: [sourceNotes, rebateNotes ? `返点明细：${rebateNotes}` : ""].filter(Boolean).join("\n") || undefined,
        transactions: row.__transactions || [],
        storeId: store?.id || "",
        dealerGroupId: storeType === "DEALER" ? store?.dealerGroupId || "" : undefined,
      };
      const reasons = [];
      if (!customer.name) reasons.push("缺少姓名");
      if (phone && !/^[+\d][\d\s()-]{5,19}$/.test(phone)) reasons.push("手机号格式不正确");
      else if (existingPhones.has(normalizedPhone)) reasons.push("手机号已存在");
      else if (filePhones.has(normalizedPhone)) reasons.push("文件内手机号重复");
      if (!storeType || !province || !city || !customer.regionDistrict || !store) reasons.push("请选择该工作表的归属门店");
      if (store && initialType && store.storeType !== initialType) reasons.push("表格经营模式与所选门店不一致");
      if (storeType === "DEALER" && store && ((initialProvince && initialProvince !== store.regionProvince) || (initialCity && initialCity !== store.regionCity))) {
        reasons.push("代理商客户地区与所选门店不一致");
      }
      if (storeType === "DEALER" && !customer.dealerGroupId) reasons.push("代理商门店未关联代理商分组");
      if (normalizedPhone) filePhones.add(normalizedPhone);
      return { sheetName: row.__sheetName, rowNumber: row.__rowNumber, customer, storeName: store?.storeName || "-", reasons, valid: reasons.length === 0 };
    });
  }

  function renderStoreMappings() {
    const sheets = [...new Set(sourceRows.filter((row) => {
      const storeType = normalizeStoreType(valueFor(row, "storeType"));
      return !matchStore(row, availableStores, storeType, valueFor(row, "province"), valueFor(row, "city"));
    }).map((row) => row.__sheetName))];
    elements.storeMapping.classList.toggle("hidden", sheets.length === 0);
    elements.storeMappingList.replaceChildren();
    sheets.forEach((sheetName, sheetIndex) => {
      const label = document.createElement("label");
      label.className = "grid gap-1 font-label-md text-label-md text-primary";
      label.append(document.createTextNode(`${sheetName} 工作表`));
      const input = document.createElement("input");
      const listId = `customer-import-store-options-${sheetIndex}`;
      input.type = "search";
      input.className = "w-full rounded-lg border border-outline-variant bg-surface-white px-3 py-2 font-body-md text-body-md text-primary";
      input.placeholder = "可输入门店名称或编码";
      input.setAttribute("list", listId);
      input.value = availableStores.find((store) => store.id === storeIdsBySheet.get(sheetName))?.storeName || "";
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "shrink-0 rounded-lg border border-primary px-3 py-2 font-label-md text-label-md text-primary";
      addButton.textContent = "新增门店";
      addButton.addEventListener("click", () => openStoreForm(sheetName));
      const datalist = document.createElement("datalist");
      datalist.id = listId;
      availableStores.forEach((store) => {
        const option = document.createElement("option");
        option.value = store.storeName;
        option.label = `${store.code} · ${store.storeType === "DEALER" ? "代理商" : "直营"} · ${store.regionProvince}${store.regionCity}${store.regionDistrict || ""}`;
        datalist.append(option);
      });
      const updateStoreMapping = () => {
        const store = uniqueBestStore(availableStores, input.value);
        if (store) storeIdsBySheet.set(sheetName, store.id);
        else storeIdsBySheet.delete(sheetName);
        parsedRows = validateRows(sourceRows, availableStores, existingCustomers);
        renderPreview();
      };
      input.addEventListener("input", updateStoreMapping);
      const controls = document.createElement("div");
      controls.className = "flex gap-2";
      controls.append(input, addButton);
      label.append(controls, datalist);
      elements.storeMappingList.append(label);
    });
  }

  function renderDealerGroupOptions() {
    const select = elements.storeForm.elements.dealerGroupId;
    const previous = select.value;
    select.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "直营门店无需选择";
    select.append(empty);
    availableDealerGroups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = `${group.dealerName} · ${group.regionProvince}${group.regionCity}`;
      select.append(option);
    });
    select.value = previous;
  }

  function syncDealerGroupField() {
    const isDealer = elements.storeForm.elements.storeType.value === "DEALER";
    const select = elements.storeForm.elements.dealerGroupId;
    select.disabled = !isDealer;
    select.required = isDealer;
    if (!isDealer) select.value = "";
  }

  function openStoreForm(sheetName) {
    activeSheetName = sheetName;
    elements.storeForm.reset();
    elements.storeForm.elements.storeName.value = sheetName;
    elements.storeForm.elements.storeType.value = "DIRECT";
    elements.storeFormSheet.textContent = `将为“${sheetName}”工作表创建门店，创建后会自动绑定。`;
    renderDealerGroupOptions();
    syncDealerGroupField();
    elements.storeForm.classList.remove("hidden");
    elements.storeForm.elements.code.focus();
  }

  function closeStoreForm() {
    activeSheetName = "";
    elements.storeForm.classList.add("hidden");
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
        cell(row.customer.tier), cell(row.valid ? `有效（${row.customer.transactions.length} 笔流水）` : row.reasons.join("；"), row.valid ? "px-4 py-3 text-on-secondary-container whitespace-nowrap" : "px-4 py-3 text-on-error-container whitespace-nowrap"));
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
    resetImportProgress();
    elements.modal.classList.remove("hidden");
    elements.modal.classList.add("flex");
    elements.close.focus();
  }
  function closeModal() {
    elements.modal.classList.add("hidden");
    elements.modal.classList.remove("flex");
    elements.input.value = "";
    parsedRows = [];
    sourceRows = [];
    availableStores = [];
    availableDealerGroups = [];
    existingCustomers = [];
    storeIdsBySheet.clear();
    closeStoreForm();
    elements.button.focus();
  }

  async function fetchAllCustomers() {
    const firstPage = await window.FarockAPI.get("/customers?page=1&pageSize=100");
    const totalPages = Number(firstPage.meta?.totalPages) || 1;
    if (totalPages === 1) return firstPage.data;
    const remaining = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => (
      window.FarockAPI.get(`/customers?page=${index + 2}&pageSize=100`)
    )));
    return [firstPage, ...remaining].flatMap((payload) => payload.data);
  }

  async function handleFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(extension)) throw new Error("仅支持 .xlsx、.xls 或 .csv 文件");
    const XLSX = await loadSheetJs();
    const [storesPayload, customers, dealerGroupsPayload] = await Promise.all([
      window.FarockAPI.get("/stores"),
      fetchAllCustomers(),
      window.FarockAPI.get("/dealer-groups"),
    ]);
    const buffer = await file.arrayBuffer();
    const workbook = extension === "csv" ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" }) : XLSX.read(buffer, { type: "array" });
    if (!workbook.SheetNames.length) throw new Error("文件中没有可读取的工作表");
    sourceRows = extractRows(XLSX, workbook);
    if (!sourceRows.length) throw new Error("所有工作表均未识别到客户数据");
    availableStores = storesPayload.data;
    availableDealerGroups = dealerGroupsPayload.data;
    existingCustomers = customers;
    storeIdsBySheet.clear();
    parsedRows = validateRows(sourceRows, availableStores, existingCustomers);
    openModal(file.name);
    renderStoreMappings();
    renderDealerGroupOptions();
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
    const totalBatches = Math.ceil(customers.length / IMPORT_BATCH_SIZE);
    let imported = 0;
    let completed = 0;
    updateImportProgress(0, customers.length);
    try {
      for (let offset = 0; offset < customers.length; offset += IMPORT_BATCH_SIZE) {
        const batch = customers.slice(offset, offset + IMPORT_BATCH_SIZE);
        const batchNumber = Math.floor(offset / IMPORT_BATCH_SIZE) + 1;
        elements.confirm.textContent = `正在导入 ${batchNumber}/${totalBatches} 批...`;
        const result = await window.FarockAPI.post("/customers/import", { customers: batch });
        imported += Number(result.data?.imported) || batch.length;
        completed += batch.length;
        updateImportProgress(completed, customers.length);
      }
      elements.confirm.textContent = `已导入 ${imported} 位客户`;
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      showError(`已导入 ${imported} 位客户，后续批次未完成：${error.message || "客户导入失败"}`);
      elements.confirm.disabled = false;
      elements.confirm.textContent = "确认导入";
    }
  });
  elements.storeForm.elements.storeType.addEventListener("change", syncDealerGroupField);
  elements.storeFormCancel.addEventListener("click", closeStoreForm);
  elements.storeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.storeFormSubmit.disabled = true;
    const form = elements.storeForm.elements;
    try {
      const result = await window.FarockAPI.post("/stores", {
        code: form.code.value, storeName: form.storeName.value, storeType: form.storeType.value,
        regionProvince: form.regionProvince.value, regionCity: form.regionCity.value,
        regionDistrict: form.regionDistrict.value || undefined, dealerGroupId: form.dealerGroupId.value || undefined,
      });
      availableStores = [...availableStores, result.data];
      if (activeSheetName) storeIdsBySheet.set(activeSheetName, result.data.id);
      closeStoreForm();
      renderStoreMappings();
      parsedRows = validateRows(sourceRows, availableStores, existingCustomers);
      renderPreview();
    } catch (error) {
      showError(error.message || "新增门店失败");
    } finally {
      elements.storeFormSubmit.disabled = false;
    }
  });
  [elements.close, elements.cancel].forEach((button) => button.addEventListener("click", closeModal));
  elements.modal.addEventListener("click", (event) => { if (event.target === elements.modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !elements.modal.classList.contains("hidden")) closeModal(); });
})();
