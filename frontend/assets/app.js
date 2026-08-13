(() => {
  const routes = {
    dashboard: "dashboard.html",
    customers: "customers.html",
    customerCreate: "customer-create.html",
    customerDetail: "customer-detail.html",
    tasks: "follow-up-tasks.html",
    activity: "channel-analysis.html",
    team: "team-ranking.html",
    orders: "orders-payments.html",
    payment: "payment-entry.html",
    organizations: "organizations.html",
    users: "users-permissions.html",
    handover: "customer-handover.html",
    settings: "master-data.html",
    login: "index.html"
  };

  const page = location.pathname.split("/").pop() || routes.login;
  let uiRevealed = false;
  const revealUi = () => {
    if (uiRevealed) return;
    uiRevealed = true;
    document.documentElement.classList.add("farock-ui-ready");
    window.dispatchEvent(new CustomEvent("farock:ui-ready"));
  };
  const revealFallback = setTimeout(revealUi, 15_000);
  let currentSession = null;
  try { currentSession = JSON.parse(localStorage.getItem("farock-session") || "null"); } catch { currentSession = null; }
  window.addEventListener("farock:user-updated", (event) => {
    currentSession = { ...(currentSession || {}), ...event.detail };
    const profileTarget = currentSession?.role === "ADMIN" ? routes.users : routes.dashboard;
    document.querySelectorAll('a[href="users-permissions.html"], a[href="#"]').forEach((anchor) => {
      if (textOf(anchor.querySelector(".material-symbols-outlined")) === "account_circle") anchor.href = profileTarget;
    });
  });
  const BRAND = "FRROCO 法洛可";
  const normalize = (value) => value.replace(/\s+/g, " ").trim();
  const textOf = (element) => normalize(element?.textContent || "");
  const go = (target) => {
    location.href = target;
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function readStore(key, fallback = []) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function toast(message, type = "success") {
    let stack = document.querySelector(".farock-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "farock-toast-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.append(stack);
    }
    const item = document.createElement("div");
    item.className = `farock-toast ${type}`;
    item.innerHTML = `<span class="material-symbols-outlined">${type === "error" ? "error" : "check_circle"}</span><span>${escapeHtml(message)}</span>`;
    stack.append(item);
    setTimeout(() => item.remove(), 3200);
  }

  function openModal(title, fields, onSubmit, submitLabel = "保存") {
    const backdrop = document.createElement("div");
    backdrop.className = "farock-modal-backdrop";
    backdrop.innerHTML = `
      <section class="farock-modal" role="dialog" aria-modal="true" aria-labelledby="farock-modal-title">
        <header class="farock-modal-header">
          <h2 id="farock-modal-title">${escapeHtml(title)}</h2>
          <button type="button" aria-label="Close"><span class="material-symbols-outlined">close</span></button>
        </header>
        <form>
          <div class="farock-modal-body">
            ${fields.map((field) => {
              const attributes = `${field.required ? "required" : ""} ${field.readonly ? "readonly" : ""}`;
              const options = field.options
                ? `<select name="${escapeHtml(field.name)}" ${attributes}>${field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select>`
                : field.type === "textarea"
                  ? `<textarea name="${escapeHtml(field.name)}" rows="3" ${attributes}>${escapeHtml(field.value || "")}</textarea>`
                  : `<input name="${escapeHtml(field.name)}" type="${field.type || "text"}" value="${escapeHtml(field.value || "")}" ${attributes}/>`;
              return `<div class="farock-field"><label>${escapeHtml(field.label)}</label>${options}</div>`;
            }).join("")}
          </div>
          <footer class="farock-modal-actions">
            <button class="farock-btn" type="button" data-close>取消</button>
            <button class="farock-btn primary" type="submit">${escapeHtml(submitLabel)}</button>
          </footer>
        </form>
      </section>`;
    const close = () => backdrop.remove();
    backdrop.querySelector('[aria-label="Close"]').addEventListener("click", close);
    backdrop.querySelector("[data-close]").addEventListener("click", close);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    backdrop.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
      close();
    });
    document.body.append(backdrop);
    backdrop.querySelector("input, select, textarea")?.focus();
  }

  const zh = {
    "Premium Management": "高端定制管理",
    "Dashboard": "经营工作台",
    "Customers": "客户管理",
    "Tasks": "跟进任务",
    "Activity": "数据分析",
    "Orders": "订单与回款",
    "Settings": "系统配置",
    "Profile": "个人中心",
    "Logout": "退出登录",
    "New Project": "新建客户",
    "Main Office": "总部门店",
    "East Branch": "城东门店",
    "Add Customer": "新建客户",
    "New Follow-up": "新增跟进",
    "View All": "查看全部",
    "View Details": "查看详情",
    "View Projects": "查看项目",
    "Export Data": "导出数据",
    "Export List": "导出名单",
    "Invite User": "邀请用户",
    "Register Payment": "登记收款",
    "Edit Details": "编辑详情",
    "Export": "导出",
    "Filter": "筛选",
    "Client:": "客户：",
    "Add Branch": "新增机构",
    "View All Branches": "查看全部机构",
    "New Category": "新增分类",
    "Organic Web": "自然流量",
    "Direct Outreach": "直营触达",
    "Add Series": "新增系列",
    "Add Tier": "新增等级",
    "Direct Web": "直营线上",
    "Acme Corp - John Doe": "艾克米公司 - 张伟",
    "Metro Build": "都会建设",
    "LOGIN": "登录",
    "Login": "登录",
    "Need an account?": "还没有账号？",
    "Faloco CRM - Dashboard": "Faloco CRM｜经营工作台",
    "Faloco CRM - Customers": "Faloco CRM｜客户列表",
    "Faloco CRM - Login": "Faloco CRM｜登录",
    "Faloco CRM - Orders & Payments": "Faloco CRM｜订单与回款",
    "Customer Details - Faloco CRM": "Faloco CRM｜客户详情",
    "Add Customer - Faloco CRM": "Faloco CRM｜新建客户",
    "Register Payment - Faloco CRM": "Faloco CRM｜收款登记",
    "Acquisition Analytics | Faloco CRM": "Faloco CRM｜渠道分析",
    "Faloco - Activity Leaderboard": "Faloco CRM｜团队业绩排行",
    "Task Dashboard - Faloco CRM": "Faloco CRM｜跟进任务",
    "Faloco - Branch Management": "Faloco CRM｜机构管理",
    "Faloco - User Management": "Faloco CRM｜人员与权限",
    "Faloco - Batch Transfer": "Faloco CRM｜客户交接",
    "Data Dictionaries - Faloco CRM": "Faloco CRM｜基础数据配置",
    "Active Orders": "进行中订单",
    "Active Portfolio": "活跃客户",
    "Active Tasks": "待办任务",
    "Activity Summary": "活动摘要",
    "Orders Pending Payment": "待回款订单",
    "Pending Approvals": "待审批",
    "Pending Balance": "待收尾款",
    "Total Revenue": "总营收",
    "Total Pipeline Value": "商机总金额",
    "Revenue vs Target": "营收目标达成",
    "Monthly Collection Target": "月度回款目标",
    "New customers": "新增客户",
    "Success Rate": "成交率",
    "Successful deals": "成交客户",
    "18 Apr": "4月18日",
    "09 Mar": "3月9日",
    "16 Apr": "4月16日",
    "540 Realty Blvd, Miami, FL 33132": "深圳市南山区 33132",
    "1200 Enterprise Way, Suite 100": "总部园区 100 号",
    "Trade Show": "展会",
    "Partner Agency": "合作代理商",
    "since yesterday": "较昨日",
    "This Month": "本月",
    "Last Quarter": "上季度",
    "Year to Date": "年度至今",
    "Last 30 Days Trajectory": "近30天趋势",
    "Order & Payment Management": "订单与回款",
    "Track order statuses, balances, and register new payments.": "跟踪订单状态、待收余额并登记新回款。",
    "All Orders": "全部订单",
    "Completed": "已完成",
    "Order ID": "订单编号",
    "Client Name": "客户名称",
    "Order Total": "订单总额",
    "Amount Paid": "已收金额",
    "Balance Due": "待收余额",
    "Payment Progress": "回款进度",
    "Customer Name": "客户姓名",
    "Phone Number": "联系电话",
    "WeChat ID": "微信号",
    "Age Group": "年龄段",
    "Basic Info": "基础信息",
    "Basic Information": "基础信息",
    "Housing Info": "住房信息",
    "Source & Assignment": "渠道与归属",
    "Commercial Details": "交易信息",
    "Persona Profile": "客户画像",
    "Create New Customer": "新建客户",
    "Enter the preliminary details to onboard a new client.": "录入客户基础资料，建立客户档案。",
    "Initial Notes": "初始备注",
    "Continue to Step 2": "继续下一步",
    "Material Series": "板材/材质系列",
    "Why Faloco?": "为什么选择 Faloco？",
    "AI Customer Persona & Insights": "客户画像与洞察",
    "Follow-up History": "跟进记录",
    "Log Activity": "记录活动",
    "Log Follow-up": "记录跟进",
    "Payment Details": "收款详情",
    "Payment Type": "收款类型",
    "Payment Date": "收款日期",
    "Payment Method": "收款方式",
    "Bank Transfer": "银行转账",
    "WeChat Pay": "微信支付",
    "Milestone Payment": "阶段款",
    "Final Balance": "尾款",
    "Supporting Documents": "收款凭证",
    "Drag and drop receipt image or PDF": "拖放收据图片或 PDF 到此处",
    "or click to browse": "或点击选择文件",
    "REMAINING BALANCE": "待收余额",
    "Back to Order ORD-2023-089": "返回订单 ORD-2023-089",
    "Acquisition Analytics": "渠道分析",
    "Monitor lead performance, conversion velocity, and revenue distribution across all primary marketing channels.": "监控各主要获客渠道的线索表现、转化效率和营收分布。",
    "Total Leads": "线索总数",
    "Avg Conversion": "平均转化率",
    "Avg. Deal Size": "平均客单价",
    "Revenue by Channel": "渠道营收",
    "Lead Source Dist.": "线索来源分布",
    "Channel Performance Table": "渠道表现明细",
    "Leads generated": "获得线索",
    "Successful deals": "成交数",
    "Conv. Rate": "转化率",
    "Total Volume": "成交总额",
    "Volume composition": "金额占比",
    "Team Performance": "团队业绩排行",
    "Top Performers": "优秀员工",
    "All Teams": "全部团队",
    "Calls Made": "外呼次数",
    "Emails Sent": "邮件数",
    "Tasks Completed": "已完成任务",
    "Success Rate": "成功率",
    "Tasks & Follow-ups": "跟进任务",
    "Manage your daily outreach and prioritize high-value client interactions.": "管理每日跟进，优先处理高价值客户互动。",
    "High Priority": "高优先级",
    "Sort by:": "排序：",
    "Name (A-Z)": "姓名 A-Z",
    "Yesterday, 4:00 PM": "昨日 16:00",
    "Branch Management": "机构管理",
    "Overview of all operational units and regional offices.": "查看并管理全部门店和经销商区域。",
    "Total Branches": "机构总数",
    "Direct Ops": "直营机构",
    "Dealer Network": "经销商网络",
    "Operational Mode": "运营模式",
    "Regional Manager": "区域负责人",
    "User & Role Management": "人员与权限",
    "Configure system access, define roles, and manage permissions across branches.": "配置系统访问、定义角色并管理各机构权限。",
    "All Roles": "全部角色",
    "All Branches": "全部机构",
    "Admin": "管理员",
    "Sales": "导购",
    "Designer": "设计师",
    "Team Members": "团队成员",
    "24 Active": "24 人启用",
    "Employee": "人员",
    "Role": "角色",
    "Branch": "所属机构",
    "Status": "状态",
    "Actions": "操作",
    "Active": "启用",
    "Sales Exec": "导购",
    "Senior Sales": "资深导购",
    "Lead Design": "主管设计师",
    "Role Settings": "角色设置",
    "Module Access": "模块权限",
    "Project Permissions": "项目权限",
    "Projects & Tasks": "项目与任务",
    "Can see project details and files.": "可查看项目详情和文件。",
    "Can modify timelines and descriptions.": "可修改进度和描述。",
    "Delete Projects": "删除项目",
    "Permanently remove records.": "永久删除记录。",
    "Showing 1-4 of 24": "显示第 1-4 条，共 24 条",
    "Transfer Ownership": "客户交接",
    "Select customers to reassign and choose their new representative. This action will update all active projects and pending tasks associated with these accounts.": "选择需要交接的客户及新负责人。操作将同步更新相关项目和待办任务。",
    "Select Customers": "选择客户",
    "2 customers selected": "已选 2 位客户",
    "Current Rep": "当前负责人",
    "Transfer Details": "交接详情",
    "Assign To": "新负责人",
    "Reason for Transfer (Optional)": "交接原因（选填）",
    "Transfer Active Tasks": "转移未完成任务",
    "Move all uncompleted follow-ups to the new owner.": "将所有未完成跟进转移给新负责人。",
    "Notify Customers": "通知客户",
    "Send automated introduction email from new representative.": "以新负责人身份发送自动介绍邮件。",
    "Selected Accounts": "已选客户",
    "Pending Tasks Reassigned": "待办任务将同步转移",
    "Execute Transfer": "确认交接",
    "Data Dictionaries": "基础数据配置",
    "Channel Sources": "渠道来源",
    "Origin of customer leads": "客户线索来源",
    "Customer Levels": "客户分级",
    "Account tiering": "客户价值分层",
    "Style Preferences": "风格偏好",
    "Design aesthetics tags": "设计风格标签",
    "Quick Add Tag": "快速添加标签",
    "Download lists to CSV/Excel.": "将基础数据导出为表格文件。",
    "S - Elite": "S 级",
    "A - High": "A 级",
    "Level S": "S 级",
    "Level A": "A 级",
    "Level B": "B 级",
    "Select type...": "请选择类型",
    "Select age range...": "请选择年龄段",
    "Select new representative...": "请选择新负责人",
    "Contact Support": "联系支持",
    "Forgot?": "忘记密码？",
    "Username or Phone": "用户名或手机号",
    "Password": "密码",
    "Keep me signed in": "保持登录",
    "View details": "查看详情",
    "Contacted": "已联系",
    "Negotiation": "洽谈中",
    "Offer Sent": "已发方案",
    "Total Outstanding Balance": "待收尾款总额",
    "vs last month": "较上月",
    "68% Achieved": "已达成 68%",
    "Confirmed": "已确认",
    "Draft": "草稿",
    "In Production": "生产中",
    "Stage: Proposal": "阶段：方案沟通",
    "Material: ENF Eco-friendly": "材质：ENF 级环保板材",
    "75% Complete": "已完成 75%",
    "Filters": "筛选",
    "Source": "渠道来源",
    "Referral": "转介绍",
    "Web": "线上渠道",
    "Org": "机构",
    "Internal": "内部",
    "Partner": "合作伙伴",
    "Level": "客户分级",
    "Last Active": "最近活跃",
    "142 Total": "共 142 位",
    "Next: Today": "下次：今日",
    "Next: ASAP": "下次：尽快",
    "Followed: 16 Apr": "最近跟进：4月16日",
    "Followed: 18 Apr": "最近跟进：4月18日",
    "Followed: 21 Mar": "最近跟进：3月21日",
    "Followed: 23 Apr": "最近跟进：4月23日",
    "Next: 25 Apr": "下次：4月25日",
    "Next: 30 Apr": "下次：4月30日",
    "Cancel": "取消",
    "Save Changes": "保存更改",
    "Save as Draft": "保存草稿",
    "Order Summary": "订单摘要",
    "CUSTOMER": "客户",
    "PROJECT": "项目",
    "Paid to Date": "累计已付",
    "Deposit": "定金",
    "Amount": "收款金额",
    "Reference No. (Optional)": "参考编号（选填）",
    "Card": "刷卡",
    "Cash": "现金",
    "Avg. Conv Rate": "平均转化率",
    "Weekly": "周度",
    "Monthly": "月度",
    "Quarterly": "季度",
    "Yearly": "年度",
    "Xiaohongshu": "小红书",
    "Douyin": "抖音",
    "Referrals": "老客转介绍",
    "Direct": "直营",
    "Total": "合计",
    "Channel": "渠道",
    "Design": "设计团队",
    "View Full List": "查看完整排行",
    "Home": "首页",
    "Clients": "客户",
    "Overdue": "已逾期",
    "Reschedule": "重新安排",
    "Today": "今日",
    "Upcoming": "即将开始",
    "Wed": "周三",
    "HEADQUARTERS": "总部",
    "Edit": "编辑",
    "Dealer": "经销商",
    "Away": "暂离",
    "Suspended": "已停用",
    "Financials": "财务管理",
    "Currently configuring permissions for the": "当前正在配置",
    "role.": "角色的权限。",
    "Batch Transfer": "批量交接",
    "Customer": "客户",
    "Value": "客户价值",
    "Summary": "交接摘要",
    "Review carefully. Transferring ownership will immediately update access permissions for the selected accounts.": "请仔细核对。交接后将立即更新所选客户的访问权限。",
    "Add": "新增",
    "More": "更多",
    "Configure standard terminologies and categorical data used across the CRM. These values populate dropdowns and standardize reporting.": "配置 CRM 全局使用的标准术语和分类数据，用于下拉选项和统一报表口径。",
    "Product fabrication lines": "产品制造系列",
    "Minimalist": "极简",
    "Industrial": "工业风",
    "Mid-Century": "中古风",
    "Contemporary": "现代风",
    "Rustic": "自然原木风",
    "Tier 1: Enterprise": "S 级：核心客户",
    "Tier 2: Key Account": "A 级：重点客户",
    "Tier 3: Standard": "B/C 级：普通客户",
    "Earth Collection": "大地系列",
    "Industrial Core": "工业核心系列",
    "Premium Alloy": "臻选合金系列",
    "Eco-Resin": "环保树脂系列",
    "12.5% vs last month": "较上月 +12.5%",
    "2.1% vs last month": "较上月 +2.1%",
    "8.4% vs last month": "较上月 +8.4%",
    "12.5% vs last period": "较上期 +12.5%",
    "3.2% vs last period": "较上期 +3.2%",
    "-5% vs last period": "较上期 -5%",
    "October 2023": "2023年10月",
    "Q3 2024 • Activity & Leaderboard": "2024年第3季度 • 活动与排行",
    "10:30 AM": "10:30",
    "2:00 PM": "14:00",
    "Client: Metro Build": "客户：都会建设",
    "Alex Sterling": "艾伦",
    "John Doe": "张伟",
    "Jane Smith": "李娜",
    "Sarah Jenkins": "王敏",
    "Marcus Chen": "陈明",
    "Marcus Thorne": "马克",
    "Elena Rodriguez": "罗琳",
    "Elena Rossi": "罗雪",
    "David Kim": "金大伟",
    "Diana Chen": "陈娜",
    "Iona Rollins": "林晓雅",
    "J. Doe": "张伟",
    "M. Chen": "陈明",
    "Tom": "汤姆",
    "David Chen (Senior Designer)": "陈大伟（资深设计师）",
    "Elena Rodriguez (Sales Exec)": "罗琳（导购）",
    "Marcus Thorne (Sales Exec)": "马克（导购）",
    "Prime Estate": "卓越地产",
    "Prime Estate Group": "卓越地产集团",
    "ByteBridge": "字节桥科技",
    "ByteBridge Security": "字节桥安全",
    "SkillUp Hub": "职业进阶中心",
    "Stellar Architecture": "星空建筑",
    "Apex Developments": "巅峰发展",
    "Nova Build Group": "新城建设集团",
    "Lumina Spaces": "光影空间",
    "AI Synergy Labs": "协同智能实验室",
    "SwiftCargo Intl.": "迅达国际物流",
    "Acme Corp - John Doe": "艾克米公司 - 张伟",
    "Elevate Designs LLC": "高维设计",
    "Apex Constructors": "巅峰建造",
    "Northway Retail Group": "北辰零售集团",
    "South Hub": "南区中心",
    "Apex Manufacturing": "巅峰制造",
    "Vanguard Design Co.": "先锋设计",
    "Horizon Estates": "天际地产",
    "Lumina Lighting": "光影照明",
    "Corporate and personal data protection on a turnkey basis": "为企业和个人提供一站式数据安全服务",
    "Corporate and personal data protection on a turnkey basis for enterprise clients.": "为企业客户提供一站式数据安全服务。",
    "Platform for professional development of specialists": "专业人才职业发展平台",
    "Agency-developer of low-rise elite and commercial real estate": "专注低密高端住宅和商业地产开发",
    "High-end commercial real estate developers focusing on low-rise luxury complexes.": "专注低密高端综合体的商业地产开发商。",
    "Innovative automation solutions based on artificial intelligence for mid-market.": "面向中型企业的人工智能自动化解决方案。",
    "International transportation of chemical goods and hazardous materials.": "提供化工品和危险品国际运输服务。",
    "Penthouse Suite 4A": "4A 顶层宅邸",
    "Riverfront Residences": "滨江府",
    "Downtown District": "市中心区",
    "Custom Kitchen & Island": "定制橱柜与中岛",
    "Onyx Collection - T1": "黑玛瑙系列 - T1",
    "Onyx Collection - T2": "黑玛瑙系列 - T2",
    "Titanium Core": "钛金核心系列",
    "Quartz Line - Custom": "石英系列 - 定制",
    "Custom Lobby Seating v2": "定制大堂座椅 v2",
    "Finalize Custom Millwork Quote": "完成定制木作报价",
    "Check-in on Steel Delivery": "跟进钢材到货",
    "Send Revised Floorplans": "发送修订版平面图",
    "Review Q3 Supply Contracts": "复核第3季度供应合同",
    "Site Visit - Downtown Project": "现场勘察 - 城中项目",
    "Discussed initial proposal for custom kitchen cabinetry. Client prefers the ENF Eco-friendly series. Sent revised quote.": "已沟通定制橱柜初步方案。客户偏好 ENF 级环保系列，已发送修订报价。",
    "Clarified timeline expectations. Production lead time of 6 weeks is acceptable.": "已明确交付进度，客户可接受 6 周生产周期。",
    "Initial inquiry received via website contact form. Shared preliminary digital catalog.": "通过官网表单收到初步咨询，已发送电子产品目录。",
    "Alex is a detail-oriented professional who values sustainable materials and long-term durability. They are highly analytical in their purchasing decisions, preferring data-backed guarantees over emotional sales pitches. Time efficiency is critical; they appreciate concise communication and adherence to promised timelines.": "客户注重细节，关注可持续材料和长期耐用性。购买决策理性，更信任数据与质保承诺。注重沟通效率和按时交付。",
    "Exclusive use of certified ENF Eco-friendly materials.": "采用经认证的 ENF 级环保材质。",
    "Transparent production timeline tracking.": "生产进度透明可追踪。",
    "Premium bespoke design capabilities fitting unique floorplans.": "高端定制设计能力，可适配独特户型。",
    "$340K collected": "已回款 ¥34万",
    "$45,000 Paid": "已付 ¥45,000",
    "$15,000 Remaining": "剩余 ¥15,000",
    "Oct 24, 2023 • Meeting": "2023年10月24日 • 面谈",
    "Oct 18, 2023 • Call": "2023年10月18日 • 电话",
    "Oct 10, 2023 • Email": "2023年10月10日 • 邮件",
    "Miami, FL 33132": "深圳市南山区 33132",
    "Austin, TX 78701": "杭州市拱墅区 78701",
    "Newark, NJ 07102": "苏州市工业园区 07102",
    "Seattle, WA 98101": "成都市高新区 98101",
    "San Francisco, CA 94103": "上海市静安区 94103",
    "New York, NY": "北京市朝阳区",
    "Austin, TX": "杭州市拱墅区",
    "> $500k/yr": "年消费 > ¥350万",
    "$100k - $500k": "年消费 ¥70万 - ¥350万",
    "< $100k/yr": "年消费 < ¥70万"
  };

  const placeholderZh = {
    "Search...": "搜索…",
    "Search customer...": "搜索客户…",
    "Search customer, phone...": "搜索客户或电话…",
    "Search employees...": "搜索人员…",
    "Search by name or ID...": "按姓名或编号搜索…",
    "Search branches...": "搜索机构…",
    "Search settings...": "搜索配置…",
    "Search orders...": "搜索订单…",
    "e.g. Jane Doe": "例如：张丽",
    "Optional": "选填",
    "Brief context about the customer...": "填写客户需求或背景…",
    "Enter your credentials": "请输入用户名或手机号",
    "e.g. TRC-99201": "例如：TRC-99201",
    "e.g., Territory realignment...": "例如：区域调整…",
    "Add new channel...": "添加新渠道…",
    "e.g. Art Deco": "例如：奶油风"
  };

  function localizeInterface() {
    document.documentElement.lang = "zh-CN";
    document.title = (zh[document.title] || document.title).replaceAll("Faloco", BRAND);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      if (!element || ["SCRIPT", "STYLE"].includes(element.tagName) || element.closest(".material-symbols-outlined")) continue;
      const original = node.nodeValue;
      const value = original.trim();
      if (!value) continue;
      let translated = (zh[value] || value)
        .replaceAll("Faloco", BRAND)
        .replaceAll("faloco.com", "frroco.com")
        .replaceAll("$", "¥");
      if (value.startsWith("Client: ")) {
        const client = value.slice("Client: ".length);
        translated = `客户：${zh[client] || client}`;
      }
      if (translated !== value) node.nodeValue = original.replace(value, translated);
    }
    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((input) => {
      input.placeholder = placeholderZh[input.placeholder] || input.placeholder;
    });
    document.querySelectorAll('[aria-label="Close"]').forEach((item) => item.setAttribute("aria-label", "关闭"));
  }

  function routeForAnchor(anchor) {
    const label = textOf(anchor).toLowerCase();
    const icon = textOf(anchor.querySelector(".material-symbols-outlined"));
    if (label.includes("logout") || icon === "logout") return routes.login;
    if (label.includes("profile") || icon === "account_circle") return currentSession?.role === "ADMIN" ? routes.users : routes.dashboard;
    if (label.includes("dashboard") || icon === "dashboard") return routes.dashboard;
    if (label.includes("customer") || icon === "group") return routes.customers;
    if (label.includes("task") || icon === "assignment_turned_in") return routes.tasks;
    if (label.includes("activity") || icon === "trending_up") return routes.activity;
    if (label.includes("order") || icon === "shopping_cart") return routes.orders;
    if (label.includes("setting") || icon === "settings") return routes.settings;
    return null;
  }

  function setupNavigation() {
    document.querySelectorAll('a[href="#"]').forEach((anchor) => {
      const label = textOf(anchor);
      const icon = textOf(anchor.querySelector(".material-symbols-outlined"));
      if (currentSession?.role !== "ADMIN" && (icon === "account_circle" || label.toLowerCase().includes("profile"))) {
        anchor.remove();
        return;
      }
      if (label === "View All Branches" || label === "查看全部机构") {
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          document.querySelectorAll(".farock-hidden").forEach((item) => item.classList.remove("farock-hidden"));
          toast("已显示全部机构。");
        });
        return;
      }
      if (label === "Main Office" || label === "East Branch") {
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          localStorage.setItem("farock-branch", label);
          anchor.parentElement?.querySelectorAll("a").forEach((item) => item.classList.remove("text-primary", "font-bold", "border-b-2", "border-primary"));
          anchor.classList.add("text-primary", "font-bold", "border-b-2", "border-primary");
          toast(`已切换至${zh[label] || label}`);
        });
        return;
      }
      const target = routeForAnchor(anchor);
      if (target) anchor.href = target;
    });

    if (page !== routes.login && !document.querySelector("farock-sidebar") && !document.querySelector("nav.md\\:hidden")) {
      const dock = document.createElement("nav");
      dock.className = "farock-mobile-dock";
      dock.innerHTML = [
        ["dashboard", routes.dashboard],
        ["group", routes.customers],
        ["add", routes.customerCreate],
        ["assignment_turned_in", routes.tasks],
        ["settings", routes.settings]
      ].map(([icon, target]) => `<button type="button" data-route="${target}"><span class="material-symbols-outlined">${icon}</span></button>`).join("");
      dock.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => go(button.dataset.route)));
      document.body.append(dock);
    }
  }

  function setupLogin() {
    if (page !== routes.login) return;
    const form = document.querySelector("form");
    const password = document.querySelector('#password');
    const visibility = password?.parentElement?.querySelector("button");
    visibility?.addEventListener("click", () => {
      const reveal = password.type === "password";
      password.type = reveal ? "text" : "password";
      visibility.querySelector("span").textContent = reveal ? "visibility" : "visibility_off";
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.querySelector('#email')?.value.trim();
      if (!email || !password?.value) {
        toast("请输入邮箱和密码。", "error");
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      const originalContent = submit.innerHTML;
      submit.disabled = true;
      submit.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> 正在登录';
      try {
        const payload = await window.FarockAPI.post("/auth/login", { email, password: password.value });
        window.FarockAPI.setToken(payload.data.token);
        localStorage.setItem("farock-session", JSON.stringify(payload.data.user));
        sessionStorage.setItem("farock-welcome-pending", "1");
        go(routes.dashboard);
      } catch (error) {
        toast(error?.message || "登录失败，请稍后重试。", "error");
        submit.disabled = false;
        submit.innerHTML = originalContent;
      }
    });
  }

  function setupGlobalSearch() {
    const search = document.querySelector("[data-global-search]") || Array.from(document.querySelectorAll('input[type="text"], input[type="search"]'))
      .find((input) => /search/i.test(input.placeholder || ""));
    if (!search) return;

    if (page === routes.customers) {
      const grid = document.querySelector("[data-customer-grid]");
      if (!grid) return;
      search.addEventListener("input", () => {
        grid._farockCustomerQuery = search.value.trim().toLowerCase();
        grid._farockRender?.();
      });
      return;
    }

    let items = Array.from(document.querySelectorAll("tbody tr"));
    if (page === routes.organizations && !items.length) {
      items = Array.from(document.querySelectorAll("main h3")).map((heading) => heading.closest(".bg-surface-white")).filter(Boolean);
    }
    if (!items.length) return;

    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      items.forEach((item) => {
        const show = !query || textOf(item).toLowerCase().includes(query);
        item.classList.toggle("farock-hidden", !show);
        if (show) visible++;
      });
      let empty = document.querySelector("[data-search-empty]");
      if (!visible && !empty) {
        empty = document.createElement("div");
        empty.dataset.searchEmpty = "true";
        empty.className = "farock-empty";
        empty.textContent = "没有匹配记录，请清空搜索或调整筛选条件。";
        items[0]?.parentElement?.append(empty);
      }
      empty?.classList.toggle("farock-hidden", visible > 0);
    });
  }

  function setupCustomerCards() {
    if (page !== routes.customers) return;
    const grid = document.querySelector("[data-customer-grid]");
    if (!grid) return;

    const stored = readStore("farock-customers");
    stored.slice().reverse().forEach((customer) => {
      const rawMode = String(customer.operationMode || "").toUpperCase();
      const mode = rawMode === "DEALER" || rawMode.includes("DEALER") || rawMode.includes("经销") ? "DEALER" : "DIRECT";
      const province = customer.regionProvince || customer.province || "";
      const city = customer.regionCity || customer.city || "";
      const dealerGroup = customer.dealerGroupId || customer.dealerGroup || customer.dealerName || "";
      const tier = String(customer.tier || "B").charAt(0).toUpperCase();
      const card = document.createElement("div");
      card.className = "bg-surface-white rounded-3xl p-6 shadow-sm border border-outline-variant/30 hover:shadow-lg transition-shadow duration-300 flex flex-col group";
      card.dataset.operationMode = mode;
      card.dataset.province = province;
      card.dataset.city = city;
      card.dataset.store = customer.storeId || "";
      card.dataset.storeLabel = customer.storeName || "";
      card.dataset.dealerGroup = dealerGroup;
      card.dataset.dealerGroupLabel = dealerGroup;
      card.dataset.tier = tier;
      card.dataset.createdAt = customer.createdAt || "";
      card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
          <div class="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors"><span class="material-symbols-outlined">home_work</span></div>
          <div class="flex flex-wrap justify-end gap-2">
            <span class="bg-secondary-fixed text-on-secondary-fixed px-2.5 py-1 rounded-md font-label-md text-label-md font-bold">${escapeHtml(tier)}</span>
            <span class="customer-mode-badge ${mode === "DEALER" ? "customer-mode-dealer" : "customer-mode-direct"}"><span class="material-symbols-outlined">${mode === "DEALER" ? "storefront" : "business"}</span>${mode === "DEALER" ? "代理商" : "直营"}</span>
          </div>
        </div>
        <h3 class="font-headline-md text-headline-md text-primary mb-1">${escapeHtml(customer.name)}</h3>
        <p class="font-body-md text-body-md text-on-surface-variant mb-6 line-clamp-2">${escapeHtml(customer.persona || customer.notes || "新建客户画像")}</p>
        <div class="space-y-3 mt-auto">
          <div class="flex items-center gap-2 text-on-surface-variant"><span class="material-symbols-outlined text-[18px]">location_on</span><span class="font-body-md text-body-md">${escapeHtml([province, city, customer.district || customer.community].filter(Boolean).join(" / ") || "位置待完善")}</span></div>
          <div class="flex justify-between items-center pt-4 border-t border-outline-variant/20"><span class="font-label-md text-label-md text-on-surface-variant">${escapeHtml(dealerGroup || customer.storeName || customer.organization || "分组待完善")}</span><span class="font-label-md text-label-md text-primary">新建</span></div>
        </div>`;
      grid.prepend(card);
    });

    Array.from(grid.children).forEach((card) => {
      card.dataset.farockClickable = "true";
      card.tabIndex = 0;
      const open = () => go(routes.customerDetail);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") open();
      });
    });
  }

  function setupCustomerFilters() {
    if (page !== routes.customers) return;
    const grid = document.querySelector("[data-customer-grid]");
    if (!grid) return;
    const controls = Array.from(document.querySelectorAll("[data-customer-filter]"));
    const empty = document.createElement("div");
    empty.className = "farock-empty farock-hidden";
    empty.textContent = "没有符合当前筛选条件的客户。";
    empty.setAttribute("data-customer-empty", "true");
    grid.after(empty);

    const getCards = () => Array.from(grid.children).filter((card) => card.dataset.operationMode);
    const valueOf = (card, key) => String(card.dataset[key] || "").trim();
    const selected = (name) => document.querySelector(`[data-customer-filter="${name}"]`)?.value || "";
    const setOptions = (name, values, label) => {
      const select = document.querySelector(`[data-customer-filter="${name}"]`);
      if (!select) return;
      const current = select.value;
      const options = values.map((value) => typeof value === "string" ? { value, label: value } : value);
      select.innerHTML = `<option value="">${label}</option>${options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}`;
      if (options.some((option) => option.value === current)) select.value = current;
    };
    const unique = (items) => [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const refreshOptions = () => {
      const cards = getCards();
      const mode = selected("mode");
      setOptions("province", unique(cards.filter((card) => !mode || valueOf(card, "operationMode") === mode).map((card) => valueOf(card, "province"))), "全部省份");
      const province = selected("province");
      setOptions("city", unique(cards.filter((card) => (!mode || valueOf(card, "operationMode") === mode) && (!province || valueOf(card, "province") === province)).map((card) => valueOf(card, "city"))), "全部城市");
      const city = selected("city");
      const stores = [...new Map(cards.filter((card) => (!mode || valueOf(card, "operationMode") === mode) && (!province || valueOf(card, "province") === province) && (!city || valueOf(card, "city") === city))
        .map((card) => [valueOf(card, "store"), { value: valueOf(card, "store"), label: valueOf(card, "storeLabel") || valueOf(card, "store") }])
        .filter(([value]) => value)).values()];
      setOptions("store", stores, "全部门店");
      const dealerGroups = [...new Map(cards.filter((card) => (!mode || valueOf(card, "operationMode") === mode) && (!province || valueOf(card, "province") === province))
        .map((card) => [valueOf(card, "dealerGroup"), { value: valueOf(card, "dealerGroup"), label: valueOf(card, "dealerGroupLabel") || valueOf(card, "dealerGroup") }])
        .filter(([value]) => value)).values()];
      setOptions("dealer-group", dealerGroups, "全部代理商分组");
    };
    const render = () => {
      const mode = selected("mode");
      const province = selected("province");
      const city = selected("city");
      const store = selected("store");
      const dealerGroup = selected("dealer-group");
      const tier = selected("tier");
      const query = grid._farockCustomerQuery || "";
      const sort = selected("sort");
      const cards = getCards().sort((a, b) => {
        if (sort === "name") return textOf(a.querySelector("h3")).localeCompare(textOf(b.querySelector("h3")));
        if (sort === "tier") return valueOf(a, "tier").localeCompare(valueOf(b, "tier"));
        return String(b.dataset.createdAt || "").localeCompare(String(a.dataset.createdAt || ""));
      });
      cards.forEach((card) => grid.append(card));
      let visible = 0;
      cards.forEach((card) => {
        const show = (!mode || valueOf(card, "operationMode") === mode)
          && (!province || valueOf(card, "province") === province)
          && (!city || valueOf(card, "city") === city)
          && (!store || valueOf(card, "store") === store)
          && (!dealerGroup || valueOf(card, "dealerGroup") === dealerGroup)
          && (!tier || valueOf(card, "tier") === tier)
          && (!query || textOf(card).toLowerCase().includes(query));
        card.classList.toggle("farock-hidden", !show);
        if (show) visible += 1;
      });
      empty.classList.toggle("farock-hidden", visible > 0);
      const heading = Array.from(document.querySelectorAll("h2")).find((item) => textOf(item).includes("Active Portfolio"));
      const count = heading?.parentElement?.querySelector("span");
      if (count) count.textContent = `${visible} 位客户`;
    };
    grid._farockRender = render;
    grid._farockRefreshOptions = refreshOptions;
    controls.forEach((control) => control.addEventListener("change", () => {
      if (["mode", "province", "city"].includes(control.dataset.customerFilter)) refreshOptions();
      render();
    }));
    document.querySelector("[data-customer-filter-clear]")?.addEventListener("click", () => {
      controls.forEach((control) => { if (control.dataset.customerFilter !== "sort") control.value = ""; });
      grid._farockCustomerQuery = "";
      const search = document.querySelector("[data-global-search]");
      if (search) search.value = "";
      refreshOptions();
      render();
    });
    refreshOptions();
    render();
  }

  function setupCreateCustomer() {
    if (page !== routes.customerCreate || window.FAROCK_CUSTOMER_CREATE_API) return;
    const title = Array.from(document.querySelectorAll("h3")).find((item) => textOf(item) === "Basic Information");
    const card = title?.parentElement;
    const actions = card?.nextElementSibling;
    const steps = Array.from(document.querySelectorAll(".flex.justify-between.relative.mb-section-gap > div"));
    if (!card || !actions) return;
    const state = { step: 1 };
    const premium = "w-full input-premium rounded-lg py-3 px-4 font-body-md text-body-md text-primary";
    const field = (label, control, wide = false) => `<div class="${wide ? "md:col-span-2" : ""}"><label class="block font-label-md text-label-md text-on-surface mb-2">${label}</label>${control}</div>`;

    function updateStepper(step) {
      steps.forEach((item, index) => {
        const circle = item.querySelector("div");
        const label = item.querySelector("span");
        const active = index + 1 <= step;
        circle?.classList.toggle("bg-primary", active);
        circle?.classList.toggle("text-on-primary", active);
        circle?.classList.toggle("bg-surface-variant", !active);
        label?.classList.toggle("text-primary", active);
        label?.classList.toggle("text-on-surface-variant", !active);
      });
    }

    function renderStep2() {
      state.step = 2;
      updateStepper(2);
      card.innerHTML = `
        <h3 class="font-headline-md text-headline-md text-primary border-b border-[#E5E5E2] pb-4 mb-6">住房信息</h3>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-x-gutter-desktop gap-y-6">
          ${field("省份 *", `<input name="regionProvince" required class="${premium}" placeholder="例如：浙江省"/>`)}
          ${field("城市 *", `<input name="regionCity" required class="${premium}" placeholder="例如：杭州市"/>`)}
          ${field("区/县", `<input name="district" class="${premium}" placeholder="区或县"/>`)}
          ${field("小区名称", `<input name="community" class="${premium}" placeholder="请输入小区名称"/>`)}
          ${field("户型", `<select name="houseType" class="${premium}"><option>大平层</option><option>别墅</option><option>普通住宅</option><option>其他</option></select>`)}
          ${field("风格偏好", `<select name="style" class="${premium}"><option>极简</option><option>意式轻奢</option><option>奶油风</option><option>现代</option><option>其他</option></select>`)}
        </form>`;
      actions.innerHTML = '<button class="bg-transparent border-[1.5px] border-primary text-primary font-label-md text-label-md py-3 px-8 rounded-lg" data-back>上一步</button><button class="bg-primary text-on-primary font-label-md text-label-md py-3 px-8 rounded-lg shadow-sm" data-next>继续下一步</button>';
      actions.querySelector("[data-back]").addEventListener("click", () => location.reload());
      actions.querySelector("[data-next]").addEventListener("click", () => {
        const form = card.querySelector("form");
        if (!form.reportValidity()) return;
        Object.assign(state, Object.fromEntries(new FormData(form)));
        renderStep3();
      });
    }

    function renderStep3() {
      state.step = 3;
      updateStepper(3);
      card.innerHTML = `
        <h3 class="font-headline-md text-headline-md text-primary border-b border-[#E5E5E2] pb-4 mb-6">渠道、归属与客户画像</h3>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-x-gutter-desktop gap-y-6">
          ${field("渠道来源 *", `<select name="channel" required class="${premium}"><option>小红书</option><option>抖音</option><option>大众点评</option><option>异业合作</option><option>线下路过</option><option>老客转介绍</option></select>`)}
          ${field("运营模式 *", `<select name="operationMode" required class="${premium}"><option value="DIRECT">直营模式 / DIRECT</option><option value="DEALER">代理商模式 / DEALER</option></select>`)}
          ${field("归属机构 *", `<select name="organization" required class="${premium}"><option>总部门店</option><option>城东门店</option><option>杭州经销商</option></select>`)}
          ${field("门店 / 代理商门店", `<input name="storeName" class="${premium}" placeholder="直营店或代理商门店名称"/>`)}
          ${field("代理商分组 ID", `<input name="dealerGroupId" class="${premium}" placeholder="DEALER-HZ-XC"/>`)}
          ${field("代理商名称", `<input name="dealerName" class="${premium}" placeholder="代理商主体名称"/>`)}
          ${field("客户分级", `<select name="tier" class="${premium}"><option>S</option><option>A</option><option selected>B</option><option>C</option></select>`)}
          ${field("专属导购", `<select name="salesRep" class="${premium}"><option>张伟</option><option>李娜</option><option>未分配</option></select>`)}
          ${field("专属设计师", `<select name="designer" class="${premium}"><option>李雯</option><option>陈磊</option><option>未分配</option></select>`)}
          ${field("订购品类", `<select name="productCategory" class="${premium}"><option>全屋定制</option><option>衣柜</option><option>隐形门</option><option>橱柜</option><option>软装</option></select>`)}
          ${field("板材/材质系列", `<input name="material" class="${premium}" placeholder="请输入板材或材质系列"/>`)}
          ${field("订单金额", `<input name="orderAmount" type="number" min="0" step="0.01" class="${premium}" placeholder="0.00"/>`)}
          ${field("已付定金", `<input name="depositAmount" type="number" min="0" step="0.01" class="${premium}" placeholder="0.00"/>`)}
          ${field(`为什么选择 ${BRAND}`, `<select name="whyFarock" class="${premium}"><option>设计风格</option><option>ENF级环保材质</option><option>口碑介绍</option><option>设计师方案</option><option>性价比</option></select>`)}
          ${field("家庭结构", `<input name="family" class="${premium}" placeholder="例如：三口之家"/>`)}
          ${field("职业标签", `<input name="occupation" class="${premium}" placeholder="例如：金融、企业主"/>`)}
          ${field("客户画像综合描述", `<textarea name="persona" rows="4" class="${premium}" placeholder="填写客户需求、偏好和决策因素"></textarea>`, true)}
        </form>`;
      actions.innerHTML = '<button class="bg-transparent border-[1.5px] border-primary text-primary font-label-md text-label-md py-3 px-8 rounded-lg" data-back>上一步</button><button class="bg-primary text-on-primary font-label-md text-label-md py-3 px-8 rounded-lg shadow-sm" data-save>保存客户</button>';
      actions.querySelector("[data-back]").addEventListener("click", renderStep2);
      actions.querySelector("[data-save]").addEventListener("click", () => {
        const form = card.querySelector("form");
        if (!form.reportValidity()) return;
        Object.assign(state, Object.fromEntries(new FormData(form)));
        if (state.operationMode === "DEALER" && (!state.dealerGroupId || !state.dealerName)) {
          toast("代理商客户必须填写代理商分组 ID 和代理商名称。", "error");
          return;
        }
        if (state.operationMode === "DIRECT" && !state.storeName) {
          toast("直营客户必须填写直营门店名称。", "error");
          return;
        }
        const order = Number(state.orderAmount || 0);
        const deposit = Number(state.depositAmount || 0);
        if (deposit > order && order > 0) {
          toast("已付定金不能超过订单金额。", "error");
          return;
        }
        const customers = readStore("farock-customers");
        customers.push({ ...state, id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString() });
        writeStore("farock-customers", customers);
        toast("客户档案已创建。");
        setTimeout(() => go(routes.customers), 500);
      });
    }

    const next = Array.from(actions.querySelectorAll("button")).find((button) => textOf(button).includes("Continue"));
    const cancel = Array.from(actions.querySelectorAll("button")).find((button) => textOf(button) === "Cancel");
    cancel?.addEventListener("click", () => go(routes.customers));
    next?.addEventListener("click", (event) => {
      event.preventDefault();
      const form = card.querySelector("form");
      const inputs = form.querySelectorAll("input, select, textarea");
      const name = inputs[0]?.value.trim();
      const phone = Array.from(inputs).find((input) => input.type === "tel")?.value.trim();
      if (!name || !phone) {
        toast("客户姓名和联系电话为必填项。", "error");
        return;
      }
      if (readStore("farock-customers").some((customer) => customer.phone === phone)) {
        toast("该手机号已存在客户档案。", "error");
        return;
      }
      Object.assign(state, {
        name,
        ageGroup: inputs[1]?.value,
        phone,
        wechat: inputs[3]?.value.trim(),
        notes: inputs[4]?.value.trim()
      });
      renderStep2();
    });
  }

  function setupPayment() {
    if (page !== routes.payment || window.FAROCK_PAYMENT_API) return;
    const form = document.querySelector("main form");
    if (!form) return;
    const draft = Array.from(form.querySelectorAll("button")).find((button) => textOf(button).includes("Save as Draft"));
    draft?.addEventListener("click", () => toast("收款草稿已保存到本地。"));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const type = form.querySelector("select")?.value;
      const amountInput = Array.from(form.querySelectorAll("input")).find((input) => input.placeholder === "0.00");
      const date = form.querySelector('input[type="date"]')?.value;
      const method = form.querySelector('input[name="payment_method"]:checked')?.value;
      const amount = Number((amountInput?.value || "").replaceAll(",", ""));
      if (!type || !amount || amount <= 0 || !date || !method) {
        toast("请完整填写收款类型、金额、日期和方式。", "error");
        return;
      }
      if (amount > 25000) {
        toast("收款金额不能超过待收余额 ¥25,000。", "error");
        return;
      }
      const payments = readStore("farock-payments");
      payments.push({ type, amount, date, method, createdAt: new Date().toISOString() });
      writeStore("farock-payments", payments);
      toast("收款登记成功。");
      setTimeout(() => go(routes.orders), 500);
    });
  }

  function downloadTable() {
    const table = document.querySelector("table");
    if (!table) {
      toast("当前页面没有可导出的表格数据。", "error");
      return;
    }
    const csv = Array.from(table.querySelectorAll("tr")).map((row) => Array.from(row.children)
      .map((cell) => `"${textOf(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${page.replace(".html", "")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("CSV 文件已生成。");
  }

  function setupOrderTabs() {
    if (page !== routes.orders || window.FAROCK_ORDERS_API) return;
    const rows = Array.from(document.querySelectorAll("tbody tr"));
    const matches = (row, status) => {
      const content = textOf(row);
      if (status === "all") return true;
      if (status === "pending") return /Pending|待收/.test(content);
      if (status === "confirmed") return /Confirmed|已确认/.test(content);
      if (status === "completed") return /Completed|已完成/.test(content);
      return /Draft|草稿/.test(content);
    };
    const apply = (status) => rows.forEach((row) => row.classList.toggle("farock-hidden", !matches(row, status)));

    document.querySelectorAll("[data-order-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const status = button.dataset.orderTab;
        apply(status);
        button.parentElement.querySelectorAll("[data-order-tab]").forEach((item) => item.classList.remove("bg-surface-container-low", "text-primary", "border", "border-outline-variant/30"));
        button.classList.add("bg-surface-container-low", "text-primary", "border", "border-outline-variant/30");
      });
    });

    const toggle = document.querySelector("#order-filter-toggle");
    const panel = document.querySelector("#order-filter-panel");
    const select = document.querySelector("#order-status-filter");
    toggle?.addEventListener("click", () => {
      const isOpen = panel.classList.toggle("hidden");
      toggle.setAttribute("aria-expanded", String(!isOpen));
    });
    select?.addEventListener("change", () => {
      apply(select.value);
      panel.classList.add("hidden");
      toggle?.setAttribute("aria-expanded", "false");
    });
  }

  function setupMasterData() {
    if (page !== routes.settings) return;
    document.querySelectorAll("button .material-symbols-outlined").forEach((icon) => {
      if (textOf(icon) === "close") {
        icon.parentElement.addEventListener("click", () => {
          icon.parentElement.parentElement.remove();
          toast("基础数据项已停用。");
        });
      }
    });
    document.querySelectorAll('input[placeholder*="Add new"], input[placeholder*="Art Deco"]').forEach((input) => {
      const button = input.parentElement.querySelector("button");
      button?.addEventListener("click", () => {
        if (!input.value.trim()) {
          toast("请先输入配置项内容。", "error");
          return;
        }
        toast(`已添加配置项：${input.value.trim()}`);
        input.value = "";
      });
    });
  }

  function setupFollowUpTasks() {
    if (page !== routes.tasks || window.FAROCK_TASKS_API) return;

    document.querySelectorAll("button").forEach((button) => {
      const label = textOf(button);
      if (label === "Log Activity" || label === "Log Follow-up") {
        button.addEventListener("click", () => openModal("记录跟进", [
          { name: "method", label: "跟进方式", options: ["电话", "微信", "到店", "上门"] },
          { name: "content", label: "跟进内容", type: "textarea", required: true },
          { name: "nextDate", label: "下次跟进日期", type: "date" }
        ], () => toast("跟进记录已保存。"), "保存记录"));
      } else if (label === "Reschedule") {
        button.addEventListener("click", () => openModal("重新安排跟进", [
          { name: "date", label: "新的跟进日期", type: "date", required: true }
        ], (data) => toast(`已重新安排至 ${data.date}。`), "保存日期"));
      }
    });
  }

  function setupOrganizations() {
    if (page !== routes.organizations) return;

    const cards = Array.from(document.querySelectorAll("main h3, main h4"))
      .map((heading) => heading.closest(".bg-surface-white"))
      .filter((card, index, all) => card && /\b(Direct|Dealer)\b|直营|代理商|经销商/i.test(textOf(card)) && all.indexOf(card) === index);
    const modeOf = (card) => /\bDealer\b|代理商|经销商/i.test(textOf(card)) ? "代理商" : "直营";

    document.querySelectorAll("button").forEach((button) => {
      const label = textOf(button);
      if (label === "View Details") {
        button.addEventListener("click", () => {
          const card = button.closest(".bg-surface-white");
          const locationRow = Array.from(card.querySelectorAll(".material-symbols-outlined"))
            .find((icon) => textOf(icon) === "location_on")?.parentElement;
          const manager = card.querySelector(".font-medium, .text-sm.text-on-surface");
          const id = Array.from(card.querySelectorAll("span")).find((item) => textOf(item).startsWith("ID:"));
          openModal(`${textOf(card.querySelector("h3, h4"))}机构详情`, [
            { name: "mode", label: "经营模式", value: modeOf(card), readonly: true },
            { name: "location", label: "所在地区", value: textOf(locationRow).replace("location_on", "").trim() || "未填写", readonly: true },
            { name: "manager", label: "负责人", value: textOf(manager) || "未填写", readonly: true },
            { name: "id", label: "机构编号", value: textOf(id) || "BR-001", readonly: true }
          ], () => {}, "关闭");
        });
      } else if (label === "Filter") {
        button.addEventListener("click", () => openModal("筛选机构", [
          { name: "mode", label: "经营模式", options: ["全部机构", "直营", "代理商"] }
        ], (data) => {
          let visible = 0;
          cards.forEach((card) => {
            const show = data.mode === "全部机构" || modeOf(card) === data.mode;
            card.classList.toggle("farock-hidden", !show);
            if (show) visible++;
          });
          toast(`已显示${data.mode}：${visible}家机构。`);
        }, "应用筛选"));
      } else if (label === "View All Branches") {
        button.addEventListener("click", () => {
          cards.forEach((card) => card.classList.remove("farock-hidden"));
          toast(`已显示全部 ${cards.length} 家机构。`);
        });
      }
    });
  }

  function setupGenericActions() {
    document.querySelectorAll("button").forEach((button) => {
      const label = textOf(button);
      const icon = textOf(button.querySelector(".material-symbols-outlined"));
      if ((label.includes("Add Customer") || label === "New Project") && button.type !== "submit") {
        if (button.closest("header")) button.dataset.mobileHide = "true";
        button.addEventListener("click", () => go(routes.customerCreate));
      } else if (label.includes("New Follow-up") || label.includes("Add Task")) {
        if (button.closest("header")) button.dataset.mobileHide = "true";
        button.addEventListener("click", () => go(routes.tasks));
      } else if ((label.includes("Register Payment") || label.includes("Record Payment")) && button.type !== "submit") {
        button.addEventListener("click", () => go(routes.payment));
      } else if (label.includes("Handover") || label.includes("Transfer Customer")) {
        button.addEventListener("click", () => go(routes.handover));
      } else if (label.includes("Add Branch") || label.includes("New Branch") || label.includes("新增机构")) {
        button.addEventListener("click", () => openModal("新建机构", [
          { name: "name", label: "机构名称", required: true },
          { name: "mode", label: "运营模式", options: ["直营模式", "经销商地区模式"] },
          { name: "city", label: "所在城市", required: true }
        ], (data) => toast(`${data.name}已创建。`), "创建机构"));
      } else if (label.includes("Add User") || label.includes("Invite User") || label.includes("邀请用户")) {
        button.addEventListener("click", () => openModal("添加用户", [
          { name: "name", label: "姓名", required: true },
          { name: "phone", label: "手机号", type: "tel", required: true },
          { name: "role", label: "角色", options: ["管理员", "店长", "导购", "设计师", "财务"] }
        ], (data) => toast(`${data.name}已添加。`), "添加用户"));
      } else if (icon === "more_vert" && button.closest("tbody")) {
        button.addEventListener("click", () => openModal("订单操作", [
          { name: "action", label: "选择操作", options: ["查看订单摘要", "登记收款"] }
        ], ({ action }) => {
          if (action === "登记收款") go(routes.payment);
          else toast("订单摘要已展开，可在当前列表查看订单状态与金额。");
        }, "确认"));
      } else if (label === "Export" || icon === "download") {
        button.addEventListener("click", downloadTable);
      } else if (icon === "notifications") {
        button.addEventListener("click", () => toast("您有 3 条待处理通知。"));
      } else if (icon === "apps") {
        button.addEventListener("click", () => openModal("快速访问", [
          { name: "module", label: "模块", options: ["客户管理", "订单与回款", "跟进任务", "数据分析", "系统配置"] }
        ], (data) => {
          const target = { "客户管理": routes.customers, "订单与回款": routes.orders, "跟进任务": routes.tasks, "数据分析": routes.activity, "系统配置": routes.settings }[data.module];
          go(target);
        }, "打开"));
      }
    });

    if (page === routes.handover) {
      const confirm = Array.from(document.querySelectorAll("button")).find((button) => /confirm|handover|transfer/i.test(textOf(button)) && !/filter/i.test(textOf(button)));
      confirm?.addEventListener("click", () => toast("客户交接已完成，操作已记入审计日志。"));
    }
  }

  function setupButtonGroups() {
    document.querySelectorAll("button").forEach((button) => {
      const label = textOf(button);
      if (["Weekly", "Monthly", "Quarterly", "Yearly"].includes(label)) {
        button.addEventListener("click", () => {
          button.parentElement.querySelectorAll("button").forEach((item) => item.classList.remove("bg-primary", "text-on-primary"));
          button.classList.add("bg-primary", "text-on-primary");
          toast(`统计周期已设为${{ Weekly: "周", Monthly: "月", Quarterly: "季度", Yearly: "年" }[label]}。`);
        });
      }
    });
  }

  setupNavigation();
  setupLogin();
  setupCustomerCards();
  setupCustomerFilters();
  setupGlobalSearch();
  setupCreateCustomer();
  setupPayment();
  setupOrderTabs();
  setupMasterData();
  setupFollowUpTasks();
  setupOrganizations();
  setupGenericActions();
  setupButtonGroups();
  localizeInterface();
  document.addEventListener("DOMContentLoaded", async () => {
    await window.FarockAPI?.whenIdle?.();
    clearTimeout(revealFallback);
    revealUi();
  }, { once: true });
})();
