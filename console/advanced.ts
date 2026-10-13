/**
 * 高级模式 is Cortico's own console, served by Core at `/`, in a window of its own (named, so a second
 * open reuses it). `route` is a hash route of that console, such as `#/providers`.
 */
export function openAdvanced(route = ''): void {
  window.open(`/${route}`, 'cortico-advanced');
}
