#!/usr/bin/env bash
# Merge every source/NN.mp4 found (01..06) with 0.5s crossfades, no audio,
# scale to 1280px wide at 15 fps, export WebP frames (quality 70).
set -euo pipefail
cd "$(dirname "$0")/.."

XF=0.5   # crossfade duration (s)
FPS=15
WIDTH=1280
QUALITY=70

CLIPS=(source/0[1-6].mp4)
[ -f "${CLIPS[0]}" ] || { echo "No clips in source/" >&2; exit 1; }
echo "Clips: ${CLIPS[*]}"

# Clip durations, needed to compute xfade offsets
durs=()
for c in "${CLIPS[@]}"; do
  durs+=("$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$c")")
done

inputs=()
filter=""
for i in "${!CLIPS[@]}"; do
  inputs+=(-i "${CLIPS[$i]}")
  # Normalise every clip so xfade inputs match
  filter+="[$i:v]scale=${WIDTH}:-2,fps=${FPS},setsar=1,format=yuv420p[v$i];"
done

# Chain xfades: offset = cumulative length so far - XF
prev="v0"
acc="${durs[0]}"
for ((i=1; i<${#CLIPS[@]}; i++)); do
  off=$(awk -v a="$acc" -v x="$XF" 'BEGIN{printf "%.3f", a-x}')
  out="x$i"
  filter+="[$prev][v$i]xfade=transition=fade:duration=${XF}:offset=${off}[$out];"
  acc=$(awk -v a="$acc" -v d="${durs[$i]}" -v x="$XF" 'BEGIN{printf "%.3f", a+d-x}')
  prev="$out"
done
filter="${filter%;}"

rm -f frames/f_*.webp
ffmpeg -v error -stats -y "${inputs[@]}" -filter_complex "$filter" -map "[$prev]" -an \
  -c:v libwebp -quality "$QUALITY" -start_number 1 frames/f_%04d.webp

echo "Done: $(ls frames/f_*.webp | wc -l) frames"
