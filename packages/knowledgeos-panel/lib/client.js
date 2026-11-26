window.__ModuleLoader__.load({
	id: "knowledgeos-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.ts
		var index_exports = {};
		__export(index_exports, {
		  PANEL_ID: () => PANEL_ID,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/Panel.tsx
		var import_react = require("react");

		// src/client/status-client.ts
		var STATUS_PATH = "/knowledgeos/status";
		var STATUS_TIMEOUT_MS = 1e4;
		var StatusRequestError = class extends Error {
		  /** Stable reason the panel can branch on. */
		  kind;
		  constructor(kind, message, options) {
		    super(message, options);
		    this.name = "StatusRequestError";
		    this.kind = kind;
		  }
		};
		function isRecord(value) {
		  return typeof value === "object" && value !== null;
		}
		function readString(record, key) {
		  const value = record[key];
		  if (typeof value !== "string" || value.length === 0) {
		    throw new StatusRequestError("shape", `Host \u54CD\u5E94\u7F3A\u5C11\u5B57\u6BB5 ${key}`);
		  }
		  return value;
		}
		function parseStatusPayload(value) {
		  if (!isRecord(value)) throw new StatusRequestError("shape", "Host \u54CD\u5E94\u4E0D\u662F JSON \u5BF9\u8C61");
		  const schemaVersion = value.schema_version;
		  if (schemaVersion !== 1) throw new StatusRequestError("shape", "Host \u54CD\u5E94\u7ED3\u6784\u7248\u672C\u4E0D\u662F 1");
		  const verified = value.upstream_commit_verified;
		  if (verified !== true && verified !== false && verified !== null) {
		    throw new StatusRequestError("shape", "Host \u54CD\u5E94\u7684\u63D0\u4EA4\u6821\u9A8C\u72B6\u6001\u65E0\u6548");
		  }
		  return {
		    schema_version: 1,
		    product: readString(value, "product"),
		    upstream_commit: readString(value, "upstream_commit"),
		    upstream_version: readString(value, "upstream_version"),
		    expected_upstream_commit: readString(value, "expected_upstream_commit"),
		    upstream_commit_verified: verified,
		    host_instance_id: readString(value, "host_instance_id"),
		    started_at: readString(value, "started_at"),
		    checked_at: readString(value, "checked_at"),
		    status: readString(value, "status")
		  };
		}
		async function loadStatus(signal, timeoutMs = STATUS_TIMEOUT_MS) {
		  const controller = new AbortController();
		  const onAbort = () => {
		    controller.abort(signal?.reason);
		  };
		  signal?.addEventListener("abort", onAbort, { once: true });
		  const timer = setTimeout(() => {
		    controller.abort(new Error("timeout"));
		  }, timeoutMs);
		  try {
		    let response;
		    try {
		      response = await fetch(STATUS_PATH, {
		        method: "GET",
		        headers: { accept: "application/json" },
		        cache: "no-store",
		        credentials: "same-origin",
		        signal: controller.signal
		      });
		    } catch (error) {
		      if (signal?.aborted) throw error;
		      const message = error instanceof Error ? error.message : String(error);
		      throw new StatusRequestError("network", `\u65E0\u6CD5\u8FDE\u63A5\u672C\u673A Host \u670D\u52A1\uFF1A${message}`, { cause: error });
		    }
		    if (!response.ok) {
		      throw new StatusRequestError("http", `Host \u670D\u52A1\u8FD4\u56DE HTTP ${response.status}`);
		    }
		    let body;
		    try {
		      body = await response.json();
		    } catch (error) {
		      throw new StatusRequestError("shape", "Host \u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON", { cause: error });
		    }
		    return parseStatusPayload(body);
		  } finally {
		    clearTimeout(timer);
		    signal?.removeEventListener("abort", onAbort);
		  }
		}

		// src/client/Panel.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		var PANEL_STYLE = `
		.kos-panel { box-sizing: border-box; max-width: 880px; margin: 0 auto; padding: 32px 24px 40px; color: #23333A;
		  font-family: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif; }
		.kos-panel *, .kos-panel *::before, .kos-panel *::after { box-sizing: border-box; }
		.kos-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
		.kos-title { margin: 0; font-size: 24px; line-height: 1.35; font-weight: 600; letter-spacing: .01em; }
		.kos-sub { margin: 6px 0 0; color: #66777F; font-size: 14px; line-height: 1.6; }
		.kos-chip { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
		  font-size: 13px; line-height: 1.5; border: 1px solid transparent; white-space: nowrap; }
		.kos-chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
		.kos-chip--ok { color: #2F6E5B; background: #EDF6F1; border-color: #CFE6DA; }
		.kos-chip--loading { color: #3D7E86; background: #EDF5F6; border-color: #CEE2E4; }
		.kos-chip--error { color: #9C4A44; background: #FBEFEE; border-color: #EFD3D0; }
		.kos-banner { margin: 0 0 16px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.65; }
		.kos-banner--warn { color: #6B4E12; background: #FBF6E8; border: 1px solid #EADCB4; }
		.kos-banner--error { color: #873B36; background: #FBEFEE; border: 1px solid #EFD3D0; }
		.kos-banner strong { font-weight: 600; }
		.kos-banner p { margin: 4px 0 0; }
		.kos-card { background: #FFFFFF; border: 1px solid #E2E9EB; border-radius: 12px; padding: 6px 20px; }
		.kos-row { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; padding: 12px 0;
		  border-bottom: 1px solid #EEF2F3; font-size: 14px; line-height: 1.6; }
		.kos-row:last-child { border-bottom: 0; }
		.kos-row dt { margin: 0; color: #66777F; flex: none; }
		.kos-row dd { margin: 0; text-align: right; word-break: break-all; font-variant-numeric: tabular-nums; }
		.kos-mono { font-family: "Cascadia Mono", Consolas, "Courier New", monospace; font-size: 13px; }
		.kos-ok { color: #2F6E5B; font-weight: 600; }
		.kos-bad { color: #9C4A44; font-weight: 600; }
		.kos-unknown { color: #8A6A1F; font-weight: 600; }
		.kos-empty { padding: 28px 0; color: #66777F; font-size: 14px; line-height: 1.7; }
		.kos-skeleton { height: 14px; width: 42%; border-radius: 7px; background: #EEF2F3; margin: 18px 0; }
		.kos-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 20px; }
		.kos-note { margin: 0; color: #66777F; font-size: 12px; line-height: 1.6; }
		.kos-button { appearance: none; border: 1px solid #3D7E86; border-radius: 8px; background: #3D7E86; color: #FFFFFF;
		  padding: 8px 18px; font: inherit; font-size: 14px; line-height: 1.6; cursor: pointer; }
		.kos-button:hover { background: #356F76; border-color: #356F76; }
		.kos-button:focus-visible { outline: 2px solid #3D7E86; outline-offset: 2px; }
		.kos-button:disabled { cursor: progress; opacity: .6; }
		.kos-button--ghost { background: transparent; color: #3D7E86; }
		.kos-button--ghost:hover { background: #EDF5F6; }
		@media (prefers-color-scheme: dark) {
		  .kos-panel { color: #E6EEF1; }
		  .kos-sub, .kos-note, .kos-row dt, .kos-empty { color: #A7B6BD; }
		  .kos-card { background: #202B32; border-color: #2E3D45; }
		  .kos-row { border-bottom-color: #2A3840; }
		  .kos-chip--ok { background: #1D3129; border-color: #2C4A3C; color: #8FC9AF; }
		  .kos-chip--loading { background: #1D2E31; border-color: #2C4448; color: #9CC8CC; }
		  .kos-chip--error { background: #352321; border-color: #4C302D; color: #E0A29C; }
		  .kos-banner--warn { background: #332B1B; border-color: #4E4227; color: #E2C98D; }
		  .kos-banner--error { background: #352321; border-color: #4C302D; color: #E0A29C; }
		}
		`;
		function formatTime(value) {
		  const time = new Date(value);
		  if (Number.isNaN(time.getTime())) return value;
		  return new Intl.DateTimeFormat("zh-CN", {
		    year: "numeric",
		    month: "2-digit",
		    day: "2-digit",
		    hour: "2-digit",
		    minute: "2-digit",
		    second: "2-digit",
		    hour12: false
		  }).format(time);
		}
		function shortCommit(value) {
		  return value === "unknown" ? value : value.slice(0, 12);
		}
		function describeError(error) {
		  if (error instanceof StatusRequestError) return error.message;
		  if (error instanceof Error) return error.message;
		  return String(error);
		}
		function verificationFace(verified) {
		  if (verified === true) return { className: "kos-ok", text: "\u4E0E\u9501\u5B9A\u63D0\u4EA4\u4E00\u81F4" };
		  if (verified === false) return { className: "kos-bad", text: "\u4E0E\u9501\u5B9A\u63D0\u4EA4\u4E0D\u4E00\u81F4" };
		  return { className: "kos-unknown", text: "Host \u672A\u8BB0\u5F55\u6784\u5EFA\u63D0\u4EA4\uFF0C\u65E0\u6CD5\u6838\u9A8C" };
		}
		function KnowledgeOsPanel() {
		  const [state, setState] = (0, import_react.useState)({ phase: "loading" });
		  const requestId = (0, import_react.useRef)(0);
		  const activeController = (0, import_react.useRef)(null);
		  const refresh = (0, import_react.useCallback)(() => {
		    activeController.current?.abort();
		    const controller = new AbortController();
		    activeController.current = controller;
		    const id = ++requestId.current;
		    setState((previous) => previous.phase === "loading" ? previous : { phase: "loading", data: previous.data });
		    void loadStatus(controller.signal).then((data2) => {
		      if (id !== requestId.current) return;
		      setState({ phase: "ready", data: data2 });
		    }).catch((error) => {
		      if (controller.signal.aborted) return;
		      if (id !== requestId.current) return;
		      setState((previous) => ({
		        phase: "error",
		        message: describeError(error),
		        failedAt: (/* @__PURE__ */ new Date()).toISOString(),
		        data: previous.data
		      }));
		    });
		  }, []);
		  (0, import_react.useEffect)(() => {
		    refresh();
		    return () => {
		      activeController.current?.abort();
		    };
		  }, [refresh]);
		  const data = state.data;
		  const phase = state.phase;
		  const chipClass = phase === "ready" ? "kos-chip--ok" : phase === "error" ? "kos-chip--error" : "kos-chip--loading";
		  const chipText = phase === "ready" ? "\u5DF2\u8FDE\u63A5" : phase === "error" ? "\u8FDE\u63A5\u5931\u8D25" : data === void 0 ? "\u8FDE\u63A5\u4E2D" : "\u5237\u65B0\u4E2D";
		  const connectionText = phase === "ready" ? "\u5DF2\u8FDE\u63A5\u672C\u673A Host" : phase === "loading" ? data === void 0 ? "\u6B63\u5728\u8FDE\u63A5\u672C\u673A Host\u2026" : "\u6B63\u5728\u5237\u65B0 \xB7 \u663E\u793A\u4E0A\u6B21\u7ED3\u679C" : data === void 0 ? "\u8FDE\u63A5\u5931\u8D25" : "\u65E7\u6570\u636E\uFF08\u8FDE\u63A5\u5931\u8D25\uFF09";
		  const verified = data === void 0 ? null : data.upstream_commit_verified;
		  const verification = verificationFace(verified);
		  const stale = state.phase === "error" && state.data !== void 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "kos-panel", "data-testid": "knowledgeos-panel", "data-state": phase, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: PANEL_STYLE }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "kos-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { className: "kos-title", id: "kos-title", children: "KnowledgeOS" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "kos-sub", children: "\u672C\u673A DSH \u8FD0\u884C\u72B6\u6001 \xB7 \u53EA\u8BFB\u67E5\u8BE2 \xB7 \u4E0D\u8BFB\u53D6\u4F1A\u8BDD\u4E0E\u8D26\u6237\u6570\u636E" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `kos-chip ${chipClass}`, role: "status", "aria-live": "polite", "data-testid": "kos-status", children: chipText })
		    ] }),
		    phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-banner kos-banner--error", role: "alert", "data-testid": "kos-error", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u65E0\u6CD5\u8BFB\u53D6 Host \u8FD0\u884C\u72B6\u6001\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: state.message }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
		        "\u5931\u8D25\u65F6\u95F4\uFF1A",
		        formatTime(state.failedAt)
		      ] }),
		      stale ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
		        "\u4E0B\u65B9\u4E3A\u4E0A\u6B21\u6210\u529F\u83B7\u53D6\u7684\u6570\u636E\uFF0C",
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u5DF2\u5931\u53BB\u5B9E\u65F6\u6027" }),
		        "\u3002"
		      ] }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "kos-button", onClick: refresh, "data-testid": "kos-error-retry", children: "\u91CD\u8BD5" }) })
		    ] }) : null,
		    stale ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "kos-note", "data-testid": "kos-stale", children: "\u72B6\u6001\uFF1A\u65E7\u6570\u636E \xB7 \u7B49\u5F85\u91CD\u65B0\u8FDE\u63A5" }) : null,
		    verified === false ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-banner kos-banner--warn", role: "status", "data-testid": "kos-mismatch", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u6784\u5EFA\u4FE1\u606F\u4E0D\u5339\u914D\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
		        "\u8FD0\u884C\u4E2D\u7684 Host \u63D0\u4EA4 ",
		        shortCommit(data?.upstream_commit ?? ""),
		        " \u4E0E\u672C\u9879\u76EE\u9501\u5B9A\u7684\u63D0\u4EA4 ",
		        shortCommit(data?.expected_upstream_commit ?? ""),
		        " \u4E0D\u4E00\u81F4\uFF0C\u672C\u6B21\u8FD0\u884C\u4E0D\u80FD\u4F5C\u4E3A\u56FA\u5B9A\u7248\u672C\u7684\u9A8C\u6536\u8BC1\u636E\u3002"
		      ] })
		    ] }) : null,
		    verified === null && data !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-banner kos-banner--warn", role: "status", "data-testid": "kos-unknown-commit", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Host \u672A\u62A5\u544A\u6784\u5EFA\u63D0\u4EA4\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u5F53\u524D\u53EA\u80FD\u786E\u8BA4\u7248\u672C\u53F7\uFF0C\u65E0\u6CD5\u6838\u9A8C\u662F\u5426\u4E0E\u9501\u5B9A\u63D0\u4EA4\u4E00\u81F4\u3002" })
		    ] }) : null,
		    phase === "loading" && data !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "kos-note", role: "status", "data-testid": "kos-refreshing", children: "\u6B63\u5728\u5237\u65B0\uFF0C\u4EE5\u4E0B\u4E3A\u4E0A\u6B21\u6210\u529F\u7ED3\u679C\uFF0C\u5C1A\u4E0D\u80FD\u89C6\u4E3A\u5F53\u524D\u8FDE\u63A5\u72B6\u6001\u3002" }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "kos-card", children: data === void 0 ? phase === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-empty", "data-testid": "kos-loading", children: [
		      "\u6B63\u5728\u901A\u8FC7 Host \u670D\u52A1\u8BFB\u53D6\u8FD0\u884C\u72B6\u6001\u2026",
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "kos-skeleton" })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "kos-empty", children: "\u5C1A\u65E0\u53EF\u7528\u72B6\u6001\u6570\u636E\u3002\u8BF7\u70B9\u51FB\u91CD\u8BD5\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "\u8FDE\u63A5\u72B6\u6001" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { "data-testid": "kos-connection", children: connectionText })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "DSH \u7248\u672C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { className: "kos-mono", "data-testid": "kos-version", children: data.upstream_version })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "\u4E0A\u6E38\u63D0\u4EA4" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { className: "kos-mono", "data-testid": "kos-commit", children: shortCommit(data.upstream_commit) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "\u63D0\u4EA4\u6821\u9A8C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { className: verification.className, "data-testid": "kos-verified", children: verification.text })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "\u4E3B\u673A\u5B9E\u4F8B" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { className: "kos-mono", "data-testid": "kos-instance", children: data.host_instance_id })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "\u5B9E\u4F8B\u542F\u52A8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { "data-testid": "kos-started-at", children: formatTime(data.started_at) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kos-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "\u672C\u6B21\u67E5\u8BE2" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { "data-testid": "kos-checked-at", "data-checked-at": data.checked_at, children: formatTime(data.checked_at) })
		      ] })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "kos-foot", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "kos-note", children: [
		        "\u6570\u636E\u6765\u81EA\u672C\u673A DSH Host \u63D2\u4EF6\uFF1B\u4EC5\u5305\u542B\u7248\u672C\u3001\u63D0\u4EA4\u3001\u5B9E\u4F8B\u4E0E\u65F6\u95F4\u7B49\u8FD0\u884C\u5143\u6570\u636E\u3002",
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: "/knowledgeos/today", style: { color: "#3D7E86" }, children: "\u4ECA\u65E5\u8BA1\u5212" }),
		        " \xB7 ",
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: "/knowledgeos/library", style: { color: "#3D7E86" }, children: "\u77E5\u8BC6\u5E93" }),
		        " \xB7 ",
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: "/knowledgeos/account", style: { color: "#3D7E86" }, children: "\u6253\u5F00\u8D26\u53F7\u4E0E\u4E2A\u4EBA\u7A7A\u95F4" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "kos-button kos-button--ghost", onClick: refresh, disabled: phase === "loading", "data-testid": "kos-refresh", children: phase === "error" ? "\u91CD\u65B0\u8FDE\u63A5" : "\u5237\u65B0" })
		    ] })
		  ] });
		}

		// src/client/icon.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function KnowledgeOsPanelIcon({ size = 20 }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", focusable: "false", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      "path",
		      {
		        d: "M4.5 5.25c2.8-.9 5.2-.55 7.5.9 2.3-1.45 4.7-1.8 7.5-.9v12.2c-2.8-.9-5.2-.55-7.5.9-2.3-1.45-4.7-1.8-7.5-.9V5.25Z",
		        stroke: "currentColor",
		        strokeWidth: "1.5",
		        strokeLinejoin: "round"
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 6.15v12.2", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      "path",
		      {
		        d: "M7.2 9.1c1.1-.2 2.1-.05 3.1.45M7.2 12.2c1.1-.2 2.1-.05 3.1.45M13.7 9.55c1-.5 2-.65 3.1-.45M13.7 12.65c1-.5 2-.65 3.1-.45",
		        stroke: "currentColor",
		        strokeWidth: "1.2",
		        strokeLinecap: "round"
		      }
		    )
		  ] });
		}

		// src/client/index.ts
		var PANEL_ID = "knowledgeos";
		var inject = ["slots"];
		function apply(ctx) {
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({ name: "main", key: PANEL_ID }, KnowledgeOsPanel);
		  });
		  ctx.slots.inject("sidebar.panellist", function* () {
		    yield ctx.slots.register({
		      name: "sidebar.panellist",
		      id: PANEL_ID,
		      order: 20,
		      label: () => "\u77E5\u8BC6\u5E93"
		    }, KnowledgeOsPanelIcon);
		  });
		}

		return module.exports;
	}
});
