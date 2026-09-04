// 정답 위치 덱 (GDD §1-3-4, L-109)
//
// 왜 셔플이 아니라 덱인가: 매번 균등 셔플하면 «표본이 적을 때» 한 위치로 쏠린다(실측 χ²=36.3).
// 덱은 균등을 확률이 아니라 구조로 보장한다.
//
// 왜 소진하지 않는가: 덱을 끝까지 쓰면 남은 장수를 세는 플레이어가 마지막 위치를
// 문제를 풀지 않고 확정할 수 있다(codex CRITICAL). 잔여 REFILL_AT 장 이하가 되면
// 새 덱을 섞어 **잔여분과 합쳐** 계속 뽑는다 — 경계가 사라진다.
//
// 병합 불변식: 병합 직후 «직전 출제 이력 + 새 덱 순서»에 같은 위치 4연속이 생기면 재셔플한다.

import { DECK } from './balance.js';
import { shuffle } from './rng.js';

const SOURCE = {
  2: DECK.TWO_WAY,
  3: DECK.THREE_WAY,
};

export class PositionDeck {
  /**
   * @param {number} branches 갈래 수 (2 또는 3)
   * @param {() => number} rng
   */
  constructor(branches, rng) {
    if (!SOURCE[branches]) throw new Error(`지원하지 않는 갈래 수: ${branches}`);
    this.branches = branches;
    this.rng = rng;
    this.cards = [];
    this.history = []; // 최근 출제 위치(최대 MAX_SAME_RUN 개 유지)
    this.refill();
  }

  /** 남은 카드에 새 덱 한 벌을 섞어 합친다. 4연속이 생기면 다시 섞는다. */
  refill() {
    for (let attempt = 0; attempt < DECK.RESHUFFLE_TRIES; attempt++) {
      const fresh = shuffle(this.rng, SOURCE[this.branches].slice());
      const merged = this.cards.concat(fresh);
      if (!hasRun(this.history.concat(merged), DECK.MAX_SAME_RUN)) {
        this.cards = merged;
        return;
      }
    }
    // 재셔플로 못 풀면 4번째 카드를 다른 위치와 교환해 강제로 끊는다.
    const merged = this.cards.concat(shuffle(this.rng, SOURCE[this.branches].slice()));
    this.cards = breakRuns(this.history.concat(merged), DECK.MAX_SAME_RUN).slice(this.history.length);
  }

  /** 다음 정답 위치('L'|'C'|'R') */
  draw() {
    if (this.cards.length <= DECK.REFILL_AT) this.refill();
    const card = this.cards.shift();
    this.history.push(card);
    if (this.history.length > DECK.MAX_SAME_RUN) this.history.shift();
    return card;
  }

  /** 위치 문자를 인덱스로 (좌=0, 가운데=1(3갈래), 우=마지막) */
  static toIndex(pos, branches) {
    if (pos === 'L') return 0;
    if (pos === 'R') return branches - 1;
    return 1; // 'C'
  }
}

/** seq 안에 같은 값이 limit 초과로 연속하는가 */
export function hasRun(seq, limit) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run > limit) return true;
  }
  return false;
}

/** limit 초과 연속을 뒤쪽 카드와 교환해 끊는다(결정론) */
export function breakRuns(seq, limit) {
  const out = seq.slice();
  for (let i = limit; i < out.length; i++) {
    let run = 1;
    for (let j = i; j > 0 && out[j] === out[j - 1]; j--) run++;
    if (run <= limit) continue;
    const swap = out.findIndex((v, k) => k > i && v !== out[i]);
    if (swap === -1) break;
    const t = out[i]; out[i] = out[swap]; out[swap] = t;
  }
  return out;
}
