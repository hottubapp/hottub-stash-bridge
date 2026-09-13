#!/usr/bin/env bash
# Generate short silent MP4s Stash can scan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEDIA_DIR="${1:-$ROOT/stash-data/media}"

mkdir -p "$MEDIA_DIR"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg required. brew install ffmpeg" >&2
  exit 1
fi

make_clip() {
  local name="$1"
  local color="$2"
  local seconds="$3"
  local out="$MEDIA_DIR/${name}.mp4"
  if [[ -f "$out" ]]; then
    echo "exists: $out"
    return
  fi
  echo "making: $out (${seconds}s)"
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "color=c=${color}:s=1280x720:d=${seconds}" \
    -f lavfi -i "sine=frequency=440:duration=${seconds}" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
    "$out"
}

make_clip "demo_studio_outdoor_interview" "0x1a5fb4" 6
make_clip "demo_studio_city_walk" "0x26a269" 5
make_clip "alex_example_talking_head" "0xc64600" 4
make_clip "alex_example_b_roll" "0x813d9c" 5
make_clip "misc_untagged_clip" "0x241f31" 3

echo "seed media ready in $MEDIA_DIR"
ls -lh "$MEDIA_DIR"
