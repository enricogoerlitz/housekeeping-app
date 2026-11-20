import { leadingNumberWordToDigits } from './amounts';

const SEPARATORS = /[,;\n]| und | sowie /i;
const FILLERS = /(?:^|\s)(?:bitte|noch)(?=[\s.!?:]|$)/gi;
const EDGE_PUNCTUATION = /^[\s.!?:]+|[\s.!?:]+$/g;

/**
 * Splits a dictated shopping request into item texts for the smart input:
 * "Milch, sechs Eier und Brot" → ["Milch", "6 Eier", "Brot"]. Splits on commas, semicolons, new
 * lines, "und" and "sowie"; drops the fillers "bitte" and "noch" and sentence punctuation; number
 * words at the start become digits.
 */
export function splitDictation(transcript: string): string[] {
  return transcript
    .split(SEPARATORS)
    .map((part) =>
      part.replace(FILLERS, ' ').replace(EDGE_PUNCTUATION, '').replace(/\s+/g, ' ').trim(),
    )
    .filter((part) => part !== '')
    .map(leadingNumberWordToDigits);
}
