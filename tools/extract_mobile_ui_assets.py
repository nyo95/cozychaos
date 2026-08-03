#!/usr/bin/env python3
"""Deterministically extract runtime-safe mobile UI/VFX assets from concept sheets.

The source concept sheets stay untouched. Static crops use fixed coordinates; animation
frames are alpha-trimmed inside fixed, non-overlapping selection regions and placed on
fixed-size canvases without resampling. Run with ``--check`` to verify that committed
outputs are byte-for-byte reproducible.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
CONCEPT_ROOT = REPO_ROOT / "client/public/assets/concepts/mobile-redesign-2026-08-03"
OUTPUT_ROOT = REPO_ROOT / "client/public/assets/mobile-ui"
MANIFEST_PATH = OUTPUT_ROOT / "extracted-assets.json"


Box = tuple[int, int, int, int]
Anchor = Literal["center", "right-center"]


@dataclass(frozen=True)
class StaticSpec:
    asset_id: str
    source: str
    crop: Box
    output: str
    purpose: str


@dataclass(frozen=True)
class AnimationSpec:
    asset_id: str
    source: str
    selections: tuple[Box, ...]
    frame_size: tuple[int, int]
    output: str
    purpose: str
    anchor: Anchor = "center"
    suggested_fps: int = 10
    loop: bool = False


STATIC_ASSETS = (
    StaticSpec(
        asset_id="inkOrb",
        source="mobile-hud-kit.png",
        crop=(50, 574, 242, 766),
        output="hud/ink-orb.png",
        purpose="Ink meter emblem; decorative only, with live Ink supplied as HTML text.",
    ),
    StaticSpec(
        asset_id="windDirectionPill",
        source="mobile-hud-kit.png",
        crop=(390, 392, 806, 520),
        output="hud/wind-direction-pill.png",
        purpose="Text-free wind-direction ornament; mirror/rotate from authoritative wind data.",
    ),
    StaticSpec(
        asset_id="actionPanelOrnament",
        source="mobile-hud-kit.png",
        crop=(74, 1009, 1178, 1201),
        output="hud/action-panel-ornament.png",
        purpose="Text-free bottom action panel with touch-drag glyph and divider.",
    ),
)


ANIMATIONS = (
    AnimationSpec(
        asset_id="lockPulseCyan",
        source="feedback-vfx-sheet.png",
        selections=((0, 20, 180, 220), (175, 20, 345, 220), (340, 20, 495, 220), (495, 20, 635, 220)),
        frame_size=(192, 192),
        output="vfx/lock-pulse-cyan.png",
        purpose="Local cyan rune-lock confirmation pulse.",
        suggested_fps=10,
    ),
    AnimationSpec(
        asset_id="lockPulsePink",
        source="feedback-vfx-sheet.png",
        selections=((630, 20, 800, 220), (790, 20, 955, 220), (950, 20, 1105, 220), (1105, 20, 1254, 220)),
        frame_size=(192, 192),
        output="vfx/lock-pulse-pink.png",
        purpose="Rival-ready pink lock pulse; does not reveal the rival rune.",
        suggested_fps=10,
    ),
    AnimationSpec(
        asset_id="collisionBurst",
        source="feedback-vfx-sheet.png",
        selections=((620, 220, 795, 420), (790, 220, 955, 420), (955, 220, 1090, 420), (1090, 220, 1254, 420)),
        frame_size=(192, 192),
        output="vfx/collision-burst.png",
        purpose="Presentation-only cyan/pink rune collision burst.",
        suggested_fps=12,
    ),
    AnimationSpec(
        asset_id="rescueBubbleCyan",
        source="feedback-vfx-sheet.png",
        selections=((0, 600, 180, 830), (170, 600, 340, 830), (330, 600, 500, 830), (490, 600, 650, 830)),
        frame_size=(192, 192),
        output="vfx/rescue-bubble-cyan.png",
        purpose="Presentation-only rescue/KO bubble dissolve.",
        suggested_fps=8,
    ),
    AnimationSpec(
        asset_id="windStreak",
        source="feedback-vfx-sheet.png",
        selections=((620, 840, 800, 1020), (800, 840, 950, 1020), (950, 840, 1095, 1020), (1090, 840, 1254, 1020)),
        frame_size=(192, 128),
        output="vfx/wind-streak.png",
        purpose="Ambient wind-readable streak; direction and strength remain data-driven.",
        anchor="right-center",
        suggested_fps=8,
        loop=True,
    ),
    AnimationSpec(
        asset_id="starReward",
        source="feedback-vfx-sheet.png",
        selections=((620, 1015, 800, 1254), (790, 1015, 955, 1254), (955, 1015, 1090, 1254), (1090, 1015, 1254, 1254)),
        frame_size=(192, 192),
        output="vfx/star-reward.png",
        purpose="Presentation-only round-win Star sparkle.",
        suggested_fps=10,
    ),
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def source_image(name: str) -> Image.Image:
    path = CONCEPT_ROOT / name
    if not path.is_file():
        raise FileNotFoundError(f"Missing source concept sheet: {path}")
    image = Image.open(path).convert("RGBA")
    image.load()
    return image


def validate_box(image: Image.Image, box: Box, label: str) -> None:
    left, top, right, bottom = box
    if left < 0 or top < 0 or right > image.width or bottom > image.height:
        raise ValueError(f"{label}: crop {box} exceeds source {image.size}")
    if left >= right or top >= bottom:
        raise ValueError(f"{label}: invalid crop {box}")


def alpha_stats(image: Image.Image, *, frames: int = 1, frame_width: int | None = None) -> dict[str, object]:
    if image.mode != "RGBA":
        raise ValueError("Output must be RGBA")
    alpha = image.getchannel("A")
    non_empty = sum(alpha.histogram()[1:])
    coverage = round(non_empty / (image.width * image.height), 6)
    corners = [
        alpha.getpixel((0, 0)),
        alpha.getpixel((image.width - 1, 0)),
        alpha.getpixel((0, image.height - 1)),
        alpha.getpixel((image.width - 1, image.height - 1)),
    ]
    if non_empty == 0:
        raise ValueError("Output is empty")
    if any(corners):
        raise ValueError(f"Output corners are not transparent: {corners}")
    if coverage >= 0.98:
        raise ValueError(f"Implausibly opaque output coverage: {coverage}")

    frame_coverages: list[float] = []
    if frames > 1:
        assert frame_width is not None
        for index in range(frames):
            frame_alpha = alpha.crop((index * frame_width, 0, (index + 1) * frame_width, image.height))
            occupied = sum(frame_alpha.histogram()[1:])
            if occupied == 0:
                raise ValueError(f"Frame {index} is empty")
            frame_coverages.append(round(occupied / (frame_width * image.height), 6))

    result: dict[str, object] = {
        "alpha": True,
        "transparentCorners": True,
        "nonTransparentCoverage": coverage,
    }
    if frame_coverages:
        result["frameCoverage"] = frame_coverages
    return result


def crop_static(spec: StaticSpec, image: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    validate_box(image, spec.crop, spec.asset_id)
    output = image.crop(spec.crop)
    return output, {
        "kind": "image",
        "path": f"/assets/mobile-ui/{spec.output}",
        "width": output.width,
        "height": output.height,
        "source": {"path": f"../concepts/mobile-redesign-2026-08-03/{spec.source}", "crop": list(spec.crop)},
        "purpose": spec.purpose,
        "resampling": "none",
    }


def place_frame(trimmed: Image.Image, size: tuple[int, int], anchor: Anchor) -> Image.Image:
    width, height = size
    if trimmed.width > width or trimmed.height > height:
        raise ValueError(f"Trimmed frame {trimmed.size} does not fit canvas {size}")
    if anchor == "center":
        x = (width - trimmed.width) // 2
    elif anchor == "right-center":
        x = width - trimmed.width - 8
    else:  # pragma: no cover - Literal keeps this unreachable during normal use.
        raise ValueError(f"Unsupported anchor: {anchor}")
    y = (height - trimmed.height) // 2
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(trimmed, (x, y))
    return canvas


def crop_animation(spec: AnimationSpec, image: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    frames: list[Image.Image] = []
    trimmed_boxes: list[list[int]] = []
    for index, selection in enumerate(spec.selections):
        validate_box(image, selection, f"{spec.asset_id}[{index}]")
        selection_image = image.crop(selection)
        local_bbox = selection_image.getchannel("A").getbbox()
        if local_bbox is None:
            raise ValueError(f"{spec.asset_id}[{index}] selection is empty")
        trimmed = selection_image.crop(local_bbox)
        absolute_bbox = [
            selection[0] + local_bbox[0],
            selection[1] + local_bbox[1],
            selection[0] + local_bbox[2],
            selection[1] + local_bbox[3],
        ]
        trimmed_boxes.append(absolute_bbox)
        frames.append(place_frame(trimmed, spec.frame_size, spec.anchor))

    frame_width, frame_height = spec.frame_size
    strip = Image.new("RGBA", (frame_width * len(frames), frame_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * frame_width, 0))

    return strip, {
        "kind": "sprite-sheet",
        "path": f"/assets/mobile-ui/{spec.output}",
        "width": strip.width,
        "height": strip.height,
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "frameCount": len(frames),
        "columns": len(frames),
        "rows": 1,
        "suggestedFps": spec.suggested_fps,
        "loop": spec.loop,
        "anchor": spec.anchor,
        "source": {
            "path": f"../concepts/mobile-redesign-2026-08-03/{spec.source}",
            "selections": [list(box) for box in spec.selections],
            "alphaTrimmedBounds": trimmed_boxes,
        },
        "purpose": spec.purpose,
        "resampling": "none",
    }


def build_outputs() -> tuple[dict[str, bytes], bytes]:
    images: dict[str, Image.Image] = {}
    sources: dict[str, Image.Image] = {}
    assets: dict[str, dict[str, object]] = {}

    for spec in STATIC_ASSETS:
        image = sources.setdefault(spec.source, source_image(spec.source))
        output, metadata = crop_static(spec, image)
        metadata["validation"] = alpha_stats(output)
        images[spec.output] = output
        assets[spec.asset_id] = metadata

    for spec in ANIMATIONS:
        image = sources.setdefault(spec.source, source_image(spec.source))
        output, metadata = crop_animation(spec, image)
        metadata["validation"] = alpha_stats(
            output,
            frames=len(spec.selections),
            frame_width=spec.frame_size[0],
        )
        images[spec.output] = output
        assets[spec.asset_id] = metadata

    encoded = {path: encode_png(image) for path, image in images.items()}
    for asset in assets.values():
        relative_path = str(asset["path"]).removeprefix("/assets/mobile-ui/")
        asset["sha256"] = sha256(encoded[relative_path])

    source_metadata = []
    for name in sorted(sources):
        data = (CONCEPT_ROOT / name).read_bytes()
        source_metadata.append(
            {
                "path": f"../concepts/mobile-redesign-2026-08-03/{name}",
                "sha256": sha256(data),
                "width": sources[name].width,
                "height": sources[name].height,
            }
        )

    manifest = {
        "version": 1,
        "generator": "tools/extract_mobile_ui_assets.py",
        "pixelPolicy": {
            "alpha": "preserved from RGBA source",
            "resampling": "none; use nearest-neighbor if downstream scaling is unavoidable",
            "runtimeAuthority": "presentation-only; never use these pixels for collision or gameplay truth",
            "projectilePolicy": "no fixed projectile imagery is included",
        },
        "sources": source_metadata,
        "assets": assets,
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    return encoded, manifest_bytes


def write_or_check(check: bool) -> int:
    encoded, manifest = build_outputs()
    expected = {**encoded, MANIFEST_PATH.relative_to(OUTPUT_ROOT).as_posix(): manifest}
    failures: list[str] = []

    for relative, data in expected.items():
        path = OUTPUT_ROOT / relative
        if check:
            if not path.is_file():
                failures.append(f"missing: {path.relative_to(REPO_ROOT)}")
            elif path.read_bytes() != data:
                failures.append(f"not reproducible: {path.relative_to(REPO_ROOT)}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    if failures:
        for failure in failures:
            print(f"ERROR {failure}", file=sys.stderr)
        return 1

    verb = "validated" if check else "generated"
    print(f"{verb} {len(encoded)} PNG assets and {MANIFEST_PATH.relative_to(REPO_ROOT)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify existing outputs without writing")
    args = parser.parse_args()
    return write_or_check(args.check)


if __name__ == "__main__":
    raise SystemExit(main())
