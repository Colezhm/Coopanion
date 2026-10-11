import type { ConsoleMemo } from '../shared/client-panel.ts';
import { icon } from './ui/icons.ts';
import { sidebarBrand } from './sidebar-brand.ts';
import { L } from './strings.ts';

const COLLAPSED_KEY = 'companion.sidebar.collapsed';

/** Adds the app's compact navigation to the Cortico shell, including late manifest entries. */
export function mountSidebar(rail: HTMLElement, memo: ConsoleMemo, signal: AbortSignal): HTMLElement {
  const doc = rail.ownerDocument;
  const win = doc.defaultView!;
  const brand = rail.querySelector<HTMLElement>('.brand')!;
  const nav = rail.querySelector<HTMLElement>('nav.stack')!;
  const content = doc.getElementById('kernel-root');
  nav.id = 'companion-navigation';
  // the logo, the version centred under it (and a new release's link when there is one), then the collapse button
  const tools = doc.createElement('div');
  tools.className = 'companion-sidebar-tools';
  const meta = doc.createElement('div');
  meta.className = 'companion-brand-meta';
  // a new release's link sits in a box that folds to nothing with the rail (its row eases from 1fr to 0fr), so the
  // button under it goes back up to where it is with no link, whatever height the link has
  const release = doc.createElement('div');
  release.className = 'companion-release';
  const releaseInner = doc.createElement('div');
  release.append(releaseInner);
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'companion-sidebar-toggle';
  toggle.setAttribute('aria-controls', nav.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="companion-sidebar-chevron" d="m16 9-3 3 3 3"/></svg>';
  const toggleLabel = doc.createElement('span');
  toggleLabel.className = 'lbl';
  // the words only show on the open rail, where the button folds it: they stay put while the rail folds
  toggleLabel.textContent = L.collapseSidebar;
  toggle.append(toggleLabel);
  tools.append(toggle);
  brand.replaceChildren(sidebarBrand(doc), meta, tools);

  const backdrop = doc.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'companion-sidebar-backdrop';
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', L.collapseSidebar);
  rail.after(backdrop);

  const compact = win.matchMedia('(max-width: 1000px)');
  const narrow = win.matchMedia('(max-width: 720px)');
  const stored = memo.get<unknown>(COLLAPSED_KEY, null);
  let preference = typeof stored === 'boolean' ? stored : null;
  let collapsed: boolean;

  const tooltip = doc.createElement('div');
  tooltip.className = 'companion-sidebar-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.hidden = true;
  doc.body.append(tooltip);
  const hideTip = (): void => { tooltip.hidden = true; };

  const foot = rail.querySelector<HTMLElement>('.railfoot');
  /**
   * The foot changes layout when the rail folds (a row of keys over the avatar, or one column), which CSS can't
   * animate: grow or shrink its height and slide the keys from where they were (FLIP), the run state's words riding
   * along with the pause key as they fade. The avatar keeps its place; it is in the list in case a layout moves it.
   */
  const flip = (change: () => void): void => {
    const moving = foot && typeof foot.animate === 'function' && !win.matchMedia('(prefers-reduced-motion: reduce)')?.matches
      ? Array.from(foot.querySelectorAll<HTMLElement>('.rail-who, .rail-action, .companion-runstate')).filter((el) => !el.hidden)
      : [];
    const before = moving.map((el) => el.getBoundingClientRect());
    const height = foot?.getBoundingClientRect().height ?? 0;
    // clicked again mid-way: start from where things are on screen now, and measure the new layout without the old animations
    for (const el of foot && moving.length ? [foot, ...moving] : []) for (const a of el.getAnimations()) a.cancel();
    change();
    if (!foot || !moving.length) return;
    const options: KeyframeAnimationOptions = { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' };
    foot.animate([{ height: `${height}px`, boxSizing: 'border-box' }, { height: `${foot.getBoundingClientRect().height}px`, boxSizing: 'border-box' }], options);
    const run = moving.findIndex((el) => el.matches('.rail-run'));
    const runMove = run < 0 ? null : { x: moving[run]!.getBoundingClientRect().left - before[run]!.left, y: moving[run]!.getBoundingClientRect().top - before[run]!.top };
    moving.forEach((el, i) => {
      const now = el.getBoundingClientRect();
      const dx = before[i]!.left - now.left;
      const dy = before[i]!.top - now.top;
      // the run state in words rides along with the pause key while it fades: folded it has no place of its own
      // (it is taken out of the column), so sliding it to where it rests would send it to the corner
      if (runMove && el.matches('.companion-runstate')) {
        const [from, to] = collapsed
          ? [[dx, dy], [dx + runMove.x, dy + runMove.y]]
          : [[-runMove.x, -runMove.y], [0, 0]];
        el.animate([{ transform: `translate(${from[0]}px, ${from[1]}px)` }, { transform: `translate(${to[0]}px, ${to[1]}px)` }], options);
        return;
      }
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], options);
    });
  };

  const render = (next: boolean, animate = false): void => {
    if (animate && next !== collapsed) { flip(() => render(next)); return; }
    collapsed = next;
    rail.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? L.expandSidebar : L.collapseSidebar);
    toggle.title = collapsed ? L.expandSidebar : L.collapseSidebar;
    meta.inert = collapsed;
    backdrop.hidden = collapsed || !narrow.matches;
    if (content) content.inert = !backdrop.hidden;
    hideTip();
  };
  const resize = (): void => render(narrow.matches || (preference ?? compact.matches));
  toggle.addEventListener('click', () => {
    if (!narrow.matches) {
      preference = !collapsed;
      memo.set(COLLAPSED_KEY, preference);
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

  const prepareNav = (): void => {
    for (const item of nav.querySelectorAll<HTMLAnchorElement>('a.navitem')) {
      const label = item.querySelector('.lbl')?.textContent ?? '';
      item.setAttribute('aria-label', label);
      item.title = label;
      // World instances have no icon in the upstream tree.
      if (!item.querySelector('.navicon')) item.prepend(icon(doc, 'boxes', 'navicon companion-module-icon'));
    }
  };
  const observer = new win.MutationObserver((records) => {
    const newItems = records.some((record) => record.target === nav || Array.from(record.addedNodes).some((node) =>
      node.nodeType === 1 && ((node as Element).matches('.navitem, .navgroup') || (node as Element).querySelector('.navitem'))));
    if (newItems) { prepareNav(); hideTip(); }
    // The framework release check appends directly to the shell's brand container, the app's own to `meta`.
    for (const hint of [...brand.querySelectorAll(':scope > .release-hint'), ...meta.querySelectorAll(':scope > .release-hint')]) {
      releaseInner.append(hint);
      if (!release.isConnected) meta.append(release);
    }
  });
  observer.observe(nav, { childList: true, subtree: true });
  observer.observe(brand, { childList: true });
  observer.observe(meta, { childList: true });
  prepareNav();

  const showTip = (event: Event): void => {
    const target = (event.target as Element).closest<HTMLElement>('a.navitem, .companion-mode, .rail-action, .rail-avatar, .companion-sidebar-toggle');
    if (!collapsed || !target || target.hidden) return;
    const label = target.getAttribute('aria-label') || target.title;
    if (!label) return;
    tooltip.textContent = label;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rail.getBoundingClientRect().right + 10}px`;
    tooltip.style.top = `${Math.max(8, Math.min(win.innerHeight - tooltip.offsetHeight - 8, rect.top + (rect.height - tooltip.offsetHeight) / 2))}px`;
  };
  rail.addEventListener('pointerover', showTip, { signal });
  rail.addEventListener('focusin', showTip, { signal });
  rail.addEventListener('pointerout', hideTip, { signal });
  rail.addEventListener('focusout', hideTip, { signal });
  nav.addEventListener('scroll', hideTip, { signal });
  rail.addEventListener('click', hideTip, { signal });
  win.addEventListener('resize', hideTip, { signal });

  doc.body.classList.add('companion-sidebar');
  resize();
  signal.addEventListener('abort', () => {
    observer.disconnect();
    tooltip.remove();
    backdrop.remove();
    if (content) content.inert = false;
    doc.body.classList.remove('companion-sidebar');
  }, { once: true });
  return meta;
}
