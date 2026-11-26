// Writes docs/recipes/UEBERSICHT.md: every recipe file with Gang, Küche, variants and picture
// state, the open points (OFFEN) on top. Run from the repo root:
//   node .claude/skills/recipe-crud/scripts/overview.mjs
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';

const DOCS = 'docs/recipes';
const SKIP = ['README.md', 'UEBERSICHT.md'];
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return name === 'pictures' ? [] : walk(p);
    return name.endsWith('.md') && !SKIP.includes(name) ? [p] : [];
  });

const rows = walk(DOCS)
  .sort()
  .map((file) => {
    const text = readFileSync(file, 'utf8');
    const fm = parse(text.match(/^---\n([\s\S]*?)\n---/)[1]);
    const offen = [...text.matchAll(/^\s*(?:-\s*)?\**OFFEN:?\**\s*(.*)$/gim)].map((m) => m[1].trim());
    const rel = path.relative(DOCS, file);
    return { rel, folder: path.dirname(rel), fm, offen };
  });

const link = (r) => `[${r.fm.titel}](${r.rel.split('/').map(encodeURIComponent).join('/')})`;
const picture = (r) => {
  if (!r.fm.bild || !existsSync(path.join(DOCS, r.fm.bild))) return '–';
  return r.fm.bild_referenz ? 'verbessert' : 'neu';
};

let md = `# Übersicht der Rezepte\n\nErzeugt aus den Dateien (\`overview.mjs\` im Skill \`recipe-crud\`); nicht von Hand bearbeiten. ${rows.length} Dateien.\n\n`;
md += '## Zum Prüfen (OFFEN)\n\n';
for (const r of rows.filter((x) => x.offen.length)) md += `- ${link(r)}: ${r.offen.join(' · ')}\n`;
md += '\n## Umgebaut\n\n';
for (const r of rows.filter((x) => x.fm.umbau)) md += `- ${link(r)}: ${r.fm.umbau}\n`;
for (const folder of [...new Set(rows.map((r) => r.folder))]) {
  const list = rows.filter((r) => r.folder === folder);
  md += `\n## ${folder} (${list.length})\n\n| Rezept | Gang | Küche | Varianten | Bild |\n| --- | --- | --- | --- | --- |\n`;
  for (const r of list) {
    const gang = r.fm.gang ?? (r.fm.art === 'sammlung' ? 'Sammlung' : '');
    const variants = (r.fm.varianten ?? []).map((v) => (v.standard ? `**${v.name}**` : v.name)).join(', ');
    md += `| ${link(r)} | ${gang} | ${r.fm.kueche ?? ''} | ${variants} | ${picture(r)} |\n`;
  }
}
writeFileSync(path.join(DOCS, 'UEBERSICHT.md'), md);
console.log(`${rows.length} Dateien, ${rows.filter((r) => r.offen.length).length} mit OFFEN`);
