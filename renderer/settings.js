(() => {
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
    status: document.getElementById('status'),
    voiceEnabled: document.getElementById('voiceEnabled'),
    voiceURI: document.getElementById('voiceURI'),
    voiceLang: document.getElementById('voiceLang'),
    voiceRate: document.getElementById('voiceRate'),
    voiceRateValue: document.getElementById('voiceRateValue'),
    voicePitch: document.getElementById('voicePitch'),
    voicePitchValue: document.getElementById('voicePitchValue'),
    voiceVolume: document.getElementById('voiceVolume'),
    voiceVolumeValue: document.getElementById('voiceVolumeValue'),
    testVoice: document.getElementById('testVoice'),
    micDevice: document.getElementById('micDevice'),
    wakeWordEnabled: document.getElementById('wakeWordEnabled')
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

    el.voiceEnabled.checked = s.voiceEnabled !== false;
    el.voiceLang.value = s.voiceLang || 'fr-FR';
    const rate = s.voiceRate ?? 1;
    el.voiceRate.value = String(rate);
    el.voiceRateValue.textContent = rate.toFixed(1) + 'x';
    const pitch = s.voicePitch ?? 1;
    el.voicePitch.value = String(pitch);
    el.voicePitchValue.textContent = pitch.toFixed(1);
    const volPct = Math.round((s.voiceVolume ?? 1) * 100);
    el.voiceVolume.value = String(volPct);
    el.voiceVolumeValue.textContent = volPct + '%';
    pendingVoiceURI = s.voiceURI || '';
    applyPendingVoiceSelection();
    pendingMicDeviceId = s.micDeviceId || '';
    applyPendingMicSelection();
    el.wakeWordEnabled.checked = s.wakeWordEnabled !== false;

    loading = false;
  }

  // ---------- voix disponibles (Web Speech API) ----------
  let pendingVoiceURI = '';

  function applyPendingVoiceSelection() {
    if (el.voiceURI.querySelector(`option[value="${cssEscape(pendingVoiceURI)}"]`)) {
      el.voiceURI.value = pendingVoiceURI;
    }
  }

  function cssEscape(v) {
    return String(v).replace(/["\\]/g, '\\$&');
  }

  function populateVoices() {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    const current = el.voiceURI.value || pendingVoiceURI;
    el.voiceURI.innerHTML = '<option value="">Automatique (selon la langue)</option>';
    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      el.voiceURI.appendChild(opt);
    });
    if (current && el.voiceURI.querySelector(`option[value="${cssEscape(current)}"]`)) {
      el.voiceURI.value = current;
    }
  }

  if (window.speechSynthesis) {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  // ---------- microphones disponibles ----------
  let pendingMicDeviceId = '';

  function applyPendingMicSelection() {
    if (el.micDevice.querySelector(`option[value="${cssEscape(pendingMicDeviceId)}"]`)) {
      el.micDevice.value = pendingMicDeviceId;
    }
  }

  async function populateMicDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let mics = devices.filter((d) => d.kind === 'audioinput');
      // Le nom des peripheriques n'est fourni qu'apres une autorisation d'acces
      // au micro : on la demande une fois, brievement, puis on referme le flux.
      if (mics.length && mics.every((d) => !d.label)) {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          mics = devices.filter((d) => d.kind === 'audioinput');
        } catch (e) { /* permission refusee : on garde les entrees sans nom */ }
      }
      const current = el.micDevice.value || pendingMicDeviceId;
      el.micDevice.innerHTML = '<option value="">Automatique (peripherique par defaut)</option>';
      mics.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Microphone ${i + 1}`;
        el.micDevice.appendChild(opt);
      });
      if (current && el.micDevice.querySelector(`option[value="${cssEscape(current)}"]`)) {
        el.micDevice.value = current;
      }
    } catch (e) { /* pas d'acces aux peripheriques : on garde le select par defaut */ }
  }

  populateMicDevices();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', populateMicDevices);
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

  el.voiceEnabled.addEventListener('change', () => save({ voiceEnabled: el.voiceEnabled.checked }));

  el.voiceURI.addEventListener('change', () => save({ voiceURI: el.voiceURI.value }));

  el.voiceLang.addEventListener('change', () => {
    const v = el.voiceLang.value.trim();
    if (v) save({ voiceLang: v });
  });

  el.voiceRate.addEventListener('input', () => {
    el.voiceRateValue.textContent = Number(el.voiceRate.value).toFixed(1) + 'x';
  });
  el.voiceRate.addEventListener('change', () => save({ voiceRate: Number(el.voiceRate.value) }));

  el.voicePitch.addEventListener('input', () => {
    el.voicePitchValue.textContent = Number(el.voicePitch.value).toFixed(1);
  });
  el.voicePitch.addEventListener('change', () => save({ voicePitch: Number(el.voicePitch.value) }));

  el.voiceVolume.addEventListener('input', () => {
    el.voiceVolumeValue.textContent = el.voiceVolume.value + '%';
  });
  el.voiceVolume.addEventListener('change', () => save({ voiceVolume: Number(el.voiceVolume.value) / 100 }));

  el.micDevice.addEventListener('change', () => save({ micDeviceId: el.micDevice.value }));

  el.wakeWordEnabled.addEventListener('change', () => save({ wakeWordEnabled: el.wakeWordEnabled.checked }));

  el.testVoice.addEventListener('click', () => {
    if (!window.speechSynthesis) {
      showStatus('Synthese vocale indisponible');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      "Voici un apercu de ma voix."
    );
    const voices = window.speechSynthesis.getVoices();
    const chosen = voices.find((v) => v.voiceURI === el.voiceURI.value);
    if (chosen) utter.voice = chosen;
    utter.lang = (chosen && chosen.lang) || el.voiceLang.value || 'fr-FR';
    utter.rate = Number(el.voiceRate.value);
    utter.pitch = Number(el.voicePitch.value);
    utter.volume = Number(el.voiceVolume.value) / 100;
    window.speechSynthesis.speak(utter);
  });

  el.closeBtn.addEventListener('click', () => window.close());

  window.raphael.onSettingsUpdated((s) => { if (!loading) fillForm(s); });

  (async () => {
    const settings = await window.raphael.getSettings();
    fillForm(settings);
  })();
})();
