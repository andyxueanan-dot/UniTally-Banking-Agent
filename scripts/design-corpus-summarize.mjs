// Turn design-corpus-extract.mjs output into a readable library summary plus a derived token brief.
//
//   node scripts/design-corpus-summarize.mjs design/reference-library/corpus.json design/reference-library/summary.md \
//     [--compare review/finpilot-metrics.json] [--brief design/reference-library/brief.json]
import fs from 'node:fs';

const args = process.argv.slice(2);
const corpusFile = args[0]; const outFile = args[1] || 'summary.md';
const flag = key => { const i = args.indexOf(`--${key}`); return i >= 0 ? args[i + 1] : null; };
const compareFile = flag('compare'); const briefFile = flag('brief');
if (!corpusFile) { console.error('usage: corpus.json summary.md [--compare metrics.json] [--brief brief.json]'); process.exit(2); }
const load = file => JSON.parse(fs.readFileSync(file, 'utf8')).entries.filter(e => e.ok && e.textStyles?.length);
const corpus = load(corpusFile); const compare = compareFile ? load(compareFile) : [];

const SANS = /sans|grotesk|grotesque|helvetica|arial|\binter\b|roboto|segoe|system|ui-|verdana|tahoma|\blato\b|noto sans|source sans|plex sans|sf pro|pingfang|hiragino sans|yahei|heiti|gothic|futura|avenir|gill|univers|akzidenz|graphik|s[oö]hne|suisse|neue|dm sans|work sans|manrope|montserrat|poppins|nunito|karla|rubik|mulish|figtree|geist|instrument sans|aktiv|circular|maison|founders|basis|atlas|calibre|national|favorit|untitled|apercu|aeonik|roobert|diatype|px grotesk|blinkmac|-apple-system|microsoft yahei|wenquanyi|source han sans|dengxian|simhei|kaiti|fangsong/i;
const SERIF = /serif|georgia|times|garamond|baskerville|caslon|didot|tiempos|freight|lyon|mercury|minion|playfair|spectral|song|mincho|\bming\b|bodoni|cambria|charter|literata|\blora\b|merriweather|crimson|cormorant|libre|newsreader|fraunces|canela|sectra|signifier|reckless|editorial|domaine|portrait|\bogg\b|romie|sabon|plantin|miller|escrow|chronicle|ivar|publico|guardian|feijoa|austin|schnyder|iowan|palatino|book antiqua|hoefler|pt serif|roboto serif|plex serif|eb garamond|cardo|vollkorn|gentium|alegreya|zilla|bitter|\barvo\b|rockwell|clarendon|egyptienne|sentinel|archer|simsun|songti|stsong|fangsong|kaiti|source han serif|noto serif/i;
const isSerif = f => !!f && !SANS.test(f) && SERIF.test(f);
const num = a => a.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y);
const median = a => { const s = num(a); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { const s = num(a); if (!s.length) return null; return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const share = a => { const s = a.filter(x => x !== null && x !== undefined); return s.length ? s.filter(Boolean).length / s.length : null; };
const fmt = (v, d = 0) => v === null || v === undefined ? '—' : typeof v === 'number' ? v.toFixed(d) : String(v);
const pct = v => v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
const neutral = c => !c || c.l < 0.14 || c.l > 0.92 || c.s < 0.12;

const site = e => {
  const body = e.textStyles.find(s => s.size >= 12 && s.size <= 26) || e.textStyles[0];
  const h1 = e.headings.find(h => h.tag === 'h1'); const h2 = e.headings.find(h => h.tag === 'h2');
  const r = e.radiusHist || {}; const rTotal = Object.values(r).reduce((s, x) => s + x, 0);
  const screens = Math.max(1, Math.min(e.docH, e.vh * 4) / e.vh);
  const bodyBgHsl = e.backgrounds.find(b => b.color === e.bodyBg) || null;
  return {
    label: e.label, category: e.category, viewport: e.viewport, url: e.url,
    bodyFamily: body.family, bodySize: body.size, bodyLH: body.lineHeight, bodyWeight: Number(body.weight) || null, bodySerif: isSerif(body.family),
    h1Size: h1?.size ?? null, h1Ratio: h1 ? Number((h1.size / body.size).toFixed(2)) : null, h1Serif: h1 ? isSerif(h1.family) : null, h1Weight: h1 ? Number(h1.weight) : null,
    h2Size: h2?.size ?? null, h2Ratio: h2 ? Number((h2.size / body.size).toFixed(2)) : null,
    fonts: e.families.length, textColors: e.distinctTextColors, backgrounds: e.backgrounds.length, saturatedBg: e.saturatedBgShare,
    bodyBgWhite: e.bodyBg ? (bodyBgHsl ? bodyBgHsl.l > 0.93 && bodyBgHsl.s < 0.12 : /^#f[6-9a-f]f[6-9a-f]f[6-9a-f]$/i.test(e.bodyBg)) : null,
    boxes: e.boxes, boxesPerScreen: Number((e.boxes / screens).toFixed(1)), shadows: e.shadows, nesting: e.maxBoxNesting,
    flatRadius: rTotal ? Number((((r['0'] || 0) + (r['1-4'] || 0)) / rTotal).toFixed(2)) : null,
    measure: e.medianParagraphWidth, smallText: Number(e.textStyles.filter(s => s.size < 12).reduce((s, x) => s + x.share, 0).toFixed(3)),
    accentS: e.buttonBg && !neutral(e.buttonBg) ? e.buttonBg.s : null, accentL: e.buttonBg && !neutral(e.buttonBg) ? e.buttonBg.l : null, buttonNeutral: e.buttonBg ? neutral(e.buttonBg) : null,
    linkS: e.linkColor ? e.linkColor.s : null,
  };
};
const rows = corpus.map(site); const cmpRows = compare.map(site);
const by = (list, vp) => list.filter(r => r.viewport === vp);
const summarize = list => ({
  n: list.length,
  bodySize: median(list.map(r => r.bodySize)), bodySizeP25: quantile(list.map(r => r.bodySize), 0.25), bodySizeP75: quantile(list.map(r => r.bodySize), 0.75),
  bodyLH: median(list.map(r => r.bodyLH)), bodySerif: share(list.map(r => r.bodySerif)),
  h1Ratio: median(list.map(r => r.h1Ratio)), h1Size: median(list.map(r => r.h1Size)), h1Serif: share(list.map(r => r.h1Serif)), h2Ratio: median(list.map(r => r.h2Ratio)),
  fonts: median(list.map(r => r.fonts)), textColors: median(list.map(r => r.textColors)), backgrounds: median(list.map(r => r.backgrounds)),
  saturatedBg: median(list.map(r => r.saturatedBg)), saturatedSites: share(list.map(r => r.saturatedBg > 0.2)), whiteBody: share(list.map(r => r.bodyBgWhite)),
  boxes: median(list.map(r => r.boxes)), boxesPerScreen: median(list.map(r => r.boxesPerScreen)), nesting: median(list.map(r => r.nesting)), deepNesting: share(list.map(r => r.nesting >= 3)),
  flatRadius: median(list.map(r => r.flatRadius)), shadows: median(list.map(r => r.shadows)), measure: median(list.map(r => r.measure)), smallText: median(list.map(r => r.smallText)),
  accentS: median(list.map(r => r.accentS)), accentL: median(list.map(r => r.accentL)), neutralButtons: share(list.map(r => r.buttonNeutral)), linkS: median(list.map(r => r.linkS)),
});
const metricRows = s => [
  ['正文字号（中位数 / 四分位）', `${fmt(s.bodySize)}px（${fmt(s.bodySizeP25)}–${fmt(s.bodySizeP75)}）`],
  ['正文行距（倍数）', fmt(s.bodyLH, 2)], ['正文用衬线体的站点占比', pct(s.bodySerif)],
  ['h1 / 正文 字号比', fmt(s.h1Ratio, 2)], ['h1 字号中位数', `${fmt(s.h1Size)}px`], ['h1 用衬线体的站点占比', pct(s.h1Serif)], ['h2 / 正文 字号比', fmt(s.h2Ratio, 2)],
  ['字体家族数', fmt(s.fonts)], ['文字颜色数', fmt(s.textColors)], ['大面积背景色数', fmt(s.backgrounds)],
  ['高饱和背景占比（中位数）', pct(s.saturatedBg)], ['高饱和背景超过 20% 面积的站点', pct(s.saturatedSites)], ['页面底色为白/近白的站点', pct(s.whiteBody)],
  ['盒子数（有边框/阴影/独立底色的块）', fmt(s.boxes)], ['每屏盒子数', fmt(s.boxesPerScreen, 1)], ['盒子最大嵌套深度', fmt(s.nesting)], ['嵌套深度 ≥3 的站点', pct(s.deepNesting)],
  ['圆角 ≤4px 的盒子占比', pct(s.flatRadius)], ['阴影数量', fmt(s.shadows)], ['段落宽度中位数', s.measure ? `${fmt(s.measure)}px` : '—'], ['12px 以下文字的字符占比', pct(s.smallText)],
  ['按钮强调色饱和度（排除黑白灰）', fmt(s.accentS, 2)], ['按钮强调色明度', fmt(s.accentL, 2)], ['主要按钮是黑/白/灰的站点', pct(s.neutralButtons)], ['链接颜色饱和度', fmt(s.linkS, 2)],
];
const table = (headers, body) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...body.map(r => `| ${r.join(' | ')} |`)].join('\n');

const desktop = by(rows, 'desktop'); const mobile = by(rows, 'mobile');
const sd = summarize(desktop); const sm = summarize(mobile);
const categories = [...new Set(rows.map(r => r.category))];
const famCount = new Map(); for (const r of mobile.length ? mobile : desktop) famCount.set(r.bodyFamily, (famCount.get(r.bodyFamily) || 0) + 1);
const topFamilies = [...famCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

const brief = {
  generatedAt: new Date().toISOString(), sites: { desktop: sd.n, mobile: sm.n },
  mobile: { bodyPx: Math.round(sm.bodySize), lineHeight: Math.round(sm.bodyLH * 20) / 20, h1Px: Math.round(sm.bodySize * sm.h1Ratio), h2Px: Math.round(sm.bodySize * sm.h2Ratio), smallTextShare: sm.smallText, textColors: sm.textColors, boxesPerScreen: sm.boxesPerScreen, nesting: sm.nesting, flatRadiusShare: sm.flatRadius, shadows: sm.shadows, saturatedBgShare: sm.saturatedBg, whiteBodyShare: sm.whiteBody, serifHeadingShare: sm.h1Serif, accentSaturation: sm.accentS, accentLightness: sm.accentL, neutralButtonShare: sm.neutralButtons },
  desktop: { bodyPx: Math.round(sd.bodySize), lineHeight: Math.round(sd.bodyLH * 20) / 20, measurePx: sd.measure, h1Px: sd.h1Size, h1Ratio: sd.h1Ratio },
  topBodyFamilies: topFamilies,
};

const lines = [];
lines.push('# 设计参考库：人类设计页面的客观指标', '', `生成时间 ${brief.generatedAt}。来源 ${corpusFile}；成功抓取 桌面 ${sd.n} 站、手机 ${sm.n} 站。只保存计算出的指标，不保存页面内容。`, '',
  '度量口径：正文 = 字符数最多的文本样式（字号 12–26px）；盒子 = 有边框、阴影或与父元素不同底色、且面积大于 2500px² 的块；高饱和背景 = 大面积底色中 HSL 饱和度 > 0.35 且明度在 0.15–0.9 之间的面积占比；嵌套深度 = 盒子套盒子的最大层数。', '');
lines.push('## 一、总体（手机视口 390px）', '', table(['指标', '手机'], metricRows(sm)), '');
lines.push('## 二、总体（桌面视口 1440px）', '', table(['指标', '桌面'], metricRows(sd)), '');
lines.push('## 三、分类别（手机视口）', '', table(['类别', '站点数', '正文字号', '行距', 'h1/正文', '文字颜色数', '每屏盒子', '嵌套', '圆角≤4px', '高饱和背景', '标题衬线'],
  categories.map(c => { const s = summarize(by(rows.filter(r => r.category === c), 'mobile')); return [c, s.n, fmt(s.bodySize), fmt(s.bodyLH, 2), fmt(s.h1Ratio, 2), fmt(s.textColors), fmt(s.boxesPerScreen, 1), fmt(s.nesting), pct(s.flatRadius), pct(s.saturatedBg), pct(s.h1Serif)]; })), '');
lines.push('## 四、正文字体榜（手机视口，按站点数）', '', table(['字体', '站点数'], topFamilies.map(([f, n]) => [f, n])), '');
if (cmpRows.length) {
  lines.push('## 五、用同一把尺子量 FinPilot', '', table(['指标', '参考库手机中位数', ...cmpRows.map(r => r.label)], [
    ['正文字号', `${fmt(sm.bodySize)}px`, ...cmpRows.map(r => `${r.bodySize}px`)],
    ['正文行距', fmt(sm.bodyLH, 2), ...cmpRows.map(r => fmt(r.bodyLH, 2))],
    ['h1 字号', `${fmt(sm.bodySize * sm.h1Ratio)}px`, ...cmpRows.map(r => r.h1Size ? `${r.h1Size}px` : '—')],
    ['12px 以下文字占比', pct(sm.smallText), ...cmpRows.map(r => pct(r.smallText))],
    ['文字颜色数', fmt(sm.textColors), ...cmpRows.map(r => r.textColors)],
    ['大面积背景色数', fmt(sm.backgrounds), ...cmpRows.map(r => r.backgrounds)],
    ['高饱和背景占比', pct(sm.saturatedBg), ...cmpRows.map(r => pct(r.saturatedBg))],
    ['每屏盒子数', fmt(sm.boxesPerScreen, 1), ...cmpRows.map(r => r.boxesPerScreen)],
    ['盒子最大嵌套深度', fmt(sm.nesting), ...cmpRows.map(r => r.nesting)],
    ['圆角 ≤4px 的盒子占比', pct(sm.flatRadius), ...cmpRows.map(r => pct(r.flatRadius))],
    ['阴影数量', fmt(sm.shadows), ...cmpRows.map(r => r.shadows)],
    ['字体家族数', fmt(sm.fonts), ...cmpRows.map(r => r.fonts)],
  ]), '');
}
lines.push(`## ${cmpRows.length ? '六' : '五'}、派生的设计令牌（手机）`, '', '```json', JSON.stringify(brief.mobile, null, 2), '```', '', '解释：这些数值是参考库的中位数，不是某一个站点的样式；用它们约束生成或修改页面时的字号、行距、颜色数、盒子数和圆角。', '');
lines.push(`## ${cmpRows.length ? '七' : '六'}、逐站明细（手机视口）`, '', table(['站点', '类别', '正文', '行距', 'h1', '字体数', '文字色', '背景色', '高饱和', '盒子/屏', '嵌套', '圆角≤4', '阴影'],
  mobile.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label)).map(r => [r.label, r.category, `${r.bodyFamily} ${r.bodySize}px`, fmt(r.bodyLH, 2), r.h1Size ? `${r.h1Size}px${r.h1Serif ? ' 衬线' : ''}` : '—', r.fonts, r.textColors, r.backgrounds, pct(r.saturatedBg), r.boxesPerScreen, r.nesting, pct(r.flatRadius), r.shadows])), '');
const failed = JSON.parse(fs.readFileSync(corpusFile, 'utf8')).entries.filter(e => !e.ok);
if (failed.length) lines.push('## 抓取失败', '', table(['站点', '视口', '原因'], failed.map(f => [f.label, f.viewport, (f.error || '').replace(/\|/g, '/')])), '');
fs.writeFileSync(outFile, lines.join('\n'));
if (briefFile) fs.writeFileSync(briefFile, JSON.stringify(brief, null, 2));
console.log(`summary -> ${outFile}${briefFile ? `, brief -> ${briefFile}` : ''}; sites desktop ${sd.n}, mobile ${sm.n}`);
