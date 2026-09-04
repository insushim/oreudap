// 화면 레이아웃 단일 진실원.
// 🔴 DOM 오버레이(선택지 버튼)와 Phaser 월드(발판 스프라이트)가 «같은 이 함수»를 쓴다.
//    두 벌로 나뉘면 화면이 어긋나고, 그건 수치 검사가 못 잡는다.

export const MAX_CONTENT_W = 560;
export const MIN_TAP = 44;   // 접근성 최소 터치 타깃(px)
export const CHOICE_MIN_H = 88;

export function computeLayout(w, h) {
  // 🔴 아주 좁은 뷰포트에서 열 너비가 44px 밑으로 내려가면 «선언한 최소 터치 크기»가 깨진다.
  //    화면을 넘더라도 최소 폭을 지킨다(스크롤이 생기는 편이 못 누르는 것보다 낫다).
  const MIN_CONTENT = MIN_TAP * 3 + 24;
  const contentW = Math.max(MIN_CONTENT, Math.min(w - 24, MAX_CONTENT_W));
  const contentLeft = (w - contentW) / 2;
  const landscape = w > h;
  // 가로 화면에서는 카드/발판 밴드를 위로 당겨 하단 여백을 확보한다.
  const bandRatio = landscape ? 0.50 : 0.455;
  const bandH = Math.max(CHOICE_MIN_H, Math.min(150, h * (landscape ? 0.24 : 0.155)));
  return {
    w, h, landscape, contentW, contentLeft,
    cardTop: Math.max(56, h * (landscape ? 0.10 : 0.115)),
    cardH: Math.max(84, Math.min(150, h * (landscape ? 0.20 : 0.135))),
    bandY: h * bandRatio,
    bandH,
    charY: h * (landscape ? 0.80 : 0.735),
    charSize: Math.min(contentW * 0.34, h * 0.16),
    gap: contentW > 420 ? 16 : 10,
  };
}

/**
 * k개 갈래의 열 위치. 좌 → (가운데) → 우 순서이며 인덱스가 곧 선택지 인덱스다.
 * @returns {{x:number, y:number, w:number, h:number, cx:number, cy:number}[]}
 */
export function columns(layout, k) {
  const { contentLeft, contentW, bandY, bandH, gap } = layout;
  const colW = (contentW - gap * (k - 1)) / k;
  const out = [];
  for (let i = 0; i < k; i++) {
    const x = contentLeft + i * (colW + gap);
    out.push({ x, y: bandY - bandH / 2, w: colW, h: bandH, cx: x + colW / 2, cy: bandY });
  }
  return out;
}
