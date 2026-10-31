#!/usr/bin/env bash
# usage: make_today.sh <layers-dir> <out.mp4>
# Kling clip + exact logo + 'open today' layers fading in one by one + Kling ambience mixed with soft birds.
set -euo pipefail
B="$(cd "$(dirname "$0")" && pwd)"; L="$1"; OUT="$2"; D=8.04
inputs=(-i "$B/base-coffee.mp4" -i "$B/soundtrack.wav" -loop 1 -t $D -i "$B/logo-layer.png")
filters="[0:v][2:v]overlay=0:0[v0]"
n=3; prev=v0
add() { # file start
  inputs+=(-loop 1 -t $D -i "$1")
  filters+=";[$n:v]format=rgba,fade=t=in:st=$2:d=${3:-0.25}:alpha=1[l$n];[$prev][l$n]overlay=0:0[v$n]"
  prev=v$n; n=$((n+1))
}
line() { # name start — PNG sequence drawing the line, last frame held
  inputs+=(-framerate 24 -i "$B/lines/${1}_%02d.png")
  filters+=";[$n:v]format=rgba,setpts=PTS+$2/TB[l$n];[$prev][l$n]overlay=0:0:eof_action=repeat[v$n]"
  prev=v$n; n=$((n+1))
}
# on the beat of "Life" (Tony Dark Eyes, ~125 BPM, beat 0.48s, first beat 0.47s, downbeats 0.95/2.87/4.79/6.71)
add "$L/00-shade.png" 0.47 0.45
add "$L/01-head.png"  0.95
add "$L/02-date.png"  1.43
line a                1.91
add "$L/10-time.png"  2.87
add "$L/11-time.png"  3.35
line b                3.83
add "$L/20-qr.png"    4.31
add "$L/21-qr.png"    4.79
add "$L/22-qr.png"    5.27
add "$L/90-end.png"   6.71
filters+=";[1:a]anull[a]"  # soundtrack.wav: Kling ambience + birds + café melody at 125 BPM, mixed at -14 LUFS
ffmpeg -v error -y "${inputs[@]}" -filter_complex "$filters" -map "[$prev]" -map "[a]" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -movflags +faststart -t $D "$OUT"
echo "$OUT"
