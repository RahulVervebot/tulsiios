import RNCallKeep from 'react-native-callkeep';
import firestore from '@react-native-firebase/firestore';
import { AppState, NativeModules } from 'react-native';
import { markCallKitActive, unmarkCallKitActive } from './CallKitState';
import { rootNavigate } from './RootNavigation';

const { PendingCallModule } = NativeModules;
let _navigationRef  = null;
let _pendingCall    = null;
const _shownCallIds = new Set();
let _answeredCallId = null;
let _killedAppPending = null;

export const setCallKeepNav = (ref) => { _navigationRef = ref; };

// Synchronous getter — called from checkLogin before any await so timing is safe.
export function getAndClearKilledAppPending() {
  const val = _killedAppPending;
  _killedAppPending = null;
  return val; // { callUUID } or null — callType is NOT reliable here; use native for type
}

// Register listeners immediately at module-load time so _onAnswer fires the moment
// RNCallKeep replays the queued native event, even before useEffect runs.

RNCallKeep.addEventListener('answerCall',             _onAnswer);
RNCallKeep.addEventListener('endCall',                _onEnd);
RNCallKeep.addEventListener('didDisplayIncomingCall', _onDisplay);

export async function initCallKeep() {
  try {
    await RNCallKeep.setup({
      ios:     { appName: 'Tulsi', supportsVideo: true },
      android: {
        alertTitle:       'Phone account permission',
        alertDescription: 'Tulsi needs access to your phone accounts to show incoming calls.',
        cancelButton:     'Cancel',
        okButton:         'Allow',
        imageName:        'ic_launcher',
        additionalPermissions: [],
        foregroundService: {
          channelId:         'com.tulsi.calls',
          channelName:       'Incoming Calls',
          notificationTitle: 'Tulsi — Incoming Call',
        },
      },
    });
  } catch (err) {
    console.log('[CallKeep] setup error:', err?.message);
  }
}

export function destroyCallKeep() {
  RNCallKeep.removeEventListener('answerCall');
  RNCallKeep.removeEventListener('endCall');
  RNCallKeep.removeEventListener('didDisplayIncomingCall');
}

export function displayIncomingCall(callData) {
  if (_shownCallIds.has(callData.callId)) return;
  _shownCallIds.add(callData.callId);
  _pendingCall = callData;
  // Native CallKit screen is shown by AppDelegate.swift (reportNewIncomingCall).
  // This function just registers the pending call so _onAnswer can read callType.
  if (AppState.currentState !== 'active') {
    markCallKitActive(callData.callId);
  }
}

export function wasCallKitHandled() { return !!_answeredCallId; }

export function clearShownCall(callId) { _shownCallIds.delete(callId); }

export function reportCallActive(callId) {
  try { RNCallKeep.setCurrentCallActive(callId); } catch (_) {}
}

export function endCallKeep(callId) {
  _shownCallIds.delete(callId);
  unmarkCallKitActive(callId);
  try { RNCallKeep.endCall(callId); } catch (_) {}
}

// ───────────────────── private handlers ─────────────────────────────

function _onAnswer({ callUUID }) {
  _answeredCallId = callUUID;
  unmarkCallKitActive(callUUID);

  // Mark accepted in native UserDefaults so getPendingAcceptedCall() knows this was
  // a real accept (not just any incoming push). Fire-and-forget — no await needed.

  if (PendingCallModule?.markCallAccepted) {
    PendingCallModule.markCallAccepted().catch(() => {});
  }

  const nav = _navigationRef?.current;
  if (!nav?.isReady?.()) {
    // App was killed — nav not ready yet. checkLogin() polls getPendingAcceptedCall()
    // which reads callType from native UserDefaults (set by storePendingVoipCall).
    _killedAppPending = { callUUID, callType: _pendingCall?.callType ?? 'voice' };
    _pendingCall = null;
    try { RNCallKeep.endCall(callUUID); } catch (_) {}
    return;
  }

  // App was open/backgrounded — nav ready.
  const callType = _pendingCall?.callType ?? 'voice';
  const screen   = callType === 'video' ? 'VideoCallScreen' : 'VoiceCallScreen';
  _pendingCall   = null;
  try {
    rootNavigate(screen, { incomingCallId: callUUID });
    RNCallKeep.endCall(callUUID);
  } catch (_) {}
}

async function _onEnd({ callUUID }) {
  _pendingCall = null;
  _shownCallIds.delete(callUUID);
  unmarkCallKitActive(callUUID);

  // We called endCall() ourselves after answering — not a real decline, skip Firestore.
  // Do NOT clear _answeredCallId here; iOS may fire this event more than once for the
  // same UUID (e.g. system + our explicit endCall). Keep the guard active until the
  // call screen calls endCallKeep() which explicitly clears it via clearAnsweredCall().
  if (_answeredCallId === callUUID) {
    return;
  }

  // If the app is active when _onEnd fires, it means AppDelegate called endCall()
  // to silently dismiss the native CallKit UI — the in-app overlay is handling
  // ringing. This is not a real decline, so do not write 'rejected' to Firestore.
  if (AppState.currentState === 'active') {
    return;
  }

  // User declined from native CallKit UI — write rejected and clean up.
  if (PendingCallModule?.clearPendingVoipCall) {
    PendingCallModule.clearPendingVoipCall().catch(() => {});
  }

  try {
    await firestore().collection('calls').doc(callUUID).update({ status: 'rejected' });
  } catch (_) {}

}

export function clearAnsweredCall(callId) {
  if (_answeredCallId === callId) _answeredCallId = null;
}

function _onDisplay({ error }) {
  if (error) console.log('[CallKeep] display error:', error);
}