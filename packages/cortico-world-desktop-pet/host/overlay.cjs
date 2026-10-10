/**
 * The pet window as a streaming layer: while the World says someone watches its `/overlay` page
 * (`worlds.desktop-pet.window.exportOverlay` is on), this sends the part of the window where the
 * pet and its bubbles are, at most OVERLAY_FPS times a second, to the World's `overlay-source` socket.
 *
 * The page reports that part (`pet:overlayRect`, CSS pixels) while it is told the stream is on
 * (`pet:overlay`). A frame is 6 little-endian uint32 (the window's width and height and the part's
 * x, y, width and height, all in device pixels) and the part's BGRA pixels, alpha premultiplied as
 * Chromium paints them, deflated. A part of 0 × 0 clears the layer: the window is hidden or nothing
 * is drawn.
 */
const { deflate } = require('node:zlib');
const { screen } = require('electron');

const OVERLAY_FPS = 30;
/** A frame waits while more than this many bytes are still on their way to the World. */
const MAX_BUFFERED = 4 * 1024 * 1024;
/** Milliseconds before the socket is tried again after it closed. */
const RECONNECT_MS = 2000;

/**
 * Connects to `origin` (the World's page server) and streams while it asks. `getWindow` returns the
 * pet window or null.
 */
function createOverlaySource({ origin, getWindow }) {
  let socket = null;
  let on = false;
  let rect = null;
  let busy = false;
  let timer = null;
  let stopped = false;

  const tellPage = () => getWindow()?.webContents.send('pet:overlay', on);

  const connect = () => {
    if (stopped) return;
    const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/socket?role=overlay-source`);
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === 'overlay') setOn(!!msg.on);
      } catch { /* not ours */ }
    });
    ws.addEventListener('close', () => {
      if (socket === ws) { socket = null; setOn(false); }
      if (!stopped) setTimeout(connect, RECONNECT_MS);
    });
    ws.addEventListener('error', () => { /* close follows */ });
    socket = ws;
  };

  const setOn = (value) => {
    if (value === on) return;
    on = value;
    rect = null;
    tellPage();
    if (on && !timer) timer = setInterval(() => void frame(), Math.round(1000 / OVERLAY_FPS));
    if (!on && timer) { clearInterval(timer); timer = null; }
  };

  const send = (head, pixels) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(Buffer.concat([Buffer.from(new Uint32Array(head).buffer), pixels]));
  };

  const frame = async () => {
    const win = getWindow();
    if (busy || !win || !socket || socket.bufferedAmount > MAX_BUFFERED) return;
    // the page's zoom stays at 1 (electron-main.cjs), so CSS pixels are DIPs
    const scale = screen.getDisplayMatching(win.getBounds()).scaleFactor;
    const b = win.getContentBounds();
    const size = [Math.round(b.width * scale), Math.round(b.height * scale)];
    if (!win.isVisible() || !rect || rect.width < 1 || rect.height < 1) { send([...size, 0, 0, 0, 0], Buffer.alloc(0)); return; }
    busy = true;
    try {
      const image = await win.webContents.capturePage(rect);
      const { width, height } = image.getSize();
      if (!width || !height) return;
      const pixels = await new Promise((done, fail) => deflate(image.toBitmap(), { level: 1 }, (err, out) => (err ? fail(err) : done(out))));
      send([...size, Math.round(rect.x * scale), Math.round(rect.y * scale), width, height], pixels);
    } catch { /* the window closed mid-capture */ } finally {
      busy = false;
    }
  };

  connect();
  return {
    /** The part to send, in the page's CSS pixels, or null for none. */
    setRect: (r) => {
      rect = r && [r.x, r.y, r.width, r.height].every(Number.isFinite)
        ? { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.ceil(r.width), height: Math.ceil(r.height) }
        : null;
    },
    /** The page loaded again: tell it whether to report. */
    pageLoaded: tellPage,
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      socket?.close();
    },
  };
}

module.exports = { createOverlaySource };
