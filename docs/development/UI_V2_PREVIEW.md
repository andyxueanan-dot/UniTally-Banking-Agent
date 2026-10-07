# 新版界面（V2）

**状态（2026-10-06）：已替换为线上手机入口。** `mobile/entry.tsx` 现在渲染 `src/pages/BankAgentV2.tsx`，不再加载 `src/mobile/mobile.css`；团队网关的登录页模板同步换成同一视觉语言。旧的 `BankAgent.tsx`、`bank-agent.css`、`mobile.css` 保留在仓库里（桌面版 `/bank-agent` 仍使用它们），需要回退时把 `mobile/entry.tsx` 的引用改回去即可。

下文是评审阶段的记录：当时 V2 是一份独立副本（`mobile-v2/` 入口），用于不影响线上的情况下对比。`mobile-v2/` 入口继续保留，和线上入口渲染同一组件。

## 改了什么、没改什么

- 新增文件：`mobile-v2/index.html`、`mobile-v2/entry.tsx`、`mobile-v2/login-preview.html`、`src/pages/BankAgentV2.tsx`、`src/pages/bank-agent-v2.css`、`src/mobile/MobileHomeV2.tsx`、`vite.mobile-v2.config.ts`、`tsconfig.mobile-v2.json`、`scripts/capture-ui-screens.mjs`。
- 共享文件只做了追加：`package.json` 多了 `mobile-v2:dev / mobile-v2:build / mobile-v2:preview` 三个脚本；`.gitignore` 多了 `dist-mobile-v2/`。
- 同一套后端、同一套业务逻辑、同一份数据：`BankAgentV2.tsx` 是 `BankAgent.tsx` 的复制件，只改了样式引用、首页组件引用、对话的角色标签、回执的印章元素和图表配色。服务中心等子组件（`src/pages/bank/*`）直接复用，没有复制。
- 没有改桌面版 `/bank-agent`（线上没有部署桌面版，部署的是手机壳）。

## 设计口径（给评审看）

目标是去掉“AI 生成感”：不用纯色/暖色/高饱和色块当背景，不套卡片、不套边框。

- 白纸黑字；只有一条墨绿（已执行、可点击）、一条琥珀（等你确认）、红色只给强验证和拒绝。
- 分隔靠细线、点线和留白，容器最多一层；卡片管理页是唯一保留“盒子”的地方，也只用线框。
- 正文 15px，最小 12px；大额数字用衬线字体；对话是“笔录”排版而不是气泡；权限等级是任务左侧的一条色条加文字，而不是彩色胶囊。
- 只保留两种动效：换页时一次轻微上浮；回执落地时的“已记录”印章。
- 字体全部用系统字体。线上网关的 CSP 是 `font-src 'self'`，外链字体（如 Google Fonts）会被浏览器拦截；如果以后要换字体，必须把字体文件放进仓库自托管。

## 10 月 6 日：按设计参考库修正

新版的数值不再凭经验，而是对照 `design/reference-library/`（72 个人类设计的公开页面在手机视口上的测量中位数）：正文 16px、没有 12px 以下的字、文字颜色 ≤4、底色不饱和、每屏盒子 ≤3、嵌套 1、圆角 ≤4px、无阴影、链接黑字下划线、强调色只用在极小面积。用同一脚本测首页：旧版 12px 正文、30% 的字小于 12px、8 种文字色、每屏 6 个盒子；修正后 14px 主体文字（段落正文 16px）、0% 小字、3 种文字色、每屏 0.9 个盒子。详见 `design/reference-library/README.md` 与 `summary.md`。

## 10 月 7 日：V3 银行版（已审核，已替换为线上入口）

队友反馈"不像银行"。按 `review-2026-10-07/bank-ui-research.md`（34 家银行官网测量）做了 V3 副本：`src/pages/BankAgentV3.tsx`、`src/mobile/MobileHomeV3.tsx`、`src/pages/bank-agent-v3.css`（`@import` V2 样式后只覆盖主色、顶栏细条、主按钮、宫格图标、问候/公告/页脚、回执分行、个人中心账户信息）。Andy 审核通过后，`mobile/entry.tsx` 与预览入口 `mobile-v2/` 都渲染 V3；V2 文件保留，回退只需把 `mobile/entry.tsx` 的引用改回 `BankAgentV2`。审查材料与替换步骤见仓库上一级 `review-2026-10-07/README-v3.md` 和 `compare-v3.html`。

## 本地怎么看

1. 双击 `启动银行智能体.cmd`（或者 `node backend/bank-server.js`），确认 http://127.0.0.1:5091/api/bank/health 正常。
2. 在仓库根目录运行：

```powershell
npm run mobile-v2:dev
```

3. 浏览器打开 http://127.0.0.1:8092 ，用开发者工具切到手机尺寸（或直接用手机访问电脑 IP 时记得后端只信任本机来源，远程访问请仍用团队网关）。
4. 登录页的新版草稿是静态文件 `mobile-v2/login-preview.html`，直接用浏览器打开即可；它只是版式预览，表单字段与现有后端一致。

对比截图：仓库上一级目录 `review-2026-10-05/compare.html`（左旧右新，20 个页面）。重新生成：

```powershell
node scripts/capture-ui-screens.mjs http://127.0.0.1:8092 ../review-2026-10-05/after
```

脚本只跑离线固定案例，任何非 demo 的模型调用都会被拦截，不消耗 AI 额度。

## 评审通过后怎么替换（现在不要做）

1. 把 `mobile/entry.tsx` 里的 `import BankAgent from '../src/pages/BankAgent'` 改成 `'../src/pages/BankAgentV2'`，并删掉 `import '../src/mobile/mobile.css'`（V2 样式表已包含手机壳规则）。只改这一个文件，Render 的构建命令不用动。
2. 登录页：把 `backend/team-share-server.js` 里 `loginPage()` 的 HTML 换成 `mobile-v2/login-preview.html` 的 `<style>` 和 `<main>`，保留 `${failed ? … : ''}` 与 `${maxDailyCalls}` 两个占位。
3. 浏览器自动检查 `scripts/check-mobile-browser.mjs` 里有一处断言与新版首页结构不同，需要同步改：`.bm-recent>div` 数量为 3 → 改成 `.v2-ledger li` 数量为 5（新版首页显示 5 条最近记录）。`.bm-welcome` 在新版首页上保留了同名 class，不用改；其余断言不变。
4. 重新跑：`npm run mobile:build`、`node scripts/check-mobile-browser.mjs`、后端测试；再推送部署分支。

不替换时，副本留在仓库里不会被任何入口加载，也不会出现在线上构建产物中。
