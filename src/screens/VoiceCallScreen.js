import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AppState,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
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
import { useFocusEffect } from '@react-navigation/native';
import { sendMissedCallPushNotification } from '../config/OneSignalConfig';
import { useActiveCall } from '../context/ActiveCallContext';
import { reportCallActive, endCallKeep, clearAnsweredCall } from '../config/CallKeepConfig';

const makeUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

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
  const [callStatus, setCallStatus] = useState(STATUS.IDLE);
  const [remoteUser, setRemoteUser] = useState(null);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [iceState, setIceState] = useState('');
  const [callSubLabel, setCallSubLabel] = useState('');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addUsers, setAddUsers] = useState([]);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const callDocRef = useRef(null);
  const timerRef = useRef(null);
  const forwardTimerRef = useRef(null);
  const endTimerRef = useRef(null);
  const unsubsRef = useRef([]);
  const callStatusRef = useRef(STATUS.IDLE);
  const autoCallFiredRef = useRef(false);
  const endCallFiredRef = useRef(false);
  const remoteUserRef = useRef(null);
  const activeCallIdRef = useRef(null);
  const callRoleRef = useRef(null); // 'caller' | 'callee'
  const callWasConnectedRef = useRef(false);
  const { setActiveCall, setMiniDuration } = useActiveCall();

  const setStatus = (s) => {
    callStatusRef.current = s;
    setCallStatus(s);
    if (s === STATUS.IDLE) {
      setActiveCall(null);
    } else {
      setActiveCall({
        screen: 'VoiceCallScreen',
        label: remoteUserRef.current
          ? `Voice call with ${remoteUserRef.current.name || remoteUserRef.current.email}`
          : 'Voice Call',
        callId: activeCallIdRef.current,
        params: activeCallIdRef.current
          ? { incomingCallId: activeCallIdRef.current }
          : {},
      });
    }
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

  // Auto-start outgoing call when navigated from SupportScreen with a target user
  useEffect(() => {
    const target = route?.params?.outgoingUser;
    if (myEmail && target && !autoCallFiredRef.current) {
      autoCallFiredRef.current = true;
      startCall(target);
    }
  }, [myEmail]);

  // Auto-answer when navigated here from CallKeep (incomingCall only has callId/callerName)
  // Must fetch offer + full data from Firestore before calling answerCall.

  useEffect(() => {
    const call = route?.params?.incomingCall;
    if (!call?.callId) return;
    if (callStatusRef.current !== STATUS.IDLE) {
      // Already in a call — reject new call as busy
      firestore().collection('calls').doc(call.callId).update({ status: 'busy' }).catch(() => {});
      return;
    }
    firestore().collection('calls').doc(call.callId).get()
      .then((snap) => {
        const data = snap.data();
        if (!data || data.status === 'ended' || data.status === 'rejected' || data.status === 'cancelled') return;
        answerCall({ id: call.callId, ...data });
      })
      .catch((e) => Alert.alert('Error', 'Could not load call: ' + e.message));
  }, []);

  const incomingCallId = route?.params?.incomingCallId;
  useEffect(() => {
    if (!incomingCallId) return;
    if (callStatusRef.current !== STATUS.IDLE) {
      // Already in a call — reject new call as busy
      firestore().collection('calls').doc(incomingCallId).update({ status: 'busy' }).catch(() => {});
      return;
    }

    // Show connecting UI immediately with a placeholder name while we fetch call data
    setStatus(STATUS.RINGING);
    firestore().collection('calls').doc(incomingCallId).get().then((snap) => {
      const data = snap.data();
      if (!data || data.status === 'ended' || data.status === 'rejected') {
        setStatus(STATUS.IDLE);
        return;
      }

      // Show caller info immediately so the placeholder isn't blank during WebRTC setup
      const ru = { name: data.callerName, email: data.callerEmail || data.callerId };
      remoteUserRef.current = ru;
      setRemoteUser(ru);
      answerCall({ id: incomingCallId, ...data });
    }).catch(() => setStatus(STATUS.IDLE));
  }, [incomingCallId]);

  useEffect(() => {
    if (callStatus === STATUS.CONNECTED) {
      timerRef.current = setInterval(() => setCallDuration((d) => { setMiniDuration(d + 1); return d + 1; }), 1000);
    } else {
      clearInterval(timerRef.current);
      if (callStatus === STATUS.IDLE) setCallDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', () => {});
    return () => {
      sub.remove();
      if (callStatusRef.current === STATUS.IDLE) cleanup();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (callStatusRef.current === STATUS.IDLE) return;
      try { InCallManager?.start({ media: 'audio' }); } catch (_) {}
      try { InCallManager?.setSpeakerphoneOn(speakerOn); } catch (_) {}
    }, [speakerOn])
  );

  const buildPC = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        callWasConnectedRef.current = true;
        setStatus(STATUS.CONNECTED);
        if (activeCallIdRef.current) reportCallActive(activeCallIdRef.current);
      } else if (pc.connectionState === 'failed') {
        // Terminal failure — end the call
        endCall(false);
      }
      // 'disconnected' is transient on mobile networks — we intentionally ignore it.
      // 'closed' is triggered by our own pc.close() inside cleanup(), so ignore it too.
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
      const targetEmail = targetUser.email;
      if (!targetEmail) {
        Alert.alert('Unavailable', `${targetUser.name || targetUser.email} is not reachable for calls right now.`);
        return;
      }

      // ── Busy check: callee already in an answered call ──────────────────
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activeCalls = await firestore()
          .collection('calls')
          .where('calleeEmail', '==', targetEmail)
          .where('status', '==', 'answered')
          .where('createdAt', '>=', fiveMinAgo)
          .get({ source: 'server' });
        // Exclude calls where I am the caller (my own just-ended call)
        const trulyBusy = activeCalls.docs.filter(
          (d) => d.data().callerEmail !== myEmail,
        );
        if (trulyBusy.length > 0) {
          // Write a missed-call record so the busy user sees it in their history
          firestore().collection('calls').add({
            callerId:    myEmail,
            callerEmail: myEmail,
            callerName:  myName,
            calleeId:    targetEmail,
            calleeEmail: targetEmail,
            calleeName:  targetUser.name || targetEmail,
            type:        'voice',
            status:      'calling',
            missedBusy:  true,
            createdAt:   firestore.FieldValue.serverTimestamp(),
          }).catch(() => {});
          Alert.alert('User Busy', `${targetUser.name || targetEmail} is currently on another call.`);
          navigation.reset({ index: 0, routes: [{ name: 'MainDrawer' }] });
          return;
        }
      } catch (_) {}

      console.log('[VoiceCall] startCall | caller:', myEmail, '| callee:', targetEmail);
      callRoleRef.current = 'caller';
      remoteUserRef.current = targetUser;
      setRemoteUser(targetUser);
      setStatus(STATUS.CALLING);
      try { InCallManager?.startRingback?.('_DEFAULT_'); } catch (_) {}

      const stream = await getAudioStream();
      const pc = buildPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const callId = makeUUID();
      activeCallIdRef.current = callId;
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
        type: 'voice',
        status: 'calling',
        offer: { type: offer.type || '', sdp: offer.sdp || '' },
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // Listen for answer / reject / busy
      const unsub1 = callRef.onSnapshot(async (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.status === 'answered' && data.answer && !pc.remoteDescription) {
          clearCallTimers();
          setCallSubLabel('');
          callWasConnectedRef.current = true; // guard: answered = never send missed call
          try { InCallManager?.stopRingback?.(); } catch (_) {}
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          setStatus(STATUS.CONNECTED);
        }
        if (data.status === 'ended' || data.status === 'rejected') {
          endCall(false);
        }
        if (data.status === 'busy') {
          clearCallTimers();
          Alert.alert('User Busy', `${remoteUserRef.current?.name || targetEmail} is currently on another call.`);
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
      // sendCallPushNotification(targetEmail, myName || myEmail, 'voice', callId).catch(() => {});

      // ── Forward after 30s if agent hasn't answered ───────────────────────
      forwardTimerRef.current = setTimeout(async () => {
        if (callStatusRef.current !== STATUS.CALLING) return;
        try {
          const storeDoc = await firestore().collection('tulsi').doc('storelist').get();
          const supervisorList = storeDoc.data()?.supervisor || [];
          if (!supervisorList.length) return;
          const supervisor = supervisorList[0];
          // Look up supervisor name from callProfiles
          const supProfile = await firestore().collection('callProfiles').doc(supervisor).get();
          const supName = supProfile.data()?.name || supervisor;
          const supUser = { email: supervisor, name: supName };
          remoteUserRef.current = supUser;
          setRemoteUser(supUser);
          setCallSubLabel('Forwarding to supervisor…');
          await callRef.update({
            calleeEmail: supervisor,
            calleeId: supervisor,
            calleeName: supName,
            forwardedFrom: targetEmail,
            forwardedAt: firestore.FieldValue.serverTimestamp(),
          });
          // sendCallPushNotification(supervisor, myName || myEmail, 'voice', callId).catch(() => {});
        } catch (_) {}
      }, 30_000);

      // ── Auto-end after 60s if nobody answered ───────────────────────────
      endTimerRef.current = setTimeout(() => {
        if (callStatusRef.current === STATUS.CALLING) {
          endCall(true);
        }
      }, 60_000);

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
      callRoleRef.current = 'callee';
      const ru = { name: callData.callerName, email: callData.callerEmail || callData.callerId };
      remoteUserRef.current = ru;
      setRemoteUser(ru);
      setStatus(STATUS.RINGING);

      const stream = await getAudioStream();
      const pc = buildPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      activeCallIdRef.current = callData.id;
      const callRef = firestore().collection('calls').doc(callData.id);
      callDocRef.current = callRef;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) callRef.collection('calleeCandidates').add(candidate.toJSON());
      };

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Check if caller cancelled while we were setting up WebRTC
      const freshSnap = await callRef.get({ source: 'server' }).catch(() => null);
      const freshStatus = freshSnap?.data()?.status;
      if (freshStatus === 'ended' || freshStatus === 'rejected' || freshStatus === 'cancelled') {
        endCall(false);
        return;
      }

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
        if (data?.status === 'ended' || data?.status === 'rejected' || data?.status === 'cancelled') {
          endCall(false);
        }
      });

      unsubsRef.current.push(unsub, unsubStatus);
    } catch (e) {
      Alert.alert('Error', 'Could not answer: ' + e.message);
    }
  };

  const endCall = async (updateDb = true) => {
    if (endCallFiredRef.current) return;
    endCallFiredRef.current = true;
    const wasCalling = callStatusRef.current === STATUS.CALLING;
    const calleeEmail = remoteUserRef.current?.email;
    const callId = activeCallIdRef.current;
    setActiveCall(null);
    if (updateDb && callDocRef.current) {
      try { await callDocRef.current.update({ status: 'ended' }); } catch (_) {}
    }
    cleanup();
    if (callId) { clearAnsweredCall(callId); endCallKeep(callId); }
    try { InCallManager?.stopRingback?.(); } catch (_) {}
    try { InCallManager?.stop(); } catch (_) {}
    if (wasCalling && callRoleRef.current === 'caller' && calleeEmail && !callWasConnectedRef.current) {
      sendMissedCallPushNotification(calleeEmail, myName || myEmail, 'voice').catch(() => {});
    }
    setStatus(STATUS.IDLE);
    navigation.reset({ index: 0, routes: [{ name: 'MainDrawer' }] });
  };

  const clearCallTimers = () => {
    clearTimeout(forwardTimerRef.current);
    clearTimeout(endTimerRef.current);
    forwardTimerRef.current = null;
    endTimerRef.current = null;
  };

  const cleanup = () => {
    clearCallTimers();
    unsubsRef.current.forEach((u) => u?.());
    unsubsRef.current = [];
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    callDocRef.current = null;
    callWasConnectedRef.current = false;
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMuted((m) => !m);
  };

  const toggleSpeaker = () => {
    setSpeakerOn((s) => {
      try { InCallManager?.setSpeakerphoneOn(!s); } catch (_) {}
      return !s;
    });
  };

  const openAddSheet = async () => {
    try {
      const userRole = await AsyncStorage.getItem('userRole');
      const isAgent = userRole === 'Agent';

      const [storeDoc, profilesSnap] = await Promise.all([
        firestore().collection('tulsi').doc('storelist').get(),
        firestore().collection('callProfiles').get(),
      ]);
      const agentList = storeDoc.data()?.Agent || [];

      let all = profilesSnap.docs.map((d) => ({ ...d.data(), email: d.id }));

      if (!isAgent) {
        // Non-agents: only allowed to call agents (same as SupportScreen contacts tab)
        all = all.filter((u) => agentList.includes(u.email));
      }

      const filtered = all.filter((u) => {
        if (u.email === myEmail) return false;
        if (remoteUserRef.current && u.email === remoteUserRef.current.email) return false;
        return true;
      });
      setAddUsers(filtered);
    } catch (_) {}
    setAddSearch('');
    setShowAddSheet(true);
  };

  const inviteParticipant = async (invitee) => {
    if (addingParticipant) return;
    setAddingParticipant(true);
    try {
      const me = { email: myEmail, name: myName || myEmail };
      const other = remoteUserRef.current
        ? { email: remoteUserRef.current.email, name: remoteUserRef.current.name || remoteUserRef.current.email }
        : null;
      const guest = { email: invitee.email, name: invitee.name || invitee.email };

      const roomId = makeUUID();
      const allParticipants = [me, ...(other ? [other] : []), guest];

      await firestore().collection('conferenceCalls').doc(roomId).set({
        createdBy:     me.email,
        createdByName: me.name,
        participants:  allParticipants,
        status:        'active',
        callType:      'voice',
        createdAt:     firestore.FieldValue.serverTimestamp(),
      });

      if (callDocRef.current) {
        try { await callDocRef.current.update({ status: 'ended' }); } catch (_) {}
      }

      // sendCallPushNotification(guest.email, me.name, 'conference_voice', roomId).catch(() => {});
      // if (other) {
      //   sendCallPushNotification(other.email, me.name, 'conference_voice', roomId).catch(() => {});
      // }

      setShowAddSheet(false);
      setAddingParticipant(false);

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      unsubsRef.current.forEach((u) => u?.());
      unsubsRef.current = [];
      try { InCallManager?.stopRingback?.(); } catch (_) {}
      try { InCallManager?.stop(); } catch (_) {}

      endCallFiredRef.current = true;
      setStatus(STATUS.IDLE);
      setActiveCall(null);

      navigation.replace('ConferenceCallScreen', {
        roomId,
        isCreator: true,
        callType: 'voice',
      });
    } catch (e) {
      setAddingParticipant(false);
      Alert.alert('Error', 'Could not add participant: ' + e.message);    }
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // ─── Active call UI ───────────────────────────────────────────────────────
  if (callStatus !== STATUS.IDLE) {
    return (
      <View style={styles.callScreen}>
        {/* Minimize — navigate to MainDrawer; VoiceCallScreen stays mounted beneath */}
        <TouchableOpacity style={styles.minimizeBtn} onPress={() => navigation.navigate('MainDrawer')}>
          <Icon name="keyboard-arrow-down" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.callInfo}>
          <View style={styles.callAvatar}>
            <Icon name="person" size={64} color="#fff" />
          </View>
          <Text style={styles.callName}>{remoteUser?.name || remoteUser?.email}</Text>
          <Text style={styles.callEmail}>{remoteUser?.email}</Text>
          <Text style={styles.callSubStatus}>
            {callStatus === STATUS.CALLING && (callSubLabel || 'Calling...')}
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

          <TouchableOpacity style={styles.actionBtn} onPress={openAddSheet}>
            <Icon name="person-add" size={26} color="#fff" />
            <Text style={styles.actionLabel}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Add Participant sheet */}
        <Modal
          visible={showAddSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddSheet(false)}
        >
          <View style={styles.sheetOverlay}>
            <View style={styles.sheetCard}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Add Participant</Text>
                <TouchableOpacity onPress={() => setShowAddSheet(false)}>
                  <Icon name="close" size={24} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.sheetSearch}>
                <Icon name="search" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.sheetSearchInput}
                  placeholder="Search by name or email…"
                  placeholderTextColor="#9CA3AF"
                  value={addSearch}
                  onChangeText={setAddSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              <FlatList
                data={addUsers.filter((u) => {
                  const q = addSearch.toLowerCase();
                  return !q || (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                })}
                keyExtractor={(u) => u.email}
                style={{ maxHeight: 340 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.sheetUserRow}
                    onPress={() => inviteParticipant(item)}
                    disabled={addingParticipant}
                  >
                    <View style={styles.sheetAvatar}>
                      <Icon name="person" size={20} color="#319241" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetUserName}>{item.name || item.email}</Text>
                      <Text style={styles.sheetUserEmail}>{item.email}</Text>
                    </View>
                    {addingParticipant
                      ? <ActivityIndicator size="small" color="#319241" />
                      : <Icon name="call" size={20} color="#319241" />
                    }
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.sheetEmpty}>No contacts found</Text>
                }
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }
  // IDLE — call is always initiated externally; render nothing
  return <View style={styles.callScreen} />;
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
  minimizeBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
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

  // ─── Add participant sheet ────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 36,
    paddingHorizontal: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  sheetSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  sheetSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  sheetUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  sheetAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  sheetUserEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  sheetEmpty: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    paddingVertical: 24,
  },
});