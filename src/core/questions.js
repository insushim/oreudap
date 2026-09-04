// 문항 은행 + 출제 — GDD §1-3-5~7
// 정답 위치는 반드시 PositionDeck 에서 온다(직접 셔플 금지, L-109).

import { WORDS_G34 } from '../data/words-g34.js';
import { WORDS_G56 } from '../data/words-g56.js';
import { gugudanDistractors, wordDistractors } from './distractors.js';
import { PositionDeck } from './positionDeck.js';
import { SRS } from './balance.js';
import { pickWeighted } from './rng.js';

export const SUBJECTS = {
  gugudan: { id: 'gugudan', label: '구구단', hint: '몇일까요?' },
  words34: { id: 'words34', label: '영단어 3·4학년', hint: '무슨 뜻일까요?' },
  words56: { id: 'words56', label: '영단어 5·6학년', hint: '무슨 뜻일까요?' },
};

export function buildBank(subject, scope) {
  if (subject === 'gugudan') {
    const dans = scope && scope.length ? scope : [2, 3, 4, 5, 6, 7, 8, 9];
    const items = [];
    for (const a of dans) {
      for (let b = 1; b <= 9; b++) items.push({ id: `g:${a}x${b}`, a, b });
    }
    return items;
  }
  const pool = subject === 'words34' ? WORDS_G34 : WORDS_G56;
  const items = [];
  for (const e of pool) {
    items.push({ id: `w:${subject}:${e.w}:w2k`, entry: e, dir: 'w2k' });
    items.push({ id: `w:${subject}:${e.w}:k2w`, entry: e, dir: 'k2w' });
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
    this.index = 0;
    this.decks = { 2: new PositionDeck(2, rng), 3: new PositionDeck(3, rng) };
  }

  /** 다음 문항. branches 는 호출자가 층에서 계산해 넘긴다. */
  next(branches) {
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
      item = this.pickWeighted();
    }

    this.index += 1;
    this.recent.push(item.id);
    if (this.recent.length > SRS.NO_REPEAT_WINDOW) this.recent.shift();

    const pos = deck.draw();
    const answerIndex = PositionDeck.toIndex(pos, branches);
    const built = this.build(item, branches, answerIndex);
    return { ...built, id: item.id, fromReview, index: this.index };
  }

  pickWeighted() {
    const banned = new Set(this.recent);
    let candidates = this.items.filter((it) => !banned.has(it.id));
    if (candidates.length === 0) candidates = this.items;
    const ts = this.now();
    const weights = candidates.map((it) => this.notes.weight(it.id, ts));
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
