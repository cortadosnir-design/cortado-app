#!/usr/bin/env bash
# usage: make_week.sh <layers-dir> <out.mp4>  — weekly hours on the same Kling clip, logo and soundtrack as make_today.sh
set -euo pipefail
B="$(cd "$(dirname "$0")" && pwd)"; L="$1"; OUT="$2"; D=8.04
inputs=(-i "$B/base-coffee.mp4" -i "$B/soundtrack.wav" -loop 1 -t $D -i "$B/logo-layer.png")
filters="[0:v][2:v]overlay=0:0[v0]"; n=3; prev=v0
add() { [ -f "$1" ] || return 0
  inputs+=(-loop 1 -t $D -i "$1")
  filters+=";[$n:v]format=rgba,fade=t=in:st=$2:d=0.25:alpha=1[l$n];[$prev][l$n]overlay=0:0[v$n]"
  prev=v$n; n=$((n+1)); }
add "$L/00-shade.png" 0.47; add "$L/01-head.png" 0.95; add "$L/02-date.png" 1.43
t=1.91; for i in 0 1 2 3 4 5 6; do add "$L/1$i-day.png" $t; t=$(echo "$t+0.36" | bc); done  # one row per beat-ish
add "$L/20-qr.png" 4.79; add "$L/21-qr.png" 5.03; add "$L/22-qr.png" 5.27; add "$L/90-end.png" 6.71
ffmpeg -v error -y "${inputs[@]}" -filter_complex "$filters;[1:a]anull[a]" -map "[$prev]" -map "[a]" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -movflags +faststart -t $D "$OUT"
echo "$OUT"
