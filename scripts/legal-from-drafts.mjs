/**
 * Turns the EN/IT legal drafts into the content the site renders.
 *
 * The drafts live in the product repo (`docs/legal/*.md`) because that is where
 * they are reviewed and where the facts they describe can be checked against the
 * code. This script is the one-way bridge: Markdown in, `src/data/legal-content.json`
 * out. Edit the drafts and re-run — never edit the JSON by hand, it is overwritten.
 *
 *   npm run legal            # default drafts dir: ../Sentinely/docs/legal
 *   npm run legal -- <dir>   # somewhere else
 *
 * ⚠️ Only the `## EN — …` and `## IT — …` sections are read. Everything else in a
 * draft — the internal note at the top, the appendix at the bottom holding the
 * cookie tables for services that are not switched on yet — stays out of the site
 * by construction. That is the whole point of the split: an internal note can say
 * "not for publication" and be believed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const draftsDir = resolve(process.argv[2] ?? join(here, '..', '..', 'Sentinely', 'docs', 'legal'));
const outFile = join(here, '..', 'src', 'data', 'legal-content.json');

/** Draft file → the key the site knows the document by. */
const DOCS = {
  privacy: 'PRIVACY-POLICY.md',
  terms: 'TERMS-OF-SERVICE.md',
  gdpr: 'GDPR-DPA.md',
  cookies: 'COOKIE-POLICY.md',
};

const LEAD = /^\*\*(?:Last updated|Ultimo aggiornamento):\s*(.+?)\*\*$/;

/** Markdown inline markup → HTML. Escaping comes first, so the source cannot inject tags. */
function inline(md) {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** A table row: `| a | b |` → ['a', 'b']. */
function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => inline(c.trim()));
}

/** One blank-line-separated block of Markdown → a renderable block, or null to skip. */
function toBlock(raw) {
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0 || lines[0].trim() === '---') return null;

  if (lines[0].trim().startsWith('|')) {
    const [head, , ...body] = lines;
    return { type: 'table', columns: cells(head), rows: body.map(cells) };
  }

  if (lines[0].trim().startsWith('- ')) {
    const items = [];
    for (const line of lines) {
      if (line.trim().startsWith('- ')) items.push(line.trim().slice(2));
      else items[items.length - 1] += ' ' + line.trim(); // wrapped continuation
    }
    return { type: 'list', items: items.map(inline) };
  }

  return { type: 'p', html: inline(lines.map((l) => l.trim()).join(' ')) };
}

/** One `## EN — Title` … section → the document as the site renders it. */
function parseLanguage(chunk) {
  const [headingLine, ...rest] = chunk.split('\n');
  const title = headingLine.replace(/^##\s*(EN|IT)\s*—\s*/, '').trim();

  const doc = { title, updated: '', intro: [], sections: [] };
  let current = null;

  for (const raw of rest.join('\n').split(/\n\s*\n/)) {
    const block = raw.trim();
    if (!block) continue;

    const lead = block.match(LEAD);
    if (lead) {
      doc.updated = lead[1].trim();
      continue;
    }

    if (block.startsWith('### ')) {
      current = { heading: block.slice(4).trim(), blocks: [] };
      doc.sections.push(current);
      continue;
    }

    const parsed = toBlock(block);
    if (!parsed) continue;
    if (current) current.blocks.push(parsed);
    else doc.intro.push(parsed); // everything before the first ### is the intro
  }

  return doc;
}

const out = { en: {}, it: {} };

for (const [key, file] of Object.entries(DOCS)) {
  const path = join(draftsDir, file);
  const source = readFileSync(path, 'utf8');

  for (const lang of ['en', 'it']) {
    const marker = new RegExp(`^## ${lang.toUpperCase()} —`, 'm');
    const start = source.search(marker);
    if (start === -1) throw new Error(`${file}: no "## ${lang.toUpperCase()} —" section`);

    // Up to the next `## ` heading — which is how the internal appendix stays out.
    const after = source.slice(start);
    const next = after.slice(1).search(/^## /m);
    const chunk = next === -1 ? after : after.slice(0, next + 1);

    const doc = parseLanguage(chunk);
    if (!doc.updated) throw new Error(`${file} (${lang}): no "Last updated" line`);
    if (doc.sections.length === 0) throw new Error(`${file} (${lang}): no sections`);
    out[lang][key] = doc;
  }
}

writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n', 'utf8');

for (const lang of ['en', 'it']) {
  for (const [key, doc] of Object.entries(out[lang])) {
    const blocks = doc.sections.reduce((n, s) => n + s.blocks.length, 0);
    console.log(
      `${lang}/${key.padEnd(8)} ${doc.updated.padEnd(34)} ${String(doc.sections.length).padStart(2)} sections, ${String(blocks).padStart(2)} blocks`,
    );
  }
}
console.log(`\nwrote ${outFile}`);
