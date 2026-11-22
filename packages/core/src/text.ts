const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normalises a name for comparison: lower case, trimmed, inner whitespace collapsed,
 * ä→ae, ö→oe, ü→ue, ß→ss, other accents dropped. "  Möhren " → "moehren", "Crème" → "creme".
 */
export function normalizeText(text: string): string {
  return (
    text
      // Pasted text can carry umlauts as letter + combining mark; compose them first so the
      // replacements below see one character.
      .normalize('NFC')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * True when one of the names is the query, ignoring case and spaces at the edges: the add window
 * then offers no "+ „…“ als Rezept anlegen" for it (spec 0018, AC-018). An empty query is never a
 * hit.
 */
export function hasExactName(query: string, names: Iterable<string>): boolean {
  const key = (text: string) => text.trim().toLocaleLowerCase('de-DE');
  const wanted = key(query);
  if (wanted === '') return false;
  for (const name of names) if (key(name) === wanted) return true;
  return false;
}

/**
 * Edit distance between two strings: insertions, deletions, substitutions and swaps of two
 * neighbouring characters each count as one ("halumi" ↔ "halloumi" = 2, "tofu" ↔ "tfou" = 1).
 */
export function editDistance(a: string, b: string): number {
  const width = b.length + 1;
  const table: number[] = Array.from({ length: (a.length + 1) * width }, () => 0);
  const at = (i: number, j: number): number => table[i * width + j] ?? 0;

  for (let i = 0; i <= a.length; i++) table[i * width] = i;
  for (let j = 0; j <= b.length; j++) table[j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + substitution);
      const isSwap = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
      if (isSwap) best = Math.min(best, at(i - 2, j - 2) + 1);
      table[i * width + j] = best;
    }
  }
  return at(a.length, b.length);
}

/** Similarity of two already normalised strings, 0…1 (1 = equal). Tolerates typos. */
export function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  return longer === 0 ? 1 : 1 - editDistance(a, b) / longer;
}

// Below four characters a single typo changes too much of the word to tell it from another word.
const MIN_TYPO_QUERY_LENGTH = 4;
// A query that is still being typed is compared with the start of a word. With only four
// characters that would match everything sharing three letters ("brot" ↔ "Brokkoli").
const MIN_PARTIAL_QUERY_LENGTH = 5;

function isTypoOf(query: string, candidate: string): boolean {
  // Typos rarely hit the first letter, while most look-alike words differ exactly there
  // ("reis" ↔ "eis", "butter" ↔ "mutter").
  if (query[0] !== candidate[0]) return false;
  const allowed = Math.max(query.length, candidate.length) >= 7 ? 2 : 1;
  if (Math.abs(query.length - candidate.length) > allowed) return false;
  return editDistance(query, candidate) <= allowed;
}

/**
 * True when the query matches the target loosely: prefix or substring of the normalised target,
 * or a typo-tolerant match ("halumi" ↔ "Halloumi", "karoten" ↔ "Karotten") against the target,
 * one of its words, or the start of either.
 * Queries shorter than 3 characters only match as prefix of the target or of one of its words;
 * typos are tolerated from 4 characters on: one edit, two when the longer of both words has 7 or
 * more characters. An empty query matches everything.
 */
export function fuzzyIncludes(query: string, target: string): boolean {
  const q = normalizeText(query);
  const t = normalizeText(target);
  if (q === '') return true;

  const words = t.split(/[ -]+/).filter((word) => word !== '');
  if (q.length < 3) return t.startsWith(q) || words.some((word) => word.startsWith(q));
  if (t.includes(q)) return true;
  if (q.length < MIN_TYPO_QUERY_LENGTH) return false;

  const candidates = new Set([t, ...words]);
  if (q.length >= MIN_PARTIAL_QUERY_LENGTH) {
    for (const text of [t, ...words]) {
      for (const length of [q.length - 1, q.length, q.length + 1]) {
        if (length < text.length) candidates.add(text.slice(0, length));
      }
    }
  }
  return [...candidates].some((candidate) => isTypoOf(q, candidate));
}
