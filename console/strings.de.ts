import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Seitenleiste einklappen', expandSidebar: 'Seitenleiste ausklappen',
  toAdvanced: 'Erweiterter Modus', toAdvancedHint: 'Ganz Cortico zeigen: Modelle, Erweiterungen, Worlds, Gedächtnis und Diagnose',
  featureLoadFailed: (label: string) => `„${label}“ konnte nicht geladen werden`,
  running: 'Läuft', paused: 'Pausiert',
};
