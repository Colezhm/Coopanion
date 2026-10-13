/**
 * 「系统提示词」 in the settings window: Coo's persona, the CONSTITUTION document of Cormini's prompt
 * (`constitution` in `/api/prompts`), in one text box saved with its button or Ctrl+S; the save
 * carries the revision it was read at, and Core refuses it (409) when the file changed since.
 * 「清空重开」 clears the `session` storage part (`POST /api/storage/clear?key=session`): Coo drops the
 * conversation and starts again from the current prompt; the workspace, memory and persona stay.
 * The whole prompt, every section of it, is on Cortico's own page in the advanced mode.
 */
import { get, post } from '../../base/api.ts';
import type { Page, PageContext } from '../../base/page.ts';
import { intro } from '../intro.ts';
import { S } from '../strings.ts';
import { P } from './strings.ts';

const DOC_KEY = 'constitution';

interface PromptDoc { key: string; title: string; description?: string; content: string; revision?: string }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: PageContext): Promise<void> {
  const { ui, root, signal } = ctx;
  root.append(intro(ui, P.title));
  const status = ui.msgline('');
  status.classList.add('grow');
  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  };

  let doc: PromptDoc | null = null;
  try {
    doc = (await get<{ prompts?: PromptDoc[] }>('/api/prompts', { signal })).prompts?.find((p) => p.key === DOC_KEY) ?? null;
  } catch (err) {
    if (signal.aborted) return;
    say(P.loadFailed(errText(err)), true);
  }
  if (signal.aborted) return;

  const card = ui.sheet({ title: doc?.title ?? P.title, ...(doc?.description ? { desc: doc.description } : {}) });
  const bar = ui.actions();
  bar.append(status);
  if (doc) {
    const persona = doc;
    const editor = ui.textarea({ cls: 'mono persona-editor' });
    editor.spellcheck = false;
    editor.value = persona.content;
    let saved = persona.content;
    let saving = false;
    const dirty = () => editor.value !== saved;
    const save = async () => {
      if (saving || !dirty()) return;
      saving = true;
      const lock = ui.disable(saveButton);
      const content = editor.value;
      say(P.saving);
      try {
        const out = await post<{ revision?: string }>('/api/prompts', { key: DOC_KEY, content, baseRevision: persona.revision }, { signal });
        saved = content;
        persona.revision = out?.revision;
        say(P.saved);
      } catch (err) {
        if (signal.aborted) return;
        say((err as { status?: number }).status === 409 ? P.conflict : P.saveFailed(errText(err)), true);
      } finally {
        saving = false;
        lock.dispose();
      }
    };
    const saveButton = ui.button(P.save, { variant: 'primary', onClick: () => void save() });
    editor.addEventListener('input', () => say(dirty() ? P.dirty : ''), { signal });
    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    }, { signal });
    ctx.lifecycle.own(ctx.router.addLeaveGuard(() => (dirty() ? P.leaveUnsaved : null)));
    card.body.append(editor);
    bar.append(saveButton);
  } else if (!status.textContent) {
    say(P.missing, true);
  }

  if (ctx.capabilities.storage === true) {
    const clear = ui.button(S.button, {
      variant: 'danger',
      onClick: () => void (async () => {
        if (!await ui.confirm({ title: S.title, body: S.body, danger: true }) || signal.aborted) return;
        const lock = ui.disable(clear);
        say(S.clearing);
        try {
          const out = await post<{ result?: string }>('/api/storage/clear?key=session', undefined, { signal });
          say(out?.result || S.cleared);
        } catch (err) {
          if (!signal.aborted) say(S.failed(errText(err)), true);
        } finally {
          lock.dispose();
        }
      })(),
    });
    bar.insertBefore(clear, bar.children[1] ?? null);
  }
  card.body.append(bar);
  root.append(card.el);
}

export const personaPage: Page = {
  route: 'prompts',
  label: P.title,
  icon: 'text',
  mount,
};
