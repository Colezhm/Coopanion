import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  httpStatus: (status: number, snippet: string) => `HTTP ${status}: ${snippet}`,
  notJson: (status: number, snippet: string) => `응답이 올바른 JSON이 아닙니다(HTTP ${status}): ${snippet}`,
  noPanel: (page: string, panel: string) => `${page}의 패널 ${panel}을(를) 찾을 수 없습니다`,
  noPathPicker: '설정 창에서는 이 컴퓨터의 경로를 선택할 수 없습니다',
};
