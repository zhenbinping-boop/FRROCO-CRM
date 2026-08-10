(() => {
  "use strict";
  window.FAROCK_PAYMENT_API = true;
  const api = window.FarockAPI;
  const form = document.querySelector("#payment-form");
  const orderId = new URLSearchParams(location.search).get("orderId");
  if (!api || !form) return;

  const fields = {
    customer: document.querySelector("#payment-order-customer"),
    project: document.querySelector("#payment-order-project"),
    total: document.querySelector("#payment-order-total"),
    paid: document.querySelector("#payment-order-paid"),
    balance: document.querySelector("#payment-order-balance"),
  };
  const submit = form.querySelector('button[type="submit"]');
  const amountInput = form.elements.amount;
  const paidAtInput = form.elements.paidAt;
  const money = (value) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function showMessage(message, error = false) {
    let notice = document.querySelector("#payment-form-message");
    if (!notice) {
      notice = document.createElement("p");
      notice.id = "payment-form-message";
      notice.setAttribute("role", "status");
      form.prepend(notice);
    }
    notice.className = `rounded-lg px-4 py-3 text-body-md ${error ? "bg-red-50 text-error-red" : "bg-green-50 text-green-800"}`;
    notice.textContent = message;
  }

  async function loadOrder() {
    if (!orderId) {
      showMessage("缺少订单编号，请从订单列表进入收款登记。", true);
      if (submit) submit.disabled = true;
      return;
    }
    try {
      const { data: order } = await api.get(`/orders/${encodeURIComponent(orderId)}`);
      const balance = Math.max(0, Number(order.totalAmount) - Number(order.paidAmount));
      fields.customer.textContent = `${order.customer.name} · ${order.customer.phone}`;
      fields.project.textContent = order.title;
      fields.total.textContent = money(order.totalAmount);
      fields.paid.textContent = money(order.paidAmount);
      fields.balance.textContent = money(balance);
      amountInput.max = balance.toFixed(2);
      if (!paidAtInput.value) paidAtInput.value = new Date().toISOString().slice(0, 10);
      if (balance <= 0 || order.status === "CANCELED") {
        showMessage(balance <= 0 ? "该订单已完成全部回款。" : "已取消订单不能登记回款。", true);
        if (submit) submit.disabled = true;
      }
    } catch (error) {
      showMessage(error.message || "订单加载失败。", true);
      if (submit) submit.disabled = true;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const method = data.get("method");
    if (!method) {
      showMessage("请选择收款方式。", true);
      return;
    }
    if (!form.reportValidity() || !orderId) return;
    if (submit) submit.disabled = true;
    try {
      await api.post(`/orders/${encodeURIComponent(orderId)}/payments`, {
        type: data.get("type"), method, amount: data.get("amount"),
        paidAt: data.get("paidAt"), referenceNumber: data.get("referenceNumber") || undefined,
      });
      showMessage("收款登记成功，正在返回订单列表。");
      setTimeout(() => { location.href = "orders-payments.html"; }, 500);
    } catch (error) {
      showMessage(error.message || "收款登记失败。", true);
      if (submit) submit.disabled = false;
    }
  });

  loadOrder();
})();
