// Measure abstract design tokens on public, human-designed pages and write them to a JSON
// library. Nothing from the pages is stored except computed numbers: font sizes, line heights,
// colour values, counts of boxes/shadows, paragraph measure. No text, HTML, CSS or images.
//
//   node scripts/design-corpus-extract.mjs --list design/reference-library/urls.txt \
//     --out design/reference-library/corpus.json [--thumbs ../review/corpus-thumbs] \
//     [--viewports desktop,mobile] [--concurrency 3] [--wait-selector css] [--timeout 30000]
//
// Lines in the list file: category<TAB>url<TAB>label. Requires headless Chrome (CHROME_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (key, fallback) => { const i = args.indexOf(`--${key}`); return i >= 0 ? args[i + 1] : fallback; };
const listFile = opt('list');
const outFile = opt('out', 'corpus.json');
const thumbDir = opt('thumbs', '');
const viewports = opt('viewports', 'desktop,mobile').split(',');
const concurrency = Number(opt('concurrency', 3));
const waitSelector = opt('wait-selector', '');
const timeout = Number(opt('timeout', 30000));
if (!listFile) { console.error('usage: --list urls.txt [--out corpus.json] [--thumbs dir] [--viewports desktop,mobile] [--concurrency 3] [--wait-selector css]'); process.exit(2); }

const entries = fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(line => {
  const [category, url, label] = line.split(/\t+/).map(s => s.trim());
  return { category, url, label: label || new URL(url).hostname.replace(/^www\./, '') };
});
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.3 },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
};

// Runs inside the page. Keep it self-contained: Playwright serialises the function source.
const extract = () => {
  const vw = innerWidth, vh = innerHeight, docH = document.documentElement.scrollHeight;
  const visible = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > -1 && r.top < vh * 4;
  };
  const toHsl = c => {
    const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    const [r, g, b] = [m[1], m[2], m[3]].map(x => Number(x) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
    return { h: Math.round(h * 360), s: Number(s.toFixed(3)), l: Number(l.toFixed(3)), a, hex: '#' + [m[1], m[2], m[3]].map(x => Math.round(Number(x)).toString(16).padStart(2, '0')).join('') };
  };
  const family = cs => cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const lineHeight = (cs, size) => cs.lineHeight === 'normal' ? 1.2 : Number((parseFloat(cs.lineHeight) / size).toFixed(2));

  // Text styles weighted by characters, so body copy dominates.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const styles = new Map(); const textColors = new Map(); let nodes = 0;
  while (walker.nextNode() && nodes < 4000) {
    const t = walker.currentNode; const txt = t.textContent.replace(/\s+/g, ' ').trim(); if (txt.length < 2) continue;
    const el = t.parentElement; if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg'].includes(el.tagName)) continue;
    if (!visible(el)) continue; nodes++;
    const cs = getComputedStyle(el); const size = parseFloat(cs.fontSize); const fam = family(cs); const lh = lineHeight(cs, size);
    const key = [fam, Math.round(size), cs.fontWeight, lh].join('|');
    const rec = styles.get(key) || { family: fam, size: Math.round(size), weight: cs.fontWeight, lineHeight: lh, letterSpacing: cs.letterSpacing, transform: cs.textTransform, chars: 0, nodes: 0 };
    rec.chars += txt.length; rec.nodes++; styles.set(key, rec);
    const col = toHsl(cs.color); if (col && col.a > 0) textColors.set(col.hex, (textColors.get(col.hex) || 0) + txt.length);
  }
  const textStyles = [...styles.values()].sort((a, b) => b.chars - a.chars);
  const totalChars = textStyles.reduce((s, x) => s + x.chars, 0) || 1;
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0, 30).map(h => {
    const cs = getComputedStyle(h); const size = parseFloat(cs.fontSize);
    return { tag: h.tagName.toLowerCase(), family: family(cs), size: Math.round(size), weight: cs.fontWeight, lineHeight: lineHeight(cs, size), letterSpacing: cs.letterSpacing, transform: cs.textTransform, color: toHsl(cs.color)?.hex };
  });

  // Backgrounds, boxes, shadows, radii, nesting.
  const all = [...document.body.querySelectorAll('*')].filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'path'].includes(el.tagName)).slice(0, 6000);
  const bgs = new Map(); const boxed = new Set(); const radiusHist = {}; let shadows = 0;
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect(); const area = r.width * r.height; if (area < 2500) continue;
    const cs = getComputedStyle(el); const bg = toHsl(cs.backgroundColor); const hasBg = !!bg && bg.a > 0.05;
    const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none');
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    if (hasBg) { const e = bgs.get(bg.hex) || { color: bg.hex, s: bg.s, l: bg.l, area: 0 }; e.area += area; bgs.set(bg.hex, e); }
    if (hasShadow) shadows++;
    const parentBg = el.parentElement ? toHsl(getComputedStyle(el.parentElement).backgroundColor) : null;
    const distinctBg = hasBg && (!parentBg || parentBg.a < 0.05 || parentBg.hex !== bg.hex);
    if ((hasBorder || hasShadow || distinctBg) && area < vw * vh * 0.9 && r.width < vw * 0.98) {
      boxed.add(el); const rad = Math.round(parseFloat(cs.borderTopLeftRadius) || 0);
      const bucket = rad === 0 ? '0' : rad <= 4 ? '1-4' : rad <= 8 ? '5-8' : rad <= 16 ? '9-16' : '17+';
      radiusHist[bucket] = (radiusHist[bucket] || 0) + 1;
    }
  }
  let maxBoxNesting = 0;
  for (const el of boxed) { let depth = 1, p = el.parentElement; while (p) { if (boxed.has(p)) depth++; p = p.parentElement; } maxBoxNesting = Math.max(maxBoxNesting, depth); }
  const bgList = [...bgs.values()].sort((a, b) => b.area - a.area).slice(0, 12); const bgTotal = bgList.reduce((s, x) => s + x.area, 0) || 1;
  const saturatedBgShare = bgList.filter(x => x.s > 0.35 && x.l > 0.15 && x.l < 0.9).reduce((s, x) => s + x.area, 0) / bgTotal;

  // Accent evidence: the most common link colour and button background.
  const mode = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const links = new Map(), buttons = new Map();
  for (const a of document.querySelectorAll('a')) { if (!visible(a)) continue; const c = toHsl(getComputedStyle(a).color); if (c) links.set(JSON.stringify({ hex: c.hex, s: c.s, l: c.l }), (links.get(JSON.stringify({ hex: c.hex, s: c.s, l: c.l })) || 0) + 1); }
  for (const b of document.querySelectorAll('button, input[type=submit], a[class*="btn"], a[class*="button"], a[class*="Button"]')) { if (!visible(b)) continue; const c = toHsl(getComputedStyle(b).backgroundColor); if (c && c.a > 0.05) { const k = JSON.stringify({ hex: c.hex, s: c.s, l: c.l }); buttons.set(k, (buttons.get(k) || 0) + 1); } }
  const paragraphs = [...document.querySelectorAll('p')].filter(p => visible(p) && p.textContent.trim().length > 80).map(p => Math.round(p.getBoundingClientRect().width)).sort((a, b) => a - b);

  return {
    title: document.title.slice(0, 80), vw, vh, docH, textNodes: nodes, totalChars,
    textStyles: textStyles.slice(0, 10).map(s => ({ ...s, share: Number((s.chars / totalChars).toFixed(3)) })),
    families: [...new Set(textStyles.map(s => s.family))].slice(0, 8), distinctTextColors: textColors.size,
    headings, bodyBg: toHsl(getComputedStyle(document.body).backgroundColor)?.hex, htmlBg: toHsl(getComputedStyle(document.documentElement).backgroundColor)?.hex,
    backgrounds: bgList.map(x => ({ color: x.color, s: x.s, l: x.l, share: Number((x.area / bgTotal).toFixed(3)) })), saturatedBgShare: Number(saturatedBgShare.toFixed(3)),
    boxes: boxed.size, shadows, radiusHist, maxBoxNesting,
    linkColor: mode(links) ? JSON.parse(mode(links)) : null, buttonBg: mode(buttons) ? JSON.parse(mode(buttons)) : null,
    medianParagraphWidth: paragraphs.length ? paragraphs[Math.floor(paragraphs.length / 2)] : null,
  };
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = []; let cursor = 0;
async function worker() {
  while (cursor < entries.length) {
    const entry = entries[cursor++];
    for (const vp of viewports) {
      const context = await browser.newContext({ ...VIEWPORTS[vp], locale: 'zh-CN', ignoreHTTPSErrors: true });
      const page = await context.newPage(); const rec = { ...entry, viewport: vp, ok: false, capturedAt: new Date().toISOString() };
      try {
        await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout });
        if (waitSelector) await page.waitForSelector(waitSelector, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2500); await page.keyboard.press('Escape').catch(() => {});
        Object.assign(rec, await page.evaluate(extract), { ok: true });
        if (thumbDir && vp === 'desktop') { fs.mkdirSync(thumbDir, { recursive: true }); const file = path.join(thumbDir, `${entry.label.replace(/[^a-z0-9.-]/gi, '_')}.png`); await page.screenshot({ path: file }); rec.thumb = path.basename(file); }
        const body = rec.textStyles?.[0]; console.log('ok  ', vp.padEnd(7), entry.label.padEnd(26), body ? `${body.family} ${body.size}px/${body.lineHeight}` : '');
      } catch (error) { rec.error = String(error?.message || error).slice(0, 160); console.log('fail', vp.padEnd(7), entry.label.padEnd(26), rec.error); }
      finally { await context.close(); }
      results.push(rec);
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
await browser.close();
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), note: '仅保存从公开页面计算出的抽象样式指标（字号、行距、颜色值、盒子数量等）；不保存页面文本、HTML、CSS 或图片。', entries: results }, null, 2));
console.log(`done: ${results.filter(r => r.ok).length}/${results.length} captures -> ${outFile}`);
