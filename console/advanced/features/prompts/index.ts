/** Each section edits its source template; previews and generated sections come from Core. */
import { fetchManifest, get, post } from '../../../base/api.ts';
import { pageIntro } from '../../../base/ui/page.ts';
import { estTok } from '../live/context.ts';
import { requestMode } from '../../../features/mode.ts';
import { S as sessionText } from '../../../features/strings.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { createPrefixEditor, references, VARIABLE_DRAG_TYPE } from './editor.ts';
import { S } from './strings.ts';
import type { PromptDoc, PromptVar } from './view.ts';

interface PrefixSegment { title: string; text: string; sourceKey?: string }
interface Section {
  segment: PrefixSegment;
  label: HTMLElement;
  toggle: HTMLButtonElement;
  cell: HTMLElement;
  note: HTMLElement;
  badge: HTMLElement;
  divider: HTMLElement;
  collapsed: boolean;
  updateVariables(): void;
}
const colWidth = { flags: 158, rail: 190 };

function description(segment: PrefixSegment, doc?: PromptDoc): { title: string; detail: string } {
  switch (segment.sourceKey ?? segment.title) {
    case 'constitution': return { title: S.constitutionTitle, detail: S.constitutionDesc };
    case 'orientation': return { title: S.orientationTitle, detail: S.orientationDesc };
    case 'WORKSPACE': return { title: S.workspaceTitle, detail: S.workspaceDesc };
    case 'MEMORY': case 'memoryNote': return { title: S.memoryTitle, detail: doc?.description || S.memoryDesc };
    case 'PARTNER': return { title: S.partnerTitle, detail: doc?.description || S.partnerDesc };
    default: return { title: doc?.title || segment.title, detail: doc?.description || S.generatedDesc };
  }
}

export async function mountPrompts(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const docs = new Map<string, PromptDoc>();
  const dirty = new Map<string, string>();
  const sections: Section[] = [];
  let segments: PrefixSegment[] = [];
  let pendingApply = false;
  let savePromise: Promise<boolean> | null = null;
  const toolbar = ui.h('div', 'prompt-toolbar');
  const actions = ui.h('div', 'prompt-actions');
  const status = ui.msgline('');
  status.setAttribute('role', 'status');
  const stage = ui.h('div', 'prefix-stage');
  const flags = ui.h('div', 'prefix-flags');
  const host = ui.h('div', 'prefix-host');
  const rail = ui.h('div', 'prefix-rail');
  const gripL = ui.h('div', 'prefix-grip');
  const gripR = ui.h('div', 'prefix-grip');
  const dividers = ui.h('div', 'prefix-dividers');
  stage.append(flags, gripL, host, gripR, rail, dividers);
  const intro = pageIntro(ui, S.title, S.introDesc);
  root.append(intro, toolbar, stage);

  function say(text: string, bad = false): void {
    status.className = bad ? 'msgline bad prompt-status' : 'msgline prompt-status';
    status.textContent = text;
  }
  function state(): void {
    save.disabled = dirty.size === 0 || !!savePromise;
    restore.disabled = dirty.size === 0 || !!savePromise;
    say(dirty.size ? S.dirtyCount(dirty.size) : pendingApply ? S.pendingApply : S.prefixStats(segments.length, estTok(segments.map((s) => s.text).join('')).toLocaleString()));
    for (const section of sections) {
      const changed = section.segment.sourceKey && dirty.has(section.segment.sourceKey);
      section.badge.textContent = changed ? S.unsaved : docs.has(section.segment.sourceKey!) ? S.editableTemplate : S.generated;
      section.badge.classList.toggle('is-dirty', !!changed);
    }
  }
  function open(section: Section, expanded: boolean): void {
    editor.setCollapsed(sections.indexOf(section), !expanded);
  }
  const expand = ui.button(S.expandAll, { size: 'sm', onClick: () => {
    const expanded = sections.some((s) => s.collapsed);
    for (const section of sections) open(section, expanded);
  } });
  const undoStep = ui.button(S.undo, { size: 'sm', onClick: () => editor.undo() });
  undoStep.title = 'Ctrl / ⌘ + Z';
  undoStep.disabled = true;
  const restore = ui.button(S.undoAll, { size: 'sm', onClick: () => {
    closePopup();
    editor.restore(new Map([...dirty.keys()].map((key) => [key, docs.get(key)!.content])));
  } });
  restore.title = S.undoAllHint;
  restore.disabled = true;
  const save = ui.button(S.saveToFile, { size: 'sm', onClick: () => { void saveAll(); } });
  save.title = 'Ctrl / ⌘ + S';
  expand.classList.add('prompt-expand-all');
  flags.append(expand);
  actions.append(undoStep, restore, save);
  toolbar.append(status, actions);

  async function refreshGenerated(): Promise<void> {
    try {
      const data = await get<{ segments: PrefixSegment[] }>('/api/prompts/prefix', { signal });
      if (signal.aborted) return;
      segments = data.segments;

      for (const section of sections) {
        if (docs.has(section.segment.sourceKey!)) continue;
        const current = segments.find((s) => s.title === section.segment.title);
        if (current) editor.updateGenerated(sections.indexOf(section), current.text);
      }
    } catch (error) {
      if (!signal.aborted) say(S.loadFailed(String(error)), true);
    }
  }
  async function persist(): Promise<boolean> {
    const batch = [...dirty];
    for (const [key, content] of batch) {
      const doc = docs.get(key)!;
      try {
        const out = await post<{ revision: string }>('/api/prompts', { key, content, baseRevision: doc.revision }, { signal });
        doc.content = content;
        doc.revision = out.revision;
        const current = editor.text(key);
        if (current === content) dirty.delete(key); else dirty.set(key, current);
        pendingApply = true;
      } catch (error) {
        if (!signal.aborted) say(S.saveFailedFor(doc.title, String(error)), true);
        return false;
      }
    }
    if (signal.aborted) return false;
    state();
    return dirty.size === 0;
  }
  function saveAll(): Promise<boolean> {
    if (savePromise) return savePromise;
    if (!dirty.size) return Promise.resolve(true);
    say(S.saving);
    editor.setSaveState('saving');
    save.disabled = restore.disabled = true;
    savePromise = persist().finally(() => {
      savePromise = null;
      save.disabled = restore.disabled = !dirty.size;
      editor.setSaveState(dirty.size ? 'dirty' : 'saved');
    });
    return savePromise;
  }
  if (ctx.capabilities.storage) {
    const restart = ui.button(sessionText.button, { size: 'sm', variant: 'danger', onClick: () => { void runSession(restart, true); } });
    restart.title = sessionText.body;
    actions.append(restart);
  }
  if (ctx.capabilities.sessionControl) {
    const apply = ui.button(S.reloadSession, { size: 'sm', variant: 'primary', onClick: () => { void runSession(apply, false); } });
    apply.title = S.applyHint;
    actions.append(apply);
  }
  let changingSession = false;
  async function runSession(button: HTMLButtonElement, restart: boolean): Promise<void> {
    if (changingSession) return;
    changingSession = true;
    const lock = ui.disable(...actions.querySelectorAll<HTMLButtonElement>('button'));
    try {
      if (restart && !await ui.confirm({ title: sessionText.title, body: sessionText.body, danger: true })) return;
      if (signal.aborted || !await saveAll()) return;
      say(restart ? sessionText.clearing : S.reloading);
      await post(restart ? '/api/storage/clear?key=session' : '/api/session/reload-prefix', undefined, { signal });
      pendingApply = false;
      state();
      say(restart ? sessionText.cleared : S.prefixReloaded);
      await refreshGenerated();
    } catch (error) {
      if (!signal.aborted) say(String(error), true);
    } finally {
      changingSession = false;
      lock.dispose();
      save.disabled = restore.disabled = !dirty.size;
      if (button.isConnected) button.focus({ preventScroll: true });
    }
  }
  ctx.lifecycle.own(ctx.router.addLeaveGuard(() => dirty.size || savePromise ? S.leaveUnsaved : null));
  window.addEventListener('beforeunload', (event) => {
    if (dirty.size || savePromise) event.preventDefault();
  }, { signal });
  root.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); void saveAll(); }
    else if (!(event.target as Element).closest('.cm-editor')) {
      if (key === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); }
      if (key === 'y') { event.preventDefault(); editor.redo(); }
    }
  }, { signal });

  let geometryFrame = 0;
  const editor = createPrefixEditor({
    parent: host,
    onChange(changes) {
      for (const { sourceKey, text } of changes) {
        const doc = docs.get(sourceKey)!;
        if (text === doc.content) dirty.delete(sourceKey); else dirty.set(sourceKey, text);
      }
      state();
      for (const section of sections) section.updateVariables();
      queueMicrotask(() => {
        if (!signal.aborted) editor.setSaveState(savePromise ? 'saving' : dirty.size ? 'dirty' : 'idle');
      });
    },
    onSave: () => { void saveAll(); },
    onHistory: () => { undoStep.disabled = !editor.canUndo(); },
    onGeometry: scheduleGeometry,
    onFold(index, collapsed) {
      const section = sections[index];
      section.collapsed = collapsed;
      section.toggle.setAttribute('aria-expanded', String(!collapsed));
      section.cell.hidden = collapsed;
      closePopup();
      expand.textContent = sections.every((s) => !s.collapsed) ? S.collapseAll : S.expandAll;
      scheduleGeometry();
    },
  });
  ctx.lifecycle.own(editor);
  function scheduleGeometry(): void {
    if (!geometryFrame) geometryFrame = requestAnimationFrame(() => { geometryFrame = 0; positionSides(); });
  }
  function positionSides(): void {
    root.style.setProperty('--prompt-rail-top', `${intro.offsetHeight + 12}px`);
    const geometry = editor.blockGeometry();
    const offset = editor.contentTop() - stage.getBoundingClientRect().top;
    const spacing = geometry.map((g, index) => {
      const section = sections[index];
      const top = `${g.top + offset}px`;
      section.label.style.top = top;
      section.cell.style.top = top;
      section.cell.style.height = `${g.height}px`;
      section.divider.style.top = top;
      section.divider.style.left = `${flags.offsetWidth}px`;
      const minHeight = Math.ceil(Math.max(50, section.note.offsetHeight + 12));
      return { minHeight, padding: g.collapsed ? 0 : Math.max(0, Math.ceil(minHeight - (g.height - g.padding))) };
    });
    flags.style.height = rail.style.height = `${host.offsetHeight}px`;
    editor.setSpacing(spacing);
  }
  function applyWidths(): void {
    flags.style.flexBasis = `${colWidth.flags}px`;
    rail.style.flexBasis = `${colWidth.rail}px`;
    scheduleGeometry();
  }
  function bindGrip(grip: HTMLElement, side: 'flags' | 'rail'): void {
    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const start = colWidth[side];
      const move = (e: PointerEvent) => {
        colWidth[side] = Math.max(100, Math.min(300, start + (e.clientX - startX) * (side === 'flags' ? 1 : -1)));
        applyWidths();
      };
      const end = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('lostpointercapture', end);
      };
      grip.addEventListener('pointermove', move, { signal });
      grip.addEventListener('lostpointercapture', end, { signal });
    }, { signal });
  }
  bindGrip(gripL, 'flags');
  bindGrip(gripR, 'rail');
  applyWidths();
  const observer = new ResizeObserver(scheduleGeometry);
  observer.observe(stage);
  observer.observe(intro);
  observer.observe(flags);
  observer.observe(rail);
  ctx.lifecycle.own({ dispose() { observer.disconnect(); cancelAnimationFrame(geometryFrame); } });

  let popup: HTMLElement | null = null;
  let popupChip: HTMLElement | null = null;
  function closePopup(): void {
    popup?.remove(); popup = null;
    popupChip?.setAttribute('aria-expanded', 'false'); popupChip = null;
  }
  document.addEventListener('click', (event) => {
    if (!popup?.contains(event.target as Node) && !popupChip?.contains(event.target as Node)) closePopup();
  }, { signal });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePopup(); }, { signal });
  document.addEventListener('scroll', (event) => {
    if (popup && !popup.contains(event.target as Node)) closePopup();
  }, { signal, capture: true, passive: true });
  ctx.lifecycle.own({ dispose: closePopup });

  function varPopup(v: PromptVar): HTMLElement {
    const pop = ui.h('div', 'varpop');
    pop.appendChild(ui.h('div', 'varpop-name mono', `{{${v.name}}}`));
    pop.appendChild(ui.h('div', 'varpop-desc', v.description));
    pop.appendChild(ui.h('div', 'varpop-label', v.multiline ? S.fillNowMultiline : S.fillNow));
    const val = ui.h('pre', 'mono varpop-value');
    val.textContent = v.value === undefined ? S.varUnreported : v.value === '' ? S.varEmpty : v.value;
    pop.appendChild(val);
    return pop;
  }

  function addSection(segment: PrefixSegment): void {
    const doc = segment.sourceKey ? docs.get(segment.sourceKey) : undefined;
    const info = description(segment, doc);
    const tone = segment.sourceKey?.startsWith('worlds.') ? 'world' : doc ? 'persona' : 'derived';
    const label = ui.h('div', `prefix-label tone-${tone}`);
    label.dataset.source = segment.sourceKey || segment.title;
    const toggle = ui.button('', { onClick: () => open(section, section.collapsed) });
    toggle.className = 'prefix-flag';
    toggle.setAttribute('aria-expanded', String(segment.sourceKey === 'constitution'));
    const title = ui.h('span', 'prefix-flag-title', info.title);
    const key = segment.sourceKey?.startsWith('worlds.') ? 'WORLD' : segment.title;
    const meta = ui.h('span', 'prefix-flag-meta');
    const badge = ui.h('span', 'prompt-section-badge');
    meta.append(ui.h('span', 'prefix-flag-key mono', key), badge);
    toggle.append(title, meta);
    toggle.title = doc?.origin === 'deployment' ? S.loadedFromDeployment : doc?.origin === 'package' ? S.loadedFromPackage : doc?.origin === 'module' ? S.loadedFromWorld : doc ? S.loadedFromSource : S.generated;
    label.append(toggle);
    const cell = ui.h('div', `prefix-railcell tone-${tone}`);
    const note = ui.h('div', 'prefix-railcontent');
    cell.append(note);
    cell.hidden = segment.sourceKey !== 'constitution';
    const divider = ui.h('div', `prefix-divider tone-${tone}`);
    flags.append(label);
    rail.append(cell);
    dividers.append(divider);
    observer.observe(label);
    observer.observe(note);
    const section: Section = { segment, label, toggle, cell, note, badge, divider, collapsed: segment.sourceKey !== 'constitution', updateVariables() {} };
    sections.push(section);
    if (!doc) return;
    const chips = new Map<string, HTMLButtonElement>();
    const warning = ui.h('div', 'prompt-railwarn');
    if (doc.vars?.length) {
      note.append(ui.h('div', 'prompt-rail-heading', S.variablesTitle), ui.h('p', 'prompt-help', S.insertHint));
      let previewing = false;
      const preview = ui.button(S.previewVariables, { size: 'sm', onClick: () => {
        closePopup();
        previewing = !previewing;
        editor.setPreview(doc.key, previewing);
        preview.textContent = previewing ? S.showVariableNames : S.previewVariables;
        preview.setAttribute('aria-pressed', String(previewing));
        if (previewing) void refreshVariables(doc.key);
      } });
      preview.classList.add('prompt-preview-toggle');
      preview.setAttribute('aria-pressed', 'false');
      const list = ui.h('div', 'prompt-variable-list');
      note.append(list, preview);
      for (const variable of doc.vars) {
        let insertPosition = 0;
        const chip = ui.button(variable.name, { size: 'sm', onClick: () => {
          if (popupChip === chip) { closePopup(); return; }
          closePopup();
          const current = doc.vars!.find((v) => v.name === variable.name)!;
          popup = varPopup(current);
          root.ownerDocument.body.append(popup);
          popupChip = chip;
          chip.setAttribute('aria-expanded', 'true');
          const rect = chip.getBoundingClientRect();
          popup.style.left = `${Math.max(8, rect.left - popup.offsetWidth - 10)}px`;
          popup.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - popup.offsetHeight - 8))}px`;
        } });
        chip.className += ' varchip mono';
        chip.draggable = true;
        chip.setAttribute('aria-expanded', 'false');
        chip.addEventListener('mousedown', (event) => { if (event.detail === 1) insertPosition = editor.view.state.selection.main.head; }, { signal });
        chip.addEventListener('dblclick', () => { closePopup(); editor.insert(doc.key, variable.name, insertPosition); }, { signal });
        chip.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); closePopup(); editor.insert(doc.key, variable.name); }
        }, { signal });
        chip.addEventListener('dragstart', (event) => {
          closePopup();
          event.dataTransfer!.setData(VARIABLE_DRAG_TYPE, JSON.stringify({ key: doc.key, name: variable.name }));
          event.dataTransfer!.effectAllowed = 'copy';
        }, { signal });
        chips.set(variable.name, chip);
        list.append(chip);
      }
    }
    note.append(warning);
    section.updateVariables = () => {
      const used = new Set(references(editor.text(doc.key)).map((r) => r.name));
      for (const [name, chip] of chips) chip.classList.toggle('varchip-unused', !used.has(name));
      const unknown = [...used].filter((name) => !doc.vars?.some((v) => v.name === name));
      warning.textContent = unknown.length ? S.warnUnknownVars(unknown.join(S.listSep)) : '';
    };
  }

  async function addSettings(): Promise<void> {
    try {
      const manifest = await fetchManifest();
      if (signal.aborted) return;
      for (const section of sections) {
        const page = manifest.providers.find((p) => p.kind === 'world' && p.prompts?.some((p) => p.key === section.segment.sourceKey));
        if (!page) continue;
        section.toggle.querySelector('.prefix-flag-title')!.textContent = page.label;
        if (!page.configGroups?.length) continue;
        const settings = ui.button(S.worldSettings, { size: 'sm', variant: 'primary', onClick: () => {
          requestMode('advanced');
          ctx.router.navigate(['provider', page.id, '~config']);
        } });
        settings.classList.add('prompt-settings-link');
        section.note.insertBefore(settings, section.note.querySelector('.prompt-railwarn'));
        scheduleGeometry();
      }
    } catch (error) { if (!signal.aborted) ctx.onError(error); }
  }
  async function refreshVariables(key: string): Promise<void> {
    try {
      const data = await get<{ prompts: PromptDoc[] }>('/api/prompts', { signal });
      if (signal.aborted) return;
      let changed = false;
      for (const doc of data.prompts) {
        const existing = docs.get(doc.key);
        if (existing && doc.key === key) {
          changed ||= JSON.stringify(existing.vars) !== JSON.stringify(doc.vars);
          existing.vars = doc.vars;
          editor.updateVariables(doc.key, doc.vars ?? []);
        }
      }
      for (const section of sections) section.updateVariables();
      pendingApply ||= changed;
      state();
    } catch (error) { if (!signal.aborted) say(S.loadFailed(String(error)), true); }
  }
  try {
    const [sources, prefix] = await Promise.all([
      get<{ prompts: PromptDoc[] }>('/api/prompts', { signal }),
      get<{ segments: PrefixSegment[] }>('/api/prompts/prefix', { signal }),
    ]);
    if (signal.aborted) return;
    for (const doc of sources.prompts) docs.set(doc.key, doc);
    segments = prefix.segments;

    segments.forEach(addSection);
    for (const doc of docs.values()) doc.content = editor.view.state.toText(doc.content).toString();
    editor.setBlocks(segments.map((segment) => {
      const doc = docs.get(segment.sourceKey!);
      return { title: segment.title, description: description(segment, doc).detail, sourceKey: doc?.key, tone: doc ? doc.key.startsWith('worlds.') ? 'world' : 'persona' : 'derived', text: doc?.content ?? segment.text, vars: doc?.vars };
    }));
    for (const section of sections) section.updateVariables();
    state();
    if (!segments.length) say(S.prefixEmpty);
    void addSettings();
  } catch (error) { if (!signal.aborted) say(S.loadFailed(String(error)), true); }
}

export const promptsFeature: FrameworkFeature = {
  route: 'prompts', label: S.title, icon: 'text', navMode: 'primary', needsAny: ['prompts'], mount: mountPrompts,
};
