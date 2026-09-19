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
    else ensureListening(); // de retour au repos -> reprend l'ecoute du mot-cle si activee
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

  let cloudAudio = null;

  function speak(text) {
    if (!settings.voiceEnabled || !text) return;
    stopSpeaking();
    if (settings.ttsProvider === 'elevenlabs' && settings.ttsApiKey && settings.ttsVoiceId) {
      speakCloud(text);
    } else {
      speakSystem(text);
    }
  }

  async function speakCloud(text) {
    try {
      const res = await window.raphael.ttsSpeak(text);
      // La voix cloud a pu etre desactivee/changee pendant l'attente reseau.
      if (!settings.voiceEnabled) return;
      if (!res || res.error) {
        console.warn('[Raphael] voix cloud :', (res && res.error) || 'reponse vide');
        if (expanded && res && res.error) addMessage('assistant', 'Voix cloud indisponible (' + res.error + '), bascule sur la voix systeme.', { error: true });
        speakSystem(text);
        return;
      }
      cloudAudio = new Audio('data:audio/mpeg;base64,' + res.audioBase64);
      cloudAudio.volume = settings.voiceVolume ?? 1;
      cloudAudio.onplay = () => { setState('speaking'); };
      cloudAudio.ontimeupdate = () => { pulseSpeak(); };
      cloudAudio.onended = () => { cloudAudio = null; setState('idle'); };
      cloudAudio.onerror = () => { cloudAudio = null; setState('idle'); };
      await cloudAudio.play();
    } catch (e) {
      console.warn('[Raphael] voix cloud :', e.message);
      speakSystem(text);
    }
  }

  function speakSystem(text) {
    if (!window.speechSynthesis) { setState('idle'); return; }
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
    if (cloudAudio) {
      try { cloudAudio.pause(); cloudAudio.currentTime = 0; } catch (e) { /* ignore */ }
      cloudAudio = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  // ---------- speech-to-text : mot-cle "Raphael" + bouton maintenu ----------
  // Un seul objet SpeechRecognition, garde allume en arriere-plan (mode
  // continuous) pour guetter le prenom "Raphael" ; des qu'il est entendu (ou
  // que le bouton micro est maintenu), tout ce qui suit devient la question
  // envoyee a Claude. Limite honnete : ceci repose entierement sur le meme
  // moteur de reconnaissance vocale integre au navigateur que le bouton
  // manuel — si ce moteur echoue (permission refusee, pas de connexion au
  // service de reconnaissance, etc.), ni le mot-cle ni le bouton ne pourront
  // fonctionner ; les erreurs reelles sont maintenant affichees (voir
  // micError ci-dessous) au lieu d'echouer silencieusement.
  const WAKE_RE = /rapha[eë]l[,:.!\s]*/i;

  const MIC_ERROR_MESSAGES = {
    'not-allowed': "Micro : l'acces au microphone a ete refuse. Verifie les autorisations microphone de Windows/macOS pour Raphael Assistant.",
    'permission-denied': "Micro : l'acces au microphone a ete refuse. Verifie les autorisations microphone de Windows/macOS pour Raphael Assistant.",
    'audio-capture': "Micro : aucun microphone accessible. Verifie qu'un peripherique est branche et non utilise par une autre application.",
    'network': "Micro : le service de reconnaissance vocale n'a pas pu etre contacte (necessite une connexion internet ; certaines versions de Chromium integrees a Electron n'ont pas acces au service de reconnaissance de Google).",
    'service-not-allowed': "Micro : le service de reconnaissance vocale est bloque sur ce systeme."
  };

  function extractAfterWake(text) {
    const match = text.match(WAKE_RE);
    if (!match) return null;
    return text.slice(match.index + match[0].length).trim();
  }

  function micError(message) {
    if (!message) return;
    console.warn('[Raphael] micro :', message);
    btnMic.title = message;
    if (expanded) addMessage('assistant', message, { error: true });
  }

  function resetMicTitle() {
    btnMic.title = 'Maintiens appuye pour parler, relache pour envoyer';
  }

  let wakeArmed = false;      // true = capture en cours (mot-cle entendu ou bouton maintenu)
  let holdingButton = false;  // true tant que le bouton micro est physiquement presse
  let finalBuffer = '';
  let restartTimer = null;
  let consecutiveErrors = 0;

  function wantBackgroundListening() {
    return !!recognition
      && settings.wakeWordEnabled !== false
      && !document.body.classList.contains('thinking')
      && !document.body.classList.contains('speaking');
  }

  function ensureListening() {
    if (!recognition || recognizing) return;
    if (!wantBackgroundListening() && !holdingButton) return;
    try {
      recognition.lang = settings.voiceLang || 'fr-FR';
      recognition.start();
    } catch (e) { /* deja en cours de demarrage : ignore */ }
  }

  function stopRecognitionSession() {
    if (recognition && recognizing) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
  }

  function finalizeCapture() {
    const text = (input.value || finalBuffer).trim();
    wakeArmed = false;
    finalBuffer = '';
    stopMicAnalyser();
    stopRecognitionSession();
    if (text) {
      input.value = text;
      sendMessage();
    }
  }

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btnMic.hidden = true;
      btnMic.title = 'Reconnaissance vocale indisponible sur ce systeme.';
      return;
    }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognizing = true;
      consecutiveErrors = 0;
      if (wakeArmed || holdingButton) {
        btnMic.classList.add('recording');
        setState('listening');
      }
    };

    recognition.onresult = (event) => {
      let interimChunk = '';
      let sawFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalBuffer += (finalBuffer ? ' ' : '') + transcript.trim();
          sawFinal = true;
        } else {
          interimChunk = transcript;
        }
      }

      if (wakeArmed) {
        input.value = (finalBuffer + ' ' + interimChunk).trim();
        autosize();
        // Envoi automatique des qu'une pause naturelle est detectee, sauf si
        // le bouton est maintenu (dans ce cas c'est le relachement qui envoie).
        if (sawFinal && !holdingButton && finalBuffer.trim()) {
          finalizeCapture();
        }
        return;
      }

      // Pas encore arme : on guette juste le prenom "Raphael".
      const liveText = (finalBuffer + ' ' + interimChunk).trim();
      if (WAKE_RE.test(liveText)) {
        const after = extractAfterWake(liveText);
        wakeArmed = true;
        finalBuffer = '';
        btnMic.classList.add('recording');
        setState('listening');
        startMicAnalyser();
        if (after) {
          finalBuffer = after;
          input.value = after;
          autosize();
          if (sawFinal) finalizeCapture();
        }
      } else {
        // Evite d'accumuler indefiniment de la parole ambiante en memoire
        // tant que le mot-cle n'a pas ete entendu.
        finalBuffer = '';
      }
    };

    recognition.onerror = (event) => {
      const err = event.error;
      if (err === 'aborted' || err === 'no-speech') {
        // 'aborted' = on a nous-meme demande l'arret ; 'no-speech' est normal
        // pendant l'ecoute passive du mot-cle, on relance simplement.
        return;
      }
      consecutiveErrors += 1;
      micError(MIC_ERROR_MESSAGES[err] || ('Micro : erreur de reconnaissance vocale (' + err + ').'));
      if (consecutiveErrors >= 5 && settings.wakeWordEnabled !== false) {
        window.raphael.setSettings({ wakeWordEnabled: false });
        micError("Micro : la reconnaissance vocale echoue de maniere repetee. L'ecoute permanente du mot-cle «Raphael» a ete desactivee automatiquement (reactivable dans les Parametres) ; le bouton micro maintenu reste disponible.");
      }
    };

    recognition.onend = () => {
      recognizing = false;
      stopMicAnalyser();
      if (wakeArmed && !holdingButton) {
        // Arret inattendu (erreur, coupure) en pleine capture automatique (mot-cle) :
        // on envoie ce qui a deja ete transcrit plutot que de le perdre silencieusement.
        const text = (input.value || finalBuffer).trim();
        wakeArmed = false;
        finalBuffer = '';
        btnMic.classList.remove('recording');
        if (text) {
          input.value = text;
          sendMessage();
        }
      } else if (!holdingButton) {
        // Ne retire le voyant rouge que si l'utilisateur n'est pas toujours en
        // train de maintenir le bouton : un redemarrage de la reconnaissance en
        // arriere-plan pendant une prise de parole maintenue ne doit pas donner
        // l'impression que le micro s'est arrete.
        btnMic.classList.remove('recording');
      }
      if (!document.body.classList.contains('thinking') && !document.body.classList.contains('speaking') && !wakeArmed) {
        setState('idle');
      }
      clearTimeout(restartTimer);
      if (holdingButton) {
        // L'utilisateur maintient toujours le bouton : on relance tout de
        // suite plutot que d'attendre le delai anti-boucle habituel.
        ensureListening();
      } else {
        restartTimer = setTimeout(ensureListening, 400);
      }
    };
  }

  function startHolding() {
    if (!recognition) return;
    stopSpeaking();
    holdingButton = true;
    wakeArmed = true;
    finalBuffer = '';
    input.value = '';
    autosize();
    resetMicTitle();
    btnMic.classList.add('recording');
    setState('listening');
    startMicAnalyser();
    ensureListening();
  }

  function stopHolding() {
    if (!holdingButton) return;
    holdingButton = false;
    if (wakeArmed) finalizeCapture();
  }

  // ---------- settings ----------
  function applySettings(s) {
    const prevWake = settings.wakeWordEnabled;
    settings = s || {};
    document.documentElement.style.setProperty('--panel-alpha', settings.opacity ?? 0.94);
    btnVoiceToggle.classList.toggle('muted', settings.voiceEnabled === false);
    if (settings.wakeWordEnabled === false && prevWake !== false) {
      if (!holdingButton) stopRecognitionSession();
    } else if (settings.wakeWordEnabled !== false && prevWake === false) {
      ensureListening();
    }
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
  // Micro a maintenir (push-to-talk) : on capture pendant que le bouton est
  // presse, on envoie au relachement. Ecoute sur window pour ne pas perdre le
  // relachement si le curseur glisse hors du (tout petit) bouton.
  btnMic.addEventListener('mousedown', (e) => { e.preventDefault(); startHolding(); });
  window.addEventListener('mouseup', () => { if (holdingButton) stopHolding(); });
  btnMic.addEventListener('touchstart', (e) => { e.preventDefault(); startHolding(); }, { passive: false });
  window.addEventListener('touchend', () => { if (holdingButton) stopHolding(); });
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
    ensureListening();
  })();
})();
