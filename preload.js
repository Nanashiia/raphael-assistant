const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('raphael', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  ask: (question) => ipcRenderer.invoke('overlay:ask', question),
  setExpanded: (expanded) => ipcRenderer.invoke('overlay:set-expanded', expanded),
  hide: () => ipcRenderer.send('overlay:hide'),
  clearHistory: () => ipcRenderer.send('overlay:clear-history'),
  resetPosition: () => ipcRenderer.send('overlay:reset-position'),
  openSettings: () => ipcRenderer.send('open-settings'),
  quit: () => ipcRenderer.send('quit-app'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  ttsListVoices: () => ipcRenderer.invoke('tts:list-voices'),
  ttsSpeak: (text) => ipcRenderer.invoke('tts:speak', text),
  onSettingsUpdated: (callback) => {
    const listener = (event, settings) => callback(settings);
    ipcRenderer.on('settings:updated', listener);
    return () => ipcRenderer.removeListener('settings:updated', listener);
  }
});
