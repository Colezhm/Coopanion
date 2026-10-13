import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: 'システムプロンプト',
  save: '保存',
  saving: '保存中…',
  saved: '保存しました。次の session から反映されます。',
  dirty: '未保存の変更があります。Ctrl+S で保存',
  saveFailed: (why: string) => `保存できませんでした：${why}`,
  conflict: 'ペルソナは別の場所で変更されました。変更内容をコピーし、このページを開き直してからやり直してください。',
  loadFailed: (why: string) => `ペルソナを読み込めませんでした：${why}`,
  missing: 'このデプロイにはペルソナファイルがありません。',
  leaveUnsaved: 'ペルソナに未保存の変更があります。移動すると失われます。',
};
