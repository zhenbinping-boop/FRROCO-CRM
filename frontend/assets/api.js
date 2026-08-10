(() => {
  "use strict";

  const defaultBaseUrl = "http://localhost:3000/api/v1";

  class ApiError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  }

  async function request(path, options = {}) {
    const baseUrl = String(window.FAROCK_API_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    const token = localStorage.getItem("farock-token");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(`${baseUrl}/${String(path).replace(/^\//, "")}`, { ...options, headers, body });
    } catch (error) {
      throw new ApiError("无法连接后端服务，请确认服务已启动", 0, error);
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(payload?.error?.message || `请求失败（HTTP ${response.status}）`, response.status, payload?.error?.details);
    }
    return payload;
  }

  window.FarockAPI = {
    ApiError,
    request,
    get: (path) => request(path, { method: "GET" }),
    post: (path, body) => request(path, { method: "POST", body }),
    patch: (path, body) => request(path, { method: "PATCH", body }),
    setToken(token) { localStorage.setItem("farock-token", token); },
    clearToken() { localStorage.removeItem("farock-token"); },
  };
})();
