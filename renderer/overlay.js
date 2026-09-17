(() => {
  const avatar = document.getElementById('avatar');
  const messagesEl = document.getElementById('messages');
  const input = document.getElementById('input');
  const btnSend = document.getElementById('btn-send');
  const btnClose = document.getElementById('btn-close');
  const btnCollapse = document.getElementById('btn-collapse');
  const btnSettings = document.getElementById('btn-settings');
  const btnMic = document.getElementById('btn-mic');
  const btnVoiceToggle = document.getElementById('btn-voice-toggle');
  const mouthEl = document.getElementById('mouth');

  const MOUTH = {
    closed: 'M 214 332 Q 256 340 298 332',
    mid: 'M 216 330 Q 256 348 296 330',
    open: 'M 218 326 Q 256 360 294 326'
  };

  let expanded = false;
  let sending = false;
  let settings = {};
  let recognizing = false;
  let recognition = null;
  let mouthTimer = null;

  // ---------- avatar state machine ----------
  // idle -> listening (mic capturing) -> thinking (awaiting Claude) -> speaking (reading the reply aloud)
  function setState(state) {
    document.body.classList.remove('listening', 'thinking', 'speaking');
    if (state && state !== 'idle') document.body.classList.add(state);
  }

  function startMouthFlap() {
    stopMouthFlap();
    let last = 'closed';
    mouthTimer = setInterval(() => {
      const options = Object.keys(MOUTH).filter((k) => k !== last);
      const pick = options[Math.floor(Math.random() * options.length)];
      last = pick;
      if (mouthEl) mouthEl.setAttribute('d', MOUTH[pick]);
    }, 110);
  }

  function stopMouthFlap() {
    if (mouthTimer) clearInterval(mouthTimer);
    mouthTimer = null;
    if (mouthEl) mouthEl.setAttribute('d', MOUTH.closed);
  }

  // ---------- text-to-speech ----------
  function pickVoice() {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (!voices.length) return null;
    if (settings.voiceURI) {
      const exact = voices.find((v) => v.voiceURI === settings.voiceURI);
      if (exact) return exact;
    }
    const lang = settings.voiceLang || 'fr-FR';
    const langMatch = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    return langMatch || voices[0];
  }

  function speak(text) {
    if (!settings.voiceEnabled || !window.speechSynthesis || !text) return;
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.lang = (voice && voice.lang) || settings.voiceLang || 'fr-FR';
    utter.rate = settings.voiceRate ?? 1;
    utter.pitch = settings.voicePitch ?? 1;
    utter.volume = settings.voiceVolume ?? 1;
    utter.onstart = () => { setState('speaking'); startMouthFlap(); };
    utter.onend = () => { stopMouthFlap(); setState('idle'); };
    utter.onerror = () => { stopMouthFlap(); setState('idle'); };
    window.speechSynthesis.speak(utter);
  }

  function stopSpeaking() {
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
    stopMouthFlap();
  }

  // ---------- speech-to-text ----------
  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btnMic.hidden = true;
      btnMic.title = "Reconnaissance vocale indisponible sur ce systeme.";
      return;
    }
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognizing = true;
      btnMic.classList.add('recording');
      setState('listening');
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      input.value = (finalText || interim).trim();
      autosize();
      if (finalText.trim()) {
        recognition.stop();
        sendMessage();
      }
    };

    recognition.onerror = () => {
      recognizing = false;
      btnMic.classList.remove('recording');
      setState('idle');
    };

    recognition.onend = () => {
      recognizing = false;
      btnMic.classList.remove('recording');
      if (!document.body.classList.contains('thinking') && !document.body.classList.contains('speaking')) {
        setState('idle');
      }
    };
  }

  function toggleRecognition() {
    if (!recognition) return;
    if (recognizing) {
      recognition.stop();
      return;
    }
    stopSpeaking();
    try {
      recognition.lang = settings.voiceLang || 'fr-FR';
      recognition.start();
    } catch (e) { /* already started */ }
  }

  // ---------- settings ----------
  function applySettings(s) {
    settings = s || {};
    document.documentElement.style.setProperty('--panel-alpha', settings.opacity ?? 0.94);
    btnVoiceToggle.classList.toggle('muted', settings.voiceEnabled === false);
  }

  // ---------- chat ----------
  function addMessage(role, text, opts = {}) {
    const el = document.createElement('div');
    el.className = `msg ${role}${opts.pending ? ' pending' : ''}${opts.error ? ' error' : ''}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  async function toggleExpand(force) {
    expanded = typeof force === 'boolean' ? force : !expanded;
    document.body.classList.toggle('expanded', expanded);
    await window.raphael.setExpanded(expanded);
    if (expanded) {
      input.focus();
      if (!messagesEl.childElementCount) {
        addMessage('assistant', "Ainsi le veut la sagesse... pose ta question, et je t'eclairerai.");
      }
    } else {
      stopSpeaking();
    }
  }

  async function sendMessage() {
    if (sending) return;
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    autosize();
    addMessage('user', question);
    sending = true;
    btnSend.disabled = true;
    setState('thinking');
    const pending = addMessage('assistant', 'Il reflechit...', { pending: true });
    try {
      const res = await window.raphael.ask(question);
      if (res && res.error) {
        pending.textContent = res.error;
        pending.classList.remove('pending');
        pending.classList.add('error');
        setState('idle');
      } else {
        const text = (res && res.text) || '(reponse vide)';
        pending.textContent = text;
        pending.classList.remove('pending');
        speak(text);
        if (!settings.voiceEnabled) setState('idle');
      }
    } catch (e) {
      pending.textContent = 'Erreur inattendue : ' + e.message;
      pending.classList.remove('pending');
      pending.classList.add('error');
      setState('idle');
    } finally {
      sending = false;
      btnSend.disabled = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 70) + 'px';
  }

  avatar.addEventListener('click', () => toggleExpand(true));
  btnCollapse.addEventListener('click', () => toggleExpand(false));
  btnClose.addEventListener('click', async () => {
    if (expanded) await toggleExpand(false);
    window.raphael.hide();
  });
  btnSettings.addEventListener('click', () => window.raphael.openSettings());
  btnSend.addEventListener('click', sendMessage);
  btnMic.addEventListener('click', toggleRecognition);
  btnVoiceToggle.addEventListener('click', () => {
    const enabled = settings.voiceEnabled !== false;
    if (enabled) stopSpeaking();
    const merged = { ...settings, voiceEnabled: !enabled };
    applySettings(merged);
    window.raphael.setSettings({ voiceEnabled: !enabled });
  });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  setupRecognition();

  (async () => {
    const s = await window.raphael.getSettings();
    applySettings(s);
    window.raphael.onSettingsUpdated(applySettings);
  })();
})();
