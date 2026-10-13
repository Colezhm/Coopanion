import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}：${snippet}`,
  notJson: (status: number, snippet: string) => `回應不是有效的 JSON（HTTP ${status}）：${snippet}`,
  noPanel: (page: string, panel: string) => `找不到 ${page} 的面板 ${panel}`,
  noPathPicker: '設定視窗裡不能選擇本機路徑',
};
