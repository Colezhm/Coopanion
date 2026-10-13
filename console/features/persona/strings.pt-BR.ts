import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: 'Prompt de sistema',
  save: 'Salvar',
  saving: 'Salvando…',
  saved: 'Salvo; vale a partir da próxima session.',
  dirty: 'Alterações não salvas; Ctrl+S salva',
  saveFailed: (why: string) => `Não salvo: ${why}`,
  conflict: 'A persona foi alterada em outro lugar. Copie suas alterações, reabra esta página e faça-as de novo.',
  loadFailed: (why: string) => `Não foi possível ler a persona: ${why}`,
  missing: 'Esta implantação não tem arquivo de persona.',
  leaveUnsaved: 'A persona tem alterações não salvas; sair as descarta.',
};
