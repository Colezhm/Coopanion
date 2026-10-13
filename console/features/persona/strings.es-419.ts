import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: 'Prompt del sistema',
  save: 'Guardar',
  saving: 'Guardando…',
  saved: 'Guardado; se aplica desde la próxima session.',
  dirty: 'Cambios sin guardar; Ctrl+S guarda',
  saveFailed: (why: string) => `No se guardó: ${why}`,
  conflict: 'La persona se cambió en otro lugar. Copia tus cambios, vuelve a abrir esta página y hazlos de nuevo.',
  loadFailed: (why: string) => `No se pudo leer la persona: ${why}`,
  missing: 'Este despliegue no tiene archivo de persona.',
  leaveUnsaved: 'La persona tiene cambios sin guardar; al salir se pierden.',
};
