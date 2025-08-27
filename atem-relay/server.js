const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_DIR = '/etc/atem-relay';
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const MEDIAMTX_CONFIG_DIR = '/etc/mediamtx';
const MEDIAMTX_CONFIG_PATH = path.join(MEDIAMTX_CONFIG_DIR, 'mediamtx.yml');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    const defaults = {
      streamPath: 'atem',
      enable: { rtmp: true, rtsp: true, srt: true, hls: true },
      listen: { rtmp: 1935, rtsp: 8554, hls: 8888, srt: 8890 }
    };
    saveConfig(defaults);
    return defaults;
  }
}

function saveConfig(cfg) {
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function generateMediamtxConfig(cfg) {
  const enableRTMP = cfg.enable?.rtmp !== false;
  const enableRTSP = cfg.enable?.rtsp !== false;
  const enableSRT = cfg.enable?.srt !== false;
  const enableHLS = cfg.enable?.hls !== false;
  const lp = cfg.listen || {};
  const lines = [];
  lines.push('logLevel: warn');
  if (enableRTMP) lines.push(`rtmp: yes`); else lines.push('rtmp: no');
  if (enableRTSP) lines.push(`rtsp: yes`); else lines.push('rtsp: no');
  if (enableSRT) lines.push(`srt: yes`); else lines.push('srt: no');
  if (enableHLS) lines.push(`hls: yes`); else lines.push('hls: no');
  if (enableRTMP) lines.push(`rtmpAddress: :${lp.rtmp || 1935}`);
  if (enableRTSP) lines.push(`rtspAddress: :${lp.rtsp || 8554}`);
  if (enableHLS) lines.push(`hlsAddress: :${lp.hls || 8888}`);
  if (enableSRT) lines.push(`srtAddress: :${lp.srt || 8890}`);
  lines.push('');
  lines.push('paths:');
  lines.push(`  ${cfg.streamPath}:`);
  lines.push('    # RTMP/RTSP/SRT publishers (ATEM) will publish to this path');
  lines.push('    # OBS or other players pull from the same path');
  lines.push('    source: publisher');
  return lines.join('\n') + '\n';
}

function writeMediamtxConfig(cfg) {
  ensureDir(MEDIAMTX_CONFIG_DIR);
  const content = generateMediamtxConfig(cfg);
  fs.writeFileSync(MEDIAMTX_CONFIG_PATH, content);
}

function restartMediamtx() {
  try {
    execSync('systemctl reload mediamtx.service', { stdio: 'ignore' });
    return true;
  } catch (e) {
    try {
      execSync('systemctl restart mediamtx.service', { stdio: 'ignore' });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs.length ? addrs : ['127.0.0.1'];
}

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  const body = req.body || {};
  const streamPath = String(body.streamPath || '').trim();
  if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(streamPath)) {
    return res.status(400).json({ error: 'Invalid streamPath. Use letters, numbers, _ or -' });
  }
  const enable = {
    rtmp: !!(body.enable?.rtmp ?? true),
    rtsp: !!(body.enable?.rtsp ?? true),
    srt: !!(body.enable?.srt ?? true),
    hls: !!(body.enable?.hls ?? true)
  };
  const listen = {
    rtmp: Number(body.listen?.rtmp ?? 1935),
    rtsp: Number(body.listen?.rtsp ?? 8554),
    hls: Number(body.listen?.hls ?? 8888),
    srt: Number(body.listen?.srt ?? 8890)
  };
  const cfg = { streamPath, enable, listen };
  saveConfig(cfg);
  writeMediamtxConfig(cfg);
  restartMediamtx();
  res.json({ ok: true, cfg });
});

app.get('/api/obs-urls', (req, res) => {
  const cfg = loadConfig();
  const host = getLocalIPs()[0];
  const stream = cfg.streamPath;
  const ports = cfg.listen;
  res.json({
    rtmp_publish: `rtmp://${host}:${ports.rtmp}/${stream}`,
    rtsp_pull: `rtsp://${host}:${ports.rtsp}/${stream}`,
    srt_pull: `srt://${host}:${ports.srt}?streamid=publish://${stream}`,
    hls_pull: `http://${host}:${ports.hls}/${stream}/index.m3u8`
  });
});

app.get('/api/status', (req, res) => {
  const cfg = loadConfig();
  const url = `rtsp://127.0.0.1:${cfg.listen.rtsp}/${cfg.streamPath}`;
  try {
    const out = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,avg_frame_rate',
      '-of', 'json',
      url
    ], { encoding: 'utf8', timeout: 3000 });
    if (out.status !== 0) throw new Error(out.stderr || 'ffprobe failed');
    const data = JSON.parse(out.stdout || '{}');
    res.json({ online: true, probe: data });
  } catch (e) {
    res.json({ online: false });
  }
});

// Fallback to SPA index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
ensureDir(CONFIG_DIR);
const current = loadConfig();
writeMediamtxConfig(current);
app.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log(`atem-relay server listening on :${PORT}`);
});

