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
  const icoObject = document.getElementById('ico-object');
  const icoPulse = document.getElementById('ico-pulse');

  let expanded = false;
  let sending = false;
  let settings = {};
  let recognizing = false;
  let recognition = null;

  // ---------- 3D icosahedron (thin wireframe, matrix3d-positioned edges) ----------
  const PHI = (1 + Math.sqrt(5)) / 2;

  function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  function buildIcosahedron(R) {
    const raw = [];
    for (const s1 of [1, -1]) {
      for (const s2 of [1, -1]) {
        raw.push([0, s1 * 1, s2 * PHI]);
        raw.push([s1 * 1, s2 * PHI, 0]);
        raw.push([s2 * PHI, 0, s1 * 1]);
      }
    }
    const seen = new Set();
    const verts = [];
    for (const v of raw) {
      const key = v.map((c) => c.toFixed(6)).join(',');
      if (!seen.has(key)) { seen.add(key); verts.push(v); }
    }
    const norm = Math.sqrt(1 + PHI * PHI);
    const scaled = verts.map((v) => [(v[0] / norm) * R, (v[1] / norm) * R, (v[2] / norm) * R]);
    const dists = [];
    for (let i = 0; i < scaled.length; i++) {
      for (let j = i + 1; j < scaled.length; j++) dists.push(dist3(scaled[i], scaled[j]));
    }
    dists.sort((a, b) => a - b);
    const edgeLen = dists[0];
    const edges = [];
    for (let i = 0; i < scaled.length; i++) {
      for (let j = i + 1; j < scaled.length; j++) {
        if (Math.abs(dist3(scaled[i], scaled[j]) - edgeLen) < 1e-4) edges.push([i, j]);
      }
    }
    return { verts: scaled, edges };
  }

  function buildEdgeElements(verts, edges, thickness) {
    icoObject.innerHTML = '';
    edges.forEach(([i, j]) => {
      const A = verts[i];
      const B = verts[j];
      const u = normalize(sub(B, A));
      const ref = Math.abs(u[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
      const v = normalize(cross(ref, u));
      const w = cross(u, v);
      const len = dist3(A, B);
      const tx = A[0] - (v[0] * thickness) / 2;
      const ty = A[1] - (v[1] * thickness) / 2;
      const tz = A[2] - (v[2] * thickness) / 2;
      const m = [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, w[0], w[1], w[2], 0, tx, ty, tz, 1];
      const el = document.createElement('div');
      el.className = 'ico-edge';
      el.style.width = len.toFixed(2) + 'px';
      el.style.height = thickness + 'px';
      el.style.transform = `matrix3d(${m.join(',')})`;
      icoObject.appendChild(el);
    });
  }

  const ICO = buildIcosahedron(58);
  buildEdgeElements(ICO.verts, ICO.edges, 1.6);

  // ---------- avatar reactivity state ----------
  let micLevel = 0; // 0..1, smoothed live mic volume while listening
  let speakPulse = 0; // 0..1, decaying, bumped on each spoken word (TTS "boundary" event)
  let micStream = null;
  let audioCtx = null;
  let analyser = null;
  let analyserData = null;

  function sampleMicLevel() {
    if (!analyser) return;
    analyser.getByteTimeDomainData(analyserData);
    let sumSquares = 0;
    for (let i = 0; i < analyserData.length; i++) {
      const v = (analyserData[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / analyserData.length);
    micLevel = micLevel * 0.7 + Math.min(1, rms * 4.5) * 0.3;
    if (analyser) requestAnimationFrame(sampleMicLevel);
  }

  // Opens the microphone so the avatar can react to your actual voice volume
  // while listening. Also used as a best-effort hint for which physical mic
  // to use: the Web Speech recognition API has no official "pick a device"
  // parameter, so opening the chosen device first is the most we can do.
  async function startMicAnalyser() {
    try {
      const constraints = settings.micDeviceId
        ? { audio: { deviceId: { exact: settings.micDeviceId } } }
        : { audio: true };
      micStream = await navigator.mediaDevices.getUserMedia(constraints);
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserData = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      requestAnimationFrame(sampleMicLevel);
    } catch (e) {
      micStream = null;
      analyser = null;
    }
  }

  function stopMicAnalyser() {
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    analyser = null;
    micLevel = 0;
  }

  function pulseSpeak() {
    speakPulse = 1;
  }

  // ---------- animation loop ----------
  let rotX = 12;
  let rotY = 0;
  let lastTs = null;

  function animFrame(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(64, ts - lastTs);
    lastTs = ts;

    speakPulse *= Math.pow(0.002, dt / 1000);
    if (speakPulse < 0.01) speakPulse = 0;

    let speed = 0.02; // deg/ms, idle
    let scale = 1;
    const body = document.body.classList;
    if (body.contains('thinking')) {
      speed = 0.055;
    } else if (body.contains('listening')) {
      speed = 0.022 + micLevel * 0.09;
      scale = 1 + micLevel * 0.16;
    } else if (body.contains('speaking')) {
      speed = 0.03 + speakPulse * 0.05;
      scale = 1 + speakPulse * 0.14;
    }

    rotY += speed * dt;
    rotX += speed * 0.42 * dt;

    icoObject.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    icoPulse.style.transform = `scale(${scale.toFixed(3)})`;

    requestAnimationFrame(animFrame);
  }
  requestAnimationFrame(animFrame);

  // ---------- avatar state machine ----------
  // idle -> listening (mic capturing) -> thinking (awaiting Claude) -> speaking (reading the reply aloud)
  function setState(state) {
    document.body.classList.remove('listening', 'thinking', 'speaking');
    if (state && state !== 'idle') document.body.classList.add(state);
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
    utter.onstart = () => { setState('speaking'); };
    utter.onboundary = () => { pulseSpeak(); };
    utter.onend = () => { setState('idle'); };
    utter.onerror = () => { setState('idle'); };
    window.speechSynthesis.speak(utter);
  }

  function stopSpeaking() {
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  // ---------- speech-to-text ----------
  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btnMic.hidden = true;
      btnMic.title = 'Reconnaissance vocale indisponible sur ce systeme.';
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
      stopMicAnalyser();
      setState('idle');
    };

    recognition.onend = () => {
      recognizing = false;
      btnMic.classList.remove('recording');
      stopMicAnalyser();
      if (!document.body.classList.contains('thinking') && !document.body.classList.contains('speaking')) {
        setState('idle');
      }
    };
  }

  async function toggleRecognition() {
    if (!recognition) return;
    if (recognizing) {
      recognition.stop();
      return;
    }
    stopSpeaking();
    await startMicAnalyser();
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
        addMessage('assistant', 'Je t\'ecoute. Pose ta question.');
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
    const pending = addMessage('assistant', 'Un instant...', { pending: true });
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
