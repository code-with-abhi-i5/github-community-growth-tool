/**
 * LinkedIn AutoConnect Pro — Content Script
 * DOM interaction engine with human-like scroll simulation,
 * button detection via aria-labels/text, and modal handling.
 */

// ===================== MESSAGE LISTENER =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PERFORM_ACTION') {
    performAction(msg.action, msg.note, msg.url);
  }
});

// ===================== MAIN ACTION PERFORMER =====================
async function performAction(action, note, url) {
  try {
    // Step 1: Wait for page to settle
    await sleep(1500 + Math.random() * 1000);

    // Step 2: Simulate human scroll (200-500px down) to look natural
    await humanScroll();

    // Step 3: Wait a bit as if reading the profile
    await sleep(1500 + Math.random() * 2000);

    // Step 4: Detect the current relationship state
    const state = detectProfileState();

    if (action === 'follow') {
      await handleFollow(state, url);
    } else if (action === 'connect' || action === 'connect_note') {
      await handleConnect(state, note, url);
    }

  } catch (err) {
    reportResult('failed', url, err.message || 'Unknown error in content script');
  }
}

// ===================== DETECT PROFILE STATE =====================
function detectProfileState() {
  const allButtons = Array.from(document.querySelectorAll('button'));
  const allSpans = Array.from(document.querySelectorAll('span'));

  const state = {
    hasFollowBtn: false,
    hasFollowingBtn: false,
    hasConnectBtn: false,
    hasPendingBtn: false,
    hasMessageBtn: false,
    hasMoreBtn: false,
    followBtn: null,
    connectBtn: null,
    moreBtn: null,
  };

  for (const btn of allButtons) {
    const text = (btn.innerText || '').trim().toLowerCase();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

    if ((text === 'follow' || ariaLabel.includes('follow')) && !text.includes('following') && !text.includes('unfollow')) {
      state.hasFollowBtn = true;
      state.followBtn = btn;
    }
    if (text === 'following' || text === 'unfollow') {
      state.hasFollowingBtn = true;
    }
    if (text === 'connect' || ariaLabel.includes('connect') && !ariaLabel.includes('disconnect')) {
      if (!text.includes('pending') && text !== 'disconnect') {
        state.hasConnectBtn = true;
        state.connectBtn = btn;
      }
    }
    if (text === 'pending' || text.includes('pending')) {
      state.hasPendingBtn = true;
    }
    if (text === 'message' || ariaLabel.includes('message')) {
      state.hasMessageBtn = true;
    }
    if (text === 'more' || ariaLabel.includes('more actions')) {
      state.hasMoreBtn = true;
      state.moreBtn = btn;
    }
  }

  return state;
}

// ===================== FOLLOW ACTION =====================
async function handleFollow(state, url) {
  // Already following?
  if (state.hasFollowingBtn) {
    reportResult('skipped', url, 'Already following this user');
    return;
  }

  // Direct Follow button visible
  if (state.hasFollowBtn && state.followBtn) {
    state.followBtn.click();
    await sleep(800 + Math.random() * 500);
    reportResult('followed', url);
    return;
  }

  // Follow might be inside "More" dropdown
  if (state.hasMoreBtn && state.moreBtn) {
    state.moreBtn.click();
    await sleep(700 + Math.random() * 400);

    const dropdownItems = Array.from(document.querySelectorAll('[role="menuitem"], .artdeco-dropdown__item, li.artdeco-dropdown__item'));
    for (const item of dropdownItems) {
      const text = (item.innerText || '').trim().toLowerCase();
      if (text.includes('follow') && !text.includes('unfollow') && !text.includes('following')) {
        item.click();
        await sleep(600);
        reportResult('followed', url);
        return;
      }
    }
    // Close dropdown if follow not found
    state.moreBtn.click();
  }

  reportResult('failed', url, 'Follow button not found on page');
}

// ===================== CONNECT ACTION =====================
async function handleConnect(state, note, url) {
  // Already connected (has Message button and no Connect)
  if (state.hasMessageBtn && !state.hasConnectBtn && !state.hasPendingBtn) {
    reportResult('skipped', url, 'Already connected');
    return;
  }

  // Pending request
  if (state.hasPendingBtn) {
    reportResult('skipped', url, 'Connection request already pending');
    return;
  }

  let connectBtn = state.connectBtn;

  // If no direct Connect button, check More dropdown
  if (!connectBtn && state.hasMoreBtn && state.moreBtn) {
    state.moreBtn.click();
    await sleep(700 + Math.random() * 400);

    const dropdownItems = Array.from(document.querySelectorAll('[role="menuitem"], .artdeco-dropdown__item, li.artdeco-dropdown__item'));
    for (const item of dropdownItems) {
      const text = (item.innerText || '').trim().toLowerCase();
      if (text.includes('connect') && !text.includes('disconnect')) {
        connectBtn = item;
        break;
      }
    }

    if (!connectBtn) {
      // Close dropdown
      state.moreBtn.click();
      // Fallback: try to follow instead
      await handleFollow(state, url);
      return;
    }
  }

  if (!connectBtn) {
    reportResult('failed', url, 'Connect button not found');
    return;
  }

  // Click connect
  connectBtn.click();
  await sleep(1000 + Math.random() * 600);

  // Handle the confirmation modal
  await handleConnectModal(note, url);
}

// ===================== CONNECT MODAL HANDLER =====================
async function handleConnectModal(note, url) {
  // Wait for modal to appear
  await sleep(600);

  const modalButtons = Array.from(document.querySelectorAll('button'));

  // If note is provided, try to add it
  if (note) {
    const addNoteBtn = modalButtons.find(btn => {
      const text = (btn.innerText || '').toLowerCase();
      return text.includes('add a note') || text.includes('add note');
    });

    if (addNoteBtn) {
      addNoteBtn.click();
      await sleep(500);

      // Find textarea and type note
      const textarea = document.querySelector('textarea[name="message"], textarea#custom-message, .msg-form__contenteditable, textarea');
      if (textarea) {
        textarea.value = note;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);
      }
    }
  }

  // Click "Send" or "Send without a note"
  await sleep(400);
  const allBtns = Array.from(document.querySelectorAll('button'));
  const sendBtn = allBtns.find(btn => {
    const text = (btn.innerText || '').toLowerCase().trim();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    return text === 'send' || text === 'send now' || text.includes('send without') ||
      ariaLabel.includes('send') || text === 'send invitation';
  });

  if (sendBtn) {
    sendBtn.click();
    await sleep(800 + Math.random() * 400);
    reportResult('connected', url);
  } else {
    // Try to dismiss any modal and report
    const dismissBtns = allBtns.filter(btn => {
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      return ariaLabel.includes('dismiss') || ariaLabel.includes('close');
    });
    if (dismissBtns.length) dismissBtns[0].click();
    reportResult('failed', url, 'Send button not found in modal');
  }
}

// ===================== REPORT RESULT BACK TO BACKGROUND =====================
function reportResult(status, url, reason = '') {
  chrome.runtime.sendMessage({
    type: 'ACTION_RESULT',
    status,
    url,
    reason,
  });
}

// ===================== HUMAN-LIKE SCROLL =====================
async function humanScroll() {
  const scrollAmount = 200 + Math.floor(Math.random() * 300); // 200-500px
  const steps = 5 + Math.floor(Math.random() * 5); // 5-10 steps
  const stepSize = scrollAmount / steps;

  for (let i = 0; i < steps; i++) {
    window.scrollBy(0, stepSize);
    await sleep(50 + Math.random() * 80);
  }
}

// ===================== SLEEP HELPER =====================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
