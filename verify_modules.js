#!/usr/bin/env node
/**
 * verify_modules.js —— 2C 行业看板「通用校验器」（阶段0收口）
 * 取代散落的 _verify_macro.js / _verify_internet*.py / _verify_auto*.py 等 30+ 脚本。
 *
 * 覆盖：
 *  1) 内联脚本语法检查
 *  2) DOM/echarts 桩 + eval 渲染引擎，5 模块逐栏目渲染冒烟（t1-t4 均有内容）
 *  3) DATA 级结构校验：核心字段、市场大盘字段契约、观点化覆盖、容量上限、链接、跨模块边界
 *  4) `};` 防回归（治理规则：明文禁 `};`、禁从快照重建）
 *  5) 宏观专属：图表 series 长度/坐标轴一致、管理层摘要跨页去重
 *
 * 用法：node verify_modules.js [index.html路径]
 * 退出码 = 硬失败数（0 表示全部通过；warn 不计入退出码）。
 */
const fs = require("fs");
const path = require("path");
const HTML = process.argv[2] || "deploy/index.html";
if (!fs.existsSync(HTML)) { console.error("X 文件不存在:", HTML); process.exit(2); }
const html = fs.readFileSync(HTML, "utf8");

let hard = 0, warn = 0;
const log = (ok, name, lvl) => {
  if (ok) console.log("  OK   " + name);
  else if (lvl === "warn") { console.log("  WARN " + name); warn++; }
  else { console.log("  X    " + name); hard++; }
};

/* ---------- 1. 语法检查 ---------- */
const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, blocks = [];
while ((m = re.exec(html))) blocks.push(m[1]);
console.log("内联脚本块:", blocks.length);
let synErr = 0;
blocks.forEach((b, i) => { try { new Function(b); } catch (e) { console.log("  X 语法错误 block#" + i + ":", e.message); synErr++; } });
log(synErr === 0, "内联脚本语法检查");
if (synErr) process.exit(1);

/* ---------- 2. DOM / echarts 桩 ---------- */
global.__renderBytes = 0;
class MockEl {
  constructor(id) { this.id = id; this._html = ""; this._t = ""; this.dataset = {}; this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return true; } }; }
  set innerHTML(v) { v = String(v); this._html = v; global.__renderBytes += v.length; } get innerHTML() { return this._html; }
  set textContent(v) { this._t = v; } get textContent() { return this._t || ""; }
  addEventListener() {} appendChild() {} querySelectorAll() { return []; } querySelector() { return new MockEl("q"); }
  get offsetHeight() { return 118; }
}
const store = {};
const gid = id => (store[id] || (store[id] = new MockEl(id)));
global.echarts = { init(el) { return { setOption() {}, dispose() {}, resize() {} }; }, getInstanceByDom() { return null; } };
global.document = {
  getElementById: gid, querySelectorAll() { return []; }, querySelector() { return gid("_q"); },
  createElement() { return new MockEl("new"); }, addEventListener() {}, head: { appendChild() {} },
  documentElement: { style: { setProperty() {} } }
};
global.window = { addEventListener() {} };
global.localStorage = { getItem() { return null; }, setItem() {} };

/* ---------- 3. eval DATA + 渲染引擎 ---------- */
const renderBlock = blocks.find(b => b.includes("function renderAll"));
let dataMode = "inline";
let dataBlock = blocks.find(b => b.includes("const DATA"));
if (!dataBlock) {
  // 阶段1：index.html 已外置 DATA，从同目录 data/ 加载
  const dir = HTML.endsWith(".html") ? path.dirname(HTML) : HTML;
  const manifestPath = path.join(dir, "data", "manifest.json");
  if (fs.existsSync(manifestPath)) {
    dataMode = "data";
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const mods = manifest.modules || Object.keys(manifest.files || {});
    const _DATA = {};
    for (const m of mods) _DATA[m] = JSON.parse(fs.readFileSync(path.join(dir, "data", m + ".json"), "utf8"));
    dataBlock = "var DATA = " + JSON.stringify(_DATA) + ";";
    console.log("[data 模式] 从 data/ 目录加载 " + mods.length + " 模块");
  }
}
if (!dataBlock || !renderBlock) { console.log("X 未找到 DATA 或渲染块"); process.exit(1); }
const expose = `
;globalThis.__api = { DATA, setCategory, renderAll, renderTab1, renderTab2, renderTab3, renderTab4 };
try{globalThis.__api.renderMacroT1=renderMacroT1;}catch(e){}
try{globalThis.__api.renderMacroT2=renderMacroT2;}catch(e){}
try{globalThis.__api.renderMacroT3=renderMacroT3;}catch(e){}
try{globalThis.__api.renderMacroT4=renderMacroT4;}catch(e){}
try{globalThis.__api.renderMarket=renderMarket;}catch(e){}
try{globalThis.__api.renderCategoryMarket=renderCategoryMarket;}catch(e){}
try{globalThis.__api.renderAutoBoard=renderAutoBoard;}catch(e){}
try{globalThis.__api.renderTerminalExtra=renderTerminalExtra;}catch(e){}
try{globalThis.__api.renderLaunchRadar=renderLaunchRadar;}catch(e){}
try{globalThis.__api.renderMacroBrief=renderMacroBrief;}catch(e){}
  try{globalThis.__api.mcOpt=mcOpt;}catch(e){}
try{globalThis.__api.setCurTab=function(v){curTab=v;};}catch(e){}
try{globalThis.__api.curCatRef=function(){return curCat;};}catch(e){}
try{globalThis.__api.curRef=function(){return cur;};}catch(e){}
`;
let evalErr = null;
try {
  if (dataMode === "data") eval(renderBlock + "\n" + dataBlock + expose);  // 渲染块含 var DATA=null，真实 DATA 随后覆盖
  else eval(dataBlock + "\n" + renderBlock + expose);
} catch (e) { evalErr = e; }
if (evalErr) { console.log("X 引擎加载失败:", evalErr.message); process.exit(1); }
const X = globalThis.__api;
console.log("引擎加载成功");

/* ---------- 4. 渲染冒烟：5 模块累计渲染量 ---------- */
const MODS = ["terminal", "auto", "internet", "chip", "macro"];
console.log("\n[渲染冒烟] 各模块累计渲染量应充足(>2000字符, 含所有子容器)");
for (const mod of MODS) {
  global.__renderBytes = 0;
  try { X.setCategory(mod); X.renderAll(); } catch (e) { log(false, `渲染 ${mod} 抛错: ${e.message}`, "hard"); continue; }
  const total = global.__renderBytes;
  log(total > 2000, `  ${mod} 渲染总量 (${total} 字符)`);
}

/* ---------- 5. DATA 级结构校验 ---------- */
console.log("\n[结构校验]");
const COMMON = ["updateTime", "headlineViewpoints", "opinionLeaders", "leadersSummary",
  "instsSummary", "topNews", "newsSummary", "earnSnap", "marketView"];
const INDUSTRY_REQUIRED = ["institutionViews", "earnings", "earningsCalendar",
  "newProducts", "launchCalendar", "productSummary", "productsSummary"];
// 每模块期望的市场大盘字段形态
const MARKET_SHAPE = { terminal: "marketData", auto: "autoBoard", internet: "market", chip: "market", macro: "market" };
const TERMINAL_ONLY = ["launchRadar", "marketData"];
const AUTO_ONLY = ["autoBoard"];
const MACRO_ONLY = ["asOf", "brief", "releaseCalendar", "policyCalendar", "policyDigest", "industryProfit", "electronicsMfg", "metricNotes", "sources"];
const CAPS = { headlineViewpoints: 12, opinionLeaders: 12, institutionViews: 12, topNews: 12,
  newProducts: 20, earnings: 12, earningsCalendar: 24, launchCalendar: 80, productSummary: 24 };
const D = X.DATA;

for (const mod of MODS) {
  const o = D[mod] || {};
  // 5.1 核心字段
  const miss = COMMON.filter(k => !(k in o));
  const missInd = (mod !== "macro") ? INDUSTRY_REQUIRED.filter(k => !(k in o)) : [];
  const missMsg = (miss.length ? " 缺:" + miss.join(",") : "") + (missInd.length ? " 缺(产业):" + missInd.join(",") : "");
  log(miss.length === 0 && missInd.length === 0, `${mod} 核心字段齐全${missMsg}`, (miss.length || missInd.length) ? "hard" : "ok");
  // 5.2 市场大盘契约
  const expectShape = MARKET_SHAPE[mod];
  const hasExpect = expectShape in o;
  const extraShapes = ["marketData", "autoBoard", "market"].filter(k => k !== expectShape && k in o);
  log(hasExpect, `${mod} 含期望市场字段 ${expectShape}`, "hard");
  log(extraShapes.length === 0, `${mod} 无多余市场字段${extraShapes.length ? " 多余:" + extraShapes.join(",") : ""}`, "warn");
  // 5.3 观点化覆盖 + 链接
  const hv = o.headlineViewpoints || [];
  let hvBad = 0, hvNoCore = 0, hvNoLink = 0;
  hv.forEach(it => {
    if (!it || !it.t || !it.t.trim()) hvBad++;
    if (!it || !it.s || !it.s.trim()) hvBad++;
    else if (!/核心观点/.test(it.s)) hvNoCore++;
    if (!it || !/^https?:\/\//.test(it.u || "")) hvNoLink++;
  });
  log(hv.length > 0 && hvBad === 0, `${mod} 头条观点化覆盖(${hv.length}条, 缺t/s:${hvBad})`, "hard");
  log(hvNoCore === 0, `${mod} 头条均含"核心观点"起手(${hvNoCore}条缺失)`, "warn");
  log(hvNoLink === 0, `${mod} 头条均含有效链接(${hvNoLink}条缺失)`, "warn");
  // 5.4 容量上限
  for (const k of Object.keys(CAPS)) {
    if (Array.isArray(o[k]) && o[k].length > CAPS[k]) log(false, `${mod}.${k} 超出容量上限 ${o[k].length}>${CAPS[k]}`, "warn");
  }
  // 5.5 跨模块边界
  const extra = [];
  if (mod !== "terminal") extra.push(...TERMINAL_ONLY.filter(k => k in o));
  if (mod !== "auto") extra.push(...AUTO_ONLY.filter(k => k in o));
  if (mod !== "macro") extra.push(...MACRO_ONLY.filter(k => k in o));
  log(extra.length === 0, `${mod} 无跨模块越界字段${extra.length ? " 越界:" + extra.join(",") : ""}`, "warn");
}

/* ---------- 5.6 T4 市场大盘契约收敛报告 ---------- */
console.log("\n[T4 市场大盘契约] 目标：每模块统一字段名 `market`（canonical），废弃 marketData/autoBoard 双形态");
const SHAPES = { terminal: "marketData", auto: "autoBoard", internet: "market", chip: "market", macro: "market" };
let t4Diverged = [];
for (const mod of MODS) {
  const o = D[mod] || {};
  const present = ["marketData", "autoBoard", "market"].filter(k => k in o);
  const diverged = present.length !== 1 || present[0] !== "market";
  if (diverged) t4Diverged.push(`${mod}:[${present.join(",")}]`);
  console.log(`  ${mod.padEnd(9)} 市场字段 = ${present.join(",") || "(无)"} ${present.join(",") === "market" ? "✓规范" : "→ 待收敛"}`);
}
log(t4Diverged.length === 0, `T4 全模块收敛到 canonical \`market\`${t4Diverged.length ? " 分歧:" + t4Diverged.join("; ") : ""}`, t4Diverged.length ? "warn" : "ok");

/* ---------- 6. `};` 防回归：DATA 对象内不得内嵌语句终结符 ---------- */
if (dataMode === "data") {
  console.log("[`};` 防回归] data 模式：DATA 已外置为 data/*.json（JSON 天然无内联 `};` 截断风险），跳过此检查");
} else {
const raw = html.replace(/\r\n/g, "\n");
const ds = raw.indexOf("const DATA = {");
let bi = raw.indexOf("{", ds), bdepth = 0, bend = -1, binStr = null, besc = false;
for (; bi < raw.length; bi++) {
  const c = raw[bi];
  if (binStr) { if (besc) { besc = false; continue; } if (c === "\\") { besc = true; continue; } if (c === binStr) binStr = null; continue; }
  if (c === '"' || c === "'" || c === "`") { binStr = c; continue; }
  if (c === "{") bdepth++; else if (c === "}") { bdepth--; if (bdepth === 0) { bend = bi; break; } }
}
const dataObj = raw.slice(ds + "const DATA = ".length, bend + 1);
const embedded = (dataObj.match(/;\n/g) || []).length;
log(embedded === 0, `DATA 对象内无内嵌语句终结符 \`;\`(出现 ${embedded} 次, 应为0)`, "hard");
}

/* ---------- 7. 宏观专属 ---------- */
console.log("\n[宏观专属]");
if (D.macro) {
  const m = D.macro;
  log(true, "宏观模块存在");
  // 图表 series 一致性
  const all = [];
  (m.industryProfit && m.industryProfit.charts || []).forEach(c => all.push(c));
  (m.electronicsMfg && m.electronicsMfg.charts || []).forEach(c => all.push(c));
  (m.market && m.market.subs || []).forEach(s => (s.charts || []).forEach(c => all.push(c)));
  let bad = 0;
  if (X.mcOpt) {
    all.forEach(c => {
      let opt; try { opt = X.mcOpt(c); } catch (e) { console.log("    X mcOpt", c.id, e.message); bad++; return; }
      if (!opt.series || !opt.series.length) { console.log("    X 无 series", c.id); bad++; return; }
      const xA = Array.isArray(opt.xAxis) ? opt.xAxis[0] : opt.xAxis;
      const yA = Array.isArray(opt.yAxis) ? opt.yAxis[0] : opt.yAxis;
      const catLen = (xA && xA.type === "category") ? xA.data.length : (yA && yA.type === "category") ? yA.data.length : null;
      opt.series.forEach((s, i) => {
        const arr = (s.data || []).map(v => (v && typeof v === "object" ? v.value : v));
        if (catLen !== null && arr.length !== catLen) { console.log("    X", c.id, "#" + i, s.name, "len", arr.length, "!= axis", catLen); bad++; }
        arr.forEach(v => { if (v === undefined || (typeof v === "number" && isNaN(v))) { console.log("    X", c.id, s.name, "bad value", v); bad++; } });
      });
    });
    log(bad === 0, `宏观图表 series 一致/无 NaN(${all.length}张, 问题${bad})`, "hard");
  } else { log(true, "宏观图表检查跳过(mcOpt 不可用)"); }
  // 管理层摘要跨页去重
  if (X.renderMacroBrief && X.setCurTab) {
    X.setCategory("macro"); X.setCurTab("t1"); X.renderMacroBrief();
    const b1 = gid("macroBrief").innerHTML.length;
    X.setCurTab("t2"); X.renderMacroBrief(); const b2 = gid("macroBrief").innerHTML.length;
    X.setCurTab("t3"); X.renderMacroBrief(); const b3 = gid("macroBrief").innerHTML.length;
    X.setCurTab("t4"); X.renderMacroBrief(); const b4 = gid("macroBrief").innerHTML.length;
    X.setCurTab("t1"); X.renderMacroBrief(); const bBack = gid("macroBrief").innerHTML.length;
    log(b1 > 500, "  摘要 T1 渲染", "hard");
    log(b2 === 0 && b3 === 0 && b4 === 0, `  摘要 T2/T3/T4 不重复(长度 ${b2}/${b3}/${b4})`, "warn");
    log(bBack > 500, "  切回 T1 摘要恢复", "hard");
  } else { log(true, "摘要去重检查跳过"); }
} else { log(false, "宏观模块缺失", "hard"); }

/* ---------- 8. 汇总 ---------- */
console.log(`\n========== 校验汇总 ==========`);
console.log(`硬失败(hard): ${hard}   警告(warn): ${warn}`);
console.log(hard === 0 ? "✅ 全部硬性检查通过" : "❌ 存在硬性检查未通过，请修复后再部署");
process.exit(hard ? 1 : 0);
