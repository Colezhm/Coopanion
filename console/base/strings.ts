import { pick } from './language.ts';
import { S as zhHant } from './strings.zh-Hant.ts';
import { S as ja } from './strings.ja.ts';
import { S as ko } from './strings.ko.ts';
import { S as fr } from './strings.fr.ts';
import { S as de } from './strings.de.ts';
import { S as es419 } from './strings.es-419.ts';
import { S as ptBR } from './strings.pt-BR.ts';
import { S as it } from './strings.it.ts';
import { S as ru } from './strings.ru.ts';

const zh = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}：${snippet}`,
  notJson: (status: number, snippet: string) => `响应不是合法 JSON（HTTP ${status}）：${snippet}`,
  noPanel: (page: string, panel: string) => `找不到 ${page} 的面板 ${panel}`,
  noPathPicker: '设置窗口里不能选择本机路径',
};
export const en: typeof zh = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}: ${snippet}`,
  notJson: (status: number, snippet: string) => `Response is not valid JSON (HTTP ${status}): ${snippet}`,
  noPanel: (page: string, panel: string) => `No panel ${panel} on ${page}`,
  noPathPicker: 'The settings window cannot pick a path on this computer',
};
export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
