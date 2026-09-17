(() => {
  const avatar = document.getElementById('avatar');
  const messagesEl = document.getElementById('messages');
  const input = document.getElementById('input');
  const btnSend = document.getElementById('btn-send');
  const btnClose = document.getElementById('btn-close');
  const btnCollapse = document.getElementById('btn-collapse');
  const btnSettings = document.getElementById('btn-settings');

  let expanded = false;
  let sending = false;

  function applySettings(settings) {
    document.documentElement.style.setProperty('--panel-alpha', settings.opacity ?? 0.94);
  }

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
    const pending = addMessage('assistant', 'Il reflechit...', { pending: true });
    try {
      const res = await window.raphael.ask(question);
      if (res && res.error) {
        pending.textContent = res.error;
        pending.classList.remove('pending');
        pending.classList.add('error');
      } else {
        pending.textContent = (res && res.text) || '(reponse vide)';
        pending.classList.remove('pending');
      }
    } catch (e) {
      pending.textContent = 'Erreur inattendue : ' + e.message;
      pending.classList.remove('pending');
      pending.classList.add('error');
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
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  (async () => {
    const settings = await window.raphael.getSettings();
    applySettings(settings);
    window.raphael.onSettingsUpdated(applySettings);
  })();
})();
