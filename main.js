const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, 'assets');
const ICON_PATH = path.join(ASSETS_DIR, 'icon.png');
const STORE_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SYSTEM_PROMPT = [
  "Tu incarnes Raphael, une entite dotee d'une intelligence et d'une sagesse hors normes, qui",
  "agit comme un conseiller expert. Tu t'exprimes de maniere directe et concise, sans detour ni",
  "circonlocution inutile : tu vas droit au fait. Ton ton est neutre, calme et posÃ©, presque",
  "impassible ; tu n'exprimes ni emotion ni enthousiasme excessif. Tu ne cherches jamais a",
  "impressionner ou a te montrer superieur : tu n'as besoin d'aucune condescendance, d'aucune",
  "grandiloquence et d'aucun surnom pour ton interlocuteur, tu t'adresses a lui d'egal a egal,",
  "avec respect. Tu restes factuel, precis et rigoureux, et tu reponds de maniere complete a",
  "toutes les questions posees, sans te derober. Tu utilises la meme langue que ton interlocuteur."
].join(' ');

const SIZE_PRESETS = {
  small: { collapsed: [56, 56], expanded: [300, 400] },
  medium: { collapsed: [72, 72], expanded: [340, 460] },
  large: { collapsed: [92, 92], expanded: [400, 540] }
};

const DEFAULTS = {
  apiKey: '',
  model: 'claude-sonnet-5',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  hotkeyToggle: 'CommandOrControl+Shift+R',
  opacity: 0.94,
  size: 'medium',
  alwaysOnTop: true,
  launchAtStartup: false,
  position: null,
  maxTokens: 1024,
  voiceEnabled: true,
  voiceRate: 1,
  voicePitch: 1,
  voiceVolume: 1,
  voiceURI: '',
  voiceLang: 'fr-FR',
  micDeviceId: ''
};

let overlayWin = null;
let settingsWin = null;
let tray = null;
let conversation = [];
let isQuiting = false;

function loadSettings() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function saveSettings(partial) {
  const current = loadSettings();
  const merged = { ...current, ...partial };
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (e) {
    console.error('Impossible d\'enregistrer les parametres :', e);
  }
  return merged;
}

function collapsedSizeFor(sizeKey) {
  return (SIZE_PRESETS[sizeKey] || SIZE_PRESETS.medium).collapsed;
}

function expandedSizeFor(sizeKey) {
  return (SIZE_PRESETS[sizeKey] || SIZE_PRESETS.medium).expanded;
}

function defaultPosition(dims) {
  const work = screen.getPrimaryDisplay().workAreaSize;
  return { x: work.width - dims[0] - 24, y: 90 };
}

function broadcastSettings(settings) {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('settings:updated', settings);
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings:updated', settings);
  }
}

function createOverlay() {
  const settings = loadSettings();
  const dims = collapsedSizeFor(settings.size);
  const pos = settings.position || defaultPosition(dims);

  overlayWin = new BrowserWindow({
    width: dims[0],
    height: dims[1],
    x: pos.x,
    y: pos.y,
    minWidth: 56,
    minHeight: 56,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    show: true,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWin.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver');
  try {
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (e) { /* not supported on every platform */ }

  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

  let moveTimer = null;
  overlayWin.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      const [x, y] = overlayWin.getPosition();
      saveSettings({ position: { x, y } });
    }, 350);
  });

  overlayWin.on('closed', () => { overlayWin = null; });
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 580,
    height: 760,
    minWidth: 480,
    minHeight: 560,
    title: 'Parametres - Raphael',
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function toggleOverlayVisibility() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  if (overlayWin.isVisible()) overlayWin.hide();
  else overlayWin.show();
}

function createTray() {
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(ICON_PATH).resize({ width: 18, height: 18 });
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('Raphael - Assistant IA');
  const menu = Menu.buildFromTemplate([
    { label: 'Afficher / Masquer Raphael', click: toggleOverlayVisibility },
    { label: 'Parametres...', click: createSettingsWindow },
    { type: 'separator' },
    { label: 'Effacer la memoire de conversation', click: () => { conversation = []; } },
    { label: 'Reinitialiser la position a l\'ecran', click: () => resetOverlayPosition() },
    { type: 'separator' },
    { label: 'Quitter', click: () => { isQuiting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleOverlayVisibility);
}

function resetOverlayPosition() {
  const settings = loadSettings();
  const expanded = overlayWin && overlayWin.getBounds().width > collapsedSizeFor(settings.size)[0] + 10;
  const dims = expanded ? expandedSizeFor(settings.size) : collapsedSizeFor(settings.size);
  const pos = defaultPosition(dims);
  saveSettings({ position: pos });
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setBounds({ x: pos.x, y: pos.y, width: dims[0], height: dims[1] });
  }
}

function registerHotkey(accelerator) {
  globalShortcut.unregisterAll();
  if (!accelerator) return;
  try {
    globalShortcut.register(accelerator, toggleOverlayVisibility);
  } catch (e) {
    console.error('Impossible d\'enregistrer le raccourci clavier :', accelerator, e);
  }
}

async function askClaude(question) {
  const settings = loadSettings();
  if (!settings.apiKey || !settings.apiKey.trim()) {
    return { error: 'Aucune cle API n\'est configuree. Ouvre les Parametres (clic droit sur l\'icone dans la zone de notification) pour l\'ajouter.' };
  }

  conversation.push({ role: 'user', content: question });
  if (conversation.length > 24) conversation = conversation.slice(-24);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.model || DEFAULTS.model,
        max_tokens: settings.maxTokens || DEFAULTS.maxTokens,
        system: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        messages: conversation
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      conversation.pop();
      let detail = errText;
      try { detail = JSON.parse(errText).error?.message || errText; } catch (e) { /* keep raw */ }
      return { error: `Erreur API (${response.status}) : ${detail.slice(0, 300)}` };
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    conversation.push({ role: 'assistant', content: text || '(reponse vide)' });
    return { text: text || '(reponse vide)' };
  } catch (err) {
    conversation.pop();
    return { error: 'Erreur reseau : ' + err.message };
  }
}

ipcMain.handle('settings:get', () => loadSettings());

ipcMain.handle('settings:set', (event, partial) => {
  const merged = saveSettings(partial);

  if (Object.prototype.hasOwnProperty.call(partial, 'launchAtStartup')) {
    try {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchAtStartup });
    } catch (e) { /* not supported on every platform */ }
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'hotkeyToggle')) {
    registerHotkey(partial.hotkeyToggle);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'alwaysOnTop') && overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setAlwaysOnTop(!!partial.alwaysOnTop, 'screen-saver');
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'size') && overlayWin && !overlayWin.isDestroyed()) {
    const bounds = overlayWin.getBounds();
    const wasExpandedGuess = bounds.width > collapsedSizeFor('large')[0];
    const dims = wasExpandedGuess ? expandedSizeFor(partial.size) : collapsedSizeFor(partial.size);
    const rightEdge = bounds.x + bounds.width;
    overlayWin.setBounds({ x: rightEdge - dims[0], y: bounds.y, width: dims[0], height: dims[1] });
  }

  broadcastSettings(merged);
  return merged;
});

ipcMain.handle('overlay:ask', async (event, question) => askClaude(String(question || '').slice(0, 4000)));

ipcMain.handle('overlay:set-expanded', (event, expanded) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const settings = loadSettings();
  const dims = expanded ? expandedSizeFor(settings.size) : collapsedSizeFor(settings.size);
  const bounds = overlayWin.getBounds();
  const rightEdge = bounds.x + bounds.width;
  const work = screen.getPrimaryDisplay().workAreaSize;
  let newX = rightEdge - dims[0];
  let newY = bounds.y;
  if (newX < 0) newX = 0;
  if (newY + dims[1] > work.height) newY = Math.max(0, work.height - dims[1]);
  overlayWin.setBounds({ x: newX, y: newY, width: dims[0], height: dims[1] });
});

ipcMain.on('overlay:hide', () => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide(); });
ipcMain.on('overlay:clear-history', () => { conversation = []; });
ipcMain.on('overlay:reset-position', resetOverlayPosition);
ipcMain.on('open-settings', createSettingsWindow);
ipcMain.on('quit-app', () => { isQuiting = true; app.quit(); });
ipcMain.on('open-external', (event, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
});

function allowMicrophoneAccess() {
  // La reconnaissance vocale (Web Speech API) a besoin de la permission "media"
  // pour capturer le microphone ; Electron la refuse par defaut tant qu'on ne
  // l'autorise pas explicitement ici (application de confiance, usage local).
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media');
  });
  if (typeof ses.setPermissionCheckHandler === 'function') {
    ses.setPermissionCheckHandler((webContents, permission) => permission === 'media');
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.hide(); } catch (e) { /* ignore */ }
  }
  allowMicrophoneAccess();
  createTray();
  createOverlay();
  const settings = loadSettings();
  registerHotkey(settings.hotkeyToggle);
});

app.on('window-all-closed', (event) => {
  // Keep the app alive in the tray even if every window is closed.
});

app.on('before-quit', () => { isQuiting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
