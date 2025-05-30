# .platform/hooks/prebuild/01_ffmpeg.sh
#!/bin/bash
set -euxo pipefail

tmpdir=$(mktemp -d)
cd "$tmpdir"

curl -L -O https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -xf ffmpeg-release-amd64-static.tar.xz
cd ffmpeg-*-static

install -m 0755 ffmpeg ffprobe /usr/local/bin/
echo "Installed $(ffmpeg -version | head -1)"
