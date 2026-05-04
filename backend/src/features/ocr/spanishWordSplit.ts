import fs from 'node:fs';
import path from 'node:path';

// Wordninja-style word segmentation for run-together Spanish text.
//
// Background: the PP-OCRv4 latin recognition model bundled in
// `monkt/paddleocr-onnx` was trained without the space token in its
// dictionary, so each detected line comes back as one concatenated string
// (e.g. "Elabusosignificalaexplotación..."). This module restores word
// boundaries via dynamic programming over a Spanish word frequency table.

const FREQ_FILE_PRIMARY = path.resolve(process.cwd(), 'models', 'paddle', 'es_full.txt');
const FREQ_FILE_FALLBACK = path.resolve(process.cwd(), 'models', 'paddle', 'es_50k.txt');
const MIN_FREQ_FULL = 10; // filter es_full.txt noise (typos, single-occurrence proper nouns)
const MAX_WORD_LEN = 22;
const UNKNOWN_CHAR_COST = 9e6; // very high; per character of unparseable run

let costs: Map<string, number> | null = null;
let warnedMissing = false;

function loadCosts(): Map<string, number> {
  if (costs) return costs;
  let activeFile = '';
  let minFreq = 1;
  if (fs.existsSync(FREQ_FILE_PRIMARY)) {
    activeFile = FREQ_FILE_PRIMARY;
    minFreq = MIN_FREQ_FULL;
  } else if (fs.existsSync(FREQ_FILE_FALLBACK)) {
    activeFile = FREQ_FILE_FALLBACK;
    minFreq = 1;
  } else {
    if (!warnedMissing) {
      console.warn(
        `[spanishWordSplit] frequency files missing (looked for ${FREQ_FILE_PRIMARY} and ${FREQ_FILE_FALLBACK}); word splitting disabled`,
      );
      warnedMissing = true;
    }
    costs = new Map();
    return costs;
  }
  const lines = fs.readFileSync(activeFile, 'utf8').split('\n');
  const map = new Map<string, number>();
  let totalFreq = 0;
  const entries: Array<[string, number]> = [];
  for (const line of lines) {
    const [word, freqStr] = line.split(/\s+/);
    if (!word || !freqStr) continue;
    const freq = Number(freqStr);
    if (!Number.isFinite(freq) || freq < minFreq) continue;
    entries.push([word.toLowerCase(), freq]);
    totalFreq += freq;
  }
  // Cost = -log(probability). Lower freq => higher cost.
  const logTotal = Math.log(totalFreq);
  for (const [word, freq] of entries) {
    map.set(word, logTotal - Math.log(freq));
  }
  costs = map;
  console.log(`[spanishWordSplit] loaded ${map.size} words from ${path.basename(activeFile)}`);
  return map;
}

interface SegmentResult {
  text: string;
  unknownChars: number;
}

function segmentRun(run: string): SegmentResult {
  const dict = loadCosts();
  if (dict.size === 0 || run.length === 0) {
    return { text: run, unknownChars: 0 };
  }
  const lower = run.toLowerCase();
  const n = lower.length;
  const cost = new Float64Array(n + 1);
  const back = new Int32Array(n + 1);
  cost[0] = 0;
  for (let i = 1; i <= n; i++) {
    let best = Infinity;
    let bestJ = i - 1;
    const minJ = Math.max(0, i - MAX_WORD_LEN);
    for (let j = minJ; j < i; j++) {
      const piece = lower.slice(j, i);
      const dictCost = dict.get(piece);
      const stepCost = dictCost ?? UNKNOWN_CHAR_COST * (i - j);
      const total = cost[j] + stepCost;
      if (total < best) {
        best = total;
        bestJ = j;
      }
    }
    cost[i] = best;
    back[i] = bestJ;
  }
  const parts: string[] = [];
  let unknownChars = 0;
  let i = n;
  while (i > 0) {
    const j = back[i];
    const piece = run.slice(j, i);
    if (!dict.has(lower.slice(j, i))) unknownChars += i - j;
    parts.push(piece);
    i = j;
  }
  parts.reverse();
  return { text: parts.join(' '), unknownChars };
}

// Scan a recognition output string and segment any run of >= 4 consecutive
// letters that the dictionary doesn't recognize as a single word. Punctuation,
// digits, single-letter tokens, and existing spaces pass through untouched.
// Then a second pass tries to fuse adjacent short fragments back into known
// words — useful when Paddle inserted spaces inside a single real word
// (e.g. "ar tí cul o" → "artículo").
export function spanishSplitWords(input: string): string {
  if (!input) return input;
  const dict = loadCosts();
  let out = '';
  const re = /([\p{L}\p{N}À-ɏ'-]+)|([^\p{L}\p{N}À-ɏ'-]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const word = m[1];
    const sep = m[2];
    if (sep !== undefined) {
      out += sep;
      continue;
    }
    if (!word) continue;
    if (word.length <= 3) {
      out += word;
      continue;
    }
    if (dict.has(word.toLowerCase())) {
      out += word;
      continue;
    }
    const { text } = segmentRun(word);
    out += text;
  }
  return mergeAdjacentFragments(out, dict);
}

// Defragmenter: walks each line and tries to glue back together runs of short
// tokens (≤4 chars each) when the concatenation is a known Spanish word. Keeps
// case from the original tokens. Bounded to 6-token windows to keep this O(n).
function mergeAdjacentFragments(text: string, dict: Map<string, number>): string {
  if (dict.size === 0) return text;
  return text
    .split('\n')
    .map((line) => {
      // Split on whitespace but keep punctuation attached to tokens.
      const tokens = line.split(' ');
      const out: string[] = [];
      let i = 0;
      while (i < tokens.length) {
        let merged = false;
        const maxJ = Math.min(tokens.length, i + 6);
        // Try the longest window first so we prefer "artículo" over "artí".
        for (let j = maxJ; j > i + 1; j--) {
          const window = tokens.slice(i, j);
          if (!window.every((t) => t.length > 0 && t.length <= 4)) continue;
          // Refuse to merge any window where ALL tokens are individually known
          // Spanish words — that would happily fuse "a los" into "alos" using
          // typos that snuck into the subtitle-derived frequency table. We only
          // glue back fragments (at least one token must be a non-word).
          const allValid = window.every((t) => dict.has(t.toLowerCase()));
          if (allValid) continue;
          const candidate = window.join('');
          if (candidate.length < 4 || candidate.length > 22) continue;
          if (!/^[\p{L}\p{N}À-ɏ'-]+$/u.test(candidate)) continue;
          if (dict.has(candidate.toLowerCase())) {
            out.push(candidate);
            i = j;
            merged = true;
            break;
          }
        }
        if (!merged) {
          out.push(tokens[i]);
          i++;
        }
      }
      return out.join(' ');
    })
    .join('\n');
}
