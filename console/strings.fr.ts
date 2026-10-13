import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Réduire la barre latérale', expandSidebar: 'Développer la barre latérale',
  toAdvanced: 'Mode avancé', toAdvancedHint: 'Afficher tout Cortico : modèles, extensions, World, mémoire et diagnostic',
  featureLoadFailed: (label: string) => `Échec du chargement de « ${label} »`,
  running: 'En marche', paused: 'En pause',
};
