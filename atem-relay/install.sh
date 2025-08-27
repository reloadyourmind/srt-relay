#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

apt-get update -y
apt-get install -y curl ca-certificates ffmpeg

# Install Node.js (LTS) if missing
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install MediaMTX
if ! command -v mediamtx >/dev/null 2>&1; then
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) MTX_ARCH=amd64;;
    aarch64) MTX_ARCH=arm64v8;;
    armv7l) MTX_ARCH=armv7;;
    *) echo "Unsupported arch $ARCH"; exit 1;;
  esac
  TMP=$(mktemp -d)
  cd "$TMP"
  curl -fsSL -o mediamtx.tar.gz https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_linux_${MTX_ARCH}.tar.gz
  tar -xzf mediamtx.tar.gz
  install -m 0755 mediamtx /usr/local/bin/mediamtx
  cd /
  rm -rf "$TMP"
fi

mkdir -p /etc/mediamtx
mkdir -p /etc/atem-relay

# Deploy app
mkdir -p /opt/atem-relay
cp -r /workspace/atem-relay/* /opt/atem-relay/
cd /opt/atem-relay
npm ci --omit=dev || npm install --omit=dev

# Write initial configs
node -e 'const s=require("./server.js");'

# Systemd services
cp /opt/atem-relay/mediamtx.service /etc/systemd/system/mediamtx.service
cp /opt/atem-relay/atem-relay.service /etc/systemd/system/atem-relay.service
systemctl daemon-reload
systemctl enable mediamtx.service atem-relay.service
systemctl restart mediamtx.service atem-relay.service

echo "Install complete. Web UI on http://<container-ip>:8080"
echo "Point ATEM to rtmp://<container-ip>:1935/atem (default)."

