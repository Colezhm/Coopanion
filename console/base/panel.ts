/**
 * World panels on Coopanion's own pages, through the panel contract (`ConsolePanelContext`):
 * methods over `POST /api/console/providers/<page>/panels/<panel>/<method>`, the push channel over
 * the panel's WebSocket. The bundles are the workspace packages' panel sources, built into the
 * settings window; Core serves the same ones to its own console. The host's path picker is not
 * offered here: `pickPath` rejects.
 */
import type { ConsoleClientBundle, ConsoleMemo, ConsolePanelContext, Disposable } from 'cortico/web/shared/client-panel.ts';
import petPanels from 'cortico-world-desktop-pet/console';
import { invokePanel, invokePanelBinary, setConfig } from './api.ts';
import { LANGUAGE } from './language.ts';
import { Lifecycle } from './lifecycle.ts';
import { ConsoleInvokeError, panelStreamRoute, toDisposable } from './protocol.ts';
import { openStream } from './stream.ts';
import { browserSocketEnv } from './websocket.ts';
import { createConsoleUi } from './ui/index.ts';
import { S } from './strings.ts';

const BUNDLES: Readonly<Record<string, ConsoleClientBundle>> = { 'world:desktop-pet': petPanels };

export interface PanelHostDeps {
  doc: Document;
  memo: ConsoleMemo;
  addLeaveGuard(fn: () => string | null): Disposable;
  onError(err: unknown): void;
}

/** Mounts one panel into `root`; disposing it unmounts the panel and closes its stream. */
export async function mountPanel(deps: PanelHostDeps, pageId: string, panelId: string, root: HTMLElement): Promise<Disposable> {
  const panel = BUNDLES[pageId]?.panels[panelId];
  if (!panel) throw new Error(S.noPanel(pageId, panelId));
  const lifecycle = new Lifecycle(deps.onError);
  const signal = lifecycle.signal;
  const env = browserSocketEnv(window);
  const prefix = `${pageId}${panelId}`;
  const memo: ConsoleMemo = { get: (key, fallback) => deps.memo.get(prefix + key, fallback), set: (key, value) => deps.memo.set(prefix + key, value) };
  const ctx: ConsolePanelContext = {
    pageId,
    panelId,
    language: LANGUAGE,
    root,
    signal,
    invoke: (method, args) => invokePanel(pageId, panelId, method, args, { signal }),
    invokeBinary: (method, args) => invokePanelBinary(pageId, panelId, method, args, { signal }),
    notifyOnUnmount(method, args) {
      signal.addEventListener('abort', () => {
        void invokePanel(pageId, panelId, method, args, { keepalive: true }).catch(deps.onError);
      }, { once: true });
    },
    pickPath: () => Promise.reject(new ConsoleInvokeError(S.noPathPicker, 0)),
    setConfig: (groupId, values) => setConfig(groupId, values, { signal }),
    stream: (handlers) => lifecycle.own(openStream({
      url: env.wsUrl(panelStreamRoute(pageId, panelId)),
      handlers,
      signal,
      createSocket: env.createSocket,
      setTimer: env.setTimer,
      clearTimer: env.clearTimer,
      onError: deps.onError,
    })),
    interval: (fn, ms) => lifecycle.interval(fn, ms),
    timeout: (fn, ms) => lifecycle.timeout(fn, ms),
    frame: (fn) => lifecycle.frame(fn),
    own: (d) => lifecycle.own(d),
    memo,
    guardLeave: (fn) => lifecycle.own(deps.addLeaveGuard(fn)),
    scope: {},
    mountSlot: () => Promise.reject(new Error(S.noPanel(pageId, panelId))),
    ui: createConsoleUi({ memo, overlayHost: deps.doc.body, signal, doc: deps.doc }),
    refresh: async () => {},
  };
  const out = await panel.mount(ctx);
  if (out) lifecycle.own(out);
  return toDisposable(() => {
    lifecycle.dispose();
    root.replaceChildren();
  });
}
