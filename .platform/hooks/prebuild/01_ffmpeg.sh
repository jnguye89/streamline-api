#!/bin/bash
# Installs a modern static FFmpeg (libx264, libopus, flv, etc.) on AL2
set -euxo pipefail

tmpdir=$(mktemp -d)
cd "$tmpdir"

# Generic build name that always exists
curl -L -O https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -xf ffmpeg-release-amd64-static.tar.xz
cd ffmpeg-*-static          # enter the unpacked directory

install -m 0755 ffmpeg ffprobe /usr/local/bin/
echo "Installed $(ffmpeg -version | head -1)"
