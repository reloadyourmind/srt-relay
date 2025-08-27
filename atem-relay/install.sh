#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

apt-get update -y
apt-get install -y curl ca-certificates ffmpeg avahi-daemon avahi-utils libnss-mdns

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

# Configure mDNS hostname
if ! grep -q "atem-relay" /etc/hostname; then
  echo "atem-relay" > /etc/hostname
  hostnamectl set-hostname atem-relay || true
fi

# Publish services via Avahi
mkdir -p /etc/avahi/services
cat >/etc/avahi/services/atem-relay-http.service <<'SVC'
<?xml version="1.0" standalone='no'?><!--*-nxml-*-->
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">ATEM Relay Web UI on %h</name>
  <service>
    <type>_http._tcp</type>
    <port>8080</port>
  </service>
  <service>
    <type>_rtsp._tcp</type>
    <port>8554</port>
  </service>
  <service>
    <type>_rtmp._tcp</type>
    <port>1935</port>
  </service>
  <service>
    <type>_srt._udp</type>
    <port>8890</port>
  </service>
  <service>
    <type>_http._tcp</type>
    <subtype>_hls._sub._http._tcp</subtype>
    <port>8888</port>
  </service>
  <service>
    <type>_workstation._tcp</type>
    <port>9</port>
  </service>
  <service>
    <type>_ssh._tcp</type>
    <port>22</port>
  </service>
  <service>
    <type>_smb._tcp</type>
    <port>445</port>
  </service>
</service-group>
SVC

systemctl enable avahi-daemon
systemctl restart avahi-daemon

echo "Also reachable at http://atem-relay.local:8080 (mDNS)."

