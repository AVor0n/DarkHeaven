#!/usr/bin/env python3
"""Обработка сгенерированных ассетов (docs/spec/05-assets.md).

assets-raw/images/*.png  -> apps/web/public/assets/art/*.webp
assets-raw/audio/*.mp3   -> apps/web/public/assets/audio/*.{webm,mp3}

Нужны Pillow и ffmpeg. Запуск: python3 scripts/process-assets.py
"""

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw"
ART = ROOT / "apps/web/public/assets/art"
AUDIO = ROOT / "apps/web/public/assets/audio"

# Ширина картинок интерфейса.
WIDE = {"menu-bg": 1600, "victory": 960, "defeat": 960}


def crop_to_content(im: Image.Image, threshold: int = 24) -> Image.Image:
    """Обрезать чёрные поля вокруг эмблемы и сделать квадрат."""
    gray = im.convert("L").point(lambda v: 255 if v > threshold else 0)
    box = gray.getbbox() or (0, 0, im.width, im.height)
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    half = side // 2 + 8
    square = Image.new("RGB", (half * 2, half * 2), (0, 0, 0))
    square.paste(im.crop((cx - half, cy - half, cx + half, cy + half)), (0, 0))
    return square


def vignette(im: Image.Image) -> Image.Image:
    """Края уходят в чистый чёрный, чтобы при режиме screen не было рамки."""
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse((w * 0.04, h * 0.04, w * 0.96, h * 0.96), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w * 0.03))
    return ImageChops.multiply(im, Image.merge("RGB", (mask, mask, mask)))


def blacken_background(im: Image.Image) -> Image.Image:
    """Если нейросеть нарисовала эмблему на белом фоне — залить фон чёрным от углов."""
    w, h = im.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if min(sum(im.getpixel(c)) / 3 for c in corners) < 200:
        return im
    im = im.copy()
    for c in corners:
        ImageDraw.floodfill(im, c, (0, 0, 0), thresh=60)
    return im


# Эмблемы и жетоны: квадрат на чёрном с затемнёнными краями (имя → сторона).
TOKENS = {"mourner": 512}


def process_images() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    for src in sorted((RAW / "images").glob("*.png")):
        name = src.stem
        im = Image.open(src).convert("RGB")
        if name.startswith("emblem-") or name in TOKENS:
            side = TOKENS.get(name, 256)
            im = vignette(crop_to_content(blacken_background(im))).resize((side, side), Image.LANCZOS)
            im.save(ART / f"{name}.webp", "WEBP", quality=84, method=6)
        else:
            width = WIDE.get(name, 1200)
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            im.save(ART / f"{name}.webp", "WEBP", quality=78, method=6)
        print("image", name, im.size)


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(out.stdout.strip())


def process_audio() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    plan = json.loads((ROOT / "scripts/prompts/sounds.json").read_text())["items"]
    for name, item in plan.items():
        variant = item.get("use", 1)
        src = RAW / "audio" / f"{name}-{variant}.mp3"
        if not src.exists():
            print("audio", name, "нет файла", src.name)
            continue
        long_form = item.get("kind") == "music" or item.get("loop")
        max_len = item.get("maxSeconds", 120 if long_form else 3.5)
        fade = 3.0 if long_form else 0.25
        filters = []
        if not item.get("loop"):
            # Убрать тишину в начале, обрезать по длине, плавно затухнуть.
            filters.append("silenceremove=start_periods=1:start_threshold=-45dB")
            filters.append(f"atrim=0:{max_len}")
            length = min(max_len, duration(src))
            filters.append(f"afade=t=out:st={max(0.0, length - fade):.2f}:d={fade}")
        filters.append("loudnorm=I=-18:TP=-1.5:LRA=11" if long_form else "loudnorm=I=-16:TP=-1.0")
        chain = ",".join(filters)
        bitrate = "64k" if long_form else "48k"
        ffmpeg("-i", str(src), "-af", chain, "-ac", "2" if long_form else "1", "-c:a", "libopus", "-b:a", bitrate, str(AUDIO / f"{name}.webm"))
        ffmpeg("-i", str(src), "-af", chain, "-ac", "2" if long_form else "1", "-c:a", "libmp3lame", "-b:a", "96k" if long_form else "80k", str(AUDIO / f"{name}.mp3"))
        print("audio", name, f"{duration(AUDIO / f'{name}.mp3'):.1f}s")


if __name__ == "__main__":
    process_images()
    process_audio()
