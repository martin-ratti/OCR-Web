import fs from 'node:fs';
import path from 'node:path';

// Wordninja-style word segmentation for run-together Spanish text.
//
// Background: the PP-OCRv4 latin recognition model bundled in
// `monkt/paddleocr-onnx` was trained without the space token in its
// dictionary, so each detected line comes back as one concatenated string
// (e.g. "Elabusosignificalaexplotación..."). This module restores word
// boundaries via dynamic programming over a Spanish word frequency table.

const FREQ_FILE = path.resolve(process.cwd(), 'models', 'paddle', 'es_50k.txt');
const MAX_WORD_LEN = 22;
const UNKNOWN_CHAR_COST = 9e6; // very high; per character of unparseable run

let costs: Map<string, number> | null = null;
let warnedMissing = false;

function loadCosts(): Map<string, number> {
  if (costs) return costs;
  if (!fs.existsSync(FREQ_FILE)) {
    if (!warnedMissing) {
      console.warn(`[spanishWordSplit] frequency file missing at ${FREQ_FILE}; word splitting disabled`);
      warnedMissing = true;
    }
    costs = new Map();
    return costs;
  }
  const lines = fs.readFileSync(FREQ_FILE, 'utf8').split('\n');
  const map = new Map<string, number>();
  let totalFreq = 0;
  const entries: Array<[string, number]> = [];
  for (const line of lines) {
    const [word, freqStr] = line.split(/\s+/);
    if (!word || !freqStr) continue;
    const freq = Number(freqStr);
    if (!Number.isFinite(freq) || freq <= 0) continue;
    entries.push([word.toLowerCase(), freq]);
    totalFreq += freq;
  }
  // Cost = -log(probability). Lower freq => higher cost.
  const logTotal = Math.log(totalFreq);
  for (const [word, freq] of entries) {
    map.set(word, logTotal - Math.log(freq));
  }
  costs = map;
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
export function spanishSplitWords(input: string): string {
  if (!input) return input;
  loadCosts();
  // Tokenize: a "letter run" is a maximal run of unicode letters/digits/dashes;
  // everything else (spaces, punctuation) is preserved verbatim.
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
    if (costs && costs.has(word.toLowerCase())) {
      out += word;
      continue;
    }
    const { text } = segmentRun(word);
    out += text;
  }
  return out;
}
