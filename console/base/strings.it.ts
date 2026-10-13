import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}: ${snippet}`,
  notJson: (status: number, snippet: string) => `La risposta non è JSON valido (HTTP ${status}): ${snippet}`,
  noPanel: (page: string, panel: string) => `Pannello ${panel} di ${page} non trovato`,
  noPathPicker: 'La finestra delle impostazioni non permette di scegliere un percorso di questo computer',
};
