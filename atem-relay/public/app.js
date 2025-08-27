async function loadConfig() {
  const res = await fetch('/api/config');
  return res.json();
}

async function loadUrls() {
  const res = await fetch('/api/obs-urls');
  return res.json();
}

async function loadStatus() {
  const res = await fetch('/api/status');
  return res.json();
}

function renderUrls(urls) {
  const el = document.getElementById('urls');
  el.innerHTML = '';
  const entries = Object.entries(urls);
  for (const [k, v] of entries) {
    const div = document.createElement('div');
    div.className = 'row';
    const label = document.createElement('span');
    label.textContent = k + ':';
    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = v;
    input.onclick = () => input.select();
    div.appendChild(label);
    div.appendChild(input);
    el.appendChild(div);
  }
}

function renderStatus(st) {
  const el = document.getElementById('status');
  if (!st.online) {
    el.textContent = 'Offline (no active stream)';
    el.className = 'offline';
  } else {
    const stream = st.probe?.streams?.[0] || {};
    const fr = stream.avg_frame_rate || '';
    el.textContent = `Online: ${stream.codec_name || ''} ${stream.width || ''}x${stream.height || ''} ${fr}`;
    el.className = 'online';
  }
}

async function init() {
  const cfg = await loadConfig();
  document.getElementById('streamPath').value = cfg.streamPath;
  document.getElementById('enable_rtmp').checked = !!cfg.enable.rtmp;
  document.getElementById('enable_rtsp').checked = !!cfg.enable.rtsp;
  document.getElementById('enable_srt').checked = !!cfg.enable.srt;
  document.getElementById('enable_hls').checked = !!cfg.enable.hls;
  document.getElementById('port_rtmp').value = cfg.listen.rtmp;
  document.getElementById('port_rtsp').value = cfg.listen.rtsp;
  document.getElementById('port_srt').value = cfg.listen.srt;
  document.getElementById('port_hls').value = cfg.listen.hls;

  const urls = await loadUrls();
  renderUrls(urls);
  const st = await loadStatus();
  renderStatus(st);

  document.getElementById('cfgForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      streamPath: document.getElementById('streamPath').value.trim(),
      enable: {
        rtmp: document.getElementById('enable_rtmp').checked,
        rtsp: document.getElementById('enable_rtsp').checked,
        srt: document.getElementById('enable_srt').checked,
        hls: document.getElementById('enable_hls').checked,
      },
      listen: {
        rtmp: Number(document.getElementById('port_rtmp').value),
        rtsp: Number(document.getElementById('port_rtsp').value),
        srt: Number(document.getElementById('port_srt').value),
        hls: Number(document.getElementById('port_hls').value),
      }
    };
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const t = await res.json().catch(() => ({}));
      alert('Failed to save: ' + (t.error || res.status));
      return;
    }
    const urls = await loadUrls();
    renderUrls(urls);
    setTimeout(async () => {
      const st = await loadStatus();
      renderStatus(st);
    }, 1000);
  });

  setInterval(async () => {
    try {
      const st = await loadStatus();
      renderStatus(st);
    } catch (e) {}
  }, 5000);
}

init();

