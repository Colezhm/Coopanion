/**
 * Preload of the settings window and of the advanced-mode window it opens. Both pages, the settings
 * window's own and Cortico's console, read their language from localStorage
 * (`cortico.console.language`) when they load; here that is the app language, written before each
 * page load. A different value found there was picked on the settings page of Cortico's console,
 * which saves it and reloads: that page loads in it, and the main process makes it the app language.
 */
const { ipcRenderer } = require('electron');

const KEY = 'cortico.console.language';
/** The value this preload last wrote, to tell a pick on Cortico's page from it. */
const WRITTEN = 'coopanion.console.language';

try {
  const app = ipcRenderer.sendSync('settings:language');
  const stored = localStorage.getItem(KEY);
  if (stored !== null && localStorage.getItem(WRITTEN) !== null && stored !== localStorage.getItem(WRITTEN)) ipcRenderer.send('settings:language-picked', stored);
  else localStorage.setItem(KEY, app);
  localStorage.setItem(WRITTEN, localStorage.getItem(KEY));
} catch { /* a page without storage (the starting page) */ }
