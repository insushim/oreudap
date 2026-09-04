// 밸런스 상수 — 단일 진실원.
// 게임 코드·프로브·게이트·문서 재생성 스크립트가 전부 이 파일을 import 한다.
// 🚫 다른 파일에서 이 수치를 다시 적지 말 것(L-070: 손계산 전사가 어긋난다).

export const TIMER = {
  T0: 3.2,      // 층 1 기준 상한(초)
  K: 0.011,     // 층당 감소(초)
  TMIN: 1.0,    // 바닥(초)
};

/** 층 n 의 제한시간(초). GDD §1-4-1 */
export function timerFor(floor) {
  return Math.max(TIMER.TMIN, TIMER.T0 - TIMER.K * floor);
}

export const HEART = {
  START: 3,
  MAX: 3,
  STREAK_HEAL: 10, // 스트릭 10마다 하트 +1 (최대치 초과분은 버림)
};

export const BRANCH = {
  THREE_WAY_FROM: 30,  // 이 층부터 3갈래가 50% 확률로 등장
  THREE_WAY_FULL: 60,  // 이 층부터 항상 3갈래
  MIX_RATIO: 0.5,
};

/** 층 n 의 갈래 수. GDD §1-3-3 */
export function branchesFor(floor, rnd) {
  if (floor >= BRANCH.THREE_WAY_FULL) return 3;
  if (floor >= BRANCH.THREE_WAY_FROM) return rnd() < BRANCH.MIX_RATIO ? 3 : 2;
  return 2;
}

export const TIMING = {
  // 🔴 «활성화 이전 입력 버퍼»는 없앴다(2026-09-04 교차검증 3계열 합의).
  //    이 게임은 선택지가 «활성화 순간»에 처음 나타난다 — 그 전의 탭은 정보 없는 손가락이지
  //    이른 선택이 아니다. 버퍼가 있으면 «보지 않은 문제»에 답이 커밋되고, 갈래 수가 2→3으로
  //    바뀌는 경계에서는 본 적 없는 레이아웃의 임의 위치가 판정된다.
  //    ⇒ 문항이 살아 있지 않을 때의 입력은 그냥 무시한다.
  JUMP_MS: 220,
  STUMBLE_MS: 280,
  HIGHLIGHT_MS: 800,      // 오답 시 정답 발판 하이라이트
};

export const COIN = {
  PER_FLOOR: 1,
  STREAK_BONUS: 5,        // 스트릭 10마다
  MISSION: 20,            // 일일 미션 1개당
};

export const SHOP = {
  SKINS: [
    { id: 'fox',     name: '아기 여우',   price: 0 },
    { id: 'rabbit',  name: '토끼',       price: 60 },
    { id: 'penguin', name: '펭귄',       price: 120 },
    { id: 'cat',     name: '고양이',     price: 240 },
    { id: 'bear',    name: '곰돌이',     price: 480 },
    { id: 'owl',     name: '부엉이',     price: 900 },
    { id: 'dragon',  name: '아기 용',    price: 1500 },
  ],
  THEMES: [
    { id: 'dawn',   name: '새벽 하늘', price: 0 },
    { id: 'day',    name: '한낮 하늘', price: 300 },
    { id: 'sunset', name: '노을 하늘', price: 600 },
    { id: 'night',  name: '별밤 하늘', price: 1200 },
  ],
};

/** 층에 따른 하늘 테마 (50층마다 전환) — 해금과 무관한 연출축 */
export const SKY_EVERY = 50;

export const SRS = {
  SESSION_INTERVALS: [3, 7, 15], // 세션 복습 큐: 몇 문항 뒤에 다시 낼지
  SESSION_GRADUATE: 3,           // 세션 큐 졸업 정답 수
  BOX_DAYS: [1, 3, 7, 16],       // 영속 오답노트 박스별 재출제 간격(일)
  MAX_BOX: 4,                    // 졸업 박스
  WEIGHT_MAX: 3,                 // 약점 항목 출제 가중 상한(배)
  NO_REPEAT_WINDOW: 5,           // 무작위 출제에서 직전 N문항 반복 금지(복습 큐는 예외)
};

export const MISSIONS = [
  { id: 'correct30', label: '오늘 정답 30개', type: 'correct', goal: 30, reward: COIN.MISSION },
  { id: 'streak10',  label: '스트릭 10 달성', type: 'streak', goal: 1,  reward: COIN.MISSION },
  { id: 'review5',   label: '오답노트 5문제 정답', type: 'review', goal: 5, reward: COIN.MISSION },
];

export const DECK = {
  TWO_WAY: ['L', 'L', 'L', 'R', 'R', 'R'],
  THREE_WAY: ['L', 'L', 'C', 'C', 'R', 'R'],
  REFILL_AT: 2,        // 잔여 이 장 이하가 되면 새 덱을 섞어 합친다(소진 금지 = 카운팅 방어)
  MAX_SAME_RUN: 3,     // 같은 위치 연속 상한(4연속 금지)
  RESHUFFLE_TRIES: 20,
};

export const SAVE = {
  KEY: 'oreudap:progress',
  VERSION: 2,
};

/** 성능 예산 — 등급형(L-093: vsync 스냅 때문에 16.7 로 적으면 영구 미달) */
export const PERF = {
  P95_DESKTOP_MS: 17.5,
  P95_MOBILE_MS: 34,
  INITIAL_GZIP_BYTES: 3 * 1024 * 1024,
  TOTAL_BYTES: 8 * 1024 * 1024,
  DRAWCALL_WARN: 60,
};
