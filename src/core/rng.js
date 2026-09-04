// 시드 기반 결정론 RNG. Math.random 은 코어에서 쓰지 않는다(결정론 게이트).
// xorshift32 — 빠르고 재현 가능하며 게임 밸런스용으로 충분하다.

export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** 정수 [0, n) */
export function randInt(rng, n) {
  return Math.floor(rng() * n) % n;
}

/** 제자리 Fisher-Yates */
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function pick(rng, arr) {
  return arr[randInt(rng, arr.length)];
}

/** 가중 추출. weights[i] > 0 */
export function pickWeighted(rng, arr, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}
