import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}: ${snippet}`,
  notJson: (status: number, snippet: string) => `Ответ не является корректным JSON (HTTP ${status}): ${snippet}`,
  noPanel: (page: string, panel: string) => `Панель ${panel} страницы ${page} не найдена`,
  noPathPicker: 'В окне настроек нельзя выбрать путь на этом компьютере',
};
