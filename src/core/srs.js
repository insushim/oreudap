// 간격 반복(SRS) — GDD §1-3-6
//
// 카운터가 둘이다. 서로 다른 것을 세고, 화면 문구도 갈라 놓는다:
//  · 세션 복습 큐  : 이번 판 안에서만. 틀린 문항을 [3,7,15] 문항 뒤에 다시 낸다. 3회 맞히면 졸업.
//  · 영속 오답노트 : 날짜 기반 박스. BOX_DAYS=[1,3,7,16], MAX_BOX=4. 배지는 «이쪽»을 읽는다.
// 세션에서 졸업해도 영속 박스는 남는다 — 그래서 며칠 뒤 또 나온다. 그건 버그가 아니라 설계이고,
// 진행도를 눈에 보이게 만들어야 성취로 읽힌다.

import { SRS } from './balance.js';

export class SessionQueue {
  constructor() {
    this.entries = new Map(); // id -> { stage, correct, dueAt }
  }

  /** 오답 → 큐에 넣거나 단계를 되돌린다 */
  onWrong(id, index) {
    const e = this.entries.get(id) || { stage: 0, correct: 0, dueAt: 0 };
    e.stage = 0;
    e.correct = 0;
    e.dueAt = index + SRS.SESSION_INTERVALS[0];
    this.entries.set(id, e);
  }

  /** 정답 → 다음 간격으로. 졸업하면 큐에서 뺀다. @returns {'graduated'|'advanced'|null} */
  onCorrect(id, index) {
    const e = this.entries.get(id);
    if (!e) return null;
    e.correct += 1;
    if (e.correct >= SRS.SESSION_GRADUATE) {
      this.entries.delete(id);
      return 'graduated';
    }
    e.stage = Math.min(e.stage + 1, SRS.SESSION_INTERVALS.length - 1);
    e.dueAt = index + SRS.SESSION_INTERVALS[e.stage];
    return 'advanced';
  }

  /** 지금(index) 다시 낼 문항 id. 없으면 null. 가장 오래 밀린 것부터. */
  due(index) {
    let best = null;
    for (const [id, e] of this.entries) {
      if (e.dueAt <= index && (best === null || e.dueAt < best.dueAt)) best = { id, dueAt: e.dueAt };
    }
    return best ? best.id : null;
  }

  has(id) { return this.entries.has(id); }
  get size() { return this.entries.size; }
}

/** 날짜를 YYYY-MM-DD 로 (로컬 기준) */
export function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class PersistentNotes {
  /** @param {{[id:string]: {box:number, due:string}}} data */
  constructor(data = {}) {
    this.data = data;
  }

  box(id) {
    return this.data[id] ? this.data[id].box : 0;
  }

  /** 배지용 진행도 — 영속 박스를 읽는다(세션 카운터가 아니다) */
  progress(id) {
    const box = this.box(id);
    return { box, max: SRS.MAX_BOX, graduated: box >= SRS.MAX_BOX };
  }

  /**
   * 정답 → 박스 진급. 🔴 «이미 틀린 적 있는» 항목만 진급시킨다.
   * 처음 본 문항을 맞혔다고 오답노트에 넣으면, 한 번도 안 틀린 문제로 노트가 가득 찬다.
   * @returns {'graduated'|'advanced'|null} null = 오답노트에 없던 항목(아무 일도 안 함)
   */
  onCorrect(id, nowTs) {
    const cur = this.data[id];
    if (!cur) return null;
    cur.box = Math.min(SRS.MAX_BOX, cur.box + 1);
    cur.due = dayKey(nowTs + daysMs(SRS.BOX_DAYS[cur.box - 1]));
    return cur.box >= SRS.MAX_BOX ? 'graduated' : 'advanced';
  }

  onWrong(id, nowTs) {
    const cur = this.data[id] || { box: 0, due: dayKey(nowTs) };
    cur.box = Math.max(0, cur.box - 1);
    cur.due = dayKey(nowTs); // 오늘 바로 다시 대상
    this.data[id] = cur;
    return cur.box;
  }

  /** 출제 가중치(1 ~ WEIGHT_MAX). 약한 항목을 «더 자주» 낸다(더 어렵게가 아니다). */
  weight(id, nowTs) {
    const cur = this.data[id];
    if (!cur) return 1;
    if (cur.box >= SRS.MAX_BOX) return 1;
    const overdue = dayKey(nowTs) >= cur.due;
    if (!overdue) return 1;
    const deficit = SRS.MAX_BOX - cur.box; // 1..4
    return Math.min(SRS.WEIGHT_MAX, 1 + deficit * 0.5);
  }

  /** 오답노트 화면용 목록 */
  list() {
    return Object.entries(this.data)
      .filter(([, v]) => v.box < SRS.MAX_BOX)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.box - b.box);
  }
}

function daysMs(d) { return d * 24 * 60 * 60 * 1000; }
