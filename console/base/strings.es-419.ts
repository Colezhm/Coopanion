import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}: ${snippet}`,
  notJson: (status: number, snippet: string) => `La respuesta no es JSON válido (HTTP ${status}): ${snippet}`,
  noPanel: (page: string, panel: string) => `No se encontró el panel ${panel} de ${page}`,
  noPathPicker: 'La ventana de configuración no permite elegir una ruta de esta computadora',
};
