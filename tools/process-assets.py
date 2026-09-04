#!/usr/bin/env python3
"""원본(assets/images/raw) → 게임용 에셋 + assets/manifest.json 생성.

🔴 매니페스트가 경로의 단일 진실원이다. 게임 로더·쇼룸·크레딧 생성기가 전부 이 파일을 읽는다.
🔴 --check 는 재생성 결과를 바이트 비교해 어긋나면 exit 1 (생성기가 빌드에 안 묶이면 반드시 어긋난다).
"""
import json
import sys
import hashlib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'assets' / 'images' / 'raw'
OUT = ROOT / 'public' / 'assets' / 'images'
MANIFEST = ROOT / 'public' / 'assets' / 'manifest.json'

CHAR_SIZE = 384
PLATFORM_W = 512
BG_W, BG_H = 720, 1280

CHARS = ['fox', 'rabbit', 'penguin', 'cat', 'bear', 'owl', 'dragon']
PLATFORMS = ['stone', 'cloud', 'wood', 'crystal']
BGS = ['dawn', 'day', 'sunset', 'night']
# 테마 → 발판 매핑 (테마 해금과 발판 외형을 함께 바꾼다)
THEME_PLATFORM = {'dawn': 'stone', 'day': 'cloud', 'sunset': 'wood', 'night': 'crystal'}


def trim_alpha(im: Image.Image) -> Image.Image:
    if im.mode != 'RGBA':
        return im
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit_square(im: Image.Image, size: int) -> Image.Image:
    im = trim_alpha(im)
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas


def fit_width(im: Image.Image, width: int) -> Image.Image:
    im = trim_alpha(im)
    h = max(1, round(im.height * width / im.width))
    return im.resize((width, h), Image.LANCZOS)


def alpha_coverage(im: Image.Image) -> float:
    """투명 이미지에서 «실제로 그려진 픽셀» 비율. cutout 이 본체를 먹었는지 판정한다."""
    if im.mode != 'RGBA':
        return 1.0
    a = im.getchannel('A')
    hist = a.histogram()
    solid = sum(hist[128:])
    return solid / (im.width * im.height)


def write(im: Image.Image, path: Path, quality=88) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == '.webp':
        im.save(path, 'WEBP', quality=quality, method=6)
    else:
        im.save(path)
    data = path.read_bytes()
    return {'file': path.name, 'bytes': len(data),
            'sha1': hashlib.sha1(data).hexdigest()[:12],
            'w': im.width, 'h': im.height}


def build(check=False):
    if not RAW.exists():
        print(f'❌ 원본 폴더 없음: {RAW}')
        return 2
    manifest = {'version': 1, 'images': {}, 'themePlatform': THEME_PLATFORM, 'audio': {}}
    problems = []

    for name in CHARS:
        src = RAW / f'char-{name}.png'
        if not src.exists():
            problems.append(f'누락: {src.name}')
            continue
        im = Image.open(src).convert('RGBA')
        cov = alpha_coverage(im)
        if cov < 0.04:
            problems.append(f'{src.name}: 불투명 픽셀 {cov:.1%} — cutout 이 본체를 먹었다')
        out = fit_square(im, CHAR_SIZE)
        manifest['images'][f'char-{name}'] = write(out, OUT / f'char-{name}.webp')

    for name in PLATFORMS:
        src = RAW / f'platform-{name}.png'
        if not src.exists():
            problems.append(f'누락: {src.name}')
            continue
        im = Image.open(src).convert('RGBA')
        cov = alpha_coverage(im)
        bb = im.getbbox()
        barea = (bb[2] - bb[0]) * (bb[3] - bb[1]) if bb else 1
        solid = sum(im.getchannel('A').histogram()[128:])
        fill = solid / barea
        if cov < 0.06:
            problems.append(f'{src.name}: 불투명 픽셀 {cov:.1%} — cutout 이 본체를 먹었다')
        # 🔴 전체 비율만 보면 «이끼만 남고 몸통이 사라진» 발판이 통과한다(실측).
        #    윤곽 상자를 얼마나 채우는지까지 봐야 판별이 된다.
        if fill < 0.35:
            problems.append(f'{src.name}: 윤곽상자 충실도 {fill:.1%} — 슬래브 몸통이 비었다(cutout 손실)')
        out = fit_width(im, PLATFORM_W)
        manifest['images'][f'platform-{name}'] = write(out, OUT / f'platform-{name}.webp')

    for name in BGS:
        src = RAW / f'bg-{name}.png'
        if not src.exists():
            problems.append(f'누락: {src.name}')
            continue
        im = Image.open(src).convert('RGB')
        scale = max(BG_W / im.width, BG_H / im.height)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        left = (im.width - BG_W) // 2
        top = (im.height - BG_H) // 2
        im = im.crop((left, top, left + BG_W, top + BG_H))
        manifest['images'][f'bg-{name}'] = write(im, OUT / f'bg-{name}.webp', quality=82)

    if problems:
        print('❌ 에셋 문제:')
        for p in problems:
            print('  · ' + p)
        return 1

    # 오디오도 같은 매니페스트에 싣는다 — 로더·스모크 모수·크레딧이 전부 이 파일 하나를 읽는다.
    audio_dir = ROOT / 'public' / 'assets' / 'audio'
    for ogg in sorted(audio_dir.glob('*.ogg')):
        key = ogg.stem
        m4a = ogg.with_suffix('.m4a')
        entry = {'ogg': ogg.name, 'bytes': ogg.stat().st_size}
        if m4a.exists():
            entry['m4a'] = m4a.name
            entry['bytes'] += m4a.stat().st_size
        else:
            problems.append(f'{ogg.name}: m4a 대체본 없음 — Safari 에서 무음이 된다')
        manifest['audio'][key] = entry

    if problems:
        print('❌ 에셋 문제:')
        for p_ in problems:
            print('  · ' + p_)
        return 1

    total = sum(v['bytes'] for v in manifest['images'].values())
    manifest['audioBytes'] = sum(v['bytes'] for v in manifest['audio'].values())
    manifest['totalBytes'] = total
    text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'

    if check:
        if not MANIFEST.exists() or MANIFEST.read_text() != text:
            print('❌ manifest.json 이 재생성 결과와 다르다 — `python3 tools/process-assets.py` 를 돌려라.')
            return 1
        print(f'✅ 에셋 매니페스트 일치 · {len(manifest["images"])}장 · {total/1024:.0f}KB')
        return 0

    MANIFEST.write_text(text)
    print(f'✅ 에셋 {len(manifest["images"])}장 · 합계 {total/1024:.0f}KB → {MANIFEST.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(build(check='--check' in sys.argv))
