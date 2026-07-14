import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InCallManager from 'react-native-incall-manager';
import AppHeader from '../components/AppHeader';
import { getPosUsers } from '../functions/users/function';
import { sendCallPushNotification } from '../config/OneSignalConfig';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

const STATUS = {
  IDLE: 'idle',
  CALLING: 'calling',
  RINGING: 'ringing',
  CONNECTED: 'connected',
};

export default function VoiceCallScreen({ route, navigation }) {
  const [myEmail, setMyEmail] = useState('');
  const [myName, setMyName] = useState('');

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [callStatus, setCallStatus] = useState(STATUS.IDLE);
  const [remoteUser, setRemoteUser] = useState(null);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [iceState, setIceState] = useState('');
  const [notifCall, setNotifCall] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const callDocRef = useRef(null);
  const timerRef = useRef(null);
  const unsubsRef = useRef([]);
  const callStatusRef = useRef(STATUS.IDLE);
  const autoCallFiredRef = useRef(false);

  const setStatus = (s) => {
    callStatusRef.current = s;
    setCallStatus(s);
  };

  useEffect(() => {
    const resolve = async () => {
      const email = await AsyncStorage.getItem('userEmail');
      const name = await AsyncStorage.getItem('userName');
      if (!email) {
        Alert.alert('Auth Error', 'No logged-in user found. Please log in again.');
        return;
      }
      setMyEmail(email);
      setMyName(name || email);
    };
    resolve();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  // Auto-start outgoing call when navigated from SupportScreen with a target user
  useEffect(() => {
    const target = route?.params?.outgoingUser;
    if (myEmail && target && !autoCallFiredRef.current) {
      autoCallFiredRef.current = true;
      startCall(target);
    }
  }, [myEmail]);

  // Auto-answer when navigated here from IncomingCallOverlay
  useEffect(() => {
    const call = route?.params?.incomingCall;
    if (call) answerCall(call);
  }, []);

  // Fetch call data when opened from a push notification (app was killed/backgrounded)
  useEffect(() => {
    const callId = route?.params?.incomingCallId;
    if (!callId) return;
    firestore().collection('calls').doc(callId).get().then((snap) => {
      const data = snap.data();
      if (data?.status === 'calling' && data?.type === 'voice') {
        setNotifCall({ id: callId, ...data });
      }
    }).catch(() => {});
  }, []);

  // Ring on the callee side when this screen is opened via push notification
  useEffect(() => {
    if (notifCall) {
      try { InCallManager?.startRingtone?.('_DEFAULT_'); } catch (_) {}
    } else {
      try { InCallManager?.stopRingtone?.(); } catch (_) {}
    }
    return () => { try { InCallManager?.stopRingtone?.(); } catch (_) {} };
  }, [notifCall]);

  useEffect(() => {
    if (callStatus === STATUS.CONNECTED) {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (callStatus === STATUS.IDLE) setCallDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  useEffect(() => {
    return () => cleanup();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const result = await getPosUsers();
      const all = result.users || [];
      setUsers(all.filter((u) => u.email !== myEmail));
    } catch (e) {
      console.log('VoiceCall: fetch users error', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const buildPC = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        endCall(false);
      }
      if (pc.connectionState === 'connected') {
        setStatus(STATUS.CONNECTED);
      }
    };
    return pc;
  };

  const getAudioStream = async () => {
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    try { InCallManager?.start({ media: 'audio' }); } catch (_) {}
    try { InCallManager?.setSpeakerphoneOn(false); } catch (_) {}
    setSpeakerOn(false);
    return stream;
  };

  // ─── Outgoing call ────────────────────────────────────────────────────────
  const startCall = async (targetUser) => {
    try {
      console.log('[VoiceCall] startCall | caller:', myEmail, '| callee:', targetUser.email);
      setRemoteUser(targetUser);
      setStatus(STATUS.CALLING);
      try { InCallManager?.startRingback?.('_DEFAULT_'); } catch (_) {}

      const stream = await getAudioStream();
      const pc = buildPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const callId = `${myEmail}_${targetUser.email}_${Date.now()}`;
      const callRef = firestore().collection('calls').doc(callId);
      callDocRef.current = callRef;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) callRef.collection('callerCandidates').add(candidate.toJSON());
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await callRef.set({
        callerId: myEmail || '',
        callerName: myName || myEmail || '',
        calleeId: targetUser.email || '',
        calleeName: targetUser.name || targetUser.email || '',
        type: 'voice',
        status: 'calling',
        offer: { type: offer.type || '', sdp: offer.sdp || '' },
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // Listen for answer
      const unsub1 = callRef.onSnapshot(async (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.status === 'answered' && data.answer && !pc.remoteDescription) {
          try { InCallManager?.stopRingback?.(); } catch (_) {}
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          setStatus(STATUS.CONNECTED);
        }
        if (data.status === 'ended' || data.status === 'rejected') {
          endCall(false);
        }
      });

      // Listen for callee ICE candidates
      const unsub2 = callRef.collection('calleeCandidates').onSnapshot((snap) => {
        snap.docChanges().forEach(async ({ type, doc }) => {
          if (type === 'added') {
            try { await pc.addIceCandidate(new RTCIceCandidate(doc.data())); } catch (_) {}
          }
        });
      });

      unsubsRef.current.push(unsub1, unsub2);
      sendCallPushNotification(targetUser.email, myName || myEmail, 'voice', callId).catch(() => {});
    } catch (e) {
      Alert.alert('Error', 'Could not start call: ' + e.message);
      setStatus(STATUS.IDLE);
      setRemoteUser(null);
      cleanup();
    }
  };

  // ─── Incoming call ────────────────────────────────────────────────────────
  const answerCall = async (callData) => {
    if (!callData) return;
    try {
      setRemoteUser({ name: callData.callerName, email: callData.callerId });
      setStatus(STATUS.RINGING);

      const stream = await getAudioStream();
      const pc = buildPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const callRef = firestore().collection('calls').doc(callData.id);
      callDocRef.current = callRef;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) callRef.collection('calleeCandidates').add(candidate.toJSON());
      };

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await callRef.update({
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'answered',
      });

      // Listen for caller ICE candidates
      const unsub = callRef.collection('callerCandidates').onSnapshot((snap) => {
        snap.docChanges().forEach(async ({ type, doc }) => {
          if (type === 'added') {
            try { await pc.addIceCandidate(new RTCIceCandidate(doc.data())); } catch (_) {}
          }
        });
      });

      // Watch for remote end/reject so callee disconnects immediately
      const unsubStatus = callRef.onSnapshot((snap) => {
        const data = snap.data();
        if (data?.status === 'ended' || data?.status === 'rejected') {
          endCall(false);
        }
      });

      unsubsRef.current.push(unsub, unsubStatus);
    } catch (e) {
      Alert.alert('Error', 'Could not answer: ' + e.message);
    }
  };

  const endCall = async (updateDb = true) => {
    if (updateDb && callDocRef.current) {
      try { await callDocRef.current.update({ status: 'ended' }); } catch (_) {}
    }
    cleanup();
    try { InCallManager?.stopRingback?.(); } catch (_) {}
    try { InCallManager?.stopRingtone?.(); } catch (_) {}
    try { InCallManager?.stop(); } catch (_) {}
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('SupportScreen');
    }
  };

  const cleanup = () => {
    unsubsRef.current.forEach((u) => u?.());
    unsubsRef.current = [];
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    callDocRef.current = null;
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMuted((m) => !m);
  };

  const acceptNotifCall = () => {
    const call = notifCall;
    setNotifCall(null);
    answerCall(call);
  };

  const declineNotifCall = async () => {
    try { InCallManager?.stopRingtone?.(); } catch (_) {}
    if (notifCall) {
      try { await firestore().collection('calls').doc(notifCall.id).update({ status: 'rejected' }); } catch (_) {}
      setNotifCall(null);
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('SupportScreen');
    }
  };

  const toggleSpeaker = () => {
    setSpeakerOn((s) => {
      try { InCallManager?.setSpeakerphoneOn(!s); } catch (_) {}
      return !s;
    });
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  // ─── Incoming call from notification (app was killed/backgrounded) ──────────
  if (notifCall) {
    return (
      <View style={styles.callScreen}>
        <View style={styles.callInfo}>
          <View style={styles.callAvatar}>
            <Icon name="person" size={64} color="#fff" />
          </View>
          <Text style={styles.callName}>{notifCall.callerName}</Text>
          <Text style={styles.callEmail}>{notifCall.callerId}</Text>
          <Text style={styles.callSubStatus}>Incoming Voice Call</Text>
        </View>
        <View style={styles.callButtons}>
          <TouchableOpacity style={styles.endBtn} onPress={declineNotifCall}>
            <Icon name="call-end" size={30} color="#fff" />
            <Text style={styles.actionLabel}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.endBtn, { backgroundColor: '#16A34A' }]} onPress={acceptNotifCall}>
            <Icon name="call" size={30} color="#fff" />
            <Text style={styles.actionLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Active call UI ───────────────────────────────────────────────────────
  if (callStatus !== STATUS.IDLE) {
    return (
      <View style={styles.callScreen}>
        <View style={styles.callInfo}>
          <View style={styles.callAvatar}>
            <Icon name="person" size={64} color="#fff" />
          </View>
          <Text style={styles.callName}>{remoteUser?.name || remoteUser?.email}</Text>
          <Text style={styles.callEmail}>{remoteUser?.email}</Text>
          <Text style={styles.callSubStatus}>
            {callStatus === STATUS.CALLING && 'Calling...'}
            {callStatus === STATUS.RINGING && 'Connecting...'}
            {callStatus === STATUS.CONNECTED && formatTime(callDuration)}
          </Text>
          {!!iceState && (
            <Text style={styles.iceStateText}>ICE: {iceState}</Text>
          )}
        </View>

        <View style={styles.callButtons}>
          <TouchableOpacity
            style={[styles.actionBtn, muted && styles.actionBtnOn]}
            onPress={toggleMute}
          >
            <Icon name={muted ? 'mic-off' : 'mic'} size={26} color="#fff" />
            <Text style={styles.actionLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.endBtn} onPress={() => endCall()}>
            <Icon name="call-end" size={30} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, speakerOn && styles.actionBtnOn]}
            onPress={toggleSpeaker}
          >
            <Icon name={speakerOn ? 'volume-up' : 'volume-down'} size={26} color="#fff" />
            <Text style={styles.actionLabel}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── User list UI ─────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <AppHeader Title="Voice Call" backgroundType="color" backgroundValue="#319241" />

      {/* Debug: shows the ID this device is listening on */}
      <View style={styles.debugBar}>
        <Icon name="info-outline" size={14} color="#6B7280" />
        <Text style={styles.debugText} numberOfLines={1}>
          My ID: {myEmail || '— loading —'}
        </Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {loadingUsers ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#319241" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => String(item.id || item.email)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <View style={styles.userAvatar}>
                <Icon name="person" size={26} color="#319241" />
              </View>
              <View style={styles.userMeta}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              <TouchableOpacity style={styles.callBtn} onPress={() => startCall(item)}>
                <Icon name="call" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="people" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 15,
    color: '#9CA3AF',
  },
  debugBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FEF9C3',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  debugText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 30,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#6B7280',
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#319241',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  // ─── Incoming call modal ───────────────────────────────────────────────
  incomingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  incomingCard: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  incomingAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  incomingLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  incomingName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  incomingEmail: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 32,
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 48,
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  acceptBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingBtnLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    position: 'absolute',
    bottom: -22,
  },

  // ─── Active call screen ────────────────────────────────────────────────
  callScreen: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 24,
  },
  callInfo: {
    alignItems: 'center',
  },
  callAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  callName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  callEmail: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  callSubStatus: {
    fontSize: 16,
    color: '#6EE7B7',
    fontWeight: '500',
  },
  iceStateText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  callButtons: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  actionBtnOn: {
    backgroundColor: '#374151',
  },
  actionLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    position: 'absolute',
    bottom: -20,
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#DC2626',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
