/**
 * LinkedIn AutoConnect Pro — Background Service Worker
 * Handles tab lifecycle, queue coordination, delays, and alarm-based scheduling.
 */

// ===================== MESSAGE HANDLER =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START') {
    processNext();
  }
  if (msg.type === 'PAUSE') {
    chrome.alarms.clear('nextProfile');
  }
  if (msg.type === 'STOP') {
    chrome.alarms.clear('nextProfile');
  }
  // Content script reports result
  if (msg.type === 'ACTION_RESULT') {
    handleActionResult(msg);
  }
});

// ===================== ALARM HANDLER =====================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'nextProfile') {
    processNext();
  }
});

// ===================== PROCESS NEXT PROFILE =====================
async function processNext() {
  const data = await getStorage(['queue', 'queueIndex', 'state', 'action', 'note', 'settings', 'todayCount', 'todayDate']);

  const state = data.state;
  if (state !== 'running') return;

  const queue = data.queue || [];
  const index = data.queueIndex || 0;
  const settings = data.settings || { dailyLimit: 25, delay: 40, jitter: 15 };
  const today = new Date().toDateString();
  let todayCount = data.todayCount || 0;

  // Reset daily counter if new day
  if (data.todayDate !== today) {
    todayCount = 0;
    await setStorage({ todayDate: today, todayCount: 0 });
  }

  // Check daily limit
  if (todayCount >= settings.dailyLimit) {
    await setStorage({ state: 'paused' });
    broadcast({ type: 'LOG', message: `Daily limit reached (${todayCount}/${settings.dailyLimit}). Pausing for safety.`, level: 'error' });
    broadcast({ type: 'STATUS', message: 'Daily limit reached. Paused.', dotClass: 'error' });
    broadcast({ type: 'STATE_UPDATE' });
    return;
  }

  // Check if queue is done
  if (index >= queue.length) {
    await setStorage({ state: 'completed' });
    broadcast({ type: 'LOG', message: `All ${queue.length} profiles processed! 🎉`, level: 'success' });
    broadcast({ type: 'STATUS', message: 'Completed — All profiles processed.', dotClass: 'idle' });
    broadcast({ type: 'STATE_UPDATE' });
    return;
  }

  const url = queue[index];
  const profileName = url.split('/in/')[1] || url;

  broadcast({ type: 'LOG', message: `Opening: ${profileName}`, level: 'action' });
  broadcast({ type: 'STATUS', message: `Visiting ${profileName}...`, dotClass: 'running' });

  // Open the LinkedIn profile in a new tab
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    
    // Store tab info for content script to pick up
    await setStorage({
      currentTabId: tab.id,
      currentUrl: url,
      currentAction: data.action || 'follow',
      currentNote: data.note || '',
    });

    // Wait for page to load, then inject content script action
    // We give the page 5 seconds to fully load
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'PERFORM_ACTION',
          action: data.action || 'follow',
          note: data.note || '',
          url,
        });
      } catch (err) {
        // Content script may not be ready, try scripting API
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          // Wait a bit more then send message
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: 'PERFORM_ACTION',
                action: data.action || 'follow',
                note: data.note || '',
                url,
              });
            } catch (e) {
              handleActionResult({ status: 'failed', url, reason: 'Could not communicate with page' });
            }
          }, 2000);
        } catch (e2) {
          handleActionResult({ status: 'failed', url, reason: 'Could not inject script' });
        }
      }
    }, 5000);

  } catch (err) {
    handleActionResult({ status: 'failed', url, reason: err.message });
  }
}

// ===================== HANDLE ACTION RESULT =====================
async function handleActionResult(msg) {
  const data = await getStorage(['queue', 'queueIndex', 'state', 'history', 'todayCount', 'settings', 'currentTabId']);

  const history = data.history || [];
  const settings = data.settings || { dailyLimit: 25, delay: 40, jitter: 15 };
  let todayCount = data.todayCount || 0;
  const index = data.queueIndex || 0;

  // Log result
  const statusLabels = {
    connected: '✅ Connected',
    followed: '✅ Followed',
    skipped: '⚠️ Skipped (already connected/following)',
    failed: '❌ Failed',
  };

  const profileName = (msg.url || '').split('/in/')[1] || msg.url || 'unknown';
  const label = statusLabels[msg.status] || msg.status;
  const logLevel = msg.status === 'connected' || msg.status === 'followed' ? 'success'
    : msg.status === 'skipped' ? 'warning' : 'error';

  broadcast({ type: 'LOG', message: `${label}: ${profileName}${msg.reason ? ' — ' + msg.reason : ''}`, level: logLevel });

  // Update today count for successful actions
  if (msg.status === 'connected' || msg.status === 'followed') {
    todayCount++;
  }

  // Save to history
  history.push({
    url: msg.url || '',
    status: msg.status,
    reason: msg.reason || '',
    time: new Date().toISOString(),
  });

  // Move to next
  const nextIndex = index + 1;
  const queue = data.queue || [];

  await setStorage({
    queueIndex: nextIndex,
    history,
    todayCount,
  });

  // Close the tab
  if (data.currentTabId) {
    try {
      await chrome.tabs.remove(data.currentTabId);
    } catch (e) { /* tab may already be closed */ }
  }

  broadcast({ type: 'PROGRESS', todayCount });

  // Check if done
  if (nextIndex >= queue.length) {
    await setStorage({ state: 'completed' });
    broadcast({ type: 'LOG', message: `All ${queue.length} profiles processed! 🎉`, level: 'success' });
    broadcast({ type: 'STATUS', message: 'Completed!', dotClass: 'idle' });
    broadcast({ type: 'STATE_UPDATE' });
    return;
  }

  // Check daily limit
  if (todayCount >= settings.dailyLimit) {
    await setStorage({ state: 'paused' });
    broadcast({ type: 'LOG', message: `Daily limit reached (${todayCount}). Pausing.`, level: 'error' });
    broadcast({ type: 'STATUS', message: 'Daily limit reached.', dotClass: 'error' });
    broadcast({ type: 'STATE_UPDATE' });
    return;
  }

  // Schedule next with randomized delay
  const baseDelay = settings.delay || 40;
  const jitter = settings.jitter || 15;
  const randomDelay = baseDelay + Math.floor(Math.random() * jitter * 2) - jitter;
  const clampedDelay = Math.max(15, randomDelay); // Minimum 15 seconds

  broadcast({ type: 'STATUS', message: `Waiting ${clampedDelay}s before next profile...`, dotClass: 'running' });
  broadcast({ type: 'LOG', message: `⏳ Waiting ${clampedDelay}s (human delay)...`, level: 'info' });

  // Use chrome.alarms for MV3 compatible timer
  chrome.alarms.create('nextProfile', { delayInMinutes: clampedDelay / 60 });
}

// ===================== BROADCAST TO POPUP =====================
function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup may not be open, that's ok
  });
}

// ===================== STORAGE HELPERS =====================
function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}
