/**
 * The settings window's left rail: the Coopanion mark with the version under it and a new release's
 * link, the button that folds the rail to icons, one entry per page, the 高级模式 button, and the
 * foot (shut down, pause/resume with the run state in words, the avatar and the bot's name).
 *
 * Folded, the rail shows icons only and a tooltip names what is under the pointer. Below 1000px
 * wide it starts folded unless it was set by hand (kept in the memo); below 720px it opens over the
 * page, with a backdrop that folds it again. Pause and resume, shutting down and renaming go to Core
 * through `/api/run/*` and `/api/config`.
 */
import type { ConsoleMemo, ConsoleUi } from 'cortico/web/shared/client-panel.ts';
import { get, post, setConfig } from '../base/api.ts';
import type { Page } from '../base/page.ts';
import { buildHash, type Route, type Router } from '../base/router.ts';
import { icon } from '../base/ui/icons.ts';
import { mountRelease } from '../features/release.ts';
import { sidebarBrand } from './brand.ts';
import { L } from '../strings.ts';
import { createAvatarControl } from './avatar.ts';
import { S } from './strings.ts';

const COLLAPSED_KEY = 'companion.sidebar.collapsed';
const DEFAULT_NAME = 'bot';

export interface RailDeps {
  doc: Document;
  ui: ConsoleUi;
  router: Router;
  pages: readonly Page[];
  memo: ConsoleMemo;
  signal: AbortSignal;
  /** The page area: inert while the narrow rail is open over it. */
  content: HTMLElement;
  /** 高级模式. */
  onAdvanced(): void;
  onError(err: unknown): void;
}

export interface Rail {
  readonly el: HTMLElement;
  /** Goes right after `el`: on a narrow window it covers the page while the rail is open. */
  readonly backdrop: HTMLElement;
  setRoute(route: Route): void;
  setCapabilities(capabilities: Record<string, boolean>): void;
}

export function createRail(deps: RailDeps): Rail {
  const { doc, ui, router, signal, onError } = deps;
  const win = doc.defaultView!;
  let capabilities: Record<string, boolean> = {};

  const el = ui.h('div');
  el.id = 'rail';

  /* ---------- brand ---------- */
  const brand = ui.h('div', 'brand');
  // the logo, the version centred under it (and a new release's link when there is one), then the collapse button
  const meta = ui.h('div', 'companion-brand-meta');
  // a new release's link sits in a box that folds to nothing with the rail (its row eases from 1fr to 0fr), so the
  // button under it goes back up to where it is with no link, whatever height the link has
  const release = ui.h('div', 'companion-release');
  const releaseInner = ui.h('div');
  release.append(releaseInner);
  const tools = ui.h('div', 'companion-sidebar-tools');
  const toggle = ui.h('button', 'companion-sidebar-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'companion-navigation');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="companion-sidebar-chevron" d="m16 9-3 3 3 3"/></svg>';
  // the words only show on the open rail, where the button folds it: they stay put while the rail folds
  toggle.append(ui.h('span', 'lbl', L.collapseSidebar));
  tools.append(toggle);
  brand.append(sidebarBrand(doc), meta, tools);
  mountRelease(doc, meta, (hint) => {
    releaseInner.append(hint);
    meta.append(release);
  }, signal);

  /* ---------- pages ---------- */
  const nav = ui.h('nav', 'stack');
  nav.id = 'companion-navigation';
  nav.setAttribute('aria-label', S.navAria);
  const entries = deps.pages.map((page) => {
    const group = ui.h('div', 'navgroup navgroup-framework navgroup-primary');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', page.label);
    const item = ui.h('a', 'navitem');
    item.href = buildHash([page.route]);
    item.setAttribute('aria-label', page.label);
    item.title = page.label;
    item.append(icon(doc, page.icon, 'navicon'), ui.h('span', 'lbl', page.label));
    // a modified or middle click keeps the browser's own behaviour
    item.addEventListener('click', (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      router.navigate([page.route]);
    }, { signal });
    group.append(item);
    nav.append(group);
    return { route: page.route, item };
  });

  const advanced = ui.h('button', 'companion-mode');
  advanced.type = 'button';
  advanced.title = L.toAdvancedHint;
  advanced.setAttribute('aria-label', L.toAdvanced);
  advanced.append(icon(doc, 'settings', 'navicon'), ui.h('span', 'lbl', L.toAdvanced));
  advanced.addEventListener('click', () => {
    // a short press animation on the button itself
    advanced.classList.remove('companion-pressed');
    void advanced.offsetWidth;
    advanced.classList.add('companion-pressed');
    deps.onAdvanced();
  }, { signal });
  advanced.addEventListener('animationend', () => advanced.classList.remove('companion-pressed'), { signal });

  /* ---------- foot ---------- */
  const foot = ui.h('div', 'railfoot');
  const avatar = createAvatarControl({ doc, ui, signal, onError });
  const name = ui.h('button', 'rail-name');
  name.type = 'button';
  name.title = S.renameTitle;
  const nameText = ui.h('span', 'rail-name-text', DEFAULT_NAME);
  const nameEdit = ui.h('span', 'rail-name-edit');
  nameEdit.setAttribute('aria-hidden', 'true');
  nameEdit.append(icon(doc, 'pencil'));
  name.append(nameText, nameEdit);
  const ident = ui.h('div', 'rail-ident');
  ident.append(name);
  const who = ui.h('div', 'rail-who');
  who.append(avatar.el, ident);
  const actions = ui.h('div', 'rail-actions');
  const shutdown = ui.h('button', 'rail-action rail-shutdown');
  shutdown.type = 'button';
  shutdown.append(icon(doc, 'power'));
  const run = ui.h('button', 'rail-action rail-run');
  run.type = 'button';
  // the run state in words right of the pause/resume key, in the key's color; a click on it is a click on the key
  const runState = ui.h('span', 'companion-runstate');
  runState.setAttribute('aria-hidden', 'true');
  runState.addEventListener('click', () => run.click(), { signal });
  actions.append(shutdown, run, runState);
  foot.append(who, actions);

  el.append(brand, nav, advanced, foot);

  let paused = false;
  let runPending = false;
  const renderRun = (): void => {
    const available = capabilities.run === true;
    run.disabled = !available || runPending;
    run.replaceChildren(icon(doc, paused ? 'play' : 'pause'));
    run.setAttribute('aria-label', paused ? S.runResume : S.runPause);
    run.title = paused ? S.runResume : S.runPause;
    run.classList.toggle('paused', paused);
    runState.textContent = paused ? L.paused : L.running;
    runState.classList.toggle('paused', paused);
    runState.hidden = !available;
  };
  run.addEventListener('click', () => {
    if (runPending || capabilities.run !== true) return;
    runPending = true;
    renderRun();
    void post<{ paused?: boolean; result?: string }>(paused ? '/api/run/resume' : '/api/run/pause', undefined, { signal })
      .then((out) => {
        paused = out.paused === true;
        if (out.result) ui.toast(out.result);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        onError(err);
        ui.toast(err instanceof Error ? err.message : String(err), 'bad');
      })
      .finally(() => {
        runPending = false;
        renderRun();
      });
  }, { signal });

  let shuttingDown = false;
  const renderPower = (): void => {
    const can = capabilities.shutdown === true;
    shutdown.hidden = !can;
    shutdown.disabled = !can || shuttingDown;
    shutdown.setAttribute('aria-label', S.shutdownAria);
    shutdown.title = shuttingDown ? S.finishing : S.shutdownTitle;
  };
  shutdown.addEventListener('click', () => void (async () => {
    if (shuttingDown || capabilities.shutdown !== true) return;
    if (!await ui.confirm({ title: S.confirmShutdownTitle, body: S.shutdownBody, danger: true }) || signal.aborted) return;
    if (!await ui.confirm({ title: S.confirmShutdownAgainTitle, body: S.confirmShutdownAgainBody, danger: true }) || signal.aborted) return;
    shuttingDown = true;
    renderPower();
    const hold = ui.toast(S.finishingToast);
    try {
      const out = await post<{
        ok?: boolean; localComplete?: boolean; result?: string; error?: string;
        steps?: Array<{ label: string; ok: boolean; ms: number; detail?: string }>;
        externalChecks?: Array<{ status: 'verified-ended' | 'still-live' | 'unknown' }>;
      }>('/api/run/shutdown', undefined, { signal });
      if (out?.error) throw new Error(out.error);
      const steps = out?.steps ?? [];
      const localComplete = out?.localComplete ?? steps.every((step) => step.ok);
      const externalUnverified = (out?.externalChecks ?? []).some((check) => check.status !== 'verified-ended');
      const lines = steps.map((s) => `${s.ok ? '✓' : '✗'} ${s.label} · ${(s.ms / 1000).toFixed(1)}s${s.ok ? '' : ` — ${s.detail ?? S.stepIncomplete}`}`);
      void ui.confirm({
        title: !localComplete ? S.resultLocalIncomplete
          : externalUnverified ? S.resultExternalUnverified
          : out?.ok === false ? S.resultUnverified : S.doneShutdown,
        body: [out?.result ?? S.resultDefault, '', ...lines].join('\n'),
      });
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      // the process can exit before its answer arrives: the result is unknown, not a failure
      onError(err);
      ui.toast(S.noReceipt(String((err as Error)?.message ?? err)), 'bad');
    } finally {
      hold.dispose();
      shuttingDown = false;
      renderPower();
    }
  })(), { signal });

  /* ---------- the bot's name ---------- */
  let shownName = DEFAULT_NAME;
  const setName = (next: unknown): void => {
    shownName = typeof next === 'string' && next.trim() !== '' ? next.trim() : DEFAULT_NAME;
    nameText.textContent = shownName;
    avatar.setLabel(shownName);
    doc.title = S.docTitle(shownName);
  };
  // the name is `displayName` in Core's config; Enter or leaving the box saves it, Escape drops the edit
  name.addEventListener('click', () => {
    const field = ui.input({ value: shownName });
    field.className = 'field rail-rename';
    name.replaceWith(field);
    field.focus();
    field.select();
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      const next = field.value.trim();
      field.replaceWith(name);
      if (!save || !next || next === shownName) return;
      setName(next);
      void setConfig('core', { displayName: next }).then(
        () => ui.toast(S.renameSaved),
        (err) => {
          ui.toast(S.renameFailed(String((err as Error)?.message ?? err)), 'bad');
          onError(err);
        },
      );
    };
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
    }, { signal });
    field.addEventListener('blur', () => finish(true), { signal });
  }, { signal });
  void get<{ displayName?: unknown; loop?: { paused?: unknown } } | null>('/api/status', { signal }).then((st) => {
    setName(st?.displayName);
    paused = st?.loop?.paused === true;
    renderRun();
  }).catch(() => { /* the name stays the default */ });

  /* ---------- folding ---------- */
  const backdrop = ui.h('button', 'companion-sidebar-backdrop');
  backdrop.type = 'button';
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', L.collapseSidebar);
  const tooltip = ui.h('div', 'companion-sidebar-tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.hidden = true;
  doc.body.append(tooltip);
  const hideTip = (): void => { tooltip.hidden = true; };

  const compact = win.matchMedia('(max-width: 1000px)');
  const narrow = win.matchMedia('(max-width: 720px)');
  const stored = deps.memo.get<unknown>(COLLAPSED_KEY, null);
  let preference = typeof stored === 'boolean' ? stored : null;
  let collapsed = false;

  /**
   * The foot changes layout when the rail folds (a row of keys over the avatar, or one column), which CSS can't
   * animate: grow or shrink its height and slide the keys from where they were (FLIP), the run state's words riding
   * along with the pause key as they fade.
   */
  const flip = (change: () => void): void => {
    const moving = typeof foot.animate === 'function' && !win.matchMedia('(prefers-reduced-motion: reduce)')?.matches
      ? Array.from(foot.querySelectorAll<HTMLElement>('.rail-who, .rail-action, .companion-runstate')).filter((x) => !x.hidden)
      : [];
    const before = moving.map((x) => x.getBoundingClientRect());
    const height = foot.getBoundingClientRect().height;
    // clicked again mid-way: start from where things are on screen now, and measure the new layout without the old animations
    for (const x of moving.length ? [foot, ...moving] : []) for (const a of x.getAnimations()) a.cancel();
    change();
    if (!moving.length) return;
    const options: KeyframeAnimationOptions = { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' };
    foot.animate([{ height: `${height}px`, boxSizing: 'border-box' }, { height: `${foot.getBoundingClientRect().height}px`, boxSizing: 'border-box' }], options);
    const at = moving.indexOf(run);
    const runMove = at < 0 ? null : { x: run.getBoundingClientRect().left - before[at]!.left, y: run.getBoundingClientRect().top - before[at]!.top };
    moving.forEach((x, i) => {
      const now = x.getBoundingClientRect();
      const dx = before[i]!.left - now.left;
      const dy = before[i]!.top - now.top;
      // folded, the words have no place of their own (they are taken out of the column): they ride with the pause key
      if (runMove && x === runState) {
        const [from, to] = collapsed
          ? [[dx, dy], [dx + runMove.x, dy + runMove.y]]
          : [[-runMove.x, -runMove.y], [0, 0]];
        x.animate([{ transform: `translate(${from[0]}px, ${from[1]}px)` }, { transform: `translate(${to[0]}px, ${to[1]}px)` }], options);
        return;
      }
      if (dx || dy) x.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], options);
    });
  };

  const render = (next: boolean, animate = false): void => {
    if (animate && next !== collapsed) { flip(() => render(next)); return; }
    collapsed = next;
    el.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? L.expandSidebar : L.collapseSidebar);
    toggle.title = collapsed ? L.expandSidebar : L.collapseSidebar;
    meta.inert = collapsed;
    backdrop.hidden = collapsed || !narrow.matches;
    deps.content.inert = !backdrop.hidden;
    hideTip();
  };
  const resize = (): void => render(narrow.matches || (preference ?? compact.matches));
  toggle.addEventListener('click', () => {
    if (!narrow.matches) {
      preference = !collapsed;
      deps.memo.set(COLLAPSED_KEY, preference);
    }
    render(!collapsed, true);
  }, { signal });
  const close = (): void => { render(true, true); toggle.focus(); };
  backdrop.addEventListener('click', close, { signal });
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    hideTip();
    if (narrow.matches && !collapsed) close();
  }, { signal });
  nav.addEventListener('click', (event) => {
    if (narrow.matches && (event.target as Element).closest('a.navitem')) render(true, true);
  }, { signal });
  compact.addEventListener('change', resize, { signal });
  narrow.addEventListener('change', resize, { signal });

  const showTip = (event: Event): void => {
    const target = (event.target as Element).closest<HTMLElement>('a.navitem, .companion-mode, .rail-action, .rail-avatar, .companion-sidebar-toggle');
    if (!collapsed || !target || target.hidden) return;
    const label = target.getAttribute('aria-label') || target.title;
    if (!label) return;
    tooltip.textContent = label;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${el.getBoundingClientRect().right + 10}px`;
    tooltip.style.top = `${Math.max(8, Math.min(win.innerHeight - tooltip.offsetHeight - 8, rect.top + (rect.height - tooltip.offsetHeight) / 2))}px`;
  };
  el.addEventListener('pointerover', showTip, { signal });
  el.addEventListener('focusin', showTip, { signal });
  el.addEventListener('pointerout', hideTip, { signal });
  el.addEventListener('focusout', hideTip, { signal });
  nav.addEventListener('scroll', hideTip, { signal });
  el.addEventListener('click', hideTip, { signal });
  win.addEventListener('resize', hideTip, { signal });

  signal.addEventListener('abort', () => {
    tooltip.remove();
    backdrop.remove();
    deps.content.inert = false;
  }, { once: true });

  renderRun();
  renderPower();
  resize();

  return {
    el,
    backdrop,
    setRoute(route: Route): void {
      for (const { route: r, item } of entries) {
        const on = route.segments[0] === r;
        item.classList.toggle('active', on);
        if (on) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      }
    },
    setCapabilities(next: Record<string, boolean>): void {
      capabilities = next;
      renderRun();
      renderPower();
    },
  };
}
