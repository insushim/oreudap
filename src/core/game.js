// 게임 코어 — DOM·Phaser 를 import 하지 않는다(headless 1:1 테스트의 전제).
// 시간은 전부 advance(dt) 로만 흐른다. rAF 에 매달리지 않으므로 숨은 탭에서도 검증 가능하다.

import {
  HEART, TIMING, COIN, timerFor, branchesFor,
} from './balance.js';
import { makeRng } from './rng.js';
import { QuestionSource } from './questions.js';
import { SessionQueue, PersistentNotes } from './srs.js';

export const PHASE = {
  IDLE: 'idle',
  QUESTION: 'question',
  RESOLVE: 'resolve',
  OVER: 'over',
};

export class GameCore {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {string} o.subject 'gugudan' | 'words34' | 'words56'
   * @param {number[]} [o.scope]
   * @param {PersistentNotes} [o.notes]
   * @param {() => number} [o.now] 벽시계(영속 SRS 가중·박스 날짜에만)
   */
  constructor({ seed, subject, scope, notes, now = () => Date.now() }) {
    this.seed = seed >>> 0;
    this.subject = subject;
    this.rng = makeRng(this.seed);
    this.notes = notes || new PersistentNotes();
    this.sessionQueue = new SessionQueue();
    this.nowFn = now;
    this.source = new QuestionSource({
      subject, scope, rng: this.rng, sessionQueue: this.sessionQueue, notes: this.notes, now,
    });

    this.t = 0;
    this.floor = 0;
    this.hearts = HEART.START;
    this.streak = 0;
    this.bestStreak = 0;
    this.coins = 0;
    this.phase = PHASE.IDLE;
    this.question = null;
    this.activeAt = 0;
    this.timerMs = 0;
    this.answered = false;
    this.resolveUntil = 0;
    this.pendingOver = false;
    this.lastResult = null;

    this.stats = {
      asked: 0, correct: 0, wrong: 0, timeouts: 0,
      reviewCorrect: 0, wrongIds: [], perId: {},
    };
  }

  start() {
    if (this.phase !== PHASE.IDLE) return;
    this.floor = 0;
    this._nextQuestion();
  }

  /** 남은 시간(ms). 문항 국면이 아니면 0 */
  get timeLeftMs() {
    if (this.phase !== PHASE.QUESTION || this.answered) return 0;
    return Math.max(0, this.timerMs - (this.t - this.activeAt));
  }

  get timeRatio() {
    return this.timerMs > 0 ? this.timeLeftMs / this.timerMs : 0;
  }

  get accuracy() {
    return this.stats.asked > 0 ? this.stats.correct / this.stats.asked : 0;
  }

  /**
   * 입력. 문항이 «지금 살아 있을 때»만 판정한다.
   * 🔴 버퍼링하지 않는다 — 선택지는 활성화 순간에 처음 보이므로, 그 전의 입력은
   *    «보지 않은 문제에 대한 답»이 된다. 해결 국면·타임아웃 이후 입력도 같은 이유로 무시한다.
   * @returns {{type:string}}
   */
  input(choiceIndex) {
    if (this.phase !== PHASE.QUESTION || this.answered) return { type: 'ignored' };
    return this._judge(choiceIndex);
  }

  /** 시간을 dt(ms) 만큼 흘린다. 발생한 이벤트 배열을 돌려준다. */
  advance(dtMs) {
    const events = [];
    if (!Number.isFinite(dtMs) || dtMs < 0) return events; // 음수·NaN dt 방어
    // 🔴 여기서 dt 를 자르지 않는다 — 자르면 게임 시계가 벽시계와 어긋나 「끊긴다」로 읽힌다.
    //    숨은 탭 복귀 같은 거대 dt 는 «호출자»(씬)가 프레임 델타 단계에서 클램프한다.
    this.t += dtMs;

    for (let guard = 0; guard < 64; guard++) {
      if (this.phase === PHASE.QUESTION && !this.answered) {
        if (this.t - this.activeAt >= this.timerMs) {
          events.push(this._resolveWrong(null, true));
          continue;
        }
        break;
      }
      if (this.phase === PHASE.RESOLVE && this.t >= this.resolveUntil) {
        if (this.pendingOver) {
          this.phase = PHASE.OVER;
          events.push({
            type: 'gameover', floor: this.floor, stats: this.stats,
            bestStreak: this.bestStreak, coins: this.coins,
          });
          break;
        }
        events.push(...this._nextQuestion());
        continue;
      }
      break;
    }
    return events;
  }

  _nextQuestion() {
    const events = [];
    const branches = branchesFor(this.floor + 1, this.rng);
    this.question = this.source.next(branches);
    this.activeAt = this.t;
    this.timerMs = timerFor(this.floor + 1) * 1000;
    this.answered = false;
    this.phase = PHASE.QUESTION;
    this.stats.asked += 1;
    events.push({ type: 'question', question: this.question, branches, timerMs: this.timerMs });
    return events;
  }

  _judge(choiceIndex) {
    if (this.answered || this.phase !== PHASE.QUESTION) return { type: 'ignored' };
    this.answered = true;                       // 문항당 판정 정확히 1회(D3)
    const correct = choiceIndex === this.question.answerIndex;
    return correct ? this._resolveCorrect() : this._resolveWrong(choiceIndex, false);
  }

  _resolveCorrect() {
    const q = this.question;
    this.floor += 1;
    this.coins += COIN.PER_FLOOR;
    this.streak += 1;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    this.stats.correct += 1;
    this._track(q.id, true);

    let healed = false;
    let bonus = 0;
    if (this.streak % HEART.STREAK_HEAL === 0) {
      bonus = COIN.STREAK_BONUS;
      this.coins += bonus;
      if (this.hearts < HEART.MAX) { this.hearts += 1; healed = true; }
    }
    const graduated = this.sessionQueue.has(q.id)
      ? this.sessionQueue.onCorrect(q.id, this.source.index)
      : null;
    if (q.fromReview) this.stats.reviewCorrect += 1;
    const boxState = this.notes.onCorrect(q.id, this.nowFn());

    this.phase = PHASE.RESOLVE;
    this.resolveUntil = this.t + TIMING.JUMP_MS;
    this.lastResult = {
      type: 'correct', floor: this.floor, healed, bonus, graduated, boxState,
      box: this.notes.box(q.id), id: q.id,
    };
    return this.lastResult;
  }

  _resolveWrong(choiceIndex, isTimeout) {
    const q = this.question;
    this.answered = true;
    this.hearts -= 1;
    this.streak = 0;
    this.stats.wrong += 1;
    if (isTimeout) this.stats.timeouts += 1;
    this._track(q.id, false);
    if (!this.stats.wrongIds.includes(q.id)) this.stats.wrongIds.push(q.id);

    this.sessionQueue.onWrong(q.id, this.source.index);
    this.notes.onWrong(q.id, this.nowFn());

    this.phase = PHASE.RESOLVE;
    // 하트가 0이면 하이라이트만 보여 주고 결과 화면으로 간다 — 자동 이동·다음 문항 없음.
    this.pendingOver = this.hearts <= 0;
    this.resolveUntil = this.t + TIMING.STUMBLE_MS + TIMING.HIGHLIGHT_MS;
    this.lastResult = {
      type: isTimeout ? 'timeout' : 'wrong',
      chose: choiceIndex,
      answerIndex: q.answerIndex,
      answerText: q.answerText,
      hearts: this.hearts,
      box: this.notes.box(q.id),
      id: q.id,
      over: this.pendingOver,
    };
    return this.lastResult;
  }

  _track(id, ok) {
    const rec = this.stats.perId[id] || { asked: 0, correct: 0 };
    rec.asked += 1;
    if (ok) rec.correct += 1;
    this.stats.perId[id] = rec;
  }

  snapshot() {
    return {
      t: this.t,
      phase: this.phase,
      floor: this.floor,
      hearts: this.hearts,
      streak: this.streak,
      coins: this.coins,
      question: this.question,
      timeLeftMs: this.timeLeftMs,
      timeRatio: this.timeRatio,
      accuracy: this.accuracy,
      stats: this.stats,
    };
  }
}
