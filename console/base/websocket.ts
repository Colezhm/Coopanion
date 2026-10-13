/**
 * WebSocket addresses for panel streams: ws or wss as the page is http or https, on the page's host,
 * with the window's language attached. The stream client itself is `stream.ts`.
 */
import { withLanguage } from './language.ts';
import type { SocketLike } from './stream.ts';

export interface SocketEnv {
  /** A path such as `/ws/providers/…` to its absolute address. */
  wsUrl(path: string): string;
  createSocket(url: string): SocketLike;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export interface LocationLike {
  protocol: string;
  host: string;
}

export function wsUrlOf(loc: LocationLike, path: string): string {
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}${path}`;
}

export function browserSocketEnv(win: Window & typeof globalThis): SocketEnv {
  return {
    wsUrl: (path) => wsUrlOf(win.location, withLanguage(path)),
    createSocket: (url) => new win.WebSocket(url) as unknown as SocketLike,
    setTimer: (fn, ms) => win.setTimeout(fn, ms),
    clearTimer: (id) => win.clearTimeout(id),
  };
}
