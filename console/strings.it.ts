import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Comprimi barra laterale', expandSidebar: 'Espandi barra laterale',
  toAdvanced: 'Modalità avanzata', toAdvancedHint: 'Mostra tutto Cortico: modelli, estensioni, World, memoria e diagnostica',
  featureLoadFailed: (label: string) => `Impossibile caricare «${label}»`,
  running: 'In esecuzione', paused: 'In pausa',
};
