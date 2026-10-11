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
  const tools = doc.createElement('div');
  tools.className = 'companion-sidebar-tools';
  const meta = doc.createElement('div');
  meta.className = 'companion-brand-meta';
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'companion-sidebar-toggle';
  toggle.setAttribute('aria-controls', nav.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="companion-sidebar-chevron" d="m16 9-3 3 3 3"/></svg>';
  tools.append(toggle, meta);
  brand.replaceChildren(sidebarBrand(doc), tools);

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

  const render = (next: boolean): void => {
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
    render(!collapsed);
  }, { signal });
  const close = (): void => { render(true); toggle.focus(); };
  backdrop.addEventListener('click', close, { signal });
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    hideTip();
    if (narrow.matches && !collapsed) close();
  }, { signal });
  nav.addEventListener('click', (event) => {
    if (narrow.matches && (event.target as Element).closest('a.navitem')) render(true);
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
    // The framework release check appends directly to the shell's brand container.
    for (const hint of brand.querySelectorAll(':scope > .release-hint')) meta.append(hint);
  });
  observer.observe(nav, { childList: true, subtree: true });
  observer.observe(brand, { childList: true });
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
