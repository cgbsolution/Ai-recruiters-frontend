/**
 * Unit tests for the microphone-check matcher.
 *
 *   node scripts/micCheck.test.mjs
 *
 * No test runner and no build step: Node 24 strips the types out of
 * ../src/lib/micCheck.ts on import. That is why micCheck.ts must stay
 * import-free and erasable (no enums, namespaces or parameter properties).
 *
 * Every row of the spec's test table is here, plus a few regression guards for
 * the things that make the matcher tricky: split tokens, extra words, and the
 * exact recall values that sit on either side of the English threshold.
 */

import {
  MIC_CHECK_TARGETS,
  matchMicCheck,
  normalizeForMatch,
  isSuspiciousMicLabel,
} from "../src/lib/micCheck.ts";

let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks += 1;
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

/** A row of the spec's test table: language, transcript, expected verdict. */
function expectMatch(lang, transcript, expected, note) {
  const r = matchMicCheck(lang, transcript);
  const ok = r.pass === expected;
  const shown = transcript === "" ? "(empty string)" : transcript;
  check(
    ok,
    `[${lang}] ${expected ? "pass" : "fail"}: ${shown}${note ? `  — ${note}` : ""}`,
    ok
      ? ""
      : `got pass=${r.pass} recall=${r.recall.toFixed(3)} keyHits=${r.keyHits}/${r.keyTotal} tokens=${r.tokens} missed=[${r.missed.join(", ")}]`,
  );
}

function expectClose(actual, expected, label) {
  const ok = Math.abs(actual - expected) < 0.005;
  check(ok, label, ok ? "" : `got ${actual.toFixed(4)}, expected ~${expected}`);
}

function expectEqual(actual, expected, label) {
  const ok = actual === expected;
  check(ok, label, ok ? "" : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ── Spec §6.2 test table — English ───────────────────────────────────────────
console.log("\nEnglish sentence table");
expectMatch("en", "I am ready to begin my interview today.", true, "the sentence itself");
expectMatch("en", "I am reddy to begin my inter view to day", true, "misheard + split tokens");
expectMatch("en", "I'm ready to start my interview today", true, "3 key words plus others");
expectMatch("en", "I am ready", false, "1 key word");
expectMatch("en", "ready begin interview", false, "3 key words, no other words");
expectMatch("en", "the interview is today", false, "2 key words — background TV");
expectMatch("en", "hello can you hear me", false, "wrong sentence");
expectMatch("en", "uh", false, "a single noise token");
expectMatch("en", "", false, "silence");

// ── Spec §6.2 test table — Hindi ─────────────────────────────────────────────
console.log("\nHindi sentence table");
expectMatch("hi", "मेरी आवाज साफ सुनायी दे रहीं हैं।", true, "spelling variants + danda");
expectMatch("hi", "meri awaaz saaf sunai de rahi hai", true, "Roman transliteration");
expectMatch("hi", "क्या आप मुझे सुन सकते हैं", false, "सुन vs सुनाई similarity 0.6");
expectMatch("hi", "साफ़ सुनाई", false, "only 2 tokens");
expectMatch("hi", "मेरी आवाज़", false, "only 2 tokens");

// ── The thresholds themselves ────────────────────────────────────────────────
console.log("\nThreshold arithmetic (0.58 sits between 0.536 and 0.607)");
expectClose(matchMicCheck("en", "ready begin interview").recall, 3 / 5.6, "3 key words alone score 0.536");
expectClose(matchMicCheck("en", "i ready begin interview").recall, 3.4 / 5.6, "3 key words + 1 other score 0.607");
check(
  matchMicCheck("en", "i ready begin interview").pass,
  "[en] pass: i ready begin interview — the lowest passing score",
);

// ── Regression guards ────────────────────────────────────────────────────────
console.log("\nRegression guards");
expectMatch("en", "hello I am ready to begin my interview today", true, "extra words never cost anything");
expectMatch("en", "I am ready to be gin my inter view to day", true, "every content word split in two");
expectMatch("en", "today today today", false, "one word repeated is not the sentence");
expectMatch("hi", "मेरी आवाज़ साफ़ सुनाई दे रही है", true, "the Hindi sentence itself");
expectMatch("hi", "मेरी आवाज़ साफ़ नहीं", true, "2 key words + 1 other is enough in Hindi");
expectMatch("hi", "आवाज़ साफ़", false, "2 key words and nothing else");
expectMatch("hi", "नमस्ते मेरा नाम राहुल है", false, "wrong Hindi sentence");
expectMatch("xx", "I am ready to begin my interview today.", true, "unknown language falls back to English");
expectMatch("en", "I am ready to begin my interview tooday", true, "doubled letter from the recogniser");

console.log("\nNormalization");
expectEqual(normalizeForMatch("I'm Reddy!"), "i am redy", "apostrophe expansion, case, punctuation, repeats");
expectEqual(normalizeForMatch("I’m ready"), "i am ready", "curly apostrophe");
expectEqual(normalizeForMatch("आवाज़"), "आवाज", "nukta removed");
expectEqual(normalizeForMatch("सुनायी"), "सुनाई", "word-final यी → ई");
expectEqual(normalizeForMatch("हैं।"), "हैं", "danda stripped, anusvara kept");
expectEqual(normalizeForMatch("awaaz saaf"), "awaz saf", "repeated Latin letters collapsed");
// Matras are \p{M} — stripping them would turn सुनाई into सनई.
expectEqual(normalizeForMatch("सुनाई, दे."), "सुनाई दे", "matras survive punctuation stripping");

console.log("\nSentences and device labels");
expectEqual(MIC_CHECK_TARGETS.en.display, "I am ready to begin my interview today.", "English sentence");
expectEqual(MIC_CHECK_TARGETS.hi.roman, "Meri awaaz saaf sunai de rahi hai", "Hindi Roman line");
check(isSuspiciousMicLabel("Stereo Mix (Realtek Audio)"), "Stereo Mix flagged as system audio");
check(isSuspiciousMicLabel("CABLE Output (VB-Audio Virtual Cable)"), "virtual cable flagged");
check(!isSuspiciousMicLabel("Headset Microphone (2- Realtek(R) Audio)"), "a real headset is not flagged");
check(!isSuspiciousMicLabel(""), "an empty label is not flagged");

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log("micCheck: all good");
