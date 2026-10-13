/**
 * The settings window: Coopanion's own front end, which talks to Core only through the console HTTP
 * API (tests/console-api.test.ts locks the routes). The Electron main process serves this build
 * under `/coopanion/` on Core's own origin (app/main.cjs), so requests and WebSockets are
 * same-origin. 高级模式 opens Cortico's console in a window of its own (advanced.ts).
 *
 * Pages mount one at a time under `#kernel-root`; the hash route picks the page and an empty or
 * unknown route opens 开始. The colour scheme is painted from the last record this window saw before
 * anything renders, then from `/api/theme`.
 */
import type { Disposable } from 'cortico/web/shared/client-panel.ts';
import { get } from './base/api.ts';
import { Lifecycle } from './base/lifecycle.ts';
import { createMemo } from './base/memo.ts';
import type { Page, PageContext } from './base/page.ts';
import { mountPanel } from './base/panel.ts';
import { Router, type Route } from './base/router.ts';
import { applyStoredTheme, disposeThemeStudio } from './base/theme/studio.ts';
import { fetchTheme } from './base/theme/storage.ts';
import { createConsoleUi } from './base/ui/index.ts';
import { openAdvanced } from './advanced.ts';
import { chatPage } from './features/chat/index.ts';
import { usagePage } from './features/cost/index.ts';
import { dressPage } from './features/dress/index.ts';
import { homePage } from './features/home/index.ts';
import { personaPage } from './features/persona/index.ts';
import { petPage } from './features/pet/index.ts';
import { voicePage } from './features/voice/index.ts';
import { createRail } from './rail/index.ts';
import { L } from './strings.ts';

/** The pages, in the rail's order. */
export const PAGES: readonly Page[] = [homePage, petPage, dressPage, voicePage, personaPage, usagePage, chatPage];

const HOME = homePage.route;

export function boot(doc: Document = document): Disposable {
  try {
    applyStoredTheme(doc);
  } catch { /* a bad cached record must not keep the window from starting */ }
  doc.getElementById('boot-note')?.remove();
  doc.body.classList.add('companion-sidebar');

  const root = doc.createElement('div');
  root.id = 'kernel-root';
  const slotHost = doc.createElement('div');
  root.append(slotHost);
  doc.body.append(root);

  const onError = (err: unknown): void => { console.error('[console]', err); };
  const life = new Lifecycle(onError);
  const memo = createMemo('cortico.panel.');
  const router = new Router({ win: window, confirmLeave: async (message) => window.confirm(message), onError });
  const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: life.signal, doc });
  const rail = createRail({ doc, ui, router, pages: PAGES, memo, signal: life.signal, content: root, onAdvanced: () => openAdvanced(), onError });
  doc.body.insertBefore(rail.el, doc.body.firstChild);
  rail.el.after(rail.backdrop);

  let capabilities: Record<string, boolean> = {};
  let ready = false;
  let mounted: { route: string; lifecycle: Lifecycle } | null = null;
  let generation = 0;

  const unmount = (): void => {
    const cur = mounted;
    mounted = null;
    generation++;
    cur?.lifecycle.dispose();
    slotHost.replaceChildren();
  };

  const mount = (page: Page): void => {
    unmount();
    const gen = generation;
    const lifecycle = new Lifecycle(onError);
    mounted = { route: page.route, lifecycle };
    const slot = doc.createElement('div');
    slot.className = `featureslot featureslot-${page.route}`;
    slotHost.append(slot);
    const pageUi = createConsoleUi({ memo, overlayHost: doc.body, signal: lifecycle.signal, doc });
    const ctx: PageContext = {
      root: slot, lifecycle, signal: lifecycle.signal, ui: pageUi, router, capabilities, onError,
      mountPanel: (pageId, panelId, box) => mountPanel({ doc, memo, onError, addLeaveGuard: (fn) => router.addLeaveGuard(fn) }, pageId, panelId, box),
    };
    void (async () => {
      try {
        const out = await page.mount(ctx);
        if (gen !== generation) { out?.dispose(); return; }
        if (out) lifecycle.own(out);
      } catch (err) {
        if (gen !== generation) return;
        onError(err);
        lifecycle.dispose();
        slot.replaceChildren();
        const card = pageUi.sheet({ title: L.featureLoadFailed(page.label) });
        card.body.append(pageUi.msgline(err instanceof Error ? err.message : String(err), true));
        slot.append(card.el);
      }
    })();
  };

  const apply = (route: Route): void => {
    rail.setRoute(route);
    if (!ready) return;
    const page = PAGES.find((p) => p.route === route.segments[0]);
    // an empty or unknown route opens 开始 without a history entry
    if (!page) { router.replace([HOME]); return; }
    if (mounted?.route !== page.route) mount(page);
  };

  const offRoute = router.onChange(apply);
  const stopRouter = router.start();

  void Promise.allSettled([
    get<{ capabilities?: Record<string, boolean> }>('/api/capabilities').then((r) => { capabilities = r?.capabilities ?? {}; }),
    fetchTheme().then((injected) => {
      disposeThemeStudio();
      applyStoredTheme(doc, { injected });
    }),
  ]).then(() => {
    if (life.signal.aborted) return;
    ready = true;
    rail.setCapabilities(capabilities);
    apply(router.route);
  });

  return {
    dispose(): void {
      unmount();
      offRoute.dispose();
      stopRouter.dispose();
      life.dispose();
      rail.el.remove();
      root.remove();
    },
  };
}

if (typeof document !== 'undefined' && document.getElementById('boot-note')) boot();
