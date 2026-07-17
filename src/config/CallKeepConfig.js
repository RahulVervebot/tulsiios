import RNCallKeep from 'react-native-callkeep';
import firestore from '@react-native-firebase/firestore';

// Holds the navigation ref set by App.js
let _navigationRef = null;
// Pending call data populated when a VoIP push / Firestore event arrives
let _pendingCall   = null; // { callId, callerId, callerName, callerEmail, callType }

export const setCallKeepNav = (ref) => { _navigationRef = ref; };

export async function initCallKeep() {
  try {
    await RNCallKeep.setup({
      ios: {
        appName:       'Tulsi',
        supportsVideo: true,
      },
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

  RNCallKeep.addEventListener('answerCall',             _onAnswer);
  RNCallKeep.addEventListener('endCall',                _onEnd);
  RNCallKeep.addEventListener('didDisplayIncomingCall', _onDisplay);
}

export function destroyCallKeep() {
  RNCallKeep.removeEventListener('answerCall');
  RNCallKeep.removeEventListener('endCall');
  RNCallKeep.removeEventListener('didDisplayIncomingCall');
}

// Called by IncomingCallOverlay (Firestore trigger) and VoIP push handler (App.js)
export function displayIncomingCall(callData) {
  _pendingCall = callData;
  console.log('[CallKeep] displayIncomingCall:', callData.callId, callData.callerName);
  try {
    RNCallKeep.displayIncomingCall(
      callData.callId,
      callData.callerEmail || callData.callerId || 'unknown',
      callData.callerName  || callData.callerId || 'Incoming Call',
      'generic',
      callData.callType === 'video',
    );
  } catch (e) {
    console.log('[CallKeep] displayIncomingCall error:', e?.message);
  }
}

// Call this from VoiceCallScreen / VideoCallScreen once WebRTC is connected
export function reportCallActive(callId) {
  try { RNCallKeep.setCurrentCallActive(callId); } catch (_) {}
}

// Call this from endCall in VoiceCallScreen / VideoCallScreen
export function endCallKeep(callId) {
  try { RNCallKeep.endCall(callId); } catch (_) {}
}

// ─── private event handlers ───────────────────────────────────────────────────

function _onAnswer({ callUUID }) {
  const call = _pendingCall;
  if (!call) return;
  _pendingCall = null;
  RNCallKeep.setCurrentCallActive(callUUID);
  const screen = call.callType === 'video' ? 'VideoCallScreen' : 'VoiceCallScreen';
  // Use reset so the call screen is always on top regardless of current nav state.
  _navigationRef?.current?.reset({
    index: 1,
    routes: [
      { name: 'MainDrawer' },
      { name: screen, params: { incomingCall: call } },
    ],
  });
}

async function _onEnd({ callUUID }) {
  const call = _pendingCall;
  _pendingCall = null;
  if (call?.callId) {
    try {
      await firestore().collection('calls').doc(call.callId).update({ status: 'rejected' });
    } catch (_) {}
  }
}

function _onDisplay({ error }) {
  if (error) console.log('[CallKeep] display error:', error);
}
