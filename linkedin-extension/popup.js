/**
 * LinkedIn AutoConnect Pro — Popup Controller
 * Handles UI state, queue management, storage syncing, and message passing.
 */

// ===================== DOM REFS =====================
const $urlInput = document.getElementById('urlInput');
const $urlCount = document.getElementById('urlCount');
const $actionType = document.getElementById('actionType');
const $noteGroup = document.getElementById('noteGroup');
const $connectNote = document.getElementById('connectNote');
const $btnStart = document.getElementById('btnStart');
const $btnPause = document.getElementById('btnPause');
const $btnStop = document.getElementById('btnStop');
const $todayCount = document.getElementById('todayCount');
const $dailyLimitDisplay = document.getElementById('dailyLimitDisplay');
const $statTotal = document.getElementById('statTotal');
const $statDone = document.getElementById('statDone');
const $statSkipped = document.getElementById('statSkipped');
const $statFailed = document.getElementById('statFailed');
const $progressBar = document.getElementById('progressBar');
const $currentStatus = document.getElementById('currentStatus');
const $liveLog = document.getElementById('liveLog');
const $historyList = document.getElementById('historyList');
const $btnExportCSV = document.getElementById('btnExportCSV');
const $btnClearHistory = document.getElementById('btnClearHistory');
const $dailyLimit = document.getElementById('dailyLimit');
const $dailyLimitValue = document.getElementById('dailyLimitValue');
const $delayRange = document.getElementById('delayRange');
const $delayValue = document.getElementById('delayValue');
const $jitterRange = document.getElementById('jitterRange');
const $jitterValue = document.getElementById('jitterValue');
const $effectiveRate = document.getElementById('effectiveRate');
const $footerStatus = document.getElementById('footerStatus');

// ===================== TAB NAVIGATION =====================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ===================== URL PARSER =====================
function parseUrls(text) {
  if (!text.trim()) return [];
  const lines = text.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
  const urls = [];
  const seen = new Set();
  for (const line of lines) {
    let url = line;
    // Clean up the URL
    if (!url.startsWith('http')) {
      if (url.includes('linkedin.com')) {
        url = 'https://' + url;
      } else {
        url = 'https://www.linkedin.com/in/' + url;
      }
    }
    // Remove trailing slashes & query params
    url = url.split('?')[0].replace(/\/+$/, '');
    // Deduplicate
    const key = url.toLowerCase();
    if (!seen.has(key) && url.includes('linkedin.com')) {
      seen.add(key);
      urls.push(url);
    }
  }
  return urls;
}

$urlInput.addEventListener('input', () => {
  const urls = parseUrls($urlInput.value);
  $urlCount.textContent = `${urls.length} URL${urls.length !== 1 ? 's' : ''} detected`;
});

// Show/hide note input based on action type
$actionType.addEventListener('change', () => {
  $noteGroup.style.display = $actionType.value === 'connect_note' ? 'block' : 'none';
});

// ===================== SETTINGS =====================
function loadSettings() {
  chrome.storage.local.get(['settings'], (result) => {
    const s = result.settings || {};
    $dailyLimit.value = s.dailyLimit || 25;
    $delayRange.value = s.delay || 40;
    $jitterRange.value = s.jitter || 15;
    updateSettingsUI();
  });
}

function saveSettings() {
  const settings = {
    dailyLimit: parseInt($dailyLimit.value),
    delay: parseInt($delayRange.value),
    jitter: parseInt($jitterRange.value),
  };
  chrome.storage.local.set({ settings });
  $dailyLimitDisplay.textContent = settings.dailyLimit;
  updateSettingsUI();
}

function updateSettingsUI() {
  $dailyLimitValue.textContent = $dailyLimit.value;
  $delayValue.textContent = $delayRange.value + 's';
  $jitterValue.textContent = '±' + $jitterRange.value + 's';
  $dailyLimitDisplay.textContent = $dailyLimit.value;

  const avgDelay = parseInt($delayRange.value);
  const rate = (60 / avgDelay).toFixed(1);
  $effectiveRate.textContent = `~${rate}/min`;
}

[$dailyLimit, $delayRange, $jitterRange].forEach(el => {
  el.addEventListener('input', () => {
    saveSettings();
  });
});

// ===================== STATE MANAGEMENT =====================
function loadState() {
  chrome.storage.local.get(['state', 'history', 'todayDate', 'todayCount'], (result) => {
    const state = result.state || 'idle';
    const history = result.history || [];
    const today = new Date().toDateString();
    let todayCount = result.todayCount || 0;

    // Reset daily counter if new day
    if (result.todayDate !== today) {
      todayCount = 0;
      chrome.storage.local.set({ todayDate: today, todayCount: 0 });
    }

    $todayCount.textContent = todayCount;
    updateButtonStates(state);
    renderHistory(history);
    updateStats(history);
    updateFooterStatus(state);
  });
}

function updateButtonStates(state) {
  $btnStart.disabled = state === 'running';
  $btnPause.disabled = state !== 'running';
  $btnStop.disabled = state === 'idle';
  $urlInput.disabled = state === 'running';
}

function updateFooterStatus(state) {
  const labels = {
    idle: 'Ready',
    running: '🟢 Running',
    paused: '⏸ Paused',
    stopped: '🔴 Stopped',
    completed: '✅ Complete',
  };
  $footerStatus.textContent = labels[state] || 'Ready';
}

// ===================== STATS =====================
function updateStats(history) {
  const total = history.length;
  const done = history.filter(h => h.status === 'connected' || h.status === 'followed').length;
  const skipped = history.filter(h => h.status === 'skipped').length;
  const failed = history.filter(h => h.status === 'failed').length;

  $statTotal.textContent = total;
  $statDone.textContent = done;
  $statSkipped.textContent = skipped;
  $statFailed.textContent = failed;

  const pct = total > 0 ? Math.round(((done + skipped + failed) / total) * 100) : 0;
  $progressBar.style.width = pct + '%';
}

// ===================== LIVE LOG =====================
function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${message}`;
  $liveLog.appendChild(entry);
  $liveLog.scrollTop = $liveLog.scrollHeight;

  // Keep only last 100 entries
  while ($liveLog.children.length > 100) {
    $liveLog.removeChild($liveLog.firstChild);
  }
}

function setStatus(message, dotClass = 'idle') {
  $currentStatus.innerHTML = `<div class="status-dot ${dotClass}"></div><span>${message}</span>`;
}

// ===================== HISTORY =====================
function renderHistory(history) {
  if (!history.length) {
    $historyList.innerHTML = '<div class="empty-state">No profiles processed yet.</div>';
    return;
  }

  $historyList.innerHTML = history.slice(-50).reverse().map(h => {
    const name = h.url.split('/in/')[1] || h.url;
    return `
      <div class="history-item">
        <span class="status-badge ${h.status}">${h.status}</span>
        <span class="profile-name" title="${h.url}">${name}</span>
      </div>
    `;
  }).join('');
}

// ===================== START / PAUSE / STOP =====================
$btnStart.addEventListener('click', () => {
  const urls = parseUrls($urlInput.value);
  if (urls.length === 0) {
    addLog('No valid LinkedIn URLs found. Please paste URLs.', 'warning');
    return;
  }

  const action = $actionType.value;
  const note = $connectNote.value.trim();

  chrome.storage.local.get(['settings', 'todayCount', 'todayDate'], (result) => {
    const settings = result.settings || { dailyLimit: 25, delay: 40, jitter: 15 };
    const today = new Date().toDateString();
    let todayCount = result.todayCount || 0;
    if (result.todayDate !== today) todayCount = 0;

    if (todayCount >= settings.dailyLimit) {
      addLog(`Daily limit reached (${todayCount}/${settings.dailyLimit}). Try again tomorrow.`, 'error');
      setStatus(`Daily limit reached. Paused for safety.`, 'error');
      return;
    }

    // Save queue and start
    chrome.storage.local.set({
      queue: urls,
      queueIndex: 0,
      action,
      note: action === 'connect_note' ? note : '',
      state: 'running',
      todayDate: today,
      todayCount,
    }, () => {
      addLog(`Queue loaded: ${urls.length} profiles. Action: ${action}`, 'action');
      addLog('Starting automation...', 'success');
      setStatus('Starting — opening first profile...', 'running');
      updateButtonStates('running');
      updateFooterStatus('running');

      // Tell background to begin
      chrome.runtime.sendMessage({ type: 'START' });
    });
  });
});

$btnPause.addEventListener('click', () => {
  chrome.storage.local.set({ state: 'paused' }, () => {
    addLog('Paused by user.', 'warning');
    setStatus('Paused — click Start to resume.', 'paused');
    updateButtonStates('paused');
    updateFooterStatus('paused');
    chrome.runtime.sendMessage({ type: 'PAUSE' });
  });
});

$btnStop.addEventListener('click', () => {
  chrome.storage.local.set({ state: 'idle', queue: [], queueIndex: 0 }, () => {
    addLog('Stopped by user. Queue cleared.', 'error');
    setStatus('Idle — Waiting to start', 'idle');
    updateButtonStates('idle');
    updateFooterStatus('idle');
    chrome.runtime.sendMessage({ type: 'STOP' });
  });
});

// ===================== EXPORT CSV =====================
$btnExportCSV.addEventListener('click', () => {
  chrome.storage.local.get(['history'], (result) => {
    const history = result.history || [];
    if (!history.length) {
      addLog('No history to export.', 'warning');
      return;
    }

    const csv = 'URL,Status,Timestamp\n' +
      history.map(h => `${h.url},${h.status},${h.time || ''}`).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedin_autoconnect_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('History exported as CSV.', 'success');
  });
});

$btnClearHistory.addEventListener('click', () => {
  chrome.storage.local.set({ history: [] }, () => {
    renderHistory([]);
    updateStats([]);
    addLog('History cleared.', 'info');
  });
});

// ===================== LISTEN FOR UPDATES FROM BACKGROUND =====================
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LOG') {
    addLog(msg.message, msg.level || 'info');
  }
  if (msg.type === 'STATUS') {
    setStatus(msg.message, msg.dotClass || 'running');
  }
  if (msg.type === 'STATE_UPDATE') {
    loadState();
  }
  if (msg.type === 'PROGRESS') {
    $todayCount.textContent = msg.todayCount || 0;
    chrome.storage.local.get(['history'], (result) => {
      updateStats(result.history || []);
      renderHistory(result.history || []);
    });
  }
});

// ===================== INIT =====================
loadSettings();
loadState();
