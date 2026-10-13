import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: 'System-Prompt',
  save: 'Speichern',
  saving: 'Wird gespeichert…',
  saved: 'Gespeichert; gilt ab der nächsten Session.',
  dirty: 'Ungespeicherte Änderungen; Strg+S speichert',
  saveFailed: (why: string) => `Nicht gespeichert: ${why}`,
  conflict: 'Die Persona wurde an anderer Stelle geändert. Kopieren Sie Ihre Änderungen, öffnen Sie diese Seite neu und nehmen Sie sie erneut vor.',
  loadFailed: (why: string) => `Die Persona konnte nicht gelesen werden: ${why}`,
  missing: 'Dieses Deployment hat keine Persona-Datei.',
  leaveUnsaved: 'Die Persona hat ungespeicherte Änderungen; beim Verlassen gehen sie verloren.',
};
