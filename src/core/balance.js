// 밸런스 상수 — 단일 진실원.
// 게임 코드·프로브·게이트·문서 재생성 스크립트가 전부 이 파일을 import 한다.
// 🚫 다른 파일에서 이 수치를 다시 적지 말 것(L-070: 손계산 전사가 어긋난다).

// 🔴 난이도의 정본. 2026-09-04 상향 — 사용자: 「너무 쉽다 · 탈락은 언제 하는겨」.
//    이전 값(T0 3.2 · K 0.011 · TMIN 1.0)은 하한에 **200층에서야** 닿아서
//    다 아는 아이는 사실상 죽지 않았다 — 엔드리스인데 «실력 천장»이 없었다.
//    지금은 90층 부근에서 하한에 닿고, 그 하한이 사람 반응시간(평균 0.85초) 언저리라
//    아무리 잘 알아도 언젠가 손이 못 따라간다. 그게 「한 판 더」를 만든다.
export const TIMER = {
  T0: 2.6,      // 층 1 기준 상한(초)
  K: 0.021,     // 층당 감소(초)
  TMIN: 0.85,   // 바닥(초) — 반응시간 평균과 같은 자리
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

// 2갈래는 찍어서 50% 다. 그 구간이 길면 «공부 안 해도 오르는» 구간이 길어진다.
export const BRANCH = {
  THREE_WAY_FROM: 8,   // 이 층부터 3갈래가 50% 확률로 등장
  THREE_WAY_FULL: 26,  // 이 층부터 항상 3갈래
  MIX_RATIO: 0.5,
};

// 🔴 난이도 계단의 «층 경계» 정본. 문항 등급(questions.maxTierFor)과 BGM 강도(ui/sound.js)가
//    같은 배열을 읽는다 — 음악이 세지는 층과 문제가 어려워지는 층이 어긋나면
//    아이는 「왜 갑자기 어렵지」를 귀로 예고받지 못한다(둘을 따로 적어 두면 반드시 어긋난다, L-070).
export const TIER_FLOORS = [10, 25];   // [등급2 개방층, 등급3 개방층]

/** 층 n 이 속한 강도 단계(0·1·2) */
export function tierIndexFor(floor) {
  let i = 0;
  for (const f of TIER_FLOORS) if (floor >= f) i += 1;
  return i;
}

/** 층 n 이 속한 단계가 «시작된» 층 — BGM 재생속도 램프의 기준점 */
export function tierStartFor(floor) {
  const i = tierIndexFor(floor);
  return i === 0 ? 1 : TIER_FLOORS[i - 1];
}

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

/** 밴드당 최소 낱말 수 — 이보다 적으면 한 판 안에 같은 단어가 돌아와 «암기 게임»이 된다.
 *  🔴 이 값을 적는 곳은 여기 하나뿐이다. 테스트도 데이터 게이트도 여기를 읽는다. */
export const MIN_WORDS_PER_BAND = 500;

export const SAVE = {
  KEY: 'oreudap:progress',
  VERSION: 2,
};

/** 성능 예산 — 등급형(L-093: vsync 스냅 때문에 16.7 로 적으면 영구 미달) */
export const PERF = {
  P95_DESKTOP_MS: 17.5,
  P95_MOBILE_MS: 34,
  INITIAL_GZIP_BYTES: 3 * 1024 * 1024,
  // 🔴 «플레이하려고 받는 것»(TOTAL)과 «필요할 때 한 개씩 받는 것»(ONDEMAND)은 다른 예산이다.
  //    8MB 상한은 번들 이야기다. 낱말 발음 943개는 4KB 짜리를 문제당 하나씩 받는 콘텐츠라
  //    합쳐서 재면 「받지도 않는 3.8MB」때문에 게이트가 빨간불이 된다 — 틀린 것을 재는 것이다.
  //    대신 온디맨드에도 상한을 두고, «첫 문제 전에 한 건도 안 받는다»를 게이트가 직접 확인한다.
  TOTAL_BYTES: 8 * 1024 * 1024,
  ONDEMAND_DIRS: ['assets/say'],
  ONDEMAND_BYTES: 6 * 1024 * 1024,
  DRAWCALL_WARN: 60,
};
