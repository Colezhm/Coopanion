/**
 * The OBS overlay: the pet window's picture as the window process sends it through the World
 * (host/overlay.cjs has the frame format). The layer is the size of the display the window is on, and
 * each frame holds everything drawn, so the layer is cleared and the part put back where it is on that display.
 */
const canvas = document.getElementById('layer');
const ctx = canvas.getContext('2d');
/** Milliseconds before the socket is tried again after it closed. */
const RECONNECT_MS = 2000;

/** Deflated bytes back to raw ones. */
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Chromium's BGRA with premultiplied alpha as canvas RGBA. */
function toImageData(bgra, width, height) {
  const out = new ImageData(width, height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = bgra[i + 3];
    if (!a) continue;
    const k = 255 / a;
    d[i] = Math.min(255, bgra[i + 2] * k);
    d[i + 1] = Math.min(255, bgra[i + 1] * k);
    d[i + 2] = Math.min(255, bgra[i] * k);
    d[i + 3] = a;
  }
  return out;
}

/** The newest frame not drawn yet; one drawing meanwhile is replaced, not queued. */
let pending = null, busy = false;
async function pump() {
  busy = true;
  while (pending) {
    const buffer = pending;
    pending = null;
    await draw(buffer).catch(() => {});
  }
  busy = false;
}
async function draw(buffer) {
  const [W, H, x, y, w, h] = new Uint32Array(buffer.slice(0, 24));
  // 0 × 0: the window process is gone; the layer clears and keeps its size
  if (W && H && (canvas.width !== W || canvas.height !== H)) { canvas.width = W; canvas.height = H; }
  const pixels = w && h ? await inflate(new Uint8Array(buffer, 24)) : null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (pixels && pixels.length === w * h * 4) ctx.putImageData(toImageData(pixels, w, h), x, y);
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/socket?role=overlay`);
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') return;
    pending = e.data;
    if (!busy) void pump();
  };
  ws.onclose = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); setTimeout(connect, RECONNECT_MS); };
}
connect();
