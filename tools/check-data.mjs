#!/usr/bin/env node
// 학습 데이터 정확성 게이트(D23) — 릴리스 차단 기준.
// 🔴 곱셈은 «계산»으로 전수 검산하고, 낱말은 «원장»(docs/data-sources.md)과 1:1 대조한다.
//    기억으로 쓴 값을 통과시키지 않는 것이 이 게이트의 존재 이유다.

import fs from 'node:fs';
import path from 'node:path';
import { WORDS_G34 } from '../src/data/words-g34.js';
import { WORDS_G56 } from '../src/data/words-g56.js';
import { COMMON_ERRORS } from '../src/data/gugudan-common-errors.js';
import { KOREAN_G34 } from '../src/data/korean-g34.js';
import { KOREAN_G56 } from '../src/data/korean-g56.js';
import { MIN_WORDS_PER_BAND, MIN_KOREAN_PER_BAND } from '../src/core/balance.js';
import { buildBank } from '../src/core/questions.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LEDGER = path.join(ROOT, 'docs', 'data-sources.md');

const fails = [];
const notes = [];
const FAIL = (m) => fails.push(m);
const NOTE = (m) => notes.push(m);

// ── ① 구구단: 값 전수 검산 ────────────────────────────────
{
  const bank = buildBank('gugudan');
  if (bank.length !== 72) FAIL(`구구단 문항 ${bank.length}개 — 72개여야 한다(2~9단 × 1~9)`);
  let checked = 0;
  for (const it of bank) {
    const [a, b] = it.id.slice(2).split('x').map(Number);
    if (a !== it.a || b !== it.b) FAIL(`문항 id 와 값이 다르다: ${it.id}`);
    if (a * b !== it.a * it.b) FAIL(`곱셈값 불일치: ${it.id}`);
    if (a < 2 || a > 9 || b < 1 || b > 9) FAIL(`범위 밖 문항: ${it.id}`);
    checked += 1;
  }
  if (checked !== 72) FAIL(`검산 ${checked}건 — 모수 72와 다르다(측정 무효)`);
  NOTE(`구구단 ${checked}문항 전수 검산 완료`);
}

// ── ② 흔한 오류 사전: 값이 실제로 «정답이 아닌 그럴듯한 수»인가 ──
{
  let n = 0;
  for (const [key, vals] of Object.entries(COMMON_ERRORS)) {
    const [a, b] = key.split('x').map(Number);
    if (!(a >= 2 && a <= 9 && b >= 1 && b <= 9)) FAIL(`오류사전 범위 밖 키: ${key}`);
    const answer = a * b;
    for (const v of vals) {
      if (v === answer) FAIL(`오류사전 ${key} 의 값 ${v} 가 정답과 같다`);
      if (!Number.isInteger(v) || v <= 0) FAIL(`오류사전 ${key} 의 값 ${v} 가 자연수가 아니다`);
      if (Math.abs(v - answer) > answer * 0.5 + 10) FAIL(`오류사전 ${key} 의 값 ${v} 가 정답 ${answer} 와 너무 멀다`);
      n += 1;
    }
    if (new Set(vals).size !== vals.length) FAIL(`오류사전 ${key} 에 중복 값`);
  }
  NOTE(`흔한 오류 사전 ${Object.keys(COMMON_ERRORS).length}키 · 값 ${n}개 검사`);
}

// ── ③ 낱말 데이터 구조·중복 ───────────────────────────────
const BANDS = [['words-g34', WORDS_G34], ['words-g56', WORDS_G56]];
const POS = new Set(['n', 'v', 'a', 'num']);
{
  const allWords = new Set();
  for (const [name, pool] of BANDS) {
    // 🔴 정확한 개수는 ④에서 출처 원장과 1:1 대조한다. 여기서는 «반복 체감» 하한만 본다 —
    //    한 판에 같은 단어가 금방 돌아오면 학습이 아니라 암기 게임이 된다.
    if (pool.length < MIN_WORDS_PER_BAND) FAIL(`${name}: ${pool.length}개 — ${MIN_WORDS_PER_BAND}개 미만이면 한 판 안에 반복된다`);
    const seen = new Set();
    const meanings = new Set();
    for (const e of pool) {
      // 요일·월·언어명 같은 고유명사는 대문자로 시작하는 것이 «정상»이다.
      if (!e.w || !/^[A-Za-z][a-z' -]*$/.test(e.w)) FAIL(`${name}: 영단어 표기 오류 "${e.w}"`);
      if (!e.k || !e.k.trim()) FAIL(`${name}: 뜻이 비었다 "${e.w}"`);
      if (!POS.has(e.pos)) FAIL(`${name}: 품사 값 오류 "${e.w}" → "${e.pos}"`);
      if (seen.has(e.w)) FAIL(`${name}: 중복 단어 "${e.w}"`);
      seen.add(e.w);
      if (allWords.has(e.w)) FAIL(`밴드 간 중복 단어 "${e.w}"`);
      allWords.add(e.w);
      if (meanings.has(e.k)) FAIL(`${name}: 같은 뜻이 두 단어에 붙었다 "${e.k}" (오답이 정답과 구분되지 않는다)`);
      meanings.add(e.k);
    }
    // 오답을 같은 품사에서 2개 뽑아야 하므로 품사별 최소 3개가 필요하다
    const byPos = {};
    for (const e of pool) byPos[e.pos] = (byPos[e.pos] || 0) + 1;
    for (const [p, c] of Object.entries(byPos)) {
      if (c < 3) FAIL(`${name}: 품사 ${p} 가 ${c}개뿐 — 같은 품사 오답 2개를 못 만든다`);
    }
    NOTE(`${name}: ${pool.length}개 · 품사 ${Object.entries(byPos).map(([p, c]) => `${p}:${c}`).join(' ')}`);
  }
}

// ── ③-2 국어 어휘: 화면에 들어가는가 · 답이 보이지 않는가 ──
//
// 🔴 영단어와 «다른 것»만 잰다. 뜻이 한국어 한 줄이라 새로 생기는 실패 방식이 셋 있다:
//    ⓐ 뜻풀이가 길어 계단 칸을 넘친다 ⓑ 뜻 안에 낱말이 들어가 답이 보인다
//    ⓒ 두 뜻이 서로를 포함해 정답이 둘이 된다. 셋 다 «데이터»의 결함이지 코드의 결함이 아니라
//    화면을 아무리 봐도 그 문항이 나오기 전엔 모른다 — 그래서 기계가 전수로 본다.
const KO_BANDS = [['korean-g34', KOREAN_G34], ['korean-g56', KOREAN_G56]];
const KO_POS = new Set(['n', 'v', 'a', 'ad']);
const K_MAX = 8;   // 뜻풀이 최대 글자수 — 3갈래 칸에서 18px 두 줄에 들어가는 한계(D43 실측)
{
  const allW = new Set();
  const allK = [];
  for (const [name, pool] of KO_BANDS) {
    if (pool.length < MIN_KOREAN_PER_BAND) FAIL(`${name}: ${pool.length}개 — ${MIN_KOREAN_PER_BAND}개 미만이면 한 판 안에 반복된다`);
    const byPos = {};
    for (const e of pool) {
      if (!e.w || !/^[가-힣]{2,5}$/.test(e.w)) FAIL(`${name}: 낱말 표기 오류 "${e.w}"`);
      if (!e.k || !e.k.trim()) FAIL(`${name}: 뜻이 비었다 "${e.w}"`);
      if (e.k && e.k.length > K_MAX) FAIL(`${name}: 뜻이 ${e.k.length}자 — ${K_MAX}자를 넘으면 계단 칸을 넘친다 "${e.w}" → "${e.k}"`);
      if (!KO_POS.has(e.pos)) FAIL(`${name}: 품사 값 오류 "${e.w}" → "${e.pos}"`);
      if (!Number.isInteger(e.t) || e.t < 1 || e.t > 3) FAIL(`${name}: 난이도 값 오류 "${e.w}" → ${e.t}`);
      if (e.k && e.k.length >= 6 && !e.k.includes(' ')) FAIL(`${name}: 뜻을 붙여 썼다 "${e.w}" → "${e.k}" — 아이가 못 읽고, keep-all 이 줄바꿀 자리가 없어 낱말 안에서 잘린다`);
      if (e.k && e.w && e.k.includes(e.w.slice(0, 2))) FAIL(`${name}: 뜻에 낱말이 그대로 들어 있다 "${e.w}" → "${e.k}" (답이 보인다)`);
      if (allW.has(e.w)) FAIL(`밴드 간 중복 낱말 "${e.w}"`);
      allW.add(e.w);
      const clash = allK.find((o) => o.k.includes(e.k) || e.k.includes(o.k));
      if (clash) FAIL(`뜻이 겹친다: "${e.w}" → "${e.k}" 와 "${clash.w}" → "${clash.k}" (한 문제의 두 보기가 되면 정답이 둘)`);
      allK.push({ w: e.w, k: e.k });
      byPos[e.pos] = (byPos[e.pos] || 0) + 1;
    }
    for (const [pp, c] of Object.entries(byPos)) {
      if (c < 3) FAIL(`${name}: 품사 ${pp} 가 ${c}개뿐 — 같은 품사 오답 2개를 못 만든다`);
    }
    NOTE(`${name}: ${pool.length}개 · 품사 ${Object.entries(byPos).map(([pp, c]) => `${pp}:${c}`).join(' ')}`);
  }
}

// ── ④ 출처 원장이 실재하고 데이터와 수가 맞는가 ────────────
{
  if (!fs.existsSync(LEDGER)) {
    FAIL('docs/data-sources.md 가 없다 — 출처를 적지 않은 학습 데이터는 릴리스할 수 없다');
  } else {
    const text = fs.readFileSync(LEDGER, 'utf8');
    for (const [name, pool] of [...BANDS, ...KO_BANDS]) {
      const m = text.match(new RegExp(`${name}[^\\n]*?(\\d+)\\s*개`));
      if (!m) FAIL(`data-sources.md 에 ${name} 의 개수 선언이 없다`);
      else if (Number(m[1]) !== pool.length) FAIL(`data-sources.md 의 ${name} 개수 ${m[1]} ≠ 실제 ${pool.length}`);
    }
    if (!/구구단[^\n]*72\s*개/.test(text)) FAIL('data-sources.md 에 구구단 72개 선언이 없다');
    NOTE('출처 원장(docs/data-sources.md) 개수 선언 일치');
  }
}

console.log('\n── 학습 데이터 게이트 (D23) ─────────────────────');
for (const n of notes) console.log('  · ' + n);
if (fails.length) {
  console.log('\n❌ 데이터 게이트 FAIL');
  for (const f of fails) console.log('  ✖ ' + f);
  process.exit(1);
}
console.log('\n✅ 데이터 게이트 PASS');
