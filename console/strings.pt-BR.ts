import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Recolher barra lateral', expandSidebar: 'Expandir barra lateral',
  toAdvanced: 'Modo avançado', toAdvancedHint: 'Mostra todo o Cortico: modelos, extensões, Worlds, memória e diagnóstico',
  featureLoadFailed: (label: string) => `Falha ao carregar “${label}”`,
  running: 'Em execução', paused: 'Pausado',
};
