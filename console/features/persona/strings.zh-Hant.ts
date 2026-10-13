import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: '系統提示詞',
  save: '儲存',
  saving: '正在儲存…',
  saved: '已儲存，從下一個 session 起生效。',
  dirty: '有未儲存的修改，Ctrl+S 儲存',
  saveFailed: (why: string) => `儲存失敗：${why}`,
  conflict: '人設在別處改過了。複製下你的修改，重新打開這一頁再改。',
  loadFailed: (why: string) => `讀取人設失敗：${why}`,
  missing: '這個部署沒有人設檔案。',
  leaveUnsaved: '人設有未儲存的修改，離開會丟掉它們。',
};
