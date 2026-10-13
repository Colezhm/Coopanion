import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: '收合側邊欄', expandSidebar: '展開側邊欄',
  toAdvanced: '進階模式', toAdvancedHint: '顯示 Cortico 的全部設定：模型、擴充功能、World、記憶與執行診斷',
  featureLoadFailed: (label: string) => `「${label}」未能載入`,
  running: '執行中', paused: '已暫停',
};
