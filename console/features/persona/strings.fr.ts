import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: 'Prompt système',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Enregistré ; appliqué à partir de la prochaine session.',
  dirty: 'Modifications non enregistrées ; Ctrl+S enregistre',
  saveFailed: (why: string) => `Non enregistré : ${why}`,
  conflict: 'Le persona a été modifié ailleurs. Copiez vos modifications, rouvrez cette page et refaites-les.',
  loadFailed: (why: string) => `Impossible de lire le persona : ${why}`,
  missing: "Ce déploiement n'a pas de fichier de persona.",
  leaveUnsaved: 'Le persona a des modifications non enregistrées ; quitter la page les perd.',
};
