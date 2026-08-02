#!/usr/bin/env python3
"""Build the small Hanalei WOFF2 used by the initial loading screen."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

try:
    import fontTools
    from fontTools import subset
except ImportError as error:
    raise SystemExit(
        "Font build dependencies are missing. Install them with: "
        "python -m pip install -r requirements-font.txt"
    ) from error

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_FONT = PROJECT_ROOT / "public" / "assets" / "font" / "Hanalei.woff2"
PUBLIC_OUTPUT = PROJECT_ROOT / "public" / "assets" / "font" / "Hanalei-subset.woff2"
CACHE_FILE = PUBLIC_OUTPUT.with_suffix(".woff2.cache.json")
DIST_OUTPUT = PROJECT_ROOT / "dist" / "assets" / "font" / "Hanalei-subset.woff2"
EXTRA_CHARS_FILE = PROJECT_ROOT / "scripts" / "hanalei-extra-chars.txt"
MAX_PRODUCTION_SIZE = 500 * 1024
TARGET_CLASSES = {"font-hanalei", "hanalei-enabled"}
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
TEXT_EXTENSIONS = {
    ".astro", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mdx",
    ".mjs", ".styl", ".svelte", ".ts", ".tsx", ".txt", ".vue", ".yaml", ".yml",
}

class HanaleiTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.capture_depth = 0
        self.characters: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.capture_depth:
            if tag not in VOID_TAGS:
                self.capture_depth += 1
            return
        classes = next((value for name, value in attrs if name == "class" and value), "")
        if tag not in VOID_TAGS and TARGET_CLASSES.intersection(classes.split()):
            self.capture_depth = 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        return

    def handle_endtag(self, tag: str) -> None:
        if self.capture_depth:
            self.capture_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.capture_depth:
            self.characters.update(data)

def normalized_characters(text: str) -> set[str]:
    normalized = unicodedata.normalize("NFC", text)
    return {character for character in text + normalized if character.isprintable()}

def base_characters() -> set[str]:
    characters = {chr(codepoint) for codepoint in range(0x20, 0x100)}
    characters.update(chr(codepoint) for codepoint in range(0x3000, 0x3040))
    return characters

def read_extra_characters() -> set[str]:
    if not EXTRA_CHARS_FILE.is_file():
        return set()
    lines = EXTRA_CHARS_FILE.read_text(encoding="utf-8").splitlines()
    content = "\n".join(line for line in lines if not line.lstrip().startswith("#"))
    return normalized_characters(content)

def collect_rendered_characters() -> tuple[set[str], int]:
    html_files = sorted((PROJECT_ROOT / "dist").rglob("*.html"))
    if not html_files:
        raise SystemExit("No production HTML found in dist. Run astro build first.")
    characters = base_characters()
    characters.update(read_extra_characters())
    for path in html_files:
        parser = HanaleiTextParser()
        parser.feed(path.read_text(encoding="utf-8", errors="ignore"))
        characters.update(parser.characters)
    return normalized_characters("".join(characters)), len(html_files)

def collect_source_characters() -> tuple[set[str], int]:
    source_files = sorted(
        path for path in (PROJECT_ROOT / "src").rglob("*")
        if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS
    )
    characters = base_characters()
    characters.update(read_extra_characters())
    for path in source_files:
        characters.update(normalized_characters(path.read_text(encoding="utf-8", errors="ignore")))
    return characters, len(source_files)

def cache_fingerprint(characters: set[str], mode: str) -> str:
    if not SOURCE_FONT.is_file():
        raise SystemExit(f"Hanalei source font not found: {SOURCE_FONT}")
    source_stat = SOURCE_FONT.stat()
    payload = "\n".join(
        (
            mode,
            fontTools.__version__,
            str(source_stat.st_size),
            str(source_stat.st_mtime_ns),
            ",".join(str(ord(character)) for character in sorted(characters)),
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def read_cached_subset(fingerprint: str, strict_size: bool) -> tuple[int, int] | None:
    if not PUBLIC_OUTPUT.is_file() or not CACHE_FILE.is_file():
        return None
    try:
        metadata = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        size = PUBLIC_OUTPUT.stat().st_size
        if metadata.get("fingerprint") != fingerprint or metadata.get("size") != size:
            return None
        glyph_count = int(metadata["glyph_count"])
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError):
        return None
    if strict_size and size > MAX_PRODUCTION_SIZE:
        return None
    return glyph_count, size

def write_cache(fingerprint: str, glyph_count: int, size: int) -> None:
    metadata = {"fingerprint": fingerprint, "glyph_count": glyph_count, "size": size}
    temporary = CACHE_FILE.with_suffix(".tmp.json")
    try:
        temporary.write_text(json.dumps(metadata, sort_keys=True), encoding="utf-8")
        os.replace(temporary, CACHE_FILE)
    finally:
        temporary.unlink(missing_ok=True)

def save_subset(characters: set[str], output: Path, strict_size: bool) -> tuple[int, int]:
    if not SOURCE_FONT.is_file():
        raise SystemExit(f"Hanalei source font not found: {SOURCE_FONT}")
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.recalc_average_width = True
    font = subset.load_font(str(SOURCE_FONT), options)
    supported = set(font.getBestCmap() or {})
    requested = {ord(character) for character in characters}
    included = sorted(requested & supported)
    if not included:
        raise SystemExit("The Hanalei subset character set is empty.")
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=included)
    subsetter.subset(font)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.woff2")
    try:
        subset.save_font(font, str(temporary), options)
        size = temporary.stat().st_size
        if strict_size and size > MAX_PRODUCTION_SIZE:
            raise SystemExit(f"Production Hanalei subset is too large: {size / 1024:.1f} KiB")
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return len(included), size

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-only", action="store_true",
        help="scan source text and generate the public font used by astro dev",
    )
    args = parser.parse_args()
    mode = "source" if args.source_only else "production HTML"
    if args.source_only:
        characters, scanned_count = collect_source_characters()
    else:
        characters, scanned_count = collect_rendered_characters()
    fingerprint = cache_fingerprint(characters, mode)
    cached = read_cached_subset(fingerprint, strict_size=not args.source_only)
    if cached:
        glyph_count, size = cached
        action = "reused"
    else:
        glyph_count, size = save_subset(
            characters, PUBLIC_OUTPUT, strict_size=not args.source_only
        )
        write_cache(fingerprint, glyph_count, size)
        action = "wrote"
    if not args.source_only:
        DIST_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temporary_dist = DIST_OUTPUT.with_suffix(".tmp.woff2")
        shutil.copyfile(PUBLIC_OUTPUT, temporary_dist)
        os.replace(temporary_dist, DIST_OUTPUT)
        (DIST_OUTPUT.parent / SOURCE_FONT.name).unlink(missing_ok=True)
        (DIST_OUTPUT.parent / CACHE_FILE.name).unlink(missing_ok=True)
    print(
        f"[font:subset] {mode}: scanned {scanned_count} files; "
        f"included {glyph_count} glyphs; {action} {size / 1024:.1f} KiB"
    )
    if args.source_only and size > MAX_PRODUCTION_SIZE:
        print(
            "[font:subset] note: the dev subset is intentionally broad; "
            "the production HTML subset remains capped at 500 KiB",
            file=sys.stderr,
        )

if __name__ == "__main__":
    main()
