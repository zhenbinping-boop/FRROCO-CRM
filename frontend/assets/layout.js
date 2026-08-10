(() => {
  "use strict";

  const page = location.pathname.split("/").pop() || "index.html";
  if (page === "index.html") return;
  if (!localStorage.getItem("farock-token")) {
    location.replace("index.html");
    return;
  }

  const pages = {
    "dashboard.html": { title: "经营工作台", active: "dashboard", actions: ["newCustomer"] },
    "customers.html": { title: "客户管理", active: "customers", actions: ["regionalExport", "customerImport", "newCustomer"] },
    "customer-create.html": { title: "新建客户", active: "customers" },
    "customer-detail.html": { title: "客户详情", active: "customers", actions: ["deleteCustomer", "editCustomer", "newFollowup"] },
    "customer-handover.html": { title: "客户交接", active: "customers" },
    "follow-up-tasks.html": { title: "跟进任务", active: "tasks", actions: ["createTask"] },
    "channel-analysis.html": { title: "渠道分析", active: "activity", actions: ["export"] },
    "team-ranking.html": { title: "团队业绩排行", active: "activity" },
    "orders-payments.html": { title: "订单与回款", active: "orders", actions: ["payment"] },
    "payment-entry.html": { title: "登记收款", active: "orders", actions: ["backToOrders"] },
    "organizations.html": { title: "机构管理", active: "settings", actions: ["addBranch"] },
    "users-permissions.html": { title: "人员与权限", active: "settings", actions: ["userImport", "inviteUser"] },
    "master-data.html": { title: "基础数据配置", active: "settings", actions: ["export"] }
  };

  const config = pages[page];
  if (!config) return;

  const navItems = [
    ["dashboard", "dashboard", "经营工作台", "dashboard.html"],
    ["customers", "group", "客户管理", "customers.html"],
    ["tasks", "assignment_turned_in", "跟进任务", "follow-up-tasks.html"],
    ["activity", "trending_up", "数据分析", "channel-analysis.html"],
    ["orders", "shopping_cart", "订单与回款", "orders-payments.html"],
    ["settings", "settings", "系统配置", "master-data.html"]
  ];

  class FarockSidebar extends HTMLElement {
    connectedCallback() {
      const active = this.getAttribute("active");
      this.innerHTML = `
        <aside class="farock-sidebar" aria-label="主导航">
          <div class="farock-sidebar__brand">
            <span class="farock-sidebar__mark">F</span>
            <span><strong>FRROCO 法洛可</strong><small>定制客户管理</small></span>
          </div>
          <nav class="farock-sidebar__nav">
            ${navItems.map(([key, icon, label, href]) => `
              <a class="farock-sidebar__link${active === key ? " is-active" : ""}" href="${href}" ${active === key ? 'aria-current="page"' : ""}>
                <span class="material-symbols-outlined">${icon}</span><span>${label}</span>
              </a>`).join("")}
          </nav>
          <div class="farock-sidebar__footer">
            <a class="farock-button farock-button--primary farock-sidebar__create" href="customer-create.html">
              <span class="material-symbols-outlined">add</span><span>新建客户</span>
            </a>
            <a class="farock-user-card" href="users-permissions.html">
              <span class="farock-avatar" aria-hidden="true">林</span>
              <span class="farock-user-card__copy"><strong>林晓雅</strong><small>管理员</small></span>
              <span class="material-symbols-outlined">chevron_right</span>
            </a>
            <button class="farock-sidebar__logout" type="button"><span class="material-symbols-outlined">logout</span><span>退出登录</span></button>
          </div>
        </aside>
        <button class="farock-sidebar__backdrop" type="button" aria-label="关闭导航"></button>`;
      this.querySelector(".farock-sidebar__backdrop").addEventListener("click", () => this.close());
      this.querySelector(".farock-sidebar__logout").addEventListener("click", () => {
        localStorage.removeItem("farock-token");
        localStorage.removeItem("farock-session");
        location.href = "index.html";
      });
      this.querySelectorAll(".farock-sidebar__link").forEach((link) => link.addEventListener("click", () => this.close()));
      window.addEventListener("farock:toggle-sidebar", () => this.toggle());
    }

    toggle() {
      this.classList.toggle("is-open");
    }

    close() {
      this.classList.remove("is-open");
    }
  }

  class FarockHeader extends HTMLElement {
    connectedCallback() {
      const title = this.getAttribute("page-title") || "法洛可 CRM";
      this.innerHTML = `
        <header class="farock-header">
          <div class="farock-header__left">
            <button class="farock-icon-button farock-header__menu" type="button" aria-label="打开导航">
              <span class="material-symbols-outlined">menu</span>
            </button>
            <h1>${title}</h1>
            <label class="farock-header__search">
              <span class="material-symbols-outlined">search</span>
              <input data-global-search type="search" placeholder="搜索客户、订单或任务" aria-label="全局搜索"/>
            </label>
          </div>
          <div class="farock-header__right">
            <button class="farock-icon-button" type="button" aria-label="通知">
              <span class="material-symbols-outlined">notifications</span><span class="farock-notification-dot"></span>
            </button>
            <a class="farock-avatar farock-avatar--header" href="users-permissions.html" aria-label="林晓雅，管理员">林</a>
          </div>
        </header>`;
      this.querySelector(".farock-header__menu").addEventListener("click", () => window.dispatchEvent(new CustomEvent("farock:toggle-sidebar")));
    }
  }

  customElements.define("farock-sidebar", FarockSidebar);
  customElements.define("farock-header", FarockHeader);

  const actionTemplates = {
    newCustomer: '<a class="farock-button farock-button--primary" href="customer-create.html"><span class="material-symbols-outlined">add</span><span>新建客户</span></a>',
    newFollowup: '<a class="farock-button farock-button--primary" href="follow-up-tasks.html"><span class="material-symbols-outlined">add_task</span><span>新增跟进</span></a>',
    createTask: '<button class="farock-button farock-button--primary" id="task-create-button" type="button"><span class="material-symbols-outlined">add_task</span><span>新建任务</span></button>',
    editCustomer: '<button class="farock-button farock-button--secondary" id="customer-edit-button" type="button"><span class="material-symbols-outlined">edit</span><span>编辑客户</span></button>',
    deleteCustomer: '<button class="farock-button farock-button--danger" id="customer-delete-button" type="button"><span class="material-symbols-outlined">delete</span><span>删除客户</span></button>',
    payment: '<a class="farock-button farock-button--primary" href="payment-entry.html"><span class="material-symbols-outlined">payments</span><span>登记收款</span></a>',
    backToOrders: '<a class="farock-button farock-button--secondary" href="orders-payments.html"><span class="material-symbols-outlined">arrow_back</span><span>返回订单</span></a>',
    export: '<button class="farock-button farock-button--secondary" type="button"><span class="material-symbols-outlined">download</span><span>导出</span></button>',
    addBranch: '<button class="farock-button farock-button--primary" type="button">新增机构</button>',
    inviteUser: '<button class="farock-button farock-button--primary" type="button">邀请用户</button>',
    customerImport: '<button class="farock-button farock-button--secondary" id="customer-import-button" type="button"><span class="material-symbols-outlined">upload_file</span><span>表格导入</span></button><input id="customer-import-file" class="farock-visually-hidden" type="file" accept=".xlsx,.xls,.csv"/>',
    regionalExport: '<button class="farock-button farock-button--secondary" id="customer-regional-export" type="button"><span class="material-symbols-outlined">download</span><span>导出地区名单</span></button>',
    userImport: '<button class="farock-button farock-button--secondary" id="user-import-button" type="button"><span class="material-symbols-outlined">upload_file</span><span>表格导入</span></button><input id="user-import-file" class="farock-visually-hidden" type="file" accept=".xlsx,.xls,.csv"/>'
  };

  function createActionBar(actions = []) {
    if (!actions.length) return null;
    const bar = document.createElement("div");
    bar.className = "farock-content-actions";
    bar.setAttribute("aria-label", "页面操作");
    bar.innerHTML = actions.map((action) => actionTemplates[action] || "").join("");
    return bar;
  }

  const main = document.querySelector("main");
  if (!main) return;

  function removeLegacyPageHeader() {
    const heading = main.querySelector("h1, h2");
    if (!heading) return;
    const headingGroup = heading.parentElement;
    const headerRow = headingGroup?.parentElement;
    const hasControls = headerRow?.querySelectorAll("button, a").length > 0;
    const hasFormFields = headerRow?.querySelectorAll("input:not([type=\"file\"]), select, textarea").length > 0;
    if (headerRow && headerRow !== main && hasControls && !hasFormFields) {
      headerRow.remove();
      return;
    }
    headingGroup?.remove();
  }

  document.querySelectorAll("header").forEach((header) => header.remove());
  removeLegacyPageHeader();
  let legacyRoot = main;
  while (legacyRoot.parentElement && legacyRoot.parentElement !== document.body) legacyRoot = legacyRoot.parentElement;

  const shell = document.createElement("div");
  shell.className = "farock-shell-main";
  document.body.insertBefore(shell, legacyRoot);
  main.remove();
  if (legacyRoot !== main) legacyRoot.remove();

  const sidebar = document.createElement("farock-sidebar");
  sidebar.setAttribute("active", config.active);
  const header = document.createElement("farock-header");
  header.setAttribute("page-title", config.title);
  shell.append(header);
  const actions = createActionBar(config.actions);
  if (actions) shell.append(actions);
  shell.append(main);

  Array.from(document.body.children).forEach((element) => {
    if (["NAV", "ASIDE"].includes(element.tagName)) element.remove();
  });
  document.body.prepend(sidebar);
  document.body.classList.add("farock-app-shell");
})();
