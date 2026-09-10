import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Vibration, Modal, AppState, DeviceEventEmitter,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InCallManager from 'react-native-incall-manager';
import { isCallKitActive } from '../config/CallKitState';
import { rootNavigate } from '../config/RootNavigation';
import { endCallKeep } from '../config/CallKeepConfig';
import { sendMissedCallPushNotification } from '../config/OneSignalConfig';

export default function IncomingCallOverlay({ navigationRef }) {
  const [myEmail, setMyEmail] = useState('');
  const [ringingCall, setRingingCall] = useState(null);
  const [callToast, setCallToast] = useState(null);
  const shownRef = useRef(new Set());
  const confAlertShownRef = useRef(new Set());
  const ringingCallRef = useRef(null);
  const toastTimerRef = useRef(null);
  
  const showCallToast = (text) => {
    clearTimeout(toastTimerRef.current);
    setCallToast(text);
    toastTimerRef.current = setTimeout(() => setCallToast(null), 4000);
  };

  useEffect(() => {
    const loadEmail = () => {
      AsyncStorage.getItem('callUserEmail').then((email) => {
        setMyEmail(email || '');
        console.log("incoming email", email);
      });
    };
    loadEmail();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadEmail();
    });
    const logoutSub = DeviceEventEmitter.addListener('userLoggedOut', () => setMyEmail(''));
    return () => {
      appStateSub.remove();
      logoutSub.remove();
    };
  }, []);

  // ────────────────────────────────────────── 1-to-1 call listener ─────────────────────────────────────────────────
  useEffect(() => {
    if (!myEmail) return;
    const subscribeTime = Date.now();
    const unsub = firestore()
      .collection('calls')
      .where('calleeId', '==', myEmail)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          // Dismiss our in-app UI if the call is ended/rejected/cancelled remotely
          if (change.type === 'modified') {
            // Call was answered — clear shownRef so we never send a missed call push
            // when it ends normally later.
            if (data.status === 'answered') {
              shownRef.current.delete(docId);
              return;
            }
            const isOver = data.status === 'ended' || data.status === 'rejected' || data.status === 'cancelled';
            if (isOver) {
              const stillRinging = ringingCallRef.current?.callId === docId;
              const wasShown = shownRef.current.has(docId);
              if (stillRinging || wasShown) {
                // Only send missed call push if the overlay was still ringing (never answered).
                if (stillRinging && (data.status === 'ended' || data.status === 'cancelled')) {
                  const callerName = data.callerName || data.callerEmail || 'Someone';
                  const callType = data.type === 'video' ? 'video' : 'voice';
                  sendMissedCallPushNotification(myEmail, callerName, callType).catch(() => {});
                }
                dismissRinging(docId, { endNative: true });
                shownRef.current.delete(docId);
              }
            }
            return;
          }
          if (change.type !== 'added') return;
          // If the call was already ended before we processed the added event, skip it
          if (data.status === 'ended' || data.status === 'rejected' || data.status === 'cancelled') return;
          if (shownRef.current.has(docId)) return;
          if (data.status !== 'calling') return;
          if (data.type !== 'voice' && data.type !== 'video') return;
          const createdMs = data.createdAt?.toMillis?.() ?? 0;
          if (createdMs && subscribeTime - createdMs > 30000) return;
          // Already on a call screen — don't interrupt with the ringing modal, but let
          // the busy user know someone tried to reach them via a brief toast.
          const currentRoute = navigationRef.current?.getCurrentRoute?.()?.name;
          if (
            currentRoute === 'VoiceCallScreen' ||
            currentRoute === 'VideoCallScreen' ||
            currentRoute === 'ConferenceCallScreen'
          ) {
            if (data.status === 'calling' && !data.missedBusy) {
              shownRef.current.add(docId);
              const callerName = data.callerName || data.callerEmail || data.callerId || 'Someone';
              showCallToast(`${callerName} is calling you…`);
            }
            return;
          }
          shownRef.current.add(docId);
          // When app is backgrounded/killed, CallKit native screen is visible — don't show
          // our in-app modal on top of it. When app is active, CallKit has no visible UI
          // so we must show our modal so the user can answer.
          const appIsActive = AppState.currentState === 'active';
          if (!appIsActive && isCallKitActive(docId)) return;
          // App is foregrounded — show our in-app ringing modal
          const incoming = {
            callId: docId,
            callerName: data.callerName || data.callerEmail || data.callerId || 'Unknown',
            callerEmail: data.callerEmail || data.callerId || '',
            callType: data.type,
          };
          ringingCallRef.current = incoming;
          setRingingCall(incoming);
          try { InCallManager.startRingtone('_BUNDLE_'); } catch (_) {}
          Vibration.vibrate([0, 1000, 500], true);
        });
      }, (e) => console.log('[IncomingCall] snapshot error:', e?.message));

    return () => unsub();
  }, [myEmail]);

  // ─── Conference call listener ──────────────────────────────────────────────
  useEffect(() => {
    if (!myEmail) return;
    const subscribeTime = Date.now();
    const unsub = firestore()
      .collection('conferenceCalls')
      .where('status', '==', 'active')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const roomId = change.doc.id;
          const data = change.doc.data();
          if (confAlertShownRef.current.has(roomId)) return;
          const participants = data.participants || [];
          const isInvited = participants.some((p) => p.email === myEmail);
          if (!isInvited) return;
          if (data.createdBy === myEmail) return;
          const createdMs = data.createdAt?.toMillis?.() ?? 0;
          if (createdMs && subscribeTime - createdMs > 45000) return;
          const currentRoute = navigationRef.current?.getCurrentRoute?.()?.name;
          // Already in a conference — don't interrupt with another one.
          if (currentRoute === 'ConferenceCallScreen') return;
          confAlertShownRef.current.add(roomId);
          // Already on a 1:1 call screen — this conference invite is very likely the
          // other party upgrading that same call into a group call (VideoCallScreen's
          // inviteParticipant ends the 1:1 call and creates this room). Auto-join rather
          // than showing a modal, so the original call partner lands in the conference
          // instead of just getting dropped back to MainDrawer with no way in.
          if (currentRoute === 'VoiceCallScreen' || currentRoute === 'VideoCallScreen') {
            rootNavigate('ConferenceCallScreen', {
              roomId,
              isCreator: false,
              callType: data.callType || 'video',
            });
            return;
          }
          const callerName = data.createdByName || data.createdBy || 'Someone';
          const callTypeLabel = data.callType === 'voice' ? 'Group Voice' : 'Group Video';
          const incoming = {
            callId: roomId,
            callerName,
            callerEmail: data.createdBy || '',
            callType: data.callType === 'voice' ? 'conference_voice' : 'conference_video',
            callData: data,
            isConference: true,
            callTypeLabel,
          };
          ringingCallRef.current = incoming;
          setRingingCall(incoming);
          try { InCallManager.startRingtone('_BUNDLE_'); } catch (_) {}
          Vibration.vibrate([0, 1000, 500], true);
        });
      }, (e) => console.log('[IncomingConf] snapshot error:', e?.message));
    return () => unsub();
  }, [myEmail]);

  const dismissRinging = (callId, { endNative = false } = {}) => {
    ringingCallRef.current = null;
    setRingingCall(null);
    try { InCallManager.stopRingtone(); } catch (_) {}
    Vibration.cancel();
    if (endNative && callId) {
      try { endCallKeep(callId); } catch (_) {}
    }
  };

  const handleDecline = async () => {
    const call = ringingCallRef.current;
    dismissRinging(call?.callId, { endNative: true });
    if (!call || call.isConference) return;
    try {
      await firestore().collection('calls').doc(call.callId).update({ status: 'rejected' });
    } catch (_) {}
  };

  const handleAccept = () => {
    const call = ringingCallRef.current;
    if (call?.callId) shownRef.current.delete(call.callId);
    dismissRinging(call?.callId, { endNative: false });
    if (!call) return;

    const screen = call.isConference
      ? 'ConferenceCallScreen'
      : call.callType === 'video' ? 'VideoCallScreen' : 'VoiceCallScreen';
    const params = call.isConference
      ? { roomId: call.callId, isCreator: false, callType: call.callData?.callType || 'video' }
      : { incomingCallId: call.callId };
    rootNavigate(screen, params);
  };

  if (!ringingCall) {
    if (!callToast) return null;
    return (
      <View style={styles.toastWrap} pointerEvents="none">
        <View style={styles.toastCard}>
          <Icon name="call" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.toastText} numberOfLines={1}>{callToast}</Text>
        </View>
      </View>
    );
  }

  const isVideo = ringingCall.callType === 'video' || ringingCall.callType === 'conference_video';
  const label = ringingCall.isConference
    ? `Incoming ${ringingCall.callTypeLabel} Call`
    : `Incoming ${isVideo ? 'Video' : 'Voice'} Call`;
  
  return (
    <Modal
      transparent
      animationType="slide"
      visible={!!ringingCall}
      onRequestClose={handleDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Icon name={isVideo ? 'videocam' : 'call'} size={36} color="#fff" />
          </View>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.name}>{ringingCall.callerName}</Text>
          <Text style={styles.email}>{ringingCall.callerEmail}</Text>

          <View style={styles.actions}>
            <View style={styles.actionWrap}>
              <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
                <Icon name="call-end" size={32} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Decline</Text>
            </View>

            <View style={styles.actionWrap}>
              <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
                <Icon name={isVideo ? 'videocam' : 'call'} size={32} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 40,
  },
  actions: {
    flexDirection: 'row',
    gap: 64,
    justifyContent: 'center',
  },
  actionWrap: {
    alignItems: 'center',
    gap: 10,
  },
  declineBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  toastWrap: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});