/**
 * Microphone check — the pure half: the sentence the candidate reads aloud and
 * the matcher that decides whether a speech-to-text transcript is plausibly
 * that sentence being read.
 *
 * IMPORT-FREE and erasable-TypeScript only (no enums, no namespaces, no
 * parameter properties) on purpose: `scripts/micCheck.test.mjs` imports this
 * file directly under Node's type stripping, with no bundler and no build step.
 * Keep it that way — an `import` here would break `node scripts/micCheck.test.mjs`.
 *
 * The matcher has to tolerate what real, nervous, accented read-aloud speech
 * produces — a dropped word, a mis-recognised word, and tokens the recogniser
 * split or merged ("inter view", "to day") — while still rejecting a single
 * stray word, a background TV, or noise. So it scores *recall of content
 * words*, not string equality.
 */

export interface MicCheckWord {
  text: string;
  /** Content word: weight 1.0, and counted by `keyHits`. Others weigh 0.4. */
  key?: boolean;
  /** Extra spellings that count as an exact hit (variants, transliteration). */
  alts?: string[];
}

export interface MicCheckTarget {
  /** The sentence as shown to the candidate. */
  display: string;
  /** Roman transliteration, shown under a non-Latin sentence. */
  roman?: string;
  /** Plain-English gloss, shown under a non-English sentence. */
  gloss?: string;
  /** Minimum number of key words that must be heard. */
  keyMin: number;
  /** Minimum weighted recall that must be reached. */
  recallMin: number;
  words: MicCheckWord[];
}

export interface MicCheckResult {
  pass: boolean;
  /** Weighted share of the sentence that was heard, 0..1. */
  recall: number;
  keyHits: number;
  keyTotal: number;
  /** Number of tokens in the transcript (noise gives 0–2, silence 0). */
  tokens: number;
  /** Target words that were heard / not heard — for telemetry and debugging. */
  matched: string[];
  missed: string[];
}

/**
 * Both sentences are deliberately plain:
 *  - no numbers (Deepgram's `smart_format` turns spoken numbers into digits),
 *  - no proper nouns, no English loanwords in the Hindi one,
 *  - no content words with common sound-alikes (hear/here, for/four),
 *  - the Hindi one is gender-neutral (रही agrees with आवाज़, not the speaker).
 */
export const MIC_CHECK_TARGETS = {
  en: {
    display: "I am ready to begin my interview today.",
    keyMin: 3,
    recallMin: 0.58,
    words: [
      { text: "i" },
      { text: "am" },
      { text: "ready", key: true },
      { text: "to", alts: ["too", "two", "2"] },
      { text: "begin", key: true },
      { text: "my" },
      { text: "interview", key: true },
      { text: "today", key: true },
    ],
  },
  hi: {
    display: "मेरी आवाज़ साफ़ सुनाई दे रही है",
    roman: "Meri awaaz saaf sunai de rahi hai",
    gloss: "(My voice can be heard clearly)",
    // Looser than English: Deepgram's nova-2 Hindi word error rate is clearly
    // higher than its English, so the same strictness would fail people whose
    // microphone is fine.
    keyMin: 2,
    recallMin: 0.5,
    words: [
      { text: "मेरी", alts: ["meri"] },
      { text: "आवाज़", key: true, alts: ["अवाज", "awaz", "avaz"] },
      { text: "साफ़", key: true, alts: ["saf"] },
      { text: "सुनाई", key: true, alts: ["sunai", "sunayi"] },
      { text: "दे", alts: ["दें", "de"] },
      { text: "रही", alts: ["रहीं", "rahi"] },
      { text: "है", alts: ["हैं", "hai"] },
    ],
  },
} satisfies Record<string, MicCheckTarget>;

/** Widened view of the table so an arbitrary language string can index it. */
const TARGETS: Record<string, MicCheckTarget> = MIC_CHECK_TARGETS;

/** Unknown languages fall back to English, exactly like the Deepgram mapping. */
export function getMicCheckTarget(language: string | null | undefined): MicCheckTarget {
  return (language && TARGETS[language]) || MIC_CHECK_TARGETS.en;
}

const KEY_WEIGHT = 1;
const OTHER_WEIGHT = 0.4;
/** Below this length, edit distance is meaningless ("am"/"an", "my"/"by"). */
const FUZZY_MIN_LEN = 4;
const FUZZY_MIN_SIM = 0.75;
/** Deepgram emits 0–2 short tokens for noise; require more than that. */
const MIN_TOKENS = 3;

// ── Normalization ────────────────────────────────────────────────────────────
// The same pipeline runs over target words, alternates and the transcript, so
// a comparison is always like-for-like.

const CURLY_APOSTROPHE = /[‘’ʼ]/g;
/** Nukta — Deepgram spells आवाज़ / साफ़ with or without it. */
const NUKTA = /़/g;
/** Chandrabindu → anusvara, so हैं and हँ compare equal. */
const CHANDRABINDU = /ँ/g;
const ZERO_WIDTH = /[‌‍]/g;
/** ङ ञ ण न म + virama before a consonant is just an anusvara in disguise. */
const NASAL_VIRAMA = /[ङञणनम]्(?=[क-ह])/g;
/** Word-final यी → ई (सुनायी / सुनाई) and ये → ए. */
const FINAL_YI = /यी(?![\p{L}\p{M}])/gu;
const FINAL_YE = /ये(?![\p{L}\p{M}])/gu;
/** Collapse repeated characters: awaaz → awaz, saaf → saf. */
const REPEATED = /(.)\1+/g;
/**
 * Strip punctuation (including the danda ।॥) but KEEP combining marks.
 * Deliberately not `\w` or `[^\p{L}\p{N}]`: Devanagari vowel signs (matras)
 * are `\p{M}`, and deleting them would turn सुनाई into सनई.
 */
const PUNCTUATION = /[^\p{L}\p{M}\p{N}\s]/gu;

export function normalizeForMatch(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFC").toLowerCase();
  s = s.replace(CURLY_APOSTROPHE, "'");
  s = s.replace(/\bi'm\b/g, "i am").replace(/\bim\b/g, "i am");
  s = s.replace(NUKTA, "");
  s = s.replace(CHANDRABINDU, "ं");
  s = s.replace(ZERO_WIDTH, "");
  s = s.replace(NASAL_VIRAMA, "ं");
  s = s.replace(FINAL_YI, "ई");
  s = s.replace(FINAL_YE, "ए");
  s = s.replace(REPEATED, "$1");
  s = s.replace(PUNCTUATION, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function tokenizeForMatch(input: string): string[] {
  const normalized = normalizeForMatch(input);
  return normalized ? normalized.split(" ") : [];
}

// ── Similarity ───────────────────────────────────────────────────────────────

function codePoints(s: string): string[] {
  // Array.from splits on code points, so a surrogate pair counts as one — and
  // Devanagari matras stay as their own units, which is what we want to count.
  return Array.from(s);
}

export function levenshtein(a: string, b: string): number {
  const x = codePoints(a);
  const y = codePoints(b);
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;

  let prev: number[] = [];
  for (let j = 0; j <= y.length; j++) prev.push(j);

  for (let i = 1; i <= x.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur.push(Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost));
    }
    prev = cur;
  }
  return prev[y.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(codePoints(a).length, codePoints(b).length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Does `candidate` count as this target word? Exact against the word or any
 * alternate always counts; fuzzy only when BOTH strings are long enough for
 * edit distance to mean anything.
 */
function evaluateCandidate(variants: string[], candidate: string): { matched: boolean; sim: number } {
  const candLen = codePoints(candidate).length;
  let matched = false;
  let best = 0;
  for (const variant of variants) {
    if (variant === candidate) return { matched: true, sim: 1 };
    if (candLen >= FUZZY_MIN_LEN && codePoints(variant).length >= FUZZY_MIN_LEN) {
      const sim = similarity(variant, candidate);
      if (sim > best) best = sim;
      if (sim >= FUZZY_MIN_SIM) matched = true;
    }
  }
  return { matched, sim: best };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export function scoreAgainstTarget(target: MicCheckTarget, transcript: string): MicCheckResult {
  const tokens = tokenizeForMatch(transcript);
  const used: boolean[] = tokens.map(() => false);

  const entries = target.words.map((word, index) => {
    const variants: string[] = [];
    for (const raw of [word.text].concat(word.alts || [])) {
      const v = normalizeForMatch(raw);
      if (v && variants.indexOf(v) === -1) variants.push(v);
    }
    return { index, word, variants, len: codePoints(variants[0] || "").length, hit: false };
  });

  // Key words claim their tokens first, longest first, so a function word can
  // never eat the token a key word needed ("to" stealing the "to" of "to day").
  const order = entries.slice().sort((a, b) => {
    const ak = a.word.key ? 1 : 0;
    const bk = b.word.key ? 1 : 0;
    if (ak !== bk) return bk - ak;
    if (a.len !== b.len) return b.len - a.len;
    return a.index - b.index;
  });

  for (const entry of order) {
    let bestSim = -1;
    let bestSpan: number[] | null = null;
    for (let i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      const single = evaluateCandidate(entry.variants, tokens[i]);
      if (single.matched && single.sim > bestSim) {
        bestSim = single.sim;
        bestSpan = [i];
      }
      // Adjacent unused pair, joined — recovers "inter view", "to day", "be gin".
      if (i + 1 < tokens.length && !used[i + 1]) {
        const pair = evaluateCandidate(entry.variants, tokens[i] + tokens[i + 1]);
        if (pair.matched && pair.sim > bestSim) {
          bestSim = pair.sim;
          bestSpan = [i, i + 1];
        }
      }
    }
    if (bestSpan) {
      entry.hit = true;
      for (const i of bestSpan) used[i] = true;
    }
  }

  let total = 0;
  let got = 0;
  let keyHits = 0;
  let keyTotal = 0;
  const matched: string[] = [];
  const missed: string[] = [];

  for (const entry of entries) {
    const weight = entry.word.key ? KEY_WEIGHT : OTHER_WEIGHT;
    total += weight;
    if (entry.word.key) keyTotal += 1;
    if (entry.hit) {
      got += weight;
      if (entry.word.key) keyHits += 1;
      matched.push(entry.word.text);
    } else {
      missed.push(entry.word.text);
    }
  }

  const recall = total > 0 ? got / total : 0;
  const pass = tokens.length >= MIN_TOKENS && keyHits >= target.keyMin && recall >= target.recallMin;

  return { pass, recall, keyHits, keyTotal, tokens: tokens.length, matched, missed };
}

/** Score a transcript against the sentence for `language`. */
export function matchMicCheck(language: string | null | undefined, transcript: string): MicCheckResult {
  return scoreAgainstTarget(getMicCheckTarget(language), transcript);
}

/**
 * Devices that are almost certainly capturing system audio rather than a
 * person. Only ever used for an amber hint — never to block a candidate.
 */
const SUSPICIOUS_DEVICE = /stereo mix|what u hear|loopback|virtual|cable output/i;

export function isSuspiciousMicLabel(label: string | null | undefined): boolean {
  return !!label && SUSPICIOUS_DEVICE.test(label);
}
