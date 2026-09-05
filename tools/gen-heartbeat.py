#!/usr/bin/env python3
"""심장 박동 SFX — 기력이 바닥나는 «아슬아슬» 구간에서 울린다.

🔴 game-builder 의 gen-sfx.py 에는 heartbeat 레시피가 없고 --recipe-file 도 실제로는
   구현돼 있지 않다(도움말에만 있다). 그래서 여기서 직접 렌더한다 —
   런타임 실시간 합성이 아니라 «오프라인 결정론 렌더»라 규칙(사운드 자체 생성)에 맞는다.

심박은 lub-dub 두 번이다. 첫 타(S1)가 낮고 길며, 짧은 사이를 두고 둘째 타(S2)가
조금 높고 짧게 온다. 저역 사인 스윕 + 지수 감쇠 + 아주 옅은 노이즈로 «가슴 안» 질감을 낸다.

  python3 tools/gen-heartbeat.py
"""
import json
import math
import os
import struct
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'audio')


def thump(dur, f0, f1, amp, rng, noise=0.05):
    n = int(SR * dur)
    t = np.arange(n) / SR
    # 주파수 스윕은 위상 적분으로 — 구간마다 sin(2πft) 를 새로 만들면 경계에서 «틱» 이 생긴다.
    f = f0 + (f1 - f0) * (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.exp(-t * (5.5 / dur))
    x = np.sin(ph) * env
    x += rng.normal(0, noise, n) * env * env      # 노이즈는 더 빨리 죽인다(숨소리처럼)
    return x * amp


def main():
    rng = np.random.default_rng(20260905)
    total = int(SR * 0.72)
    x = np.zeros(total)

    def place(at, sig):
        i = int(SR * at)
        j = min(total, i + sig.size)
        x[i:j] += sig[:j - i]

    place(0.00, thump(0.20, 78, 42, 1.00, rng))    # S1 «lub» — 낮고 길다
    place(0.24, thump(0.14, 96, 52, 0.72, rng))    # S2 «dub» — 조금 높고 짧다

    peak = np.max(np.abs(x))
    if peak > 0:
        x = x / peak * 10 ** (-2.0 / 20)           # -2dBFS
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')

    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join(OUT, 'heartbeat.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

    for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '3']),
                      ('m4a', ['-c:a', 'aac', '-b:a', '64k'])):
        dst = os.path.join(OUT, f'heartbeat.{ext}')
        os.system(f'ffmpeg -v error -y -i "{wav}" -ac 1 -ar 44100 {" ".join(args)} "{dst}"')
        print(f'✅ {dst}  {os.path.getsize(dst)/1024:.1f}KB')
    os.remove(wav)

    led = os.path.join(os.path.dirname(__file__), 'ledgers', 'sfx-ledger.json')
    recs = []
    if os.path.exists(led):
        try:
            recs = [r for r in json.load(open(led)) if r.get('file') != 'heartbeat.wav']
        except (ValueError, OSError):
            recs = []
    recs.append({'file': 'heartbeat.wav', 'recipe': 'heartbeat(lub-dub)', 'seed': 20260905,
                 'sec': round(total / SR, 3), 'license': 'self-generated',
                 'source': 'oreudap tools/gen-heartbeat.py 오프라인 결정론 렌더(numpy)'})
    json.dump(sorted(recs, key=lambda r: r['file']), open(led, 'w'), ensure_ascii=False, indent=2)
    print(f'📒 {led}')


main()
