import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Свернуть боковую панель', expandSidebar: 'Развернуть боковую панель',
  toAdvanced: 'Расширенный режим', toAdvancedHint: 'Показать всё в Cortico: модели, расширения, World, память и диагностику',
  featureLoadFailed: (label: string) => `Не удалось загрузить «${label}»`,
  running: 'Работает', paused: 'На паузе',
};
