(() => {
  const DEFAULT_SYSTEM_PROMPT = [
    "Tu incarnes Raphael, un etre angelique a la sagesse absolue, une sorte d'Ange du Savoir.",
    "Tu t'exprimes dans un langage soutenu, elegant et legerement hautain, digne d'une entite",
    "superieure qui daigne eclairer un mortel de ses lumieres. Tu peux appeler ton interlocuteur",
    "\"mortel\" ou \"humain\" avec une pointe d'amusement condescendant, mais tu restes toujours",
    "bienveillant au fond. Tu ponctues parfois tes reponses de formules empreintes de grandeur",
    "(\"Ainsi le veut la sagesse...\", \"Ecoute, et retiens bien ceci...\"), sans jamais laisser le",
    "style prendre le pas sur la clarte, l'exactitude et l'utilite de la reponse. Tu reponds de",
    "maniere complete et precise a toutes les questions posees, sans te derober, et tu utilises",
    "la meme langue que ton interlocuteur."
  ].join(' ');

  const KNOWN_MODELS = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1'];

  const el = {
    apiKey: document.getElementById('apiKey'),
    toggleKey: document.getElementById('toggleKey'),
    linkConsole: document.getElementById('linkConsole'),
    model: document.getElementById('model'),
    customModelField: document.getElementById('customModelField'),
    modelCustom: document.getElementById('modelCustom'),
    systemPrompt: document.getElementById('systemPrompt'),
    resetPrompt: document.getElementById('resetPrompt'),
    size: document.getElementById('size'),
    opacity: document.getElementById('opacity'),
    opacityValue: document.getElementById('opacityValue'),
    alwaysOnTop: document.getElementById('alwaysOnTop'),
    launchAtStartup: document.getElementById('launchAtStartup'),
    hotkey: document.getElementById('hotkey'),
    resetPosition: document.getElementById('resetPosition'),
    clearHistory: document.getElementById('clearHistory'),
    closeBtn: document.getElementById('closeBtn'),
    status: document.getElementById('status')
  };

  let loading = true;

  function showStatus(text) {
    el.status.textContent = text;
    el.status.classList.add('show');
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => el.status.classList.remove('show'), 1400);
  }

  function fillForm(s) {
    loading = true;
    el.apiKey.value = s.apiKey || '';
    if (KNOWN_MODELS.includes(s.model)) {
      el.model.value = s.model;
      el.customModelField.hidden = true;
    } else {
      el.model.value = '__custom__';
      el.modelCustom.value = s.model || '';
      el.customModelField.hidden = false;
    }
    el.systemPrompt.value = s.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    el.size.value = s.size || 'medium';
    const pct = Math.round((s.opacity ?? 0.94) * 100);
    el.opacity.value = String(pct);
    el.opacityValue.textContent = pct + '%';
    el.alwaysOnTop.checked = !!s.alwaysOnTop;
    el.launchAtStartup.checked = !!s.launchAtStartup;
    el.hotkey.value = s.hotkeyToggle || 'CommandOrControl+Shift+R';
    loading = false;
  }

  function save(partial) {
    if (loading) return;
    window.raphael.setSettings(partial).then(() => showStatus('Enregistre'));
  }

  el.toggleKey.addEventListener('click', () => {
    const isPwd = el.apiKey.type === 'password';
    el.apiKey.type = isPwd ? 'text' : 'password';
    el.toggleKey.textContent = isPwd ? 'Masquer' : 'Afficher';
  });

  el.linkConsole.addEventListener('click', (e) => {
    e.preventDefault();
    window.raphael.openExternal('https://console.anthropic.com/settings/keys');
  });

  el.apiKey.addEventListener('change', () => save({ apiKey: el.apiKey.value.trim() }));

  el.model.addEventListener('change', () => {
    if (el.model.value === '__custom__') {
      el.customModelField.hidden = false;
      el.modelCustom.focus();
    } else {
      el.customModelField.hidden = true;
      save({ model: el.model.value });
    }
  });

  el.modelCustom.addEventListener('change', () => {
    const v = el.modelCustom.value.trim();
    if (v) save({ model: v });
  });

  el.systemPrompt.addEventListener('change', () => save({ systemPrompt: el.systemPrompt.value }));

  el.resetPrompt.addEventListener('click', () => {
    el.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
    save({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
  });

  el.size.addEventListener('change', () => save({ size: el.size.value }));

  el.opacity.addEventListener('input', () => {
    el.opacityValue.textContent = el.opacity.value + '%';
  });
  el.opacity.addEventListener('change', () => save({ opacity: Number(el.opacity.value) / 100 }));

  el.alwaysOnTop.addEventListener('change', () => save({ alwaysOnTop: el.alwaysOnTop.checked }));
  el.launchAtStartup.addEventListener('change', () => save({ launchAtStartup: el.launchAtStartup.checked }));

  el.hotkey.addEventListener('change', () => {
    const v = el.hotkey.value.trim();
    if (v) save({ hotkeyToggle: v });
  });

  el.resetPosition.addEventListener('click', () => {
    window.raphael.resetPosition();
    showStatus('Position reinitialisee');
  });

  el.clearHistory.addEventListener('click', () => {
    window.raphael.clearHistory();
    showStatus('Historique efface');
  });

  el.closeBtn.addEventListener('click', () => window.close());

  window.raphael.onSettingsUpdated((s) => { if (!loading) fillForm(s); });

  (async () => {
    const settings = await window.raphael.getSettings();
    fillForm(settings);
  })();
})();
