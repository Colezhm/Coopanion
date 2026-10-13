import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}: ${snippet}`,
  notJson: (status: number, snippet: string) => `A resposta não é um JSON válido (HTTP ${status}): ${snippet}`,
  noPanel: (page: string, panel: string) => `Painel ${panel} de ${page} não encontrado`,
  noPathPicker: 'A janela de configurações não permite escolher um caminho deste computador',
};
