import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status} : ${snippet}`,
  notJson: (status: number, snippet: string) => `La réponse n'est pas du JSON valide (HTTP ${status}) : ${snippet}`,
  noPanel: (page: string, panel: string) => `Panneau ${panel} introuvable pour ${page}`,
  noPathPicker: 'La fenêtre des paramètres ne permet pas de choisir un chemin sur cet ordinateur',
};
