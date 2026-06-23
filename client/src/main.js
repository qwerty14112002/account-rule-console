const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

const viewLoggedOut = document.getElementById('view-logged-out');
const viewLoggedIn = document.getElementById('view-logged-in');
const orgIndicator = document.getElementById('org-indicator');
const orgUrlText = document.getElementById('org-url-text');

const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const btnFetch = document.getElementById('btn-fetch');
const btnEnableAll = document.getElementById('btn-enable-all');
const btnDisableAll = document.getElementById('btn-disable-all');
const btnRevert = document.getElementById('btn-revert');
const btnDeploy = document.getElementById('btn-deploy');

const emptyState = document.getElementById('empty-state');
const ruleTableWrap = document.getElementById('rule-table-wrap');
const ruleList = document.getElementById('rule-list');
const ruleCount = document.getElementById('rule-count');
const pendingCount = document.getElementById('pending-count');
const toast = document.getElementById('toast');

let rules = [];
let pending = new Map();

function showToast(message, kind = '') {
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3200);
}

function setLoggedInUI(isLoggedIn, instanceUrl) {
  viewLoggedOut.classList.toggle('hidden', isLoggedIn);
  viewLoggedIn.classList.toggle('hidden', !isLoggedIn);
  orgIndicator.classList.toggle('hidden', !isLoggedIn);
  if (isLoggedIn && instanceUrl) {
    orgUrlText.textContent = instanceUrl.replace('https://', '');
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function checkSession() {
  try {
    const data = await api('/api/me');
    setLoggedInUI(true, data.instanceUrl);
  } catch {
    setLoggedInUI(false);
  }
}

btnLogin.addEventListener('click', () => {
  window.location.href = `${API_BASE}/auth/login`;
});

btnLogout.addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  rules = [];
  pending.clear();
  renderRules();
  setLoggedInUI(false);
  showToast('Disconnected from org.');
});

function handleRedirectParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('loggedIn')) {
    const ok = params.get('loggedIn') === 'true';
    if (ok) {
      showToast('Connected to Salesforce org.', 'success');
      checkSession();
    } else {
      showToast('Login failed. Check your Connected App callback URL.', 'error');
    }
    window.history.replaceState({}, '', window.location.pathname);
  }
}

btnFetch.addEventListener('click', async () => {
  btnFetch.disabled = true;
  btnFetch.querySelector('.ic').textContent = '◌';
  try {
    const data = await api('/api/validation-rules');
    rules = data.rules;
    pending.clear();
    renderRules();
    showToast(`Loaded ${rules.length} validation rule${rules.length === 1 ? '' : 's'} from Account.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnFetch.disabled = false;
    btnFetch.querySelector('.ic').textContent = '↻';
  }
});

function renderRules() {
  const hasRules = rules.length > 0;
  emptyState.classList.toggle('hidden', hasRules);
  ruleTableWrap.classList.toggle('hidden', !hasRules);

  ruleCount.textContent = hasRules ? `${rules.length} rule${rules.length === 1 ? '' : 's'} on Account` : '';
  btnEnableAll.disabled = !hasRules;
  btnDisableAll.disabled = !hasRules;

  ruleList.innerHTML = '';
  for (const rule of rules) {
    const isPending = pending.has(rule.id);
    const effectiveActive = isPending ? pending.get(rule.id) : rule.active;

    const row = document.createElement('div');
    row.className = `rule-row${isPending ? ' is-pending' : ''}`;
    row.innerHTML = `
      <div class="rule-name">
        <span class="obj-prefix">Account.</span>${escapeHtml(rule.name)}
        ${isPending ? '<span class="pending-flag">pending</span>' : ''}
      </div>
      <div class="rule-msg" title="${escapeHtml(rule.errorMessage || '')}">${escapeHtml(rule.errorMessage || '—')}</div>
      <div class="rule-state">
        <span class="state-label ${effectiveActive ? 'on' : 'off'}">${effectiveActive ? 'ON' : 'OFF'}</span>
        <div class="switch ${effectiveActive ? 'is-on' : 'is-off'}" data-id="${rule.id}"></div>
      </div>
    `;
    ruleList.appendChild(row);
  }

  ruleList.querySelectorAll('.switch').forEach((el) => {
    el.addEventListener('click', () => toggleLocal(el.dataset.id));
  });

  renderPendingBar();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toggleLocal(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return;

  const currentlyPending = pending.get(ruleId);
  const newDesired = currentlyPending !== undefined ? !currentlyPending : !rule.active;

  if (newDesired === rule.active) {
    pending.delete(ruleId);
  } else {
    pending.set(ruleId, newDesired);
  }
  renderRules();
}

function renderPendingBar() {
  const count = pending.size;
  pendingCount.textContent = `${count} pending change${count === 1 ? '' : 's'}`;
  pendingCount.classList.toggle('has-pending', count > 0);
  btnDeploy.disabled = count === 0;
  btnRevert.disabled = count === 0;
}

btnEnableAll.addEventListener('click', () => {
  rules.forEach((r) => {
    if (!r.active) pending.set(r.id, true);
    else pending.delete(r.id);
  });
  renderRules();
});

btnDisableAll.addEventListener('click', () => {
  rules.forEach((r) => {
    if (r.active) pending.set(r.id, false);
    else pending.delete(r.id);
  });
  renderRules();
});

btnRevert.addEventListener('click', () => {
  pending.clear();
  renderRules();
  showToast('Pending changes discarded.');
});

btnDeploy.addEventListener('click', async () => {
  if (pending.size === 0) return;

  const changes = Array.from(pending.entries()).map(([id, active]) => ({ id, active }));
  btnDeploy.disabled = true;
  btnDeploy.textContent = 'Deploying…';

  try {
    const data = await api('/api/validation-rules/deploy', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });

    const failed = data.results.filter((r) => !r.ok);

    data.results.filter((r) => r.ok).forEach((r) => {
      const rule = rules.find((x) => x.id === r.id);
      if (rule) rule.active = pending.get(r.id);
      pending.delete(r.id);
    });

    renderRules();

    if (failed.length === 0) {
      showToast('All changes deployed to your org.', 'success');
    } else {
      showToast(`${failed.length} rule(s) failed to deploy. They remain pending.`, 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnDeploy.textContent = 'Deploy changes';
    renderPendingBar();
  }
});

handleRedirectParams();
checkSession();
