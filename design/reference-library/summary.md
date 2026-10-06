# 设计参考库：人类设计页面的客观指标

生成时间 2026-10-06T09:46:43.222Z。来源 design/reference-library/corpus.json；成功抓取 桌面 69 站、手机 72 站。只保存计算出的指标，不保存页面内容。

度量口径：正文 = 字符数最多的文本样式（字号 12–26px）；盒子 = 有边框、阴影或与父元素不同底色、且面积大于 2500px² 的块；高饱和背景 = 大面积底色中 HSL 饱和度 > 0.35 且明度在 0.15–0.9 之间的面积占比；嵌套深度 = 盒子套盒子的最大层数。

## 一、总体（手机视口 390px）

| 指标 | 手机 |
| --- | --- |
| 正文字号（中位数 / 四分位） | 16px（14–17） |
| 正文行距（倍数） | 1.42 |
| 正文用衬线体的站点占比 | 8% |
| h1 / 正文 字号比 | 1.89 |
| h1 字号中位数 | 30px |
| h1 用衬线体的站点占比 | 7% |
| h2 / 正文 字号比 | 1.50 |
| 字体家族数 | 2 |
| 文字颜色数 | 4 |
| 大面积背景色数 | 3 |
| 高饱和背景占比（中位数） | 0% |
| 高饱和背景超过 20% 面积的站点 | 10% |
| 页面底色为白/近白的站点 | 46% |
| 盒子数（有边框/阴影/独立底色的块） | 9 |
| 每屏盒子数 | 2.5 |
| 盒子最大嵌套深度 | 1 |
| 嵌套深度 ≥3 的站点 | 7% |
| 圆角 ≤4px 的盒子占比 | 95% |
| 阴影数量 | 0 |
| 段落宽度中位数 | 342px |
| 12px 以下文字的字符占比 | 0% |
| 按钮强调色饱和度（排除黑白灰） | 1.00 |
| 按钮强调色明度 | 0.52 |
| 主要按钮是黑/白/灰的站点 | 76% |
| 链接颜色饱和度 | 0.00 |

## 二、总体（桌面视口 1440px）

| 指标 | 桌面 |
| --- | --- |
| 正文字号（中位数 / 四分位） | 16px（14–18） |
| 正文行距（倍数） | 1.44 |
| 正文用衬线体的站点占比 | 7% |
| h1 / 正文 字号比 | 2.50 |
| h1 字号中位数 | 40px |
| h1 用衬线体的站点占比 | 12% |
| h2 / 正文 字号比 | 1.67 |
| 字体家族数 | 2 |
| 文字颜色数 | 4 |
| 大面积背景色数 | 3 |
| 高饱和背景占比（中位数） | 0% |
| 高饱和背景超过 20% 面积的站点 | 14% |
| 页面底色为白/近白的站点 | 46% |
| 盒子数（有边框/阴影/独立底色的块） | 14 |
| 每屏盒子数 | 3.5 |
| 盒子最大嵌套深度 | 2 |
| 嵌套深度 ≥3 的站点 | 12% |
| 圆角 ≤4px 的盒子占比 | 92% |
| 阴影数量 | 0 |
| 段落宽度中位数 | 497px |
| 12px 以下文字的字符占比 | 0% |
| 按钮强调色饱和度（排除黑白灰） | 0.98 |
| 按钮强调色明度 | 0.55 |
| 主要按钮是黑/白/灰的站点 | 73% |
| 链接颜色饱和度 | 0.00 |

## 三、分类别（手机视口）

| 类别 | 站点数 | 正文字号 | 行距 | h1/正文 | 文字颜色数 | 每屏盒子 | 嵌套 | 圆角≤4px | 高饱和背景 | 标题衬线 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| art_school | 12 | 16 | 1.27 | 2.11 | 4 | 3.3 | 1 | 98% | 0% | 0% |
| museum | 13 | 16 | 1.44 | 2.00 | 4 | 3.0 | 2 | 100% | 1% | 0% |
| magazine | 18 | 16 | 1.44 | 1.22 | 5 | 2.4 | 1 | 97% | 0% | 25% |
| brand | 13 | 15 | 1.45 | 1.65 | 5 | 2.0 | 1 | 53% | 0% | 0% |
| fintech | 8 | 15 | 1.46 | 2.62 | 4 | 3.1 | 2 | 31% | 0% | 0% |
| personal | 8 | 16 | 1.52 | 1.50 | 3 | 2.0 | 1 | 100% | 0% | 33% |

## 四、正文字体榜（手机视口，按站点数）

| 字体 | 站点数 |
| --- | --- |
| -apple-system | 3 |
| Helvetica | 2 |
| Graphik | 2 |
| PingFang SC | 2 |
| Helvetica Neue | 2 |
| RISD Sans | 1 |
| Renens | 1 |
| Source Sans 3 | 1 |
| new rail | 1 |
| ExecutiveLight | 1 |
| Friedl | 1 |
| mad | 1 |
| Bascule | 1 |
| HelveticaNeueLTPro-Md | 1 |
| sans-serif | 1 |

## 五、用同一把尺子量 FinPilot

| 指标 | 参考库手机中位数 | finpilot-old | finpilot-v2 |
| --- | --- | --- | --- |
| 正文字号 | 16px | 12px | 14px |
| 正文行距 | 1.42 | 1.50 | 1.50 |
| h1 字号 | 30px | 23px | 46px |
| 12px 以下文字占比 | 0% | 30% | 0% |
| 文字颜色数 | 4 | 8 | 3 |
| 大面积背景色数 | 3 | 3 | 1 |
| 高饱和背景占比 | 0% | 0% | 0% |
| 每屏盒子数 | 2.5 | 6 | 0.9 |
| 盒子最大嵌套深度 | 1 | 2 | 1 |
| 圆角 ≤4px 的盒子占比 | 95% | 71% | 100% |
| 阴影数量 | 0 | 0 | 0 |
| 字体家族数 | 2 | 1 | 2 |

## 六、派生的设计令牌（手机）

```json
{
  "bodyPx": 16,
  "lineHeight": 1.4,
  "h1Px": 30,
  "h2Px": 24,
  "smallTextShare": 0,
  "textColors": 4,
  "boxesPerScreen": 2.5,
  "nesting": 1,
  "flatRadiusShare": 0.95,
  "shadows": 0,
  "saturatedBgShare": 0,
  "whiteBodyShare": 0.4647887323943662,
  "serifHeadingShare": 0.07142857142857142,
  "accentSaturation": 1,
  "accentLightness": 0.5245,
  "neutralButtonShare": 0.7560975609756098
}
```

解释：这些数值是参考库的中位数，不是某一个站点的样式；用它们约束生成或修改页面时的字号、行距、颜色数、盒子数和圆角。

## 七、逐站明细（手机视口）

| 站点 | 类别 | 正文 | 行距 | h1 | 字体数 | 文字色 | 背景色 | 高饱和 | 盒子/屏 | 嵌套 | 圆角≤4 | 阴影 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bauhaus-dessau | art_school | Friedl 13px | 1.20 | — | 1 | 1 | 6 | 1% | 4.8 | 2 | 16% | 19 |
| calarts | art_school | sans-serif 15px | 1.60 | 16px | 5 | 6 | 7 | 11% | 2.5 | 3 | 90% | 1 |
| design-academy-eindhoven | art_school | mad 16px | 1.20 | 40px | 1 | 3 | 2 | 0% | 4.8 | 1 | 100% | 0 |
| ecal | art_school | Renens 18px | 1.15 | 38px | 1 | 3 | 2 | 0% | 28.3 | 1 | 96% | 0 |
| ensad | art_school | Bascule 16px | 1.80 | — | 1 | 5 | 5 | 0% | 7.8 | 1 | 0% | 2 |
| hfg-karlsruhe | art_school | ExecutiveLight 13px | 1.08 | 19px | 2 | 4 | 3 | 62% | 2 | 2 | 50% | 0 |
| pratt | art_school | Graphik 13px | 1.50 | 44px | 1 | 2 | 2 | 0% | 1.5 | 2 | 100% | 1 |
| rca | art_school | Source Sans 3 18px | 1.40 | — | 1 | 6 | 2 | 0% | 1.5 | 1 | 100% | 1 |
| rietveld | art_school | new rail 15px | 1.35 | — | 1 | 1 | 1 | 0% | 4 | 1 | 88% | 13 |
| risd | art_school | RISD Sans 16px | 1.15 | — | 3 | 6 | 2 | 65% | 5.5 | 1 | 100% | 0 |
| ual | art_school | HelveticaNeueLTPro-Md 22px | 1.20 | 36px | 2 | 4 | 3 | 0% | 0.8 | 2 | 100% | 0 |
| zhdk | art_school | Helvetica 13px | 1.40 | 42px | 1 | 2 | 2 | 0% | 1.1 | 1 | 100% | 0 |
| are-na | brand | areal 19px | 1.45 | 19px | 1 | 3 | 3 | 4% | 4.5 | 2 | 83% | 4 |
| basecamp | brand | Graphik 13px | 1.50 | 28px | 1 | 6 | 1 | 0% | 31.3 | 3 | 100% | 110 |
| bear | brand | bearsans 16px | 1.70 | 42px | 2 | 5 | 1 | 0% | 0.5 | 1 | 0% | 2 |
| ia | brand | iASansDay 15px | 1.35 | — | 2 | 4 | 3 | 2% | 1.8 | 1 | 0% | 5 |
| justfont | brand | genyogothictw 16px | 1.85 | 40px | 3 | 3 | 1 | 0% | 1 | 1 | 0% | 1 |
| linear | brand | Inter Variable 15px | 1.60 | 38px | 2 | 6 | 3 | 0% | 2 | 1 | 13% | 3 |
| muji-jp | brand | Helvetica Neue 14px | 1.40 | 16px | 1 | 5 | 5 | 0% | 23.8 | 1 | 100% | 0 |
| nendo | brand | -apple-system 12px | 1.50 | — | 2 | 4 | 2 | 0% | 0.8 | 2 | 67% | 0 |
| nippon-design-center | brand | custom-acumin-variable 16px | 1.60 | 16px | 2 | 1 | 1 | 0% | 0 | 0 | — | 0 |
| pentagram | brand | Plain 16px | 1.25 | 17px | 1 | 5 | 6 | 0% | 2.5 | 2 | 90% | 0 |
| stripe | brand | sohne-var 12px | 1.20 | 34px | 1 | 10 | 5 | 0% | 7 | 3 | 43% | 4 |
| teenage-engineering | brand | te-20 14px | 1.11 | — | 2 | 4 | 6 | 0% | 3.7 | 1 | 62% | 0 |
| things | brand | ui-sans-serif 20px | 1.30 | 20px | 1 | 6 | 3 | 0% | 1.3 | 1 | 20% | 1 |
| antgroup | fintech | -apple-system 13px | 1.54 | 22px | 2 | 4 | 2 | 0% | 4.2 | 1 | 63% | 8 |
| cmb | fintech | PingFang SC 12px | 1.33 | — | 1 | 4 | 1 | 0% | 7.6 | 1 | 75% | 16 |
| mercury | fintech | arcadia 16px | 1.35 | 28px | 2 | 5 | 7 | 0% | 1.5 | 1 | 0% | 2 |
| monzo | fintech | MonzoSansText 16px | 1.40 | 41px | 2 | 4 | 4 | 0% | 4.3 | 2 | 6% | 2 |
| n26 | fintech | N26 18px | 1.56 | 48px | 2 | 3 | 6 | 15% | 1.3 | 2 | 0% | 0 |
| wealthsimple | fintech | the-future 14px | 1.40 | 42px | 2 | 3 | 5 | 0% | 1.8 | 1 | 57% | 1 |
| webank | fintech | PingFangSC-Regular 14px | 1.54 | — | 3 | 4 | 2 | 0% | 6 | 2 | 100% | 1 |
| wise | fintech | Inter 17px | 1.51 | 46px | 2 | 3 | 4 | 35% | 2 | 2 | 0% | 2 |
| aeon | magazine | sansFont 16px | 1.50 | — | 3 | 7 | 6 | 73% | 0 | 0 | — | 1 |
| aiga-eye-on-design | magazine | MaisonNeueMedium 14px | 1.50 | 14px | 5 | 3 | 3 | 7% | 1.8 | 1 | 100% | 0 |
| apartamento | magazine | futura-pt 13px | 1.47 | — | 4 | 5 | 7 | 18% | 2.3 | 1 | 22% | 0 |
| baffler | magazine | system-ui 16px | 1.50 | 40px | 2 | 2 | 0 | 0% | 1 | 1 | 100% | 0 |
| eye-magazine | magazine | Georgia 14px | 1.29 | 14px 衬线 | 2 | 3 | 3 | 0% | 2.7 | 1 | 100% | 0 |
| ft-chinese | magazine | Helvetica Neue 16px | 1.61 | — | 2 | 3 | 4 | 4% | 2.5 | 1 | 100% | 1 |
| initium | magazine | Latin Quotes Fix 18px | 1.50 | 32px | 1 | 5 | 4 | 9% | 2 | 1 | 88% | 0 |
| its-nice-that | magazine | Labil 13px | 1.40 | — | 3 | 7 | 6 | 9% | 7.5 | 2 | 97% | 2 |
| kinfolk | magazine | Kinfolk-Serif-Deck 25px | 1.19 | 25px 衬线 | 3 | 2 | 3 | 0% | 3.8 | 1 | 100% | 0 |
| lrb | magazine | Quadraat 18px | 1.38 | 26px | 2 | 5 | 6 | 0% | 5.5 | 2 | 100% | 6 |
| monocle | magazine | Plantin 18px | 1.30 | — | 2 | 6 | 4 | 0% | 0.8 | 1 | 67% | 0 |
| n-plus-one | magazine | adelle-sans 16px | 1.40 | — | 1 | 4 | 4 | 8% | 7.3 | 2 | 97% | 0 |
| new-yorker | magazine | TNYAdobeCaslonPro 17px | 1.41 | — | 5 | 7 | 1 | 0% | 1.3 | 1 | 40% | 0 |
| nytimes-cn | magazine | PingFang SC 16px | 1.63 | 32px | 2 | 4 | 0 | 0% | 0 | 0 | — | 0 |
| paris-review | magazine | heldane 18px | 1.25 | 12px | 2 | 7 | 4 | 0% | 1.5 | 1 | 100% | 0 |
| sspai | magazine | -apple-system 15px | 1.50 | — | 2 | 6 | 3 | 0% | 7.8 | 2 | 42% | 2 |
| thetype | magazine | ABC Diatype 18px | 1.40 | — | 1 | 4 | 6 | 0% | 4.8 | 2 | 5% | 2 |
| twreporter | magazine | Roboto Slab 18px | 1.50 | — | 2 | 7 | 5 | 0% | 8.8 | 2 | 94% | 1 |
| cooper-hewitt | museum | CooperHewittDisplay 18px | 1.22 | 26px | 2 | 5 | 4 | 35% | 4.7 | 2 | 100% | 5 |
| moma | museum | MoMA Sans 16px | 1.33 | 32px | 1 | 3 | 6 | 4% | 1.3 | 2 | 80% | 0 |
| mplus-hk | museum | Simplistic 17px | 1.71 | — | 2 | 2 | 9 | 96% | 2 | 1 | 100% | 0 |
| psa-shanghai | museum | Gotham_Latin 12px | 1.00 | 24px | 1 | 1 | 1 | 0% | 4 | 1 | 100% | 0 |
| serpentine | museum | Noe Text 16px | 1.27 | 69px | 3 | 5 | 4 | 8% | 8.8 | 3 | 97% | 1 |
| sfmoma | museum | SFMOMASans 13px | 1.70 | 48px | 1 | 5 | 3 | 1% | 3 | 2 | 100% | 2 |
| taikwun | museum | ITC Avant Garde Gothic 20px | 1.20 | — | 2 | 12 | 5 | 0% | 9.9 | 1 | 100% | 2 |
| tate | museum | Tate regular 16px | 1.50 | 32px | 1 | 5 | 5 | 13% | 9.5 | 1 | 100% | 0 |
| teamlab | museum | Helvetica 12px | 1.60 | — | 1 | 3 | 1 | 0% | 0.3 | 1 | 100% | 0 |
| ucca | museum | FoundersGrotesk 16px | 1.44 | — | 1 | 5 | 3 | 13% | 0 | 0 | — | 0 |
| v-and-a | museum | Spiller 15px | 1.40 | 15px | 1 | 4 | 4 | 0% | 2.3 | 2 | 100% | 1 |
| vitra-design-museum | museum | VFuturaRegular 16px | 1.50 | — | 2 | 3 | 2 | 0% | 2.8 | 2 | 100% | 0 |
| walker | museum | ABC Walker 16px | 1.50 | — | 2 | 3 | 5 | 1% | 9.5 | 3 | 84% | 1 |
| brandur | personal | ui-serif 15px | 1.78 | — | 2 | 6 | 0 | 0% | 2.1 | 1 | 100% | 0 |
| craigmod | personal | ff-meta-serif-web-pro-1 16px | 1.55 | — | 2 | 5 | 3 | 25% | 1.8 | 1 | 57% | 3 |
| daringfireball | personal | Verdana 17px | 1.80 | — | 2 | 5 | 0 | 0% | 5 | 2 | 100% | 0 |
| frankchimero | personal | Courier 13px | 1.50 | 13px | 1 | 2 | 0 | 0% | 0 | 0 | — | 0 |
| gwern | personal | Source Serif 4 18px | 1.65 | 27px 衬线 | 2 | 2 | 1 | 0% | 4 | 1 | 100% | 0 |
| kottke | personal | neue-haas-unica 18px | 1.40 | — | 2 | 4 | 3 | 0% | 4.8 | 2 | 79% | 0 |
| paulgraham | personal | arial 15px | 1.20 | — | 1 | 2 | 5 | 2% | 0 | 0 | — | 0 |
| rsms | personal | Inter var 16px | 1.50 | 32px | 2 | 1 | 1 | 0% | 0.8 | 2 | 100% | 0 |

## 抓取失败

| 站点 | 视口 | 原因 |
| --- | --- | --- |
| stedelijk | desktop | page.evaluate: TypeError: Failed to execute 'createTreeWalker' on 'Document': parameter 1 is not of type 'Node'.
    at eval (eval at evaluate (:291:30), <anony |
| stedelijk | mobile | page.evaluate: TypeError: Failed to execute 'createTreeWalker' on 'Document': parameter 1 is not of type 'Node'.
    at eval (eval at evaluate (:291:30), <anony |
| psa-shanghai | desktop | page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.powerstationofart.com/", waiting until "domcontentloaded"[22m
 |
| muji-jp | desktop | page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.muji.com/jp/ja/store
Call log:
[2m  - navigating to "https://www.muji.com/jp/ja/store", waiting until " |
