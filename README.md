# consumerdaily — 消费电子行业头条看板

终端产业（华为及竞对）每日管理看板，面向终端厂商高管视角。纯静态单文件，**无需构建**。

## 内容模块
- Top10 要闻 / 关键 KOL / 主流机构 / Top10 新闻 / 产品发布 / 上市公司财报
- 存储价格趋势：相对指数曲线（公开） + 实际价格绝对值曲线（**默认锁定查看权限**，按需开放）
- ECharts 已**本地自托管**（`echarts.min.js`，同目录），不依赖任何外网 CDN，国内网络可正常出图

## 本地预览
直接用浏览器打开 `index.html` 即可（`echarts.min.js` 需同在目录下）。

## 部署（EdgeOne Pages · Git 集成）
1. EdgeOne 控制台 → 边缘安全加速平台 EO → Pages → 创建项目 → **关联 Git 仓库**（授权 GitHub）
2. 选择本仓库 `consumerdaily-site`
3. 构建命令：**留空**（纯静态，无需构建）
4. 输出目录：**仓库根目录**（含 `index.html`）
5. 部署后获得 `*.edgeone.app` / `*.edgeone.dev` 预览地址
6. 稳定公开 + 微信小程序 `web-view`：绑**自定义域名 + ICP 备案**（企业/媒体主体；个人主体无法使用 `web-view`）

## 价格曲线权限
- 默认 🔒 不开放；浏览器内点「开放查看权限」仅本机解锁。
- 全站开放：在 `index.html` 置 `PRICE_UNLOCK_OVERRIDE = true` 后重新部署。
