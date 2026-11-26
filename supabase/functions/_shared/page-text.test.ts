import { describe, expect, it } from 'vitest';

import { pageText } from './page-text.ts';

const RECIPE_PAGE = `<!doctype html>
<html><head>
<title>Linsensuppe | Chefkoch</title>
<style>body { color: red }</style>
<script>window.tracking = "nicht lesen";</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Linsensuppe","recipeIngredient":["250 g Linsen","1 Zwiebel"]}</script>
</head>
<body>
<!-- Kommentar: geheim -->
<nav>Menü</nav>
<h1>Linsensuppe &amp; Würstchen</h1>
<p>Zwiebel&nbsp;würfeln,<br>Linsen&#32;kochen &#x2013; fertig.</p>
<noscript>Bitte JavaScript</noscript>
<svg><text>Icon</text></svg>
<ul><li>Schritt 1</li><li>Schritt 2</li></ul>
</body></html>`;

describe('pageText (spec 0040: a recipe page as text for the model)', () => {
  it('puts the JSON-LD recipe first, then the visible text', () => {
    const text = pageText(RECIPE_PAGE);
    expect(text.startsWith('{"@context":"https://schema.org","@type":"Recipe"')).toBe(true);
    expect(text).toContain('Linsensuppe & Würstchen');
    expect(text).toContain('Zwiebel würfeln,\nLinsen kochen – fertig.');
    expect(text).toContain('Schritt 1\nSchritt 2');
  });

  it('drops scripts, styles, comments, noscript and svg', () => {
    const text = pageText(RECIPE_PAGE);
    for (const hidden of ['tracking', 'color: red', 'geheim', 'Bitte JavaScript', 'Icon'])
      expect(text).not.toContain(hidden);
  });

  it('collapses whitespace and cuts to maxChars', () => {
    expect(pageText('<p>a    b</p>\n\n\n\n<p>c</p>')).toBe('a b\nc');
    expect(pageText(`<p>${'x'.repeat(50)}</p>`, 10)).toBe('x'.repeat(10));
  });

  it('keeps an unknown entity as it is and survives broken markup', () => {
    expect(pageText('<p>Salz &unbekannt; <b>Pfeffer')).toBe('Salz &unbekannt; Pfeffer');
    expect(pageText('')).toBe('');
  });

  it('AC-007: a hostile page of 2 MB unclosed comments, scripts or brackets takes linear time', () => {
    const size = 2 * 1024 * 1024;
    for (const unit of ['<!--', '<script ', '<style>', '<', '<a ']) {
      const hostile = unit.repeat(Math.ceil(size / unit.length));
      const started = performance.now();
      pageText(`<p>Linsen</p>${hostile}`);
      expect(performance.now() - started, unit).toBeLessThan(1000);
    }
  });

  it('a JSON-LD block in the head counts; an unclosed hidden block ends the text', () => {
    const html =
      '<html><head><title>Dal</title><script type="application/ld+json">{"name":"Dal"}</script></head>' +
      '<body><p>Linsen</p><script>var x = "geheim"';
    const text = pageText(html);
    expect(text.split('\n')[0]).toBe('{"name":"Dal"}');
    expect(text).toContain('Linsen');
    expect(text).not.toContain('geheim');
  });
});
