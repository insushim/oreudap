#!/usr/bin/env node
/**
 * 플레이 가능성 QA — 헤드리스 시뮬이 «원리적으로» 못 보는 축(GDD 4-0b).
 *
 *  D13 끝단 입력  : 진짜 KeyboardEvent·포인터로 사람 오차를 실어 20회 이상. 판정 1회씩.
 *  D14 봇 플레이  : 실제 마우스 클릭으로 한 판을 끝까지. 런타임 오류 0.
 *  D21 개인정보   : 네트워크 요청이 자체 도메인 정적 GET 뿐. POST·beacon·쿼리값 0.
 *  D22 오디오     : 첫 입력에서 언락 → 효과음 디코드·재생.
 *
 * 🔴 표본이 모자라면 «측정 무효»로 실패시킨다. 8/8 은 100% 가 아니라 표본 없음이다.
 *   node tools/qa-play.mjs [--dir dist] [--port 8189] [--n 24]
 *   종료코드 0 PASS · 1 FAIL · 3 미실행
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DIR = path.resolve(opt('--dir', 'dist'));
const PORT = Number(opt('--port', 8189));
const N = Number(opt('--n', 24));
const MIN_N = 20;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

const fails = [];
const notes = [];
const FAIL = (m) => fails.push(m);
const NOTE = (m) => notes.push(m);

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const p = path.join(DIR, url === '/' ? 'index.html' : url);
      if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        rsp.writeHead(404).end('404');
        return;
      }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

const jitter = () => (Math.random() * 180 - 90); // 사람 오차 ±90ms

async function main() {
  const srv = await serve();
  const url = `http://127.0.0.1:${PORT}/index.html`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  const errors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), post: r.postData() }));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const t0 = Date.now();
    while (!window.__SMOKE__ && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
    await window.__SMOKE__.ready;
  });

  const startRun = async (subject = 0) => {
    await page.evaluate(() => {
      const app = window.__SMOKE__.app;
      if (app.screen !== 'title') app.go('title');
    });
    await page.click(`.subject-card >> nth=${subject}`);
    await page.click('#scope-start');
    await page.waitForFunction(() => window.__SMOKE__.app.core && window.__SMOKE__.app.core.phase === 'question');
    await page.evaluate(() => { window.__SMOKE__.app.qaLog = []; });
  };

  const waitQuestion = () => page.waitForFunction(
    () => { const c = window.__SMOKE__.app.core; return c && c.phase === 'question' && !c.answered; },
    null, { timeout: 8000 },
  );

  const state = () => page.evaluate(() => {
    const c = window.__SMOKE__.app.core;
    return { phase: c.phase, hearts: c.hearts, floor: c.floor, answered: c.answered,
             k: c.question ? c.question.choices.length : 0, ans: c.question ? c.question.answerIndex : -1,
             asked: c.stats.asked };
  });

  // ── D13-a: 진짜 키 입력, 문항 창 «안»에서 사람 오차 ───────
  await startRun(0);
  let keyTrials = 0;
  for (let i = 0; i < N; i++) {
    try { await waitQuestion(); } catch { break; }
    const s = await state();
    if (s.phase !== 'question') break;
    const delay = Math.max(60, 420 + jitter());
    await page.waitForTimeout(delay);
    const still = await state();
    if (still.phase !== 'question' || still.answered) continue;
    const key = still.ans === 0 ? 'ArrowLeft' : (still.k === 3 && still.ans === 1 ? 'ArrowUp' : 'ArrowRight');
    await page.keyboard.press(key);
    keyTrials += 1;
    await page.waitForTimeout(60);
    if (still.hearts <= 1) { await startRun(0); }
  }
  const keyLog = await page.evaluate(() => window.__SMOKE__.app.qaLog.filter((r) => r.source === 'key'));
  NOTE(`끝단 키 입력 ${keyTrials}회 시도 · 기록 ${keyLog.length}건`);
  if (keyLog.length < MIN_N) FAIL(`키 입력 표본 ${keyLog.length} < ${MIN_N} — 측정 무효`);
  const keyBad = keyLog.filter((r) => r.type !== 'correct');
  if (keyBad.length) FAIL(`정답 키를 눌렀는데 ${keyBad.length}건이 정답 처리되지 않았다 (${keyBad.slice(0, 3).map((b) => b.type).join(',')})`);
  const keyDouble = keyLog.filter((r) => Math.abs(r.heartsDelta) + Math.abs(r.floorDelta) > 1);
  if (keyDouble.length) FAIL(`키 입력 1회에 상태가 2 이상 바뀐 건 ${keyDouble.length}건 — 판정 1회 원칙 위반`);

  // ── D13-b: 타임아웃 «이후» 입력은 무시된다 ─────────────
  await startRun(0);
  let toTrials = 0;
  let extraJudgements = 0;
  for (let i = 0; i < MIN_N + 4; i++) {
    try { await waitQuestion(); } catch { break; }
    const s = await state();
    if (s.phase !== 'question') break;
    const wait = await page.evaluate(() => window.__SMOKE__.app.core.timeLeftMs);
    await page.waitForTimeout(wait + 200 + jitter() * 0.5);
    const beforeHearts = (await state()).hearts;
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(40);
    const afterHearts = (await state()).hearts;
    if (beforeHearts !== afterHearts) extraJudgements += 1;
    toTrials += 1;
    if (afterHearts <= 0) await startRun(0);
  }
  NOTE(`타임아웃 이후 입력 ${toTrials}회 · 추가 판정 ${extraJudgements}건`);
  if (toTrials < MIN_N) FAIL(`타임아웃 이후 입력 표본 ${toTrials} < ${MIN_N} — 측정 무효`);
  if (extraJudgements > 0) FAIL(`타임아웃 이후 입력이 ${extraJudgements}건 추가 판정됐다 — 무시돼야 한다`);

  // ── D13-c: 진짜 포인터 탭 — 좌표 변환까지 검증 ──────────
  await startRun(0);
  let tapTrials = 0;
  const tapWrong = [];
  for (let i = 0; i < N; i++) {
    try { await waitQuestion(); } catch { break; }
    const s = await state();
    if (s.phase !== 'question') break;
    const target = await page.evaluate((idx) => {
      const c = document.querySelectorAll('.choice')[idx];
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, s.ans);
    if (!target) { FAIL('선택지 DOM 을 못 찾았다'); break; }
    await page.waitForTimeout(Math.max(60, 300 + jitter()));
    const still = await state();
    if (still.phase !== 'question' || still.answered) continue;
    await page.mouse.click(target.x, target.y);
    tapTrials += 1;
    await page.waitForTimeout(60);
    const after = await state();
    if (after.floor !== still.floor + 1) tapWrong.push({ want: still.floor + 1, got: after.floor });
    if (after.hearts <= 1) await startRun(0);
  }
  const tapLog = await page.evaluate(() => window.__SMOKE__.app.qaLog.filter((r) => r.source === 'pointer'));
  NOTE(`포인터 탭 ${tapTrials}회 · 기록 ${tapLog.length}건`);
  if (tapLog.length < MIN_N) FAIL(`포인터 탭 표본 ${tapLog.length} < ${MIN_N} — 측정 무효`);
  if (tapWrong.length) FAIL(`정답 발판을 탭했는데 층이 안 올랐다 ${tapWrong.length}건 — 좌표 변환·히트영역 문제`);

  // ── D22: 오디오 언락·디코드 ─────────────────────────────
  const audio = await page.evaluate(() => {
    const app = window.__SMOKE__.app;
    return { report: app.sound.report(), unlocked: app.sound.unlocked, played: app.sound.play('correct') };
  });
  NOTE(`오디오 디코드 ${audio.report.decoded}/${audio.report.expected} · 언락 ${audio.unlocked} · 재생 ${audio.played}`);
  if (audio.report.decoded < audio.report.expected) {
    FAIL(`오디오 ${audio.report.expected - audio.report.decoded}개가 디코드되지 않았다 — 배포 후 무음`);
  }
  if (!audio.unlocked) FAIL('첫 입력 이후에도 AudioContext 가 언락되지 않았다');
  if (audio.report.failed.length) FAIL(`오디오 실패 ${audio.report.failed.length}건: ${audio.report.failed.slice(0, 2).join(' | ')}`);

  // ── D14: 봇이 한 판을 끝까지 (실제 클릭) ───────────────
  await startRun(0);
  let clicks = 0;
  let guard = 0;
  while (guard++ < 400) {
    const s = await state();
    if (s.phase === 'over') break;
    if (s.phase !== 'question' || s.answered) { await page.waitForTimeout(60); continue; }
    // 정답률 70% 봇 — 틀리기도 해야 오답 경로(하이라이트·오답노트)가 실행된다
    const pick = Math.random() < 0.7 ? s.ans : Math.floor(Math.random() * s.k);
    const target = await page.evaluate((idx) => {
      const c = document.querySelectorAll('.choice')[idx];
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, pick);
    if (!target) { await page.waitForTimeout(60); continue; }
    await page.waitForTimeout(Math.max(60, 350 + jitter()));
    const still = await state();
    if (still.phase !== 'question' || still.answered) continue;
    await page.mouse.click(target.x, target.y);
    clicks += 1;
    await page.waitForTimeout(80);
  }
  const final = await page.evaluate(() => ({
    onResult: document.querySelector('#screen-result').classList.contains('active'),
    floor: document.querySelector('#result-floor').textContent,
    qa: window.__SMOKE__.qa(),
  }));
  NOTE(`봇 플레이테스트 클릭 ${clicks}회 · 결과화면 ${final.onResult} · 층 ${final.floor}`);
  if (clicks < 5) FAIL(`봇이 ${clicks}회만 눌렀다 — 한 판을 두지 못했다(측정 무효)`);
  if (!final.onResult) FAIL('봇이 하트를 다 잃었는데 결과 화면이 뜨지 않았다');
  if (final.qa.zombieTweens > 0) FAIL(`파괴된 대상을 도는 트윈 ${final.qa.zombieTweens}개 — 생명주기 누수`);
  if (final.qa.loadErrors.length) FAIL(`에셋 로드 실패 ${final.qa.loadErrors.length}건: ${final.qa.loadErrors.join(', ')}`);

  // ── D21: 개인정보 — 네트워크 전수 ───────────────────────
  const origin = `http://127.0.0.1:${PORT}`;
  // blob:<origin>/… 와 data: 는 «네트워크로 나가는 요청»이 아니다(브라우저 내부 객체).
  // 그걸 외부로 세면 게이트가 진짜 외부 전송을 가리는 잡음이 된다.
  const isLocal = (u) => u.startsWith(origin) || u.startsWith(`blob:${origin}`) || u.startsWith('data:');
  const external = requests.filter((r) => !isLocal(r.url));
  const blobs = requests.filter((r) => r.url.startsWith('blob:'));
  const nonGet = requests.filter((r) => r.method !== 'GET');
  const withQuery = requests.filter((r) => r.url.includes('?') && r.url.split('?')[1].length > 0);
  const withBody = requests.filter((r) => r.post);
  NOTE(`네트워크 요청 ${requests.length}건 · 외부 ${external.length} · 내부 blob ${blobs.length} · 비GET ${nonGet.length} · 쿼리 ${withQuery.length}`);
  if (external.length) FAIL(`외부 도메인 요청 ${external.length}건: ${external.slice(0, 3).map((r) => r.url).join(', ')}`);
  if (nonGet.length) FAIL(`GET 이 아닌 요청 ${nonGet.length}건: ${nonGet.slice(0, 3).map((r) => `${r.method} ${r.url}`).join(', ')}`);
  if (withBody.length) FAIL(`본문이 실린 요청 ${withBody.length}건 — 데이터 전송`);
  if (withQuery.length) FAIL(`쿼리스트링이 붙은 요청 ${withQuery.length}건: ${withQuery.slice(0, 2).map((r) => r.url).join(', ')}`);

  const inputs = await page.evaluate(() => document.querySelectorAll('input, textarea, [contenteditable="true"]').length);
  if (inputs > 0) FAIL(`입력 필드가 ${inputs}개 있다 — 개인정보를 받지 않는 설계여야 한다`);
  NOTE(`입력 필드 ${inputs}개`);

  const stored = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = (localStorage.getItem(k) || '').length;
    }
    return out;
  });
  const keys = Object.keys(stored);
  NOTE(`localStorage 키 ${keys.length}개: ${keys.join(', ')}`);
  if (keys.some((k) => !k.startsWith('oreudap:'))) FAIL(`네임스페이스 밖 저장 키: ${keys.filter((k) => !k.startsWith('oreudap:')).join(', ')}`);

  if (errors.length) FAIL(`콘솔·런타임 오류 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

  await browser.close();
  srv.close();

  console.log('\n── 플레이 가능성 QA ────────────────────────────');
  for (const n of notes) console.log('  · ' + n);
  if (fails.length) {
    console.log('\n❌ 플레이 QA FAIL');
    for (const f of fails) console.log('  ✖ ' + f);
    process.exit(1);
  }
  console.log('\n✅ 플레이 QA PASS (D13 · D14 · D21 · D22)');
}

main().catch((e) => {
  console.error('❌ 도구가 죽었다(미실행 — 통과도 실패도 아니다):', e);
  process.exit(3);
});
