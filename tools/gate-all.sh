#!/usr/bin/env bash
# 전체 게이트 — 배포 전 이 하나만 돌리면 된다.
# 종료코드 0 PASS · 1 FAIL · 3 미실행(도구가 죽음)
set -uo pipefail
cd "$(dirname "$0")/.."

FAILED=()
run() {
  local name="$1"; shift
  echo ""
  echo "▶ $name"
  if "$@"; then
    echo "  ✅ $name"
  else
    local rc=$?
    echo "  ❌ $name (rc=$rc)"
    FAILED+=("$name(rc=$rc)")
  fi
}

run "유닛 테스트 (D2~D13·D27)"        npx vitest run --reporter=dot
run "학습 데이터 (D23)"               node tools/check-data.mjs
run "정답 위치 균형 (D8)"             node tools/answer-balance.mjs
run "밸런스 격자 (D10·D8b)"           node tools/probe-grid.mjs N=300 --gate
run "결정론 (D19)"                    "$HOME/.claude/skills/game-builder/tools/check-determinism.sh"
run "GDD 표 동기화"                   node tools/sync-gdd-table.mjs --check
run "에셋 매니페스트"                  python3 tools/process-assets.py --check
run "라이선스 원장 (D20)"             node tools/make-license.mjs --check
run "라이선스 게이트 (D20)"           "$HOME/.claude/bin/free-assets.sh" verify public/assets
run "빌드"                            npx vite build
run "2D 스모크 (D17·D18·D19·D22)"     node "$HOME/.claude/skills/game-builder/tools/phaser-smoke.mjs" --dir dist --page index.html --port 8181 --steps 600 --scene-cycles 5
run "시각 QA (D15·D16)"               node tools/qa-visual.mjs --dir dist
run "플레이 QA (D13·D14·D21·D22)"     node tools/qa-play.mjs --dir dist
run "성능·번들 (D25)"                 node tools/qa-perf.mjs --dir dist

echo ""
echo "════════════════════════════════════════════════"
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "✅ 전체 게이트 통과 — 배포 가능"
  exit 0
fi
echo "❌ 실패 ${#FAILED[@]}건:"
for f in "${FAILED[@]}"; do echo "   · $f"; done
exit 1
