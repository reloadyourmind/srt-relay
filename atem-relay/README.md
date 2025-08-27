# ATEM Relay

Web-configurable relay to ingest RTMP from ATEM Mini Pro ISO and restream to OBS via RTSP/SRT/HLS using MediaMTX. Designed for Debian/Ubuntu LXC on Proxmox.

## Features
- Web UI to configure stream path and enable/disable protocols and ports
- Accept RTMP ingest from ATEM
- Provide RTSP/SRT/HLS pull URLs for OBS or players
- Status with ffprobe
- Systemd units and install script

## Quick Install (inside LXC as root)
```bash
cd /workspace/atem-relay
chmod +x install.sh
./install.sh
```

Then open `http://<container-ip>:8080`.

## ATEM Setup
- Streaming service: Custom
- URL: `rtmp://<container-ip>:1935/<streamPath>` (default `atem`)
- Key: leave empty

## OBS Setup
- Add Media Source (for RTSP/HLS) or SRT input
- RTSP URL: `rtsp://<container-ip>:8554/<streamPath>`
- HLS URL: `http://<container-ip>:8888/<streamPath>/index.m3u8`
- SRT URL: `srt://<container-ip>:8890?streamid=publish://<streamPath>`

## Notes
- All configs stored in `/etc/atem-relay/config.json` and `/etc/mediamtx/mediamtx.yml` but managed via Web UI.
- Service binaries: `mediamtx` in `/usr/local/bin` and Node app in `/opt/atem-relay`.