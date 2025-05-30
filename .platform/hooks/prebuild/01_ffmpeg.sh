#!/bin/bash
set -euxo pipefail

cd /tmp
curl -L -o ffmpeg.tar.xz \
  https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amazonlinux2-x86_64-static.tar.xz
tar -xf ffmpeg.tar.xz
cd ffmpeg-*-static
install -m 0755 ffmpeg ffprobe /usr/local/bin/
echo "Installed FFmpeg $(ffmpeg -version | head -1)"
