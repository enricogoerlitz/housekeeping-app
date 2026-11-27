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

/** Tags that end a line of text. */
const BLOCK = new Set(
  'p div br li ul ol h1 h2 h3 h4 h5 h6 tr td th table section article header footer nav main aside blockquote pre dd dt dl figure figcaption hr'.split(
    ' ',
  ),
);
/** Elements whose content is no text for the reader. */
const HIDDEN = new Set(['script', 'style', 'noscript', 'svg', 'template']);
const TAG_NAME = /^\/?([a-z][a-z0-9]*)/;
const JSON_LD = /\btype\s*=\s*["']?application\/ld\+json/;

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

/**
 * One pass over the page with indexOf only, so a hostile page (2 MB of "<!--" or "<script"
 * without an end) costs linear time — lazy regexes would search to the end from every opening
 * (security check of spec 0040). Comments and hidden elements are dropped, their JSON-LD kept;
 * an unclosed comment, hidden element or tag ends the text.
 */
function scan(html: string): { jsonLd: string[]; text: string } {
  const lower = html.toLowerCase();
  const jsonLd: string[] = [];
  const parts: string[] = [];
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf('<', at);
    if (open === -1) {
      parts.push(html.slice(at));
      break;
    }
    parts.push(html.slice(at, open));
    if (lower.startsWith('<!--', open)) {
      const end = lower.indexOf('-->', open + 4);
      if (end === -1) break;
      parts.push(' ');
      at = end + 3;
      continue;
    }
    const close = html.indexOf('>', open + 1);
    if (close === -1) break;
    const tag = lower.slice(open + 1, close);
    const name = TAG_NAME.exec(tag)?.[1] ?? '';
    at = close + 1;
    if (!tag.startsWith('/') && HIDDEN.has(name)) {
      const end = lower.indexOf(`</${name}`, at);
      const content = end === -1 ? '' : html.slice(at, end).trim();
      if (name === 'script' && content && JSON_LD.test(tag)) {
        jsonLd.push(content.replace(/\s+/g, ' '));
      }
      if (end === -1) break;
      const after = html.indexOf('>', end);
      at = after === -1 ? html.length : after + 1;
      parts.push(' ');
      continue;
    }
    parts.push(BLOCK.has(name) ? '\n' : ' ');
  }
  const text = decodeEntities(parts.join(''))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
  return { jsonLd, text };
}

/** JSON-LD first, then the visible text; whitespace collapsed, at most `maxChars` characters. */
export function pageText(html: string, maxChars = MAX_CHARS): string {
  const { jsonLd, text } = scan(html);
  const all = [...jsonLd, text].filter((part) => part !== '').join('\n');
  return Array.from(all).slice(0, maxChars).join('');
}
