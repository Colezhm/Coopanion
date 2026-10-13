import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: 'Prompt di sistema',
  save: 'Salva',
  saving: 'Salvataggio…',
  saved: 'Salvato; vale dalla prossima session.',
  dirty: 'Modifiche non salvate; Ctrl+S salva',
  saveFailed: (why: string) => `Non salvato: ${why}`,
  conflict: 'La persona è stata modificata altrove. Copia le tue modifiche, riapri questa pagina e rifalle.',
  loadFailed: (why: string) => `Impossibile leggere la persona: ${why}`,
  missing: 'Questo deployment non ha un file di persona.',
  leaveUnsaved: 'La persona ha modifiche non salvate; uscendo vanno perse.',
};
