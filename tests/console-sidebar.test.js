// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSidebar } from '../build/cortico/src/web/client/sidebar.ts';
import { createShell } from '../build/cortico/src/web/client/shell/index.ts';
import { createConsoleUi } from '../build/cortico/src/web/client/ui/index.ts';
import { Router } from '../build/cortico/src/web/client/core/router.ts';
import { L } from '../build/cortico/src/web/client/strings.ts';

class MediaQuery extends EventTarget {
  constructor(media, matches) { super(); this.media = media; this.matches = matches; }
  set(matches) {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

const features = [{ route: 'home', label: 'Home', icon: 'bot', navMode: 'primary' }];
let queries;
let disposals;
let saved;

function mount() {
  const life = new AbortController();
  const memo = {
    get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback,
    set: (key, value) => saved.set(key, value),
  };
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, memo, signal: life.signal });
  const router = new Router({ win: window, onError: (err) => { throw err; } });
  const shell = createShell({ doc: document, ui, router, features });
  document.body.append(shell.el);
  const meta = mountSidebar(shell.el, memo, life.signal);
  const offRoute = router.onChange((route) => shell.setRoute(route));
  const stopRouter = router.start();
  const dispose = () => { life.abort(); offRoute.dispose(); stopRouter.dispose(); shell.dispose(); };
  disposals.push(dispose);
  return { shell, meta, dispose, toggle: shell.el.querySelector('.companion-sidebar-toggle') };
}

beforeEach(() => {
  saved = new Map();
  disposals = [];
  document.body.replaceChildren();
  const content = document.createElement('main');
  content.id = 'kernel-root';
  document.body.append(content);
  history.replaceState(null, '', '/');
  queries = new Map([
    ['(max-width: 1000px)', new MediaQuery('(max-width: 1000px)', false)],
    ['(max-width: 720px)', new MediaQuery('(max-width: 720px)', false)],
  ]);
  vi.stubGlobal('matchMedia', (query) => queries.get(query));
  vi.stubGlobal('fetch', async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
});
afterEach(() => {
  disposals.forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('console sidebar', () => {
  it('retains the C and both eyes while toggling and restores the choice after remount', () => {
    const { shell, toggle, meta, dispose } = mount();
    const eyes = [...shell.el.querySelectorAll('.companion-brand .accent')];
    const c = shell.el.querySelector('.companion-brand-c');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe(L.expandSidebar);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(meta.inert).toBe(true);
    expect([...shell.el.querySelectorAll('.companion-brand .accent')]).toEqual(eyes);
    expect(shell.el.querySelector('.companion-brand-c')).toBe(c);
    expect(eyes).toHaveLength(2);
    dispose();
    const restored = mount();
    expect(restored.toggle.getAttribute('aria-expanded')).toBe('false');
    restored.toggle.click();
    expect(restored.meta.inert).toBe(false);
    expect(restored.toggle.getAttribute('aria-label')).toBe(L.collapseSidebar);
  });

  it('adapts to window width until a person chooses a state', () => {
    const { toggle } = mount();
    queries.get('(max-width: 1000px)').set(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    queries.get('(max-width: 1000px)').set(false);
    queries.get('(max-width: 1000px)').set(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the small-screen overlay on Escape, backdrop and navigation without replacing the desktop choice', () => {
    const { shell, toggle } = mount();
    queries.get('(max-width: 720px)').set(true);
    const backdrop = document.querySelector('.companion-sidebar-backdrop');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(backdrop.hidden).toBe(false);
    expect(document.getElementById('kernel-root').inert).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(backdrop.hidden).toBe(true);
    expect(document.getElementById('kernel-root').inert).toBe(false);
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    backdrop.click();
    expect(backdrop.hidden).toBe(true);
    toggle.click();
    shell.el.querySelector('a.navitem').click();
    expect(backdrop.hidden).toBe(true);
    queries.get('(max-width: 720px)').set(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps late World entries named, focusable and navigable in compact mode', async () => {
    const { shell, toggle } = mount();
    toggle.click();
    shell.setPages([{ id: 'world:example', kind: 'world', label: 'Example World', availability: 'active' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const item = shell.el.querySelector('a[href*="world"]');
    expect(item.querySelector('.navicon')).not.toBeNull();
    expect(item.getAttribute('aria-label')).toBe('Example World');
    item.focus();
    const tooltip = document.querySelector('.companion-sidebar-tooltip');
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toBe('Example World');
    shell.setLamps({ 'world:example': [{ label: 'Connection', state: 'online' }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tooltip.hidden).toBe(false);
    item.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(item.getAttribute('aria-current')).toBe('page');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('releases observers, media listeners and overlays when the shell stops', async () => {
    const { shell, toggle, meta, dispose } = mount();
    const update = document.createElement('a');
    update.className = 'release-hint';
    shell.el.querySelector('.brand').append(update);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(update.closest('.companion-release')?.parentElement).toBe(meta);
    dispose();
    queries.get('(max-width: 1000px)').set(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.companion-sidebar-tooltip')).toBeNull();
    expect(document.querySelector('.companion-sidebar-backdrop')).toBeNull();
  });
});
