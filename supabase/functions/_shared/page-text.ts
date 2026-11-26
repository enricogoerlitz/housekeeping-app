// A fetched recipe page as plain text for the model (spec 0040, REQ-001). Never rendered and
// never followed: the text goes to the model only, marked as data. Recipe sites usually carry a
// schema.org Recipe as JSON-LD, which is the most reliable part, so it comes first.

const MAX_CHARS = 20_000;

const NAMED: { [name: string]: string } = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  times: '×',
};

const BLOCK =
  /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|nav|main|aside|blockquote|pre|dd|dt|dl|figure|figcaption|hr)\b[^>]*>/gi;

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,10});/gi,
    (whole, body: string) => {
      if (body.startsWith('#')) {
        const code =
          body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return NAMED[body] ?? whole;
    },
  );
}

/** The JSON-LD blocks, each as it is (already JSON text). */
function jsonLd(html: string): string[] {
  const blocks: string[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    const block = (match[1] ?? '').trim();
    if (block) blocks.push(block.replace(/\s+/g, ' '));
  }
  return blocks;
}

function visibleText(html: string): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(BLOCK, '\n')
    .replace(/<[^>]*>/g, ' ')
    // A tag cut off at the end ("<b>Pfeffer" is fine, "<div class=" is not text).
    .replace(/<[^>]*$/, ' ');
  return decodeEntities(withoutHidden)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

/** JSON-LD first, then the visible text; whitespace collapsed, at most `maxChars` characters. */
export function pageText(html: string, maxChars = MAX_CHARS): string {
  const text = [...jsonLd(html), visibleText(html)].filter((part) => part !== '').join('\n');
  return Array.from(text).slice(0, maxChars).join('');
}
