/**
 * UploadManager — global singleton that processes the chat upload queue.
 *
 * Lives outside any component so uploads continue regardless of which screen is
 * active. Components subscribe for progress to drive their own UI.
 *
 * Requires: npm install @notifee/react-native  +  cd ios && pod install
 */

import { AppState } from 'react-native';
import { processUploadQueue, cancelUploadQueue } from './uploadQueue';

// ─── Notification helpers (notifee) ───────────────────────────────────────────
// Wrapped in try/catch so a missing package causes a warning, not a crash.

let _notifee = null;
let _channelId = null;
const NOTIF_ID = 'chat-upload';

const getNotifee = () => {
  if (_notifee !== null) return _notifee;
  try {
    _notifee = require('@notifee/react-native').default;
  } catch (_) {
    _notifee = undefined; // package not installed — notifications silently skipped
  }
  return _notifee;
};

const ensureChannel = async () => {
  const n = getNotifee();
  if (!n || _channelId) return _channelId;
  try {
    const { AndroidImportance } = require('@notifee/react-native');
    _channelId = await n.createChannel({
      id:         'chat-upload',
      name:       'File Uploads',
      importance: AndroidImportance?.LOW ?? 2,
    });
  } catch (_) {}
  return _channelId;
};

const showProgress = async (pct) => {
  const n = getNotifee();
  if (!n) return;
  try {
    const channelId = await ensureChannel();
    await n.displayNotification({
      id:    NOTIF_ID,
      title: 'Sending file…',
      body:  `${pct}% uploaded`,
      android: {
        channelId,
        smallIcon:     'ic_notification',
        onlyAlertOnce: true,
        ongoing:       true,
        progress:      { max: 100, current: pct, indeterminate: pct === 0 },
      },
      ios: { },
    });
  } catch (_) {}
};

const showDone = async () => {
  const n = getNotifee();
  if (!n) return;
  try {
    const channelId = await ensureChannel();
    await n.displayNotification({
      id:    NOTIF_ID,
      title: 'File sent',
      body:  'Your attachment was sent successfully.',
      android: { channelId, smallIcon: 'ic_notification' },
      ios: { },
    });
    setTimeout(() => n.cancelNotification(NOTIF_ID).catch(() => {}), 4000);
  } catch (_) {}
};

const cancelNotif = () => {
  const n = getNotifee();
  if (n) n.cancelNotification(NOTIF_ID).catch(() => {});
};

// ─── Global state ─────────────────────────────────────────────────────────────

let _running   = false;
let _progress  = 0;              // 0–1
let _listeners = new Set();
let _appStateSub = null;

function _emit() {
  _listeners.forEach((fn) => fn({ running: _running, progress: _progress }));
}

// ─── Core runner ──────────────────────────────────────────────────────────────

async function _run() {
  if (_running) return;
  _running = true;
  _progress = 0;
  _emit();
  // Do NOT show any notification yet — wait until we know there is real work

  let hadWork = false;
  try {
    await processUploadQueue(async (p) => {
      if (!hadWork) await showProgress(0); // first callback = upload actually started
      hadWork = true;
      _progress = p;
      _emit();
      await showProgress(Math.round(p * 100));
    });
    if (hadWork) await showDone();
    // If queue was empty, hadWork stays false and no notification is ever shown
  } catch (_) {
    if (hadWork) cancelNotif();
  } finally {
    _running = false;
    _progress = 0;
    _emit();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Kick off queue processing (no-op if already running). */
export function startUploadManager() {
  _run().catch(() => {});
}

/**
 * Subscribe to upload state changes.
 * @param {(state: { running: boolean, progress: number }) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeUpload(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Cancel all queued uploads immediately.
 * Deletes in-progress RNBlobUtil request, removes Firestore placeholders,
 * and clears the queue. Call this after the user confirms the cancel Alert.
 */
export async function cancelUpload() {
  await cancelUploadQueue();
  cancelNotif();
  _running  = false;
  _progress = 0;
  _emit();
}

/**
 * Call once from App.js root to:
 *  - Process any pending uploads left from the previous session
 *  - Resume whenever the app comes to foreground
 */
export function initUploadManager() {
  if (_appStateSub) return; // already initialised
  _appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') _run().catch(() => {});
  });
  // Process anything left from a previous session
  _run().catch(() => {});
}
