// 앱 컨트롤러 — 화면 전환, 코어 구동, DOM 갱신.
// 코어(src/core/*)는 DOM 을 모르고, 이 파일이 유일한 다리다.

import { GameCore, PHASE } from './core/game.js';
import { PersistentNotes } from './core/srs.js';
import { SUBJECTS, describeId } from './core/questions.js';
import { load, save, emptySave } from './core/storage.js';
import { applyRun, buy, equip, todayMissions } from './core/economy.js';
import { SHOP, HEART, SRS, TIMING } from './core/balance.js';
import { computeLayout, columns } from './ui/layout.js';
import { Sound } from './ui/sound.js';
import { makeRng } from './core/rng.js';
import { WORDS_G34 } from './data/words-g34.js';
import { WORDS_G56 } from './data/words-g56.js';
import { getNick, setNick, suggestNick, displayNick, fetchBoard, submitScore, todayKey } from './core/rankClient.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const SUBJECT_META = {
  gugudan: { emoji: '✖️', desc: '2단부터 9단까지, 한눈에 즉답' },
  words34: { emoji: '🅰️', desc: () => `3·4학년 기본 낱말 ${WORDS_G34.length}개` },
  words56: { emoji: '📘', desc: () => `5·6학년 기본 낱말 ${WORDS_G56.length}개` },
};

export class App {
  constructor({ scene, seedFn }) {
    this.scene = scene;
    this.seedFn = seedFn;
    this.data = load();
    this.notes = new PersistentNotes(this.data.notes);
    this.core = null;
    this.subject = 'gugudan';
    this.scope = null;
    this.screen = 'title';
    this.choiceNodes = [];
    this.lastFrame = 0;
    this.rafId = 0;
    this.paused = false;
    this.smokeMode = false;
    this.smokeRun = 0;
    this.layout = computeLayout(window.innerWidth, window.innerHeight);
    this.sound = new Sound(() => this.data.settings.sound, scene, []);
    this.autoBot = null;      // 스모크·플레이테스트 전용
  }

  init() {
    this.bindStaticButtons();
    this.renderTitle();
    this.applyBodyFlags();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 60));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'play' && !this.paused) this.pause();
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  // ── 화면 ────────────────────────────────────────────────
  go(name) {
    this.screen = name;
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
    const target = $(`#screen-${name}`);
    if (target) target.classList.add('active');
    if (name === 'title') this.renderTitle();
    if (name === 'notes') this.renderNotes();
    if (name === 'collection') this.renderCollection();
    if (name === 'settings') this.renderSettings();
    document.body.classList.toggle('in-play', name === 'play');
  }

  bindStaticButtons() {
    for (const b of document.querySelectorAll('[data-go]')) {
      b.addEventListener('click', () => this.go(b.dataset.go));
    }
    $('#btn-pause').addEventListener('click', () => this.pause());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-quit').addEventListener('click', () => { this.quitRun(); });
    $('#btn-again').addEventListener('click', () => this.startRun());
    $('#scope-start').addEventListener('click', () => this.startRun());
  }

  applyBodyFlags() {
    document.body.classList.toggle('color-safe', !!this.data.settings.colorSafe);
    if (this.scene) this.scene.reduced = !!this.data.settings.reducedMotion;
  }

  persist() {
    this.data.notes = this.notes.data;
    save(this.data);
  }

  // ── 타이틀 ──────────────────────────────────────────────
  renderTitle() {
    $('#title-coin-n').textContent = this.data.coins;
    const grid = $('#subject-grid');
    grid.textContent = '';
    for (const key of Object.keys(SUBJECTS)) {
      const meta = SUBJECT_META[key];
      const card = el('button', 'subject-card');
      card.type = 'button';
      card.setAttribute('role', 'listitem');
      card.append(el('span', 'subject-emoji', meta.emoji));
      const box = el('span');
      box.append(el('b', 'subject-name', SUBJECTS[key].label));
      box.append(el('span', 'subject-desc', meta.desc));
      card.append(box);
      const best = el('span', 'subject-best');
      best.append(el('b', null, String(this.data.best[key] || 0)));
      best.append(document.createTextNode('최고 층'));
      card.append(best);
      card.addEventListener('click', () => this.openScope(key));
      grid.append(card);
    }
    this.renderBoard();
  }

  // ── 오늘의 등수 ─────────────────────────────────────────
  /** 이름 칸은 «한 번만» 배선한다 — renderTitle 은 화면을 오갈 때마다 불린다. */
  wireNick() {
    if (this._nickWired) return;
    this._nickWired = true;
    const input = $('#nick');
    const msg = $('#nick-msg');
    const show = (text, bad) => {
      msg.textContent = text;
      msg.className = bad ? 'nick-msg bad' : 'nick-msg';
      input.classList.toggle('bad', !!bad);
    };
    input.addEventListener('input', () => {
      const r = setNick(input.value);
      if (r.ok) show(`등수판에는 «${displayNick(r.nick)}» 로 올라가요`, false);
      else show(input.value.trim() ? '이 이름은 쓸 수 없어요. 다른 이름을 지어 주세요.' : '', true);
    });
    // 🔴 칸을 떠날 때 못 쓰는 이름이면 저장된 이름으로 되돌린다 — 빈 칸으로 두지 않는다.
    input.addEventListener('blur', () => { input.value = getNick(); show('', false); });
    $('#nick-dice').addEventListener('click', () => {
      const r = setNick(suggestNick());
      if (r.ok) { input.value = r.nick; show(`«${r.nick}» 로 정했어요`, false); }
      this.sound.play('button');
    });
  }

  renderBoard() {
    this.wireNick();
    const nick = getNick();
    $('#nick').value = nick;
    $('#board-day').textContent = todayKey().slice(5).replace('-', '월 ') + '일';
    const list = $('#board-list');
    const note = $('#board-note');
    const mine = displayNick(nick);

    // 🔴 등수판은 «있으면 좋은 것»이다 — 인터넷이 없거나 서버가 죽어도 게임은 그대로 돌아간다.
    note.textContent = '불러오는 중…';
    fetchBoard(10).then((b) => {
      list.textContent = '';
      if (!b.rows.length) {
        note.textContent = '오늘은 아직 아무도 오르지 않았어요. 첫 번째가 되어 보세요!';
        return;
      }
      b.rows.forEach((r, i) => {
        const li = el('li', i < 3 ? `top${i + 1}` : null);
        if (r.n === mine) li.classList.add('me');
        li.append(el('span', 'rk', String(i + 1)));
        li.append(el('span', 'nm', r.n));
        li.append(el('span', 'sb', (SUBJECTS[r.sub] && SUBJECTS[r.sub].label) || r.sub));
        li.append(el('span', 'fl', `${r.s}층`));
        list.append(li);
      });
      note.textContent = b.total > b.rows.length ? `오늘 ${b.total}명이 올랐어요` : '';
    }).catch(() => {
      list.textContent = '';
      note.textContent = '등수판을 불러오지 못했어요. 게임은 그대로 즐길 수 있어요.';
    });
  }

  // ── 범위 ────────────────────────────────────────────────
  openScope(subject) {
    this.subject = subject;
    this.scope = null;
    $('#scope-title').textContent = `${SUBJECTS[subject].label} — 범위 고르기`;
    const body = $('#scope-body');
    body.textContent = '';
    if (subject === 'gugudan') {
      const grid = el('div', 'dan-grid');
      const chosen = new Set();
      const buttons = [];
      const mkBtn = (label, dan) => {
        const b = el('button', 'dan-btn', label);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          if (dan === 'all') {
            chosen.clear();
            for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
          } else {
            if (chosen.has(dan)) chosen.delete(dan); else chosen.add(dan);
            b.setAttribute('aria-pressed', String(chosen.has(dan)));
            buttons[0].setAttribute('aria-pressed', String(chosen.size === 0));
          }
          this.scope = chosen.size ? [...chosen].sort((x, y) => x - y) : null;
        });
        buttons.push(b);
        return b;
      };
      const all = mkBtn('전체', 'all');
      all.setAttribute('aria-pressed', 'true');
      grid.append(all);
      for (let d = 2; d <= 9; d++) grid.append(mkBtn(`${d}단`, d));
      body.append(grid);
      body.append(el('p', 'scope-note', '고르지 않으면 2단부터 9단까지 전부 나와요. 여러 단을 같이 골라도 돼요.'));
    } else {
      body.append(el('p', 'scope-note',
        `낱말 ${(subject === 'words34' ? WORDS_G34 : WORDS_G56).length}개를 «영어 → 뜻»과 «뜻 → 영어» 두 방향으로 물어봐요. 틀린 낱말은 오답노트에 담겨 며칠 뒤 다시 나와요.`));
    }
    this.go('scope');
  }

  // ── 런 ──────────────────────────────────────────────────
  startRun() {
    this.endRun(true);
    const seed = this.seedFn();
    // 스모크 상태가 일반 런으로 새면 봇이 대신 플레이한다 — 진입할 때마다 명시적으로 끈다.
    this.autoBot = null;
    this.smokeMode = false;
    this.smokeRun = 0;
    this.settled = false;
    this.core = new GameCore({ seed, subject: this.subject, scope: this.scope, notes: this.notes });
    this.runStartCoins = this.data.coins;
    this.paused = false;
    $('#overlay-pause').hidden = true;
    this.go('play');
    this.onResize();
    if (this.scene) {
      this.scene.resetWorld();
      this.scene.setSkin(this.data.skin);
      this.scene.setTheme(this.data.theme);
    }
    this.sound.unlock();
    this.sound.startBgm();
    this.core.start();
    this.onQuestion();
    this.lastFrame = performance.now();
  }

  endRun(silent) {
    if (this.scene) {
      this.scene.finished = true;      // 예약된 트윈·이펙트가 결과 화면을 덮지 않게 한다
      this.scene.stopAllMotion();
    }
    this.sound.stopBgm();
    if (!silent && this.core) this.showResult();
    this.clearChoices();
  }

  /** 중간에 그만두기 — 이번 판에서 번 것은 «잃지 않고» 정산한다 */
  quitRun() {
    this.paused = false;
    $('#overlay-pause').hidden = true;
    if (this.core && !this.settled) this.showResult();
    else this.endRun(true);
    this.go('title');
  }

  pause() {
    if (this.screen !== 'play' || !this.core || this.core.phase === PHASE.OVER) return;
    this.paused = true;
    this.sound.stopBgm();
    $('#overlay-pause').hidden = false;
  }

  resume() {
    this.paused = false;
    this.sound.startBgm();
    $('#overlay-pause').hidden = true;
    this.lastFrame = performance.now();
  }

  // ── 입력 ────────────────────────────────────────────────
  onKey(e) {
    if (this.screen !== 'play' || !this.core) return;
    if (e.key === 'Escape') { this.paused ? this.resume() : this.pause(); return; }
    if (this.paused) return;
    // 🔴 키를 누르고 있으면 keydown 이 자동 반복된다 — 막지 않으면 손을 안 떼도 다음 문항이 계속 풀린다.
    if (e.repeat) { e.preventDefault(); return; }
    const k = this.core.question ? this.core.question.choices.length : 2;
    const map = k === 3
      ? { ArrowLeft: 0, a: 0, A: 0, ArrowUp: 1, w: 1, W: 1, ArrowRight: 2, d: 2, D: 2 }
      : { ArrowLeft: 0, a: 0, A: 0, ArrowRight: 1, d: 1, D: 1 };
    const idx = map[e.key];
    if (idx == null) return;
    e.preventDefault();
    this.press(idx, 'key');
  }

  press(index, source = 'app') {
    if (!this.core || this.paused) return;
    const before = { answered: this.core.answered, hearts: this.core.hearts, floor: this.core.floor };
    const phase = this.core.phase;
    const offset = this.core.t - this.core.activeAt;
    const res = this.core.input(index);
    if (res.type === 'correct' || res.type === 'wrong' || res.type === 'timeout') this.onResolve(res);
    // QA 훅: 입력이 «어떤 상태에서 몇 ms 에» 들어와 «몇 번» 판정됐는지 기록한다.
    // 배열을 심어 둔 검사만 기록하며, 평상시에는 아무 비용이 없다.
    if (Array.isArray(this.qaLog)) {
      this.qaLog.push({
        source, index, phase, offset, timerMs: this.core.timerMs,
        type: res.type, wasAnswered: before.answered,
        heartsDelta: this.core.hearts - before.hearts,
        floorDelta: this.core.floor - before.floor,
      });
    }
    return res;
  }

  // ── 코어 이벤트 → 화면 ──────────────────────────────────
  onQuestion() {
    const q = this.core.question;
    if (!q) return;
    $('#qtext').textContent = q.prompt;
    $('#qsub').textContent = q.promptSub || '';
    this.buildChoices(q);
    if (this.scene) this.scene.showRow(q.choices.length);
    this.updateHud();
  }

  onResolve(res) {
    const q = this.core.question;
    const fb = $('#feedback');
    if (res.type === 'correct') {
      this.sound.play('correct');
      if (this.scene) this.scene.jumpTo(q.answerIndex, res.floor);
      this.markChoice(q.answerIndex, 'is-correct');
      if (res.bonus) {
        this.sound.play('streak');
        if (this.scene) this.scene.celebrate();
        this.flashStreak(this.core.streak, res.healed);
      }
      // 10층마다 «금 발판» — 아래로 흘러가는 계단이 그대로 고도계가 된다.
      if (res.floor % 10 === 0) {
        this.sound.play('coin');
        this.say(fb, `🏁 ${res.floor}층 돌파!`, 'good');
      } else if (res.boxState === 'graduated') this.say(fb, '🎓 이제 완전히 내 거!', 'good');
      else if (res.graduated === 'graduated') this.say(fb, '👍 오늘은 이 문제 통과!', 'good');
    } else {
      this.sound.play(res.type === 'timeout' ? 'timeout' : 'wrong');
      if (this.scene) this.scene.stumble(res.chose, q.answerIndex);
      if (res.chose != null) this.markChoice(res.chose, 'is-wrong');
      this.markChoice(q.answerIndex, 'is-correct');
      this.say(fb, res.type === 'timeout' ? `시간 초과! 정답은 ${res.answerText}` : `정답은 ${res.answerText}`, 'bad');
    }
    this.updateHud();
  }

  say(node, text, kind) {
    node.textContent = text;
    node.className = `feedback show ${kind}`;
    clearTimeout(this._sayTimer);
    this._sayTimer = setTimeout(() => { node.className = 'feedback'; }, 900);
  }

  flashStreak(streak, healed) {
    const chip = $('#streak-chip');
    chip.hidden = false;
    chip.textContent = healed ? `🔥 ${streak}연속! 하트 +1` : `🔥 ${streak}연속!`;
    clearTimeout(this._streakTimer);
    this._streakTimer = setTimeout(() => { chip.hidden = true; }, 1200);
  }

  // ── 선택지 버튼(DOM) ────────────────────────────────────
  clearChoices() {
    const box = $('#choices');
    box.textContent = '';
    this.choiceNodes = [];
  }

  buildChoices(q) {
    this.clearChoices();
    const box = $('#choices');
    const cols = columns(this.layout, q.choices.length);
    q.choices.forEach((text, i) => {
      const b = el('button', 'choice');
      b.type = 'button';
      b.dataset.index = String(i);
      b.setAttribute('aria-label', `${i + 1}번 선택지 ${text}`);
      b.append(el('span', 'mark', ''));
      b.append(el('span', 'txt', text));
      const c = cols[i];
      b.style.left = `${c.x}px`;
      b.style.top = `${c.y}px`;
      b.style.width = `${c.w}px`;
      b.style.height = `${c.h}px`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.press(i, 'pointer'); });
      b.addEventListener('click', (e) => { e.preventDefault(); });
      box.append(b);
      this.choiceNodes.push(b);
    });
  }

  markChoice(index, cls) {
    const node = this.choiceNodes[index];
    if (!node) return;
    node.classList.add(cls);
    const mark = node.querySelector('.mark');
    if (mark) mark.textContent = cls === 'is-correct' ? '✓' : '✗';
  }

  updateHud() {
    const c = this.core;
    if (!c) return;
    $('#hud-floor').textContent = c.floor;
    const hearts = $('#hud-hearts');
    if (hearts.childElementCount !== HEART.MAX) {
      hearts.textContent = '';
      for (let i = 0; i < HEART.MAX; i++) hearts.append(el('span', 'heart', '♥'));
    }
    [...hearts.children].forEach((h, i) => h.classList.toggle('lost', i >= c.hearts));
  }

  updateTimer() {
    const c = this.core;
    const fill = $('#timer-fill');
    if (!c || c.phase !== PHASE.QUESTION) { fill.style.transform = 'scaleX(0)'; return; }
    const r = c.timeRatio;
    fill.style.transform = `scaleX(${r.toFixed(4)})`;
    fill.className = `timer-fill${r < 0.25 ? ' danger' : r < 0.5 ? ' warn' : ''}`;
  }

  // ── 결과 ────────────────────────────────────────────────
  showResult() {
    const c = this.core;
    if (!c || this.settled) { this.go('result'); return; }   // 정산은 런당 정확히 1회
    this.settled = true;
    const prevBest = this.data.best[this.subject] || 0;
    const isBest = c.floor > prevBest;
    this.data.best[this.subject] = Math.max(prevBest, c.floor);
    this.data.coins += c.coins;
    this.data.totals.runs += 1;
    this.data.totals.correct += c.stats.correct;
    this.data.totals.asked += c.stats.asked;
    const missions = applyRun(this.data, {
      correct: c.stats.correct, bestStreak: c.bestStreak, reviewCorrect: c.stats.reviewCorrect,
    }, Date.now());
    this.persist();

    $('#result-title').textContent = isBest ? '🎉 새 기록!' : '기록';
    $('#result-floor').textContent = c.floor;
    $('#result-acc').textContent = `${Math.round(c.accuracy * 100)}%`;
    $('#result-coin').textContent = c.coins + (missions.gained || 0);
    $('#result-best').textContent = this.data.best[this.subject];
    $('#result-gap').textContent = isBest
      ? '최고 기록을 넘었어요!'
      : `최고 기록까지 ${prevBest - c.floor}층 남았어요`;

    // 오늘 판에 올린다. 실패해도 게임 흐름은 건드리지 않는다(있으면 좋은 것).
    submitScore(this.subject, c.floor).then((r) => {
      if (r && r.ok && r.rank) $("#result-gap").textContent = `오늘 ${r.rank}등! · ${this.data.best[this.subject]}층이 내 최고`;
    }).catch(() => { /* 오프라인 — 조용히 넘어간다 */ });

    const miss = $('#result-miss');
    miss.textContent = '';
    const first = c.stats.wrongIds[0];
    if (first) {
      const d = describeId(first);
      if (d) {
        miss.append(el('div', null, '이번에 놓친 문제'));
        const b = el('div');
        b.append(el('b', null, `${d.q} → ${d.a}`));
        miss.append(b);
        miss.append(el('div', null, '다음 판에서 다시 나와요. 이번엔 맞혀 봐요!'));
      }
    } else if (c.stats.asked > 0) {
      miss.append(el('div', null, '틀린 문제가 하나도 없었어요. 대단해요!'));
    }
    if (missions.gained) {
      miss.append(el('div', null, `오늘의 미션 달성으로 코인 +${missions.gained}`));
    }
    this.go('result');
  }

  // ── 오답노트 ────────────────────────────────────────────
  renderNotes() {
    const list = $('#notes-list');
    list.textContent = '';
    const rows = this.notes.list();
    if (!rows.length) {
      list.append(el('p', 'hint', '아직 담긴 문제가 없어요. 게임을 하다 틀리면 여기에 모여요.'));
      return;
    }
    for (const row of rows.slice(0, 60)) {
      const d = describeId(row.id);
      if (!d) continue;
      const node = el('div', 'note-row');
      const left = el('div');
      left.append(el('div', 'note-q', d.q));
      left.append(el('div', 'note-a', `→ ${d.a}`));
      node.append(left);
      const dots = '●'.repeat(row.box) + '○'.repeat(Math.max(0, SRS.MAX_BOX - row.box));
      node.append(el('div', 'note-box', dots));
      list.append(node);
    }
  }

  // ── 컬렉션 ──────────────────────────────────────────────
  renderCollection() {
    $('#coll-coins').textContent = this.data.coins;
    const mk = (kind, item, listNode) => {
      const owned = (kind === 'skin' ? this.data.ownedSkins : this.data.ownedThemes).includes(item.id);
      const active = (kind === 'skin' ? this.data.skin : this.data.theme) === item.id;
      const b = el('button', `shop-item${owned ? '' : ' locked'}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(active));
      if (kind === 'skin') {
        const img = document.createElement('img');
        img.src = `./assets/images/char-${item.id}.webp`;
        img.alt = item.name;
        img.loading = 'lazy';
        b.append(img);
      } else {
        const sw = el('div', 'sw');
        sw.style.backgroundImage = `url(./assets/images/bg-${item.id}.webp)`;
        sw.style.backgroundSize = 'cover';
        b.append(sw);
      }
      b.append(el('div', 's-name', item.name));
      b.append(el('div', 's-price', owned ? (active ? '사용 중' : '고르기') : `● ${item.price}`));
      b.addEventListener('click', () => {
        if (owned) {
          equip(this.data, kind, item.id);
          this.sound.play('button');
        } else {
          const r = buy(this.data, kind, item.id);
          if (!r.ok) { this.sound.play('wrong'); return; }
          equip(this.data, kind, item.id);
          this.sound.play('streak');
        }
        this.persist();
        if (this.scene) {
          if (kind === 'skin') this.scene.setSkin(this.data.skin);
          else this.scene.setTheme(this.data.theme);
        }
        this.renderCollection();
      });
      listNode.append(b);
    };
    const sl = $('#skin-list'); sl.textContent = '';
    for (const s of SHOP.SKINS) mk('skin', s, sl);
    const tl = $('#theme-list'); tl.textContent = '';
    for (const t of SHOP.THEMES) mk('theme', t, tl);
  }

  // ── 설정 ────────────────────────────────────────────────
  renderSettings() {
    const list = $('#settings-list');
    list.textContent = '';
    const toggles = [
      ['sound', '소리'],
      ['reducedMotion', '흔들림 줄이기'],
      ['colorSafe', '색약 모드 (✓·✗ 함께 보이기)'],
    ];
    for (const [key, label] of toggles) {
      const row = el('div', 'setting-row');
      const id = `set-${key}`;
      const lab = el('label', null, label);
      lab.setAttribute('for', id);
      row.append(lab);
      const sw = el('button', 'switch');
      sw.type = 'button';
      sw.id = id;
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!this.data.settings[key]));
      sw.setAttribute('aria-label', label);
      sw.addEventListener('click', () => {
        this.data.settings[key] = !this.data.settings[key];
        sw.setAttribute('aria-checked', String(this.data.settings[key]));
        this.applyBodyFlags();
        this.sound.syncEnabled();
        this.persist();
      });
      row.append(sw);
      list.append(row);
    }
    const ml = $('#mission-list');
    ml.textContent = '';
    for (const m of todayMissions(this.data, Date.now())) {
      const row = el('div', `mission-row${m.claimed ? ' done' : ''}`);
      row.append(el('b', null, m.label));
      row.append(el('span', 'm-state', m.claimed ? '완료 +20' : `${m.value} / ${m.goal}`));
      ml.append(row);
    }
    $('#credits').textContent =
      '그림·소리·글자 모두 이 게임을 위해 직접 만들었습니다. 외부 광고·분석 도구를 쓰지 않고, '
      + '이름·나이·학교 같은 개인정보를 받지 않습니다. 기록은 이 기기 안에만 저장됩니다.';
  }

  // ── 레이아웃 ────────────────────────────────────────────
  onResize() {
    this.layout = computeLayout(window.innerWidth, window.innerHeight);
    const L = this.layout;
    const card = $('#qcard');
    card.style.top = `${L.cardTop}px`;
    card.style.width = `${L.contentW}px`;
    card.style.height = `${L.cardH}px`;
    if (this.core && this.core.question && this.screen === 'play') {
      const cols = columns(L, this.core.question.choices.length);
      this.choiceNodes.forEach((b, i) => {
        const c = cols[i];
        if (!c) return;
        b.style.left = `${c.x}px`;
        b.style.top = `${c.y}px`;
        b.style.width = `${c.w}px`;
        b.style.height = `${c.h}px`;
      });
    }
    if (this.scene && this.scene.ready) this.scene.applyLayout();
  }

  // ── 구동 루프 ───────────────────────────────────────────
  loop(now) {
    this.rafId = requestAnimationFrame(this.loop);
    // 숨은 탭은 visibilitychange 에서 이미 일시정지된다. 여기 클램프는 «병적인 정지»만 막는 상한이다.
    // 🔴 너무 작게 자르면(예전 50ms) 실제 경과보다 게임 시계가 느려져 «3.2초보다 오래» 답할 수 있다.
    const dt = Math.min(now - this.lastFrame, 250);
    this.lastFrame = now;
    if (this.screen !== 'play' || !this.core || this.paused) return;
    this.step(dt);
  }

  /** 시뮬 한 스텝. 스모크·플레이테스트도 이 함수를 쓴다(경로가 갈리면 검증이 무의미해진다). */
  step(dtMs) {
    if (!this.core) return;
    if (this.autoBot) {
      const r = this.autoBot(this.core, dtMs);
      if (r && (r.type === 'correct' || r.type === 'wrong' || r.type === 'timeout')) this.onResolve(r);
    }
    const events = this.core.advance(dtMs);
    for (const ev of events) {
      if (ev.type === 'question') this.onQuestion();
      else if (ev.type === 'timeout' || ev.type === 'wrong' || ev.type === 'correct') this.onResolve(ev);
      else if (ev.type === 'gameover') {
        // 스모크는 «연속 시뮬»이다 — 한 판이 끝나면 결정론적으로 다음 판을 잇는다.
        // 그래야 런 재시작 경로(GameObject 전수 리셋)가 반복 검증되고, 숨은 탭 전진도 잴 수 있다.
        if (this.smokeMode) this.smokeRestart();
        else { this.sound.play('gameover'); this.endRun(false); }
      }
    }
    this.updateTimer();
  }

  // ── 검증 계약 지원 ──────────────────────────────────────
  /** 스모크: 시드 고정 + 시뮬 리셋. 결정론 봇이 대신 플레이한다. */
  smokeSeed(n) {
    this.smokeMode = true;
    this.smokeBaseSeed = n >>> 0;
    this.smokeRun = 0;
    this.subject = 'gugudan';
    this.scope = null;
    this.paused = false;
    $('#overlay-pause').hidden = true;
    this.core = new GameCore({
      seed: n >>> 0, subject: 'gugudan',
      notes: new PersistentNotes({}), now: () => 1700000000000,
    });
    this.go('play');
    this.onResize();
    if (this.scene && this.scene.ready) this.scene.resetWorld();
    this.core.start();
    this.onQuestion();

    const rng = makeRng((n >>> 0) ^ 0x5f356495);
    let pending = null;
    this.autoBot = (core) => {
      if (core.phase !== PHASE.QUESTION) { pending = null; return null; }
      if (!core.answered && !pending) {
        const k = core.question.choices.length;
        const knows = rng() < 0.75;
        pending = {
          at: core.t + 260 + rng() * 380,
          choice: knows ? core.question.answerIndex : Math.floor(rng() * k) % k,
        };
      }
      if (pending && core.t >= pending.at) {
        const choice = pending.choice;
        pending = null;
        return this.core.input(choice);
      }
      return null;
    };
  }

  /** 스모크 전용: 같은 시드에서 결정론적으로 다음 판을 잇는다(저장소에 쓰지 않는다) */
  smokeRestart() {
    this.smokeRun += 1;
    const next = (this.smokeBaseSeed + this.smokeRun * 2654435761) >>> 0;
    this.core = new GameCore({
      seed: next, subject: 'gugudan',
      notes: new PersistentNotes({}), now: () => 1700000000000,
    });
    if (this.scene && this.scene.ready) this.scene.resetWorld();
    this.core.start();
    this.onQuestion();
  }

  /**
   * 안정 해시 — «의미 있는 상태»만 넣는다.
   * 🔴 시계(t)를 넣으면 무동작 구현도 해시가 매번 바뀌어 결정론 검사가 자명하게 통과한다.
   */
  hash() {
    const c = this.core;
    if (!c) return '0';
    const q = c.question;
    const parts = [
      c.floor, c.hearts, c.coins, c.streak, c.phase,
      c.stats.asked, c.stats.correct, c.stats.timeouts, this.smokeRun || 0,
      q ? q.id : '-', q ? q.answerIndex : '-', q ? q.choices.join(',') : '-',
    ].join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < parts.length; i++) {
      h ^= parts.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }
}

export { emptySave };
