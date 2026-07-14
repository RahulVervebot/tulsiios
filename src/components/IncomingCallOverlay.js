import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Vibration,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InCallManager from 'react-native-incall-manager';

export default function IncomingCallOverlay({ navigationRef }) {
  const [myEmail,      setMyEmail]      = useState('');
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('callUserEmail').then(email => {
      if (email) setMyEmail(email);
    });
  }, []);

  // Start/stop ringtone and vibration based on incoming call state
  useEffect(() => {
    if (incomingCall) {
      try { InCallManager?.startRingtone?.('_DEFAULT_'); } catch (_) {}
      Vibration.vibrate([500, 1000, 500, 1000], true);
    } else {
      try { InCallManager?.stopRingtone?.(); } catch (_) {}
      Vibration.cancel();
    }
    return () => {
      try { InCallManager?.stopRingtone?.(); } catch (_) {}
      Vibration.cancel();
    };
  }, [incomingCall]);

  useEffect(() => {
    if (!myEmail) return;
    const unsub = firestore()
      .collection('calls')
      .where('calleeId', '==', myEmail)
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          if (
            data.status === 'calling' &&
            (data.type === 'voice' || data.type === 'video')
          ) {
            const currentRoute = navigationRef.current?.getCurrentRoute?.()?.name;
            if (currentRoute === 'VoiceCallScreen' || currentRoute === 'VideoCallScreen') return;
            setIncomingCall(prev => prev ?? { id: change.doc.id, ...data });
          }
        });
      }, () => {});
    return () => unsub();
  }, [myEmail]);

  const stopRinging = () => {
    try { InCallManager?.stopRingtone?.(); } catch (_) {}
    Vibration.cancel();
  };

  const acceptCall = () => {
    if (!incomingCall) return;
    stopRinging();
    const call = incomingCall;
    setIncomingCall(null);
    const screen = call.type === 'video' ? 'VideoCallScreen' : 'VoiceCallScreen';
    navigationRef.current?.navigate(screen, { incomingCall: call });
  };

  const declineCall = async () => {
    stopRinging();
    if (incomingCall) {
      try {
        await firestore().collection('calls').doc(incomingCall.id).update({ status: 'rejected' });
      } catch (_) {}
    }
    setIncomingCall(null);
  };

  if (!incomingCall) return null;

  const isVideo = incomingCall.type === 'video';

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Icon name={isVideo ? 'videocam' : 'call'} size={40} color="#fff" />
          </View>
          <Text style={styles.label}>
            Incoming {isVideo ? 'Video' : 'Voice'} Call
          </Text>
          <Text style={styles.callerName}>{incomingCall.callerName}</Text>
          <Text style={styles.callerEmail}>{incomingCall.callerEmail}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.declineBtn} onPress={declineCall}>
              <Icon name="call-end" size={28} color="#fff" />
              <Text style={styles.btnLabel}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={acceptCall}>
              <Icon name={isVideo ? 'videocam' : 'call'} size={28} color="#fff" />
              <Text style={styles.btnLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  callerName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  callerEmail: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 36,
  },
  actions: {
    flexDirection: 'row',
    gap: 48,
    justifyContent: 'center',
  },
  declineBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    position: 'absolute',
    bottom: -22,
  },
});
