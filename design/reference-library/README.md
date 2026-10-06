# 设计参考库（人类设计页面的客观指标）

这个目录是给"改界面"用的尺子。做法来自一个简单的观察：AI 生成页面的通病（色块当背景、卡片套卡片、字太小、颜色太多）不是品味问题，而是它没有真实设计的基准。所以先量一批 AI 时代之前就存在的、由人设计的公开页面，把字号、行距、颜色数、背景饱和度、盒子数量、嵌套深度等指标存成库，再按库里的中位数去约束生成和修改。

## 文件

- `urls.txt`：站点清单，按类别（艺术院校、美术馆/展览、杂志/编辑、品牌/产品、金融科技、个人站点）。2026-10-06 共 73 站，成功测量 72 站（手机视口）。
- `corpus.json`：逐站逐视口（桌面 1440px、手机 390px）的测量结果。**只有数字**：文本样式分布、标题样式、底色与饱和度、盒子/阴影/圆角统计、段落宽度、链接与按钮颜色。不保存任何页面文本、HTML、CSS 或图片。
- `summary.md`：汇总表（总体、分类别、逐站明细）和派生令牌。
- `brief.json`：派生的手机端设计令牌（中位数）。

缩略图不在仓库里（第三方页面截图只用于团队内部对照），在仓库上一级 `review-2026-10-06/corpus-index.html` 可以看。

## 2026-10-06 的主要结论（手机视口中位数）

- 正文 16px（四分位 14–17），行距 1.42；**12px 以下文字的字符占比为 0%**。
- h1 ≈ 1.9 倍正文（30px），h2 ≈ 1.5 倍。
- 文字颜色 4 种，大面积底色 3 种，高饱和背景面积 0%；46% 的站点底色是白或近白。
- 每屏 2.5 个"盒子"（有边框、阴影或独立底色的块），嵌套深度 1；95% 的盒子圆角 ≤4px；阴影 0。
- 76% 的站点主要按钮是黑/白/灰；用了彩色按钮的站点，强调色饱和度中位数为 1.0（纯色、小面积），不是淡彩。链接颜色饱和度中位数 0（链接是黑字加下划线）。
- 衬线体不是主流：正文 8%、h1 7%（杂志 25%、个人站 33%）。

## 怎么用

1. 修改或生成页面前，把 `brief.json` 和 `summary.md` 的"总体（手机）"表贴进提示词，要求逐项达标：正文 ≥16px、无 12px 以下文字、文字颜色 ≤4、底色 ≤3 且不饱和、每屏盒子 ≤3、嵌套 ≤1、圆角 ≤4px、无阴影、按钮黑白、链接黑字下划线。
2. 改完用同一把尺子复核（后端与预览服务先启动）：

```powershell
node scripts/design-corpus-extract.mjs --list ../review-2026-10-06/our-urls.txt --out ../review-2026-10-06/finpilot-metrics.json --viewports mobile --wait-selector "[data-testid=balance]"
node scripts/design-corpus-summarize.mjs design/reference-library/corpus.json design/reference-library/summary.md --compare ../review-2026-10-06/finpilot-metrics.json --brief design/reference-library/brief.json
```

3. 重新抓参考库（约 10 分钟，需要本机 Chrome）：

```powershell
node scripts/design-corpus-extract.mjs --list design/reference-library/urls.txt --out design/reference-library/corpus.json --thumbs ../review-2026-10-06/corpus-thumbs
```

## 边界

- 站点是人工挑选的，中位数不是规范；中文正文的行距通常要比拉丁文高一些（1.5–1.6），所以 FinPilot 用 1.5 而不是 1.42。
- "盒子"的定义会把带下划线的列表行也算进去，这正是库给出的提示：人类设计的列表更多靠留白分隔，而不是每行一条线。
- 测量的是首页首屏到四屏的范围；弹窗、登录后页面不在内。
