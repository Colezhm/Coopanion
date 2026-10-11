/**
 * Coopanion 的控制台入口:由 scripts/stage.ts 覆盖在 Cortico 的 src/web/client/main.ts 上。
 * 与上游的差别:
 * - 页面表多了关于桌宠的四页「开始」「习惯」「装扮」「语音输入」(features/home、pet、dress、voice;「电脑操作」是「习惯」页的一节,
 *   features/cua)和「对话」(features/chat),
 *   上游的终端页改名「运行轨迹」放进「高级」组,其余页重排、改了几个分组名;
 * - 「系统提示词」页的工具栏多一个「清空重开」(features/clear-session.ts);
 * - 两种模式(features/mode.ts):普通模式左栏只有那四页、「系统提示词」「用量与成本」和「对话」,别的路由都回到「开始」;
 *   底栏两种模式都只有运行状态、暂停/继续与关机;高级模式再接上 Cortico 除「设置」页以外的全部页面。左栏底部的开关
 *   切换模式,页面也可以经 requestMode 请求换;左栏只建一次,换模式时只藏起或露出普通模式不列的项;
 * - 空路由打开「开始」;
 * - 左栏可折叠为图标导航,Coopanion 字标的两个 o 移入 C 内;展开时显示版本与项目地址及新 Release 链接;
 * - 左栏各组按「桌宠四页 · 对话 → World → 设置 → Persona & Memory → 高级」重排。
 * 其余逐字沿用上游。
 */

import { fetchManifest, get } from './core/api.ts';
import { withLanguage } from './core/language.ts';
import { Lifecycle } from './core/lifecycle.ts';
import { Router, type Route } from './core/router.ts';
import type { SocketLike } from './core/stream.ts';
import { wsUrlOf } from './core/websocket.ts';
import { BUILTIN_PANELS } from './console-pages/builtins.ts';
import { ConsolePageHost, PROVIDER_ROUTE } from './console-pages/host.ts';
import { ConsolePageLoader } from './console-pages/loader.ts';
import { createConsoleUi } from './ui/index.ts';
import { subscribeLamps } from './ui/lamp.ts';
import { applyStoredTheme } from './theme/studio.ts';
import { createShell, type ConsoleShell } from './shell/index.ts';
import { featureAvailable, type FeatureContext, type FrameworkFeature } from './features/feature.ts';
import { coreFeature } from './features/core/index.ts';
import { usageFeature } from './features/usage/index.ts';
import { providersFeature } from './features/providers/index.ts';
import { worldsFeature } from './features/worlds/index.ts';
import { extensionsFeature } from './features/extensions/index.ts';
import { homeFeature } from './features/home/index.ts';
import { petFeature } from './features/pet/index.ts';
import { dressFeature } from './features/dress/index.ts';
import { voiceFeature } from './features/voice/index.ts';
import { chatFeature } from './features/chat/index.ts';
import { traceFeature } from './features/trace.ts';
import { promptsWithClearFeature } from './features/clear-session.ts';
import { mountRelease } from './features/release.ts';
import { onModeRequest, readMode, writeMode, type ConsoleMode } from './features/mode.ts';
import { icon } from './ui/icons.ts';
import { mountSidebar } from './sidebar.ts';
import { L } from './strings.ts';
import type { ConsoleMemo } from '../shared/client-panel.ts';

/**
 * 普通模式的全部页面:关于桌宠的四页、系统提示词(人设在里面,带清空重开)、花了多少钱,和对话页(以使用者身份
 * 打字发图,看桌宠说过的话与做过的事)。高级模式里它们仍排在最前。
 */
export const BASIC_FEATURES: readonly FrameworkFeature[] = [
  homeFeature, petFeature, dressFeature, voiceFeature,
  promptsWithClearFeature, { ...usageFeature, navMode: 'primary' },
  chatFeature,
];

/**
 * 控制台自己的页面。与贡献方的页无关——那一路完全由 manifest 驱动。
 *
 * 顺序即左栏顺序。上游的「设置」页(通用、外观)不在表里:语言在「习惯」,配色方案在「开始」,
 * 底栏的齿轮键也不显示。
 */
export const FEATURES: readonly FrameworkFeature[] = [
  ...BASIC_FEATURES,
  // the Model page keeps the providers page's own name (「模型供应商」), so the rail reads as the page's title
  { ...providersFeature, navMode: 'group', navGroup: L.integrations },
  { ...extensionsFeature, navMode: 'group', navGroup: L.integrations },
  { ...traceFeature, navMode: 'group', navGroup: L.diagnostics },
  { ...coreFeature, navMode: 'group', navGroup: L.diagnostics },
  worldsFeature,
];

/** 左栏分组的显示顺序;上游 shell 按类型固定追加,这里在它画完之后挪位置。 */
function navRank(el: Element): number {
  if (el.classList.contains('navgroup-primary')) return 0;
  if (el.classList.contains('navgroup-world-tree')) return 1;
  const label = el.getAttribute('aria-label');
  if (label === L.integrations) return 2;
  if (el.classList.contains('navgroup-persona')) return 3;
  if (label === L.diagnostics) return 4;
  return 5;
}

function orderNav(nav: Element): void {
  // the persona group's title is the upstream shell's 「Persona & Memory」, not translated there: ours in its place
  const persona = nav.querySelector<HTMLElement>(':scope > .navgroup-persona');
  const title = persona?.querySelector(':scope > .stacklabel');
  if (persona && title && title.textContent !== L.personaMemory) {
    title.textContent = L.personaMemory;
    persona.setAttribute('aria-label', L.personaMemory);
  }
  const groups = [...nav.children];
  const sorted = [...groups].sort((a, b) => navRank(a) - navRank(b));
  if (sorted.every((g, i) => g === groups[i])) return;
  for (const g of sorted) nav.appendChild(g);
}

/** localStorage 后端；无痕模式下静默降级成内存，不抛。 */
export function createMemo(prefix: string): ConsoleMemo {
  const fallback = new Map<string, unknown>();
  return {
    get<T>(key: string, dflt: T): T {
      const k = prefix + key;
      // 本会话写过的值优先:localStorage 写不进去(无痕、配额满)时只有内存表是新的。
      if (fallback.has(k)) return fallback.get(k) as T;
      try {
        const raw = localStorage.getItem(k);
        return raw === null ? dflt : (JSON.parse(raw) as T);
      } catch {
        return dflt;
      }
    },
    set(key: string, value: unknown): void {
      const k = prefix + key;
      fallback.set(k, value);
      try {
        localStorage.setItem(k, JSON.stringify(value));
      } catch { /* 无痕/配额满:这轮只留在内存里 */ }
    },
  };
}

export function boot(doc: Document = document): { dispose(): void } {
  // 首次渲染前应用主题。
  try {
    applyStoredTheme(doc);
  } catch { /* 主题读坏了不该拦住整个控制台 */ }

  // 首屏提示已经完成使命——内核跑起来了。摘不掉它才说明脚本没起来。
  doc.getElementById('boot-note')?.remove();

  let root = doc.getElementById('kernel-root');
  if (!root) {
    root = doc.createElement('div');
    root.id = 'kernel-root';
    doc.body.appendChild(root);
  }
  /**
   * 贡献方的页与 framework feature 各自拥有独立根容器。ConsolePageHost.unmount() 清空其根节点时，不得影响 feature 的 DOM。
   */
  const pageRoot = doc.createElement('div');
  const featureRoot = doc.createElement('div');
  root.replaceChildren(pageRoot, featureRoot);

  const onError = (err: unknown): void => {
    console.error('[console]', err);
  };

  const loader = new ConsolePageLoader({
    importModule: (url) => import(/* @vite-ignore */ url),
    styleHost: doc.head,
    createLink: () => doc.createElement('link'),
    log: (msg, detail) => console.warn('[console]', msg, detail ?? ''),
  });

  const router = new Router({
    win: window,
    confirmLeave: async (message) => window.confirm(message),
    onError,
  });

  const memo = createMemo('cortico.panel.');

  const hostDeps = {
    doc,
    overlayHost: doc.body,
    loader,
    builtins: BUILTIN_PANELS,
    router,
    fetchManifest: () => fetchManifest(),
    memo,
    createSocket: (url: string) => new WebSocket(url) as unknown as SocketLike,
    wsUrl: (path: string) => wsUrlOf(location, withLanguage(path)),
    onError,
  };
  const host = new ConsolePageHost({ ...hostDeps, root: pageRoot });
  /** 框架页里嵌别的页的面板用的宿主:同一套加载器与 memo,只换容器与路由前缀。 */
  const consolePageHost: NonNullable<FeatureContext['consolePageHost']> = (opts) =>
    new ConsolePageHost({ ...hostDeps, root: opts.root, route: opts.route });

  /** 框架能力清单；获取失败时不启用可选能力。 */
  let capabilities: Record<string, boolean> = {};
  /** capabilities 与 manifest 都到齐了吗。到齐之前不渲染任何一页。 */
  let ready = false;
  /** 到齐之前就 dispose 了:那一拍回来什么都不做。 */
  let disposed = false;

  /**
   * 左栏外壳。它自己不探活、不认识任何具体 World:框架页那段由 FEATURES 按
   * capability 过滤,贡献方那段完全由 manifest 驱动。外壳只建一次:换模式时只把普通模式不列的项藏起来。
   */
  let mode: ConsoleMode = readMode();
  /** 普通模式只认那几页的路由。 */
  const reachable = (head: string | undefined): boolean =>
    mode === 'advanced' || BASIC_FEATURES.some((f) => f.route === head);

  const shellLife = new Lifecycle(onError);
  const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: shellLife.signal, doc });
  const shell: ConsoleShell = createShell({ doc, ui, router, features: FEATURES, onError });
  shellLife.own({ dispose: () => { shell.dispose(); shell.el.remove(); } });
  doc.body.insertBefore(shell.el, doc.body.firstChild);

  const brandMeta = mountSidebar(shell.el, memo, shellLife.signal);
  mountRelease(doc, brandMeta, shellLife.signal);

  /** 普通模式下藏起不在 BASIC_FEATURES 里的项(含 manifest 的页),项都藏起来的组也藏起来;每次导航重画后再排一遍。 */
  const basicRoutes = new Set(BASIC_FEATURES.map((f) => f.route));
  const nav = shell.el.querySelector('nav.stack');
  /** How long an entry takes to fade in or out when the mode changes (companion.css `.companion-enter`, `.companion-leave`). */
  const FADE_MS = 200;
  /** Shows or hides one entry; on a mode change it fades, at once otherwise (a redraw of the nav). */
  const showEntry = (el: HTMLElement, show: boolean, animate: boolean): void => {
    el.classList.remove('companion-enter', 'companion-leave');
    if (!animate || show === !el.hidden) { el.hidden = !show; return; }
    if (show) {
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add('companion-enter');
      el.addEventListener('animationend', () => el.classList.remove('companion-enter'), { once: true });
    } else {
      el.classList.add('companion-leave');
      setTimeout(() => { if (el.classList.contains('companion-leave')) { el.classList.remove('companion-leave'); el.hidden = true; } }, FADE_MS);
    }
  };
  const filterNav = (animate = false): void => {
    if (!nav) return;
    orderNav(nav);
    const normal = mode === 'normal';
    const shown = (item: Element) => !normal || basicRoutes.has((item.getAttribute('href') ?? '').replace(/^#\/?/, '').split('/')[0] ?? '');
    const fading = animate && !nav.querySelector('.companion-leave');
    for (const group of nav.querySelectorAll<HTMLElement>('.navgroup')) {
      const items = [...group.querySelectorAll<HTMLAnchorElement>('a.navitem')];
      const any = items.some(shown);
      // a group that goes as a whole fades as a whole, its entries untouched until it is gone (hiding them first
      // left its bare section titles fading out); inside a group that stays, each entry fades on its own
      if (!(animate && !any && !group.hidden)) for (const item of items) showEntry(item, shown(item), animate && any);
      showEntry(group, any, animate);
    }
    // entries going out shorten the list: scroll to where it will end up while they fade, rather than jump there after
    if (fading && nav.querySelector('.companion-leave')) {
      const from = nav.scrollTop;
      // where the list ends without them: hide them for one synchronous measurement (no paint in between), then put them back
      const leaving = [...nav.querySelectorAll<HTMLElement>('.companion-leave')];
      for (const el of leaving) el.style.display = 'none';
      const to = Math.max(0, Math.min(from, nav.scrollHeight - nav.clientHeight));
      for (const el of leaving) el.style.display = '';
      nav.scrollTop = from;
      if (to < from && !doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        const start = performance.now();
        const step = (now: number): void => {
          const k = Math.min(1, (now - start) / FADE_MS);
          nav.scrollTop = from + (to - from) * (1 - (1 - k) ** 3);
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } else nav.scrollTop = to;
    }
  };
  if (nav) {
    const observer = new MutationObserver(() => filterNav());
    observer.observe(nav, { childList: true, subtree: true });
    shellLife.own({ dispose: () => observer.disconnect() });
  }

  const toggle = ui.h('button', 'companion-mode');
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    // a short press animation on the button itself
    toggle.classList.remove('companion-pressed');
    void toggle.offsetWidth;
    toggle.classList.add('companion-pressed');
    setMode(mode === 'advanced' ? 'normal' : 'advanced');
  }, { signal: shellLife.signal });
  toggle.addEventListener('animationend', () => toggle.classList.remove('companion-pressed'), { signal: shellLife.signal });
  shell.el.insertBefore(toggle, shell.el.querySelector('.railfoot'));
  const renderMode = (animate = false): void => {
    const advanced = mode === 'advanced';
    toggle.title = advanced ? L.toNormalHint : L.toAdvancedHint;
    toggle.setAttribute('aria-label', advanced ? L.toNormal : L.toAdvanced);
    toggle.replaceChildren(icon(doc, advanced ? 'eye-off' : 'settings', 'navicon'), ui.h('span', 'lbl', advanced ? L.toNormal : L.toAdvanced));
    doc.body.classList.toggle('companion-normal', !advanced);
    filterNav(animate);
  };

  // the run state in words right of the pause/resume key, in the key's color; a click on it is a click on the key
  const run = shell.el.querySelector<HTMLButtonElement>('.rail-run');
  if (run) {
    const state = ui.h('span', 'companion-runstate');
    state.setAttribute('aria-hidden', 'true');
    const show = (): void => {
      const paused = run.classList.contains('paused');
      state.textContent = paused ? L.paused : L.running;
      state.classList.toggle('paused', paused);
      state.hidden = capabilities.run !== true;
    };
    state.addEventListener('click', () => run.click(), { signal: shellLife.signal });
    // left to right: shut down, pause/resume, then the state in words
    const shutdown = shell.el.querySelector('.rail-shutdown');
    if (shutdown) run.before(shutdown);
    run.after(state);
    const observer = new MutationObserver(show);
    observer.observe(run, { attributes: true, attributeFilter: ['class', 'disabled'] });
    shellLife.own({ dispose: () => observer.disconnect() });
    show();
  }

  const setMode = (next: ConsoleMode): void => {
    if (next === mode) return;
    mode = next;
    writeMode(mode);
    renderMode(true);
    // the page open now stays, even one the normal mode does not list; the next page picked is checked as usual
  };
  renderMode();
  shell.setRoute(router.route);
  onModeRequest(setMode, shellLife.signal);
  const offNav = host.onNavChange(() => shell.setPages(host.pages));

  /**
   * 状态灯的活数据。manifest 只在开页与显式刷新时取，而灯要跟得上"引擎起来了没"，
   * 所以走那条只回灯的轻端点（节拍与不叠发都归 `subscribeLamps`）。
   */
  shellLife.own(subscribeLamps(doc, (lamps) => shell.setLamps(lamps)));

  /** 当前挂着的 framework feature（贡献方那边由 host 自己管）。 */
  let mounted: { route: string; lifecycle: Lifecycle } | null = null;
  let generation = 0;

  const unmountFeature = (): void => {
    const cur = mounted;
    mounted = null;
    generation++;
    if (cur) cur.lifecycle.dispose();
    featureRoot.replaceChildren();
  };

  const findFeature = (name: string | undefined): FrameworkFeature | undefined =>
    name === undefined ? undefined : FEATURES.find((f) => f.route === name);

  const mountFeature = (feature: FrameworkFeature, route: Route): void => {
    unmountFeature();
    const gen = generation;
    const lifecycle = new Lifecycle(onError);
    mounted = { route: feature.route, lifecycle };

    const slot = doc.createElement('div');
    slot.className = `featureslot featureslot-${feature.route}`;
    featureRoot.appendChild(slot);

    const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: lifecycle.signal, doc });
    void (async () => {
      try {
        const out = await feature.mount({
          root: slot, lifecycle, signal: lifecycle.signal, ui, router, route,
          capabilities, onError, consolePageHost,
          refreshNav: () => host.refresh(),
        });
        if (gen !== generation) {
          if (out && typeof out.dispose === 'function') out.dispose();
          return;
        }
        if (out && typeof out.dispose === 'function') lifecycle.own(out);
      } catch (err) {
        if (gen !== generation) return;
        onError(err);
        lifecycle.dispose();
        slot.replaceChildren();
        const card = ui.sheet({ title: L.featureLoadFailed(feature.label), en: 'feature error' });
        card.body.appendChild(ui.msgline(err instanceof Error ? err.message : String(err), true));
        slot.appendChild(card.el);
      }
    })();
  };

  const apply = (route: Route): void => {
    shell.setRoute(route);
    // 页面加载依赖完整的 capabilities；就绪后重新应用当前路由。
    if (!ready) return;
    // 空路由替换为「开始」，不增加历史条目。
    if (route.segments.length === 0) {
      router.replace(['home']);
      return;
    }
    const head = route.segments[0];

    if (!reachable(head)) {
      router.replace(['home']);
      return;
    }
    if (head === PROVIDER_ROUTE && route.segments[1]?.startsWith('llm:')) {
      router.replace(['providers']);
      return;
    }
    if (head === PROVIDER_ROUTE) {
      unmountFeature();
      const pageId = route.segments[1];
      if (!pageId) { host.unmount(); return; }
      void host.show(pageId, route.segments[2]);
      return;
    }

    const feature = findFeature(head);
    if (feature && featureAvailable(feature, capabilities)) {
      host.unmount();
      // 同一个 feature 内部换子页签(segments[1] 变)由它自己处理，不重挂。
      if (mounted?.route === feature.route) return;
      mountFeature(feature, route);
      return;
    }

    // 没人认领:清空台面。左栏仍在,导航照常可用。
    host.unmount();
    unmountFeature();
  };

  const offRoute = router.onChange(apply);
  const stopRouter = router.start();

  // capabilities 与 manifest 就绪后按当前路由渲染。
  void Promise.allSettled([
    get<{ capabilities?: Record<string, boolean> }>('/api/capabilities')
      .then((r) => { capabilities = r?.capabilities ?? {}; }),
    host.load(),
  ]).then(() => {
    if (disposed) return;
    ready = true;
    shell.setCapabilities(capabilities);
    shell.setPages(host.pages);
    apply(router.route);
  });

  return {
    dispose(): void {
      disposed = true;
      offNav.dispose();
      shellLife.dispose();
      offRoute.dispose();
      stopRouter.dispose();
      unmountFeature();
      host.unmount();
    },
  };
}

// 作为 bundle 入口被加载时自动启动:真页面带着 boot-note。测试 import 时没有它,不自动跑。
if (typeof document !== 'undefined' && document.getElementById('boot-note')) {
  boot();
}
