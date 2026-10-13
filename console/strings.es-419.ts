import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Contraer barra lateral', expandSidebar: 'Expandir barra lateral',
  toAdvanced: 'Modo avanzado', toAdvancedHint: 'Muestra todo Cortico: modelos, extensiones, Worlds, memoria y diagnóstico',
  featureLoadFailed: (label: string) => `No se pudo cargar “${label}”`,
  running: 'En marcha', paused: 'En pausa',
};
