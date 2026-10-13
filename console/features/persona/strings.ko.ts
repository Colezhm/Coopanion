import type { en } from './strings.ts';

export const P: Partial<typeof en> = {
  title: '시스템 프롬프트',
  save: '저장',
  saving: '저장 중…',
  saved: '저장했습니다. 다음 session부터 적용됩니다.',
  dirty: '저장하지 않은 변경이 있습니다. Ctrl+S로 저장',
  saveFailed: (why: string) => `저장하지 못했습니다: ${why}`,
  conflict: '페르소나가 다른 곳에서 변경되었습니다. 변경 내용을 복사한 뒤 이 페이지를 다시 열고 다시 수정하세요.',
  loadFailed: (why: string) => `페르소나를 읽지 못했습니다: ${why}`,
  missing: '이 배포에는 페르소나 파일이 없습니다.',
  leaveUnsaved: '페르소나에 저장하지 않은 변경이 있습니다. 나가면 사라집니다.',
};
