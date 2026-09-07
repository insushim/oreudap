#!/usr/bin/env node
// 국어 어휘 데이터 임포터 — 웹 브릿지가 받아 온 원본 JSON → src/data/korean-g*.js
//
// 🔴 브릿지 출력을 «그대로 넣지 않는다». 받은 것은 원료고, 통과 기준은 여기 있다.
//    (web-bridges 표준 절차 ②거르기 — 검증 없이 커밋하면 사실 오류가 그대로 굳는다.)
//
// 거르는 것:
//   ① 모양   — w 는 한글 2~5자, k 는 2~12자. 화면이 계단 칸이라 긴 뜻풀이는 들어가지 않는다.
//   ② 자답   — 뜻풀이 안에 낱말이 들어 있으면 답이 보인다(「정직: 정직한 마음」).
//   ③ 중복   — 같은 낱말, 그리고 «같은 뜻». 뜻이 겹치면 오답 보기로 뽑혔을 때 정답이 둘이 된다.
//   ④ 품사·난이도 태그가 아는 값인가.
//
// 실행: node tools/import-korean.mjs --src <원본디렉터리>

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const SRC = argv[argv.indexOf('--src') + 1];
if (!SRC || SRC.startsWith('--')) { console.error('사용: node tools/import-korean.mjs --src <디렉터리>'); process.exit(2); }

export const W_RE = /^[가-힣]{2,5}$/;
// 🔴 8자 상한은 취향이 아니라 «화면이 정한 값»이다. 3갈래 칸 폭 105px(360px 화면)에서
//    글자 18px 하한을 지키며 두 줄에 들어가는 한글은 8자까지다 — 9자부터 세 줄이 되고,
//    세 줄이 되면 글자 상자가 발판을 덮어 「발판을 밟는다」는 모양이 사라진다(실측·D43).
//    상한을 늘리려면 데이터가 아니라 레이아웃을 먼저 바꿔야 한다.
export const K_MAX = 8;
export const K_RE = /^[가-힣0-9 ,·’'-]{2,8}$/;
const POS = new Set(['n', 'v', 'a', 'ad']);

/** 코드펜스·머리말이 섞여 와도 배열만 건져 낸다 */
export function extractArray(text) {
  const s = String(text || '');
  const i = s.indexOf('[');
  const j = s.lastIndexOf(']');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

/**
 * 항목 하나가 쓸 만한가. 통과면 정규화된 객체, 아니면 사유 문자열.
 * 🔴 «사유»를 돌려주는 이유: 버린 개수만 세면 프롬프트가 어디서 어긋났는지 다음에도 모른다.
 */
export function judge(raw) {
  if (!raw || typeof raw !== 'object') return '객체가 아님';
  const w = String(raw.w ?? '').trim();
  const k = String(raw.k ?? '').trim().replace(/[.。]$/, '');
  const pos = String(raw.pos ?? '').trim();
  const t = Number(raw.t);
  if (!W_RE.test(w)) return `낱말 모양 아님: ${JSON.stringify(w)}`;
  if (!K_RE.test(k)) return `뜻 모양 아님(2~${K_MAX}자 한글): ${JSON.stringify(k)}`;
  if (!POS.has(pos)) return `품사 모름: ${JSON.stringify(pos)}`;
  if (!Number.isInteger(t) || t < 1 || t > 3) return `난이도 모름: ${JSON.stringify(raw.t)}`;
  // 🔴 붙여 쓴 뜻풀이를 버린다(「몸을낮춰가다」). 두 가지가 동시에 깨진다 —
  //    ① 초등 저학년이 못 읽는다 ② CSS 가 `word-break: keep-all` 이라 띄어쓰기가 없으면
  //    줄바꿈할 자리가 없어 낱말 «안»에서 잘린다(「몸을낮춰 / 가다」가 아니라 「몸을낮 / 춰가다」).
  if (k.length >= 6 && !k.includes(' ')) return `붙여 썼다(띄어쓰기 없음): ${w} → ${k}`;
  if (k.includes(w)) return `뜻에 낱말이 들어 있다: ${w} → ${k}`;
  // 🔴 어간이 같아도 답이 보인다 — 「정직하다 / 정직한 마음」. 두 글자 이상 겹치면 버린다.
  if (w.length >= 2 && k.includes(w.slice(0, 2))) return `뜻이 낱말을 되풀이한다: ${w} → ${k}`;
  return { w, k, pos, t };
}

const files = fs.readdirSync(SRC).filter((f) => /\.json$/.test(f)).sort();
const bands = { korean34: [], korean56: [] };
const rejects = [];
const seenW = new Set();
const seenK = new Set();

for (const f of files) {
  const band = f.startsWith('k34') ? 'korean34' : f.startsWith('k56') ? 'korean56' : null;
  if (!band) { rejects.push(`${f}: 밴드를 알 수 없는 파일 이름`); continue; }
  const arr = extractArray(fs.readFileSync(path.join(SRC, f), 'utf8'));
  if (!Array.isArray(arr)) { rejects.push(`${f}: JSON 배열을 못 찾음`); continue; }
  let kept = 0;
  for (const raw of arr) {
    const v = judge(raw);
    if (typeof v === 'string') { rejects.push(`${f}: ${v}`); continue; }
    // 🔴 중복은 «밴드 안»이 아니라 «전체»에서 본다. 3·4학년과 5·6학년에 같은 낱말이 있으면
    //    아이 입장에선 같은 문제가 두 과목에 있는 것이고, 오답노트 id 도 갈라진다.
    if (seenW.has(v.w)) { rejects.push(`${f}: 낱말 중복 ${v.w}`); continue; }
    if (seenK.has(v.k)) { rejects.push(`${f}: 뜻 중복 ${v.k} (${v.w})`); continue; }
    // 🔴 «포함»도 중복이다 — 「기분이 좋음」과 「몹시 기분이 좋음」이 한 문제의 두 보기로 뽑히면
    //    아이 입장에서 정답이 둘이다. 완전 일치만 보면 이런 쌍이 그대로 통과한다.
    const clash = [...seenK].find((o) => o.includes(v.k) || v.k.includes(o));
    if (clash) { rejects.push(`${f}: 뜻이 «${clash}»와 겹친다 — ${v.w} → ${v.k}`); continue; }
    seenW.add(v.w); seenK.add(v.k);
    bands[band].push(v);
    kept += 1;
  }
  console.log(`  ${f}: ${arr.length}개 중 ${kept}개 채택`);
}

const HEAD = (band, list) => {
  const by = (p) => list.filter((x) => x.pos === p).length;
  return `// 초등 ${band === 'korean34' ? '3~4' : '5~6'}학년 국어 어휘
// 출처·편성 원칙 = docs/data-sources.md
// 🔴 이 파일은 «생성물»이다 — 손으로 고치지 말고 \`npm run korean:import\` 를 다시 돌린다.
// 원본 = 웹 브릿지(gpt-web·gemini-web) 생성 → tools/import-korean.mjs 가 전수 검증
// 총 ${list.length}개 (n ${by('n')} · v ${by('v')} · a ${by('a')} · ad ${by('ad')})
// w: 낱말 · k: 짧은 뜻 · pos: 품사 · t: 난이도 1~3
export const ${band === 'korean34' ? 'KOREAN_G34' : 'KOREAN_G56'} = [
${list.map((x) => `  { w: '${x.w}', k: '${x.k}', pos: '${x.pos}', t: ${x.t} },`).join('\n')}
];
`;
};

for (const [band, list] of Object.entries(bands)) {
  const out = path.join(ROOT, 'src', 'data', `korean-g${band === 'korean34' ? '34' : '56'}.js`);
  fs.writeFileSync(out, HEAD(band, list));
  console.log(`✅ ${path.relative(ROOT, out)} — ${list.length}개`);
}
console.log(`\n버린 것 ${rejects.length}건`);
for (const r of rejects.slice(0, 40)) console.log(`  · ${r}`);
if (rejects.length > 40) console.log(`  … 외 ${rejects.length - 40}건`);
