// 문항 은행 + 출제 — GDD §1-3-5~7
// 정답 위치는 반드시 PositionDeck 에서 온다(직접 셔플 금지, L-109).

import { WORDS_G34 } from '../data/words-g34.js';
import { WORDS_G56 } from '../data/words-g56.js';
import { gugudanDistractors, wordDistractors } from './distractors.js';
import { PositionDeck } from './positionDeck.js';
import { SRS, tierIndexFor } from './balance.js';
import { pickWeighted } from './rng.js';

export const SUBJECTS = {
  gugudan: { id: 'gugudan', label: '구구단', hint: '몇일까요?' },
  words34: { id: 'words34', label: '영단어 3·4학년', hint: '무슨 뜻일까요?' },
  words56: { id: 'words56', label: '영단어 5·6학년', hint: '무슨 뜻일까요?' },
};

/**
 * 문항 난이도 등급 1~3.
 * 🔴 「올라갈수록 어려워진다」의 정본. 시계만 빨라지면 문제는 처음이나 90층이나 같아서
 *    «높이»가 실력이 아니라 손속도만 재게 된다. 등급을 층으로 열어 «내용»도 올라가게 한다.
 *
 * 구구단 — 아이가 실제로 어려워하는 순서로 나눈다:
 *   1등급 2·5단, 그리고 ×1·×2·×5 (덧셈으로도 풀린다)
 *   3등급 7·8·9단 × 6~9 (외워야만 나온다)
 *   2등급 나머지
 * 영단어 — 철자 길이 + 방향. 「뜻 → 영어」는 재인이 아니라 «인출»이라 한 단계 어렵다.
 */
export function tierOf(item) {
  if (item.a != null) {
    const { a, b } = item;
    if (a === 2 || a === 5 || b === 1 || b === 2 || b === 5) return 1;
    if (a >= 7 && b >= 6) return 3;
    return 2;
  }
  const len = item.entry.w.length;
  const base = len <= 4 ? 1 : len <= 6 ? 2 : 3;
  return item.dir === 'k2w' ? Math.min(3, base + 1) : base;
}

/** 층 n 에서 «열려 있는» 최고 등급. GDD §1-4-1 */
export function maxTierFor(floor) {
  return tierIndexFor(floor) + 1;   // 층 경계는 balance.TIER_FLOORS 하나뿐이다
}

export function buildBank(subject, scope) {
  if (subject === 'gugudan') {
    const dans = scope && scope.length ? scope : [2, 3, 4, 5, 6, 7, 8, 9];
    const items = [];
    for (const a of dans) {
      for (let b = 1; b <= 9; b++) {
        const it = { id: `g:${a}x${b}`, a, b };
        it.tier = tierOf(it);
        items.push(it);
      }
    }
    return items;
  }
  const pool = subject === 'words34' ? WORDS_G34 : WORDS_G56;
  const items = [];
  for (const e of pool) {
    for (const dir of ['w2k', 'k2w']) {
      const it = { id: `w:${subject}:${e.w}:${dir}`, entry: e, dir };
      it.tier = tierOf(it);
      items.push(it);
    }
  }
  return items;
}

export class QuestionSource {
  /**
   * @param {object} o
   * @param {string} o.subject
   * @param {number[]} [o.scope] 구구단 단 목록
   * @param {() => number} o.rng 세계 난수(문항 선택·오답·갈래·위치)
   * @param {import('./srs.js').SessionQueue} o.sessionQueue
   * @param {import('./srs.js').PersistentNotes} o.notes
   * @param {() => number} [o.now] 현재 시각(ms) — 영속 박스 가중에만 쓴다
   */
  constructor({ subject, scope, rng, sessionQueue, notes, now = () => Date.now() }) {
    this.subject = subject;
    this.rng = rng;
    this.items = buildBank(subject, scope);
    this.byId = new Map(this.items.map((it) => [it.id, it]));
    this.pool = subject === 'gugudan' ? null : (subject === 'words34' ? WORDS_G34 : WORDS_G56);
    this.sessionQueue = sessionQueue;
    this.notes = notes;
    this.now = now;
    this.recent = [];
    // 🔴 이번 판에 몇 번 냈는지. 반복 금지 창(직전 5문항)만으로는 «한 판에 세 번»을 못 막는다 —
    //    창을 벗어나면 가중이 그대로 돌아오기 때문이다. 낸 만큼 덜 나오게 한다.
    //    약점 가중(notes.weight)과 «곱»해지므로 틀린 문항이 다시 나오는 길은 막지 않는다.
    this.asked = new Map();
    this.index = 0;
    this.decks = { 2: new PositionDeck(2, rng), 3: new PositionDeck(3, rng) };
  }

  /** 다음 문항. branches·floor 는 호출자가 층에서 계산해 넘긴다. */
  next(branches, floor = 1) {
    const deck = this.decks[branches];
    if (!deck) throw new Error(`덱 없음: ${branches}`);

    // ① 복습 큐가 우선한다. 반복 금지 창(NO_REPEAT_WINDOW)의 «예외»다 — 의도된 반복이므로.
    let item = null;
    let fromReview = false;
    const dueId = this.sessionQueue.due(this.index + 1); // this.index+1 = 지금 낼 문항 번호
    if (dueId && this.byId.has(dueId)) {
      item = this.byId.get(dueId);
      fromReview = true;
    } else {
      item = this.pickWeighted(floor);
    }

    this.index += 1;
    this.asked.set(item.id, (this.asked.get(item.id) || 0) + 1);
    this.recent.push(item.id);
    if (this.recent.length > SRS.NO_REPEAT_WINDOW) this.recent.shift();

    const pos = deck.draw();
    const answerIndex = PositionDeck.toIndex(pos, branches);
    const built = this.build(item, branches, answerIndex);
    return { ...built, id: item.id, fromReview, index: this.index };
  }

  pickWeighted(floor = 1) {
    const banned = new Set(this.recent);
    const maxTier = maxTierFor(floor);
    // 🔴 「한 판에 같은 문항은 두 번까지」를 규칙으로 «직접» 쓴다.
    //    가중 감쇠만으로는 꼬리가 남는다 — 구구단은 은행이 72종뿐이라 확률로는 못 막는다(실측).
    //    복습 큐(틀린 문항 재출제)는 이 경로를 타지 않으므로 학습 반복은 그대로 살아 있다.
    const MAX_PER_RUN = 2;
    const fresh = (it) => (this.asked.get(it.id) || 0) < MAX_PER_RUN;
    let candidates = this.items.filter((it) => !banned.has(it.id) && it.tier <= maxTier && fresh(it));
    if (candidates.length < 4) candidates = this.items.filter((it) => !banned.has(it.id) && fresh(it));
    // 🔴 범위를 좁게 고르면(예: 7단만) 낮은 등급이 아예 없을 수 있다 —
    //    그때는 등급 제한을 풀어야 «낼 문항이 없는» 상태가 되지 않는다.
    if (candidates.length < 4) candidates = this.items.filter((it) => !banned.has(it.id));
    if (candidates.length === 0) candidates = this.items;
    const ts = this.now();
    // 높이 올라갈수록 어려운 등급을 더 자주 낸다(약점 가중과 곱해진다).
    const tierBoost = floor >= 40 ? 2 : floor >= 25 ? 1.4 : 1;
    const weights = candidates.map((it) => this.notes.weight(it.id, ts)
      * (it.tier === maxTier && maxTier > 1 ? tierBoost : 1)
      / (1 + 2 * (this.asked.get(it.id) || 0)));
    return pickWeighted(this.rng, candidates, weights);
  }

  build(item, branches, answerIndex) {
    const need = branches - 1;
    if (this.subject === 'gugudan') {
      const answer = item.a * item.b;
      const wrong = gugudanDistractors(item.a, item.b, need, this.rng);
      const choices = [];
      let wi = 0;
      for (let i = 0; i < branches; i++) choices.push(i === answerIndex ? String(answer) : String(wrong[wi++]));
      return {
        subject: 'gugudan',
        prompt: `${item.a} × ${item.b}`,
        promptSub: '',
        choices,
        answerIndex,
        answerText: String(answer),
      };
    }
    const dir = item.dir;
    const field = dir === 'w2k' ? 'k' : 'w';
    const wrong = wordDistractors(item.entry, this.pool, dir, need, this.rng);
    const choices = [];
    let wi = 0;
    for (let i = 0; i < branches; i++) {
      choices.push(i === answerIndex ? item.entry[field] : wrong[wi++][field]);
    }
    return {
      subject: this.subject,
      prompt: dir === 'w2k' ? item.entry.w : item.entry.k,
      promptSub: dir === 'w2k' ? '뜻은?' : '영어로?',
      choices,
      answerIndex,
      answerText: item.entry[field],
    };
  }

  /** 오답노트 화면에서 문항 하나를 사람이 읽는 형태로 */
  describe(id) {
    const it = this.byId.get(id);
    if (!it) return null;
    if (this.subject === 'gugudan') return { q: `${it.a} × ${it.b}`, a: String(it.a * it.b) };
    return it.dir === 'w2k'
      ? { q: it.entry.w, a: it.entry.k }
      : { q: it.entry.k, a: it.entry.w };
  }
}

/** 문항 id 를 사람이 읽는 형태로 (은행 없이) */
export function describeId(id) {
  if (id.startsWith('g:')) {
    const [a, b] = id.slice(2).split('x').map(Number);
    return { q: `${a} × ${b}`, a: String(a * b) };
  }
  const [, band, w, dir] = id.split(':');
  const pool = band === 'words34' ? WORDS_G34 : WORDS_G56;
  const e = pool.find((x) => x.w === w);
  if (!e) return null;
  return dir === 'w2k' ? { q: e.w, a: e.k } : { q: e.k, a: e.w };
}
