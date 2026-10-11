import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Comprimi barra laterale', expandSidebar: 'Espandi barra laterale',
  trace: 'Traccia di esecuzione', model: 'Modello', settings: 'Impostazioni', advanced: 'Avanzate',
  toAdvanced: 'Modalità avanzata', toAdvancedHint: 'Mostra tutto Cortico: modelli, estensioni, World, memoria e diagnostica',
  toNormal: 'Torna alla modalità normale', toNormalHint: "Mostra solo le pagine sull'animaletto",
  featureLoadFailed: (label: string) => `Impossibile caricare «${label}»`,
  running: 'In esecuzione', paused: 'In pausa',
};
