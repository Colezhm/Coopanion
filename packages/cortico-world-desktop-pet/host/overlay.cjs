/**
 * The pet window as a streaming layer: while the World says someone watches its `/overlay` page
 * (`worlds.desktop-pet.window.exportOverlay` is on), this sends the part of the window where the
 * pet and its bubbles are, at most OVERLAY_FPS times a second, to the World's `overlay-source` socket.
 *
 * The page reports that part (`pet:overlayRect`, CSS pixels) while it is told the stream is on
 * (`pet:overlay`). A frame is 6 little-endian uint32 (the width and height of the display the window
 * is on, and the part's x, y, width and height on that display, all in device pixels) and the part's
 * BGRA pixels, alpha premultiplied as Chromium paints them, deflated. The window covers the display's
 * work area, so the part is placed by the window's offset in the display. A part of 0 × 0 clears the
 * layer: the window is hidden or nothing is drawn.
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
  // the global WebSocket came with Node 22 (Electron 35): an older Electron set by the app streams nothing
  if (typeof WebSocket !== 'function') return { setRect: () => {}, pageLoaded: () => {}, stop: () => {} };
  let socket = null;
  /** The last frame sent cleared the layer: a hidden window sends that once, not at every tick. */
  let cleared = false;
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
    cleared = false;
    tellPage();
    if (on && !timer) timer = setInterval(() => void frame(), Math.round(1000 / OVERLAY_FPS));
    if (!on && timer) { clearInterval(timer); timer = null; }
  };

  const send = (head, pixels) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    cleared = !head[4];
    socket.send(Buffer.concat([Buffer.from(new Uint32Array(head).buffer), pixels]));
  };

  const frame = async () => {
    const win = getWindow();
    if (busy || !win || !socket || socket.bufferedAmount > MAX_BUFFERED) return;
    // the page's zoom stays at 1 (electron-main.cjs), so CSS pixels are DIPs
    const display = screen.getDisplayMatching(win.getBounds());
    const scale = display.scaleFactor;
    const b = win.getContentBounds();
    // Windows rounds each display's pixel size its own way; elsewhere DIPs times the scale are the pixels
    const px = process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : null;
    const size = px ? [px.width, px.height] : [Math.round(display.bounds.width * scale), Math.round(display.bounds.height * scale)];
    const dx = b.x - display.bounds.x, dy = b.y - display.bounds.y;
    if (!win.isVisible() || !rect || rect.width < 1 || rect.height < 1) {
      if (!cleared) send([...size, 0, 0, 0, 0], Buffer.alloc(0));
      return;
    }
    busy = true;
    try {
      const image = await win.webContents.capturePage(rect);
      const { width, height } = image.getSize();
      if (!width || !height) return;
      const pixels = await new Promise((done, fail) => deflate(image.toBitmap(), { level: 1 }, (err, out) => (err ? fail(err) : done(out))));
      send([...size, Math.round((dx + rect.x) * scale), Math.round((dy + rect.y) * scale), width, height], pixels);
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
