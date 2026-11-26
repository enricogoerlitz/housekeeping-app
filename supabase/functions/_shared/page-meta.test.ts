import { describe, expect, it } from 'vitest';

import { durationMinutes, pageMeta } from './page-meta.ts';

// Spec 0049, REQ-002: what a result card shows of a recipe page — its schema.org Recipe (JSON-LD)
// and the page's og:image. Never rendered: the values go to the app as data.

const recipePage = `<!doctype html><html><head>
<meta property="og:image" content="https://img.chefkoch-cdn.de/og.jpg">
<meta name="description" content="Bolognese">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Chefkoch"},
  {"@type":["Recipe"],"name":"Spaghetti Bolognese &amp; mehr","image":[{"@type":"ImageObject","url":"https://img.chefkoch-cdn.de/rezept.jpg"}],
   "totalTime":"PT1H20M","aggregateRating":{"ratingValue":"4.7","ratingCount":"638"}}
]}</script></head><body>…</body></html>`;

describe('pageMeta', () => {
  it('AC-005: the recipe of a page: name, image, total time and rating', () => {
    expect(pageMeta(recipePage)).toEqual({
      ogImage: 'https://img.chefkoch-cdn.de/og.jpg',
      recipe: {
        name: 'Spaghetti Bolognese & mehr',
        imageUrl: 'https://img.chefkoch-cdn.de/rezept.jpg',
        totalMinutes: 80,
        rating: 4.7,
        ratingCount: 638,
      },
    });
  });

  it('takes a Recipe at the top level, an image as text and reviewCount', () => {
    const page = `<meta content="https://a.example/og.png" property='og:image' />
      <script type=application/ld+json>[{"@type":"Recipe","name":"Dal","image":"https://a.example/dal.jpg",
      "cookTime":"PT30M","prepTime":"PT10M","aggregateRating":{"ratingValue":4,"reviewCount":12}}]</script>`;
    expect(pageMeta(page).recipe).toEqual({
      name: 'Dal',
      imageUrl: 'https://a.example/dal.jpg',
      totalMinutes: 40,
      rating: 4,
      ratingCount: 12,
    });
  });

  it('AC-007: a page without a Recipe has none; broken JSON-LD is skipped', () => {
    const page = `<meta property="og:image" content="http://insecure.example/x.jpg">
      <script type="application/ld+json">{ kaputt</script>
      <script type="application/ld+json">{"@type":"Article","name":"20 Rezepte"}</script>`;
    expect(pageMeta(page)).toEqual({});
  });

  it('only https images; a rating outside 0–5 is left out', () => {
    const page = `<script type="application/ld+json">{"@type":"Recipe","name":"X","image":"javascript:alert(1)",
      "aggregateRating":{"ratingValue":"47","ratingCount":"-3"}}</script>`;
    expect(pageMeta(page).recipe).toEqual({ name: 'X' });
  });

  it('a hostile page costs linear time (2 MB of unclosed script tags)', () => {
    const started = Date.now();
    pageMeta('<script type="application/ld+json">'.repeat(60_000));
    pageMeta('<meta '.repeat(300_000));
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe('durationMinutes', () => {
  it('reads ISO 8601 durations', () => {
    expect(durationMinutes('PT45M')).toBe(45);
    expect(durationMinutes('P0DT1H5M')).toBe(65);
    expect(durationMinutes('PT2H')).toBe(120);
    expect(durationMinutes('45 Minuten')).toBeUndefined();
    expect(durationMinutes('PT0M')).toBeUndefined();
  });
});
