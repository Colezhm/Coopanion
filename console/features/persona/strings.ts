import { pick } from '../../base/language.ts';
import { P as zhHant } from './strings.zh-Hant.ts';
import { P as ja } from './strings.ja.ts';
import { P as ko } from './strings.ko.ts';
import { P as fr } from './strings.fr.ts';
import { P as de } from './strings.de.ts';
import { P as es419 } from './strings.es-419.ts';
import { P as ptBR } from './strings.pt-BR.ts';
import { P as it } from './strings.it.ts';
import { P as ru } from './strings.ru.ts';

const zh = {
  title: '系统提示词',
  save: '保存',
  saving: '正在保存…',
  saved: '已保存，从下一个 session 起生效。',
  dirty: '有未保存的修改，Ctrl+S 保存',
  saveFailed: (why: string) => `保存失败：${why}`,
  conflict: '人设在别处改过了。复制下你的修改，重新打开这一页再改。',
  loadFailed: (why: string) => `读取人设失败：${why}`,
  missing: '这个部署没有人设文件。',
  leaveUnsaved: '人设有未保存的修改，离开会丢掉它们。',
};

export const en: typeof zh = {
  title: 'System prompt',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved; it applies from the next session.',
  dirty: 'Unsaved changes; Ctrl+S saves',
  saveFailed: (why: string) => `Not saved: ${why}`,
  conflict: 'The persona was changed elsewhere. Copy your changes, reopen this page and make them again.',
  loadFailed: (why: string) => `Could not read the persona: ${why}`,
  missing: 'This deployment has no persona file.',
  leaveUnsaved: 'The persona has unsaved changes; leaving drops them.',
};

export const P = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
