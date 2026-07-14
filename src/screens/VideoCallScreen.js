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
  StatusBar,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InCallManager from 'react-native-incall-manager';
import AppHeader from '../components/AppHeader';
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

export default function VideoCallScreen({ route, navigation }) {

  const [myEmail, setMyEmail] = useState('');
  const [myName, setMyName] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [callStatus, setCallStatus] = useState(STATUS.IDLE);
  const [remoteUser, setRemoteUser] = useState(null);
  const [muted, setMuted] = useState(false);
  const [notifCall, setNotifCall] = useState(null);
  const [cameraOff, setCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [iceState, setIceState] = useState('');
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
      const [[, email], [, name]] = await AsyncStorage.multiGet([
        'callUserEmail', 'callUserName',
      ]);
      if (!email) {
        Alert.alert('Auth Error', 'No call identity found. Please login from the Contacts screen.');
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
      if (data?.status === 'calling' && data?.type === 'video') {
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
      const snap = await firestore().collection('callProfiles').get();
      const all = snap.docs.map((d) => ({ email: d.id, ...d.data() }));
      setUsers(all.filter((u) => u.email !== myEmail));
    } catch (e) {
      console.log('VideoCall: fetch users error', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const buildPC = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };
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

  const getVideoStream = async () => {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user', width: 640, height: 480 },
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  // ─── Outgoing call ────────────────────────────────────────────────────────
  const startCall = async (targetUser) => {
    try {
      const targetEmail = targetUser.email;
      if (!targetEmail) {
        Alert.alert('Unavailable', `${targetUser.name || targetUser.email} is not reachable for calls right now.`);
        return;
      }

      console.log('[VideoCall] startCall | caller:', myEmail, '| callee:', targetEmail);
      setRemoteUser(targetUser);
      setStatus(STATUS.CALLING);

      const stream = await getVideoStream();
      const pc = buildPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const callId = `vid_${Date.now()}`;
      const callRef = firestore().collection('calls').doc(callId);
      callDocRef.current = callRef;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) callRef.collection('callerCandidates').add(candidate.toJSON());
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await callRef.set({
        callerId: myEmail || '',
        callerEmail: myEmail || '',
        callerName: myName || myEmail || '',
        calleeId: targetEmail || '',
        calleeEmail: targetEmail || '',
        calleeName: targetUser.name || targetUser.email || '',
        type: 'video',
        status: 'calling',
        offer: { type: offer.type || '', sdp: offer.sdp || '' },
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // Listen for answer
      const unsub1 = callRef.onSnapshot(async (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.status === 'answered' && data.answer && !pc.remoteDescription) {
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
      sendCallPushNotification(targetEmail, myName || myEmail, 'video', callId).catch(() => {});
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
      setRemoteUser({ name: callData.callerName, email: callData.callerEmail || callData.callerId });
      setStatus(STATUS.RINGING);

      const stream = await getVideoStream();
      // Callee starts with camera off — they must turn it on manually
      stream.getVideoTracks().forEach((t) => { t.enabled = false; });
      setCameraOff(true);
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
    try { InCallManager?.stopRingtone?.(); } catch (_) {}
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

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCameraOff((c) => !c);
  };

  const flipCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t._switchCamera?.();
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
      <View style={[styles.callScreen, { backgroundColor: '#111827', justifyContent: 'space-between', paddingTop: 80, paddingBottom: 60, paddingHorizontal: 24 }]}>
        <View style={{ alignItems: 'center' }}>
          <View style={styles.callAvatar}>
            <Icon name="person" size={64} color="#fff" />
          </View>
          <Text style={styles.callName}>{notifCall.callerName}</Text>
          <Text style={styles.callEmail}>{notifCall.callerEmail || notifCall.callerId}</Text>
          <Text style={styles.callSubStatus}>Incoming Video Call</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' }}>
          <TouchableOpacity style={styles.endBtn} onPress={declineNotifCall}>
            <Icon name="call-end" size={30} color="#fff" />
            <Text style={styles.controlLabel}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.endBtn, { backgroundColor: '#16A34A' }]} onPress={acceptNotifCall}>
            <Icon name="videocam" size={30} color="#fff" />
            <Text style={styles.controlLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Active video call UI ─────────────────────────────────────────────────
  if (callStatus !== STATUS.IDLE) {
    return (
      <View style={styles.callScreen}>
        <StatusBar barStyle="light-content" />

        {/* Remote video (full screen) */}
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : (
          <View style={styles.noVideoPlaceholder}>
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
        )}

        {/* Status overlay when connected */}
        {callStatus === STATUS.CONNECTED && remoteStream && (
          <View style={styles.statusOverlay}>
            <Text style={styles.durationText}>{formatTime(callDuration)}</Text>
            {!!iceState && <Text style={styles.iceStateOverlay}>ICE: {iceState}</Text>}
          </View>
        )}

        {/* Local video (picture-in-picture) */}
        {localStream && !cameraOff && (
          <View style={styles.localVideoContainer}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              zOrder={1}
            />
          </View>
        )}

        {/* Controls */}
        <View style={styles.callControls}>
          <TouchableOpacity
            style={[styles.controlBtn, muted && styles.controlBtnOn]}
            onPress={toggleMute}
          >
            <Icon name={muted ? 'mic-off' : 'mic'} size={24} color="#fff" />
            <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.endBtn} onPress={() => endCall()}>
            <Icon name="call-end" size={30} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, cameraOff && styles.controlBtnOn]}
            onPress={toggleCamera}
          >
            <Icon name={cameraOff ? 'videocam-off' : 'videocam'} size={24} color="#fff" />
            <Text style={styles.controlLabel}>{cameraOff ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlBtn} onPress={flipCamera}>
            <Icon name="flip-camera-ios" size={24} color="#fff" />
            <Text style={styles.controlLabel}>Flip</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── User list UI ─────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <AppHeader Title="Video Call" backgroundType="color" backgroundValue="#319241" />

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
              <TouchableOpacity style={styles.videoCallBtn} onPress={() => startCall(item)}>
                <Icon name="videocam" size={22} color="#fff" />
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
  videoCallBtn: {
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

  // ─── Active video call screen ──────────────────────────────────────────
  callScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  noVideoPlaceholder: {
    flex: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
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
  statusOverlay: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  durationText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  iceStateOverlay: {
    marginTop: 4,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  localVideo: {
    flex: 1,
  },
  callControls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnOn: {
    backgroundColor: '#374151',
  },
  controlLabel: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    position: 'absolute',
    bottom: -20,
  },
  endBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
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
