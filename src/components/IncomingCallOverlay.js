import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Vibration, Modal, AppState,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InCallManager from 'react-native-incall-manager';
import { isCallKitActive } from '../config/CallKitState';
import { rootNavigate } from '../config/RootNavigation';

export default function IncomingCallOverlay({ navigationRef }) {
  const [myEmail, setMyEmail] = useState('');
  const [ringingCall, setRingingCall] = useState(null);
  const shownRef = useRef(new Set());
  const confAlertShownRef = useRef(new Set());
  const ringingCallRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('callUserEmail').then((email) => {
      if (email) setMyEmail(email);
    });
  }, []);

  // ─── 1-to-1 call listener ─────────────────────────────────────────────────
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

          // Dismiss our in-app UI if the call is ended/rejected remotely
          if (change.type === 'modified') {
            if (
              (data.status === 'ended' || data.status === 'rejected') &&
              ringingCallRef.current?.callId === docId
            ) {
              dismissRinging();
            }
            return;
          }

          if (change.type !== 'added') return;
          if (shownRef.current.has(docId)) return;
          if (data.status !== 'calling') return;
          if (data.type !== 'voice' && data.type !== 'video') return;

          const createdMs = data.createdAt?.toMillis?.() ?? 0;
          if (createdMs && subscribeTime - createdMs > 30000) return;

          // Already on a call screen — don't interrupt
          const currentRoute = navigationRef.current?.getCurrentRoute?.()?.name;
          if (
            currentRoute === 'VoiceCallScreen' ||
            currentRoute === 'VideoCallScreen' ||
            currentRoute === 'ConferenceCallScreen'
          ) return;

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
          if (
            currentRoute === 'VoiceCallScreen' ||
            currentRoute === 'VideoCallScreen' ||
            currentRoute === 'ConferenceCallScreen'
          ) return;

          confAlertShownRef.current.add(roomId);

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

  const dismissRinging = () => {
    ringingCallRef.current = null;
    setRingingCall(null);
    try { InCallManager.stopRingtone(); } catch (_) {}
    Vibration.cancel();
  };

  const handleDecline = async () => {
    const call = ringingCallRef.current;
    dismissRinging();
    if (!call || call.isConference) return;
    try {
      await firestore().collection('calls').doc(call.callId).update({ status: 'rejected' });
    } catch (_) {}
  };

  const handleAccept = () => {
    const call = ringingCallRef.current;
    dismissRinging();
    if (!call) return;

    const screen = call.isConference
      ? 'ConferenceCallScreen'
      : call.callType === 'video' ? 'VideoCallScreen' : 'VoiceCallScreen';
    const params = call.isConference
      ? { roomId: call.callId, isCreator: false, callType: call.callData?.callType || 'video' }
      : { incomingCallId: call.callId };
    rootNavigate(screen, params);
  };

  if (!ringingCall) return null;

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
});
