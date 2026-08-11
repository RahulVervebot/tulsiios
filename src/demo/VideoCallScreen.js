import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  DeviceEventEmitter,
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
  RTCView,
  mediaDevices,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InCallManager from 'react-native-incall-manager';
import { sendMissedCallPushNotification } from '../config/OneSignalConfig';
import { useActiveCall } from '../context/ActiveCallContext';
import { useFocusEffect } from '@react-navigation/native';

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

export default function VideoCallScreen({ route, navigation }) {

  const [myEmail, setMyEmail] = useState('');
  const [myName, setMyName] = useState('');
  const [callStatus, setCallStatus] = useState(STATUS.IDLE);
  const [remoteUser, setRemoteUser] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [iceState, setIceState] = useState('');
  // Stream URLs as state so RTCView updates in-place without unmounting
  const [localURL, setLocalURL] = useState(null);
  const [remoteURL, setRemoteURL] = useState(null);
  const [videosVisible, setVideosVisible] = useState(true);
  const [callSubLabel, setCallSubLabel] = useState('');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addUsers, setAddUsers] = useState([]);
  const [addingParticipant, setAddingParticipant] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const callDocRef = useRef(null);
  const timerRef = useRef(null);
  const forwardTimerRef = useRef(null);
  const endTimerRef = useRef(null);
  const unsubsRef = useRef([]);
  const callStatusRef = useRef(STATUS.IDLE);
  const autoCallFiredRef = useRef(false);
  const endCallFiredRef = useRef(false);
  const remoteUserRef = useRef(null);
  const cameraOffRef = useRef(false);
  const activeCallIdRef = useRef(null);
  const callRoleRef = useRef(null); // 'caller' | 'callee'

  const { setActiveCall } = useActiveCall();

  const setStatus = (s) => {
    callStatusRef.current = s;
    setCallStatus(s);
    if (s === STATUS.IDLE) {
      setActiveCall(null);
    } else {
      setActiveCall({
        screen: 'VideoCallScreen',
        label: remoteUserRef.current
          ? `Video call with ${remoteUserRef.current.name || remoteUserRef.current.email}`
          : 'Video Call',
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

  // Answer an incoming call — triggered by in-app overlay or CallKit accept.
  const incomingCallId = route?.params?.incomingCallId;
  useEffect(() => {
    if (!incomingCallId) return;
    if (callStatusRef.current !== STATUS.IDLE) {
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
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (callStatus === STATUS.IDLE) setCallDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  // Start InCallManager for video audio routing; default speaker on
  useEffect(() => {
    if (callStatus === STATUS.IDLE) return;
    try {
      InCallManager.start({ media: 'video', auto: false });
      InCallManager.setSpeakerphoneOn(true);
      InCallManager.setForceSpeakerphoneOn(true);
    } catch (_) {}
    setSpeakerOn(true);
  }, [callStatus === STATUS.IDLE]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-adjust speaker when wired headset is plugged/unplugged
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('WiredHeadset', (event) => {
      const isPlugged = event?.isPlugged ?? false;
      const next = !isPlugged;
      setSpeakerOn(next);
      try {
        InCallManager.setSpeakerphoneOn(next);
        InCallManager.setForceSpeakerphoneOn(next);
      } catch (_) {}
    });
    return () => sub?.remove?.();
  }, []);


  // Refresh stream URLs and re-render RTCViews without unmounting them.
  // On iOS Metal the surface freezes when the screen loses focus — the fix is:
  // 1. Hide RTCViews (opacity 0) so Metal releases the stale surface
  // 2. Update the streamURL state with a fresh toURL() call
  // 3. Show them again — Metal binds fresh to the new URL
  const refreshVideo = useCallback((reacquire = false) => {
    if (callStatusRef.current === STATUS.IDLE) return;

    const doRefresh = () => {
      if (remoteStreamRef.current) setRemoteURL(remoteStreamRef.current.toURL());
      if (!cameraOffRef.current && localStreamRef.current) setLocalURL(localStreamRef.current.toURL());
      // Hide for one frame then show — forces Metal surface rebind
      setVideosVisible(false);
      setTimeout(() => setVideosVisible(true), 50);
    };

    if (reacquire && !cameraOffRef.current) {
      const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
      const needsReacquire =
        videoTracks.length === 0 ||
        videoTracks.some((t) => t.readyState === 'ended' || t.muted);
      if (needsReacquire) {
        mediaDevices
          .getUserMedia({ audio: false, video: { facingMode: 'user', width: 640, height: 480 } })
          .then((newStream) => {
            if (callStatusRef.current === STATUS.IDLE) { newStream.getTracks().forEach((t) => t.stop()); return; }
            const newTrack = newStream.getVideoTracks()[0];
            if (!newTrack) { doRefresh(); return; }
            const sender = pcRef.current?.getSenders?.().find((s) => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(newTrack).catch(() => {});
            localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
            localStreamRef.current = newStream;
            setLocalURL(newStream.toURL());
            if (remoteStreamRef.current) setRemoteURL(remoteStreamRef.current.toURL());
            setVideosVisible(false);
            setTimeout(() => setVideosVisible(true), 50);
          })
          .catch(() => doRefresh());
        return;
      }
      // Tracks healthy — just re-enable and refresh URLs
      videoTracks.forEach((t) => { t.enabled = true; });
    }
    doRefresh();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setTimeout(() => refreshVideo(true), 300);
      }
    });
    return () => {
      sub.remove();
      if (callStatusRef.current === STATUS.IDLE) cleanup();
    };
  }, [refreshVideo]);

  useFocusEffect(
    useCallback(() => {
      if (callStatusRef.current === STATUS.IDLE) return;
      refreshVideo(false);
    }, [refreshVideo])
  );

  const buildPC = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        setRemoteURL(event.streams[0].toURL());
      }
    };
    pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setStatus(STATUS.CONNECTED);
      } else if (pc.connectionState === 'failed') {
        // Terminal failure — end the call
        endCall(false);
      }
      // 'disconnected' is transient on mobile networks — we intentionally ignore it.
      // 'closed' is triggered by our own pc.close() inside cleanup(), so ignore it too.
    };
    return pc;
  };

  const getVideoStream = async () => {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user', width: 640, height: 480 },
    });
    localStreamRef.current = stream;
    setLocalURL(stream.toURL());
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
          Alert.alert('User Busy', `${targetUser.name || targetEmail} is currently on another call.`);
          navigation.reset({ index: 0, routes: [{ name: 'MainDrawer' }] });
          return;
        }
      } catch (_) {}

      console.log('[VideoCall] startCall | caller:', myEmail, '| callee:', targetEmail);
      callRoleRef.current = 'caller';
      remoteUserRef.current = targetUser;
      setRemoteUser(targetUser);
      setStatus(STATUS.CALLING);

      const stream = await getVideoStream();
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
        type: 'video',
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
      // sendCallPushNotification(targetEmail, myName || myEmail, 'video', callId).catch(() => {});

      // ── Forward after 30s if agent hasn't answered ───────────────────────
      forwardTimerRef.current = setTimeout(async () => {
        if (callStatusRef.current !== STATUS.CALLING) return;
        try {
          const storeDoc = await firestore().collection('tulsi').doc('storelist').get();
          const supervisorList = storeDoc.data()?.supervisor || [];
          if (!supervisorList.length) return;
          const supervisor = supervisorList[0];
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
          // sendCallPushNotification(supervisor, myName || myEmail, 'video', callId).catch(() => {});
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

      const stream = await getVideoStream();
      // Incoming callee starts with camera off by default
      stream.getVideoTracks().forEach((t) => { t.enabled = false; });
      setCameraOff(true);
      cameraOffRef.current = true;
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
    setActiveCall(null);
    if (updateDb && callDocRef.current) {
      try { await callDocRef.current.update({ status: 'ended' }); } catch (_) {}
    }
    cleanup();
    if (wasCalling && callRoleRef.current === 'caller' && calleeEmail) {
      sendMissedCallPushNotification(calleeEmail, myName || myEmail, 'video').catch(() => {});
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
    remoteStreamRef.current = null;
    setLocalURL(null);
    setRemoteURL(null);
    pcRef.current?.close();
    pcRef.current = null;
    callDocRef.current = null;
    try { InCallManager.stop(); } catch (_) {}
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
    setCameraOff((c) => {
      cameraOffRef.current = !c;
      return !c;
    });
  };

  const flipCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t._switchCamera?.();
    });
  };

  const toggleSpeaker = () => {
    setSpeakerOn((prev) => {
      const next = !prev;
      try {
        InCallManager.setSpeakerphoneOn(next);
        InCallManager.setForceSpeakerphoneOn(next);
      } catch (_) {}
      return next;
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
        callType:      'video',
        createdAt:     firestore.FieldValue.serverTimestamp(),
      });

      // Mark the existing 1:1 call as ended so the other party's screen also triggers endCall
      if (callDocRef.current) {
        try { await callDocRef.current.update({ status: 'ended' }); } catch (_) {}
      }

      // Notify invitee and existing call partner
      // sendCallPushNotification(guest.email, me.name, 'conference_video', roomId).catch(() => {});
      // if (other) {
      //   sendCallPushNotification(other.email, me.name, 'conference_video', roomId).catch(() => {});
      // }

      setShowAddSheet(false);
      setAddingParticipant(false);

      // Stop local tracks — ConferenceCallScreen will re-acquire them
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      unsubsRef.current.forEach((u) => u?.());
      unsubsRef.current = [];
      try { InCallManager.stop(); } catch (_) {}

      endCallFiredRef.current = true;
      setStatus(STATUS.IDLE);
      setActiveCall(null);

      // Navigate to ConferenceCallScreen as creator
      navigation.replace('ConferenceCallScreen', {
        roomId,
        isCreator: true,
        callType: 'video',
      });
    } catch (e) {
      setAddingParticipant(false);
      Alert.alert('Error', 'Could not add participant: ' + e.message);
    }
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // ─── Active video call UI ─────────────────────────────────────────────────
  if (callStatus !== STATUS.IDLE) {
    return (
      <View style={styles.callScreen}>
        <StatusBar barStyle="light-content" />

        {/* Minimize — navigate to MainDrawer; VideoCallScreen stays mounted beneath */}
        <TouchableOpacity style={styles.minimizeBtn} onPress={() => navigation.navigate('MainDrawer')}>
          <Icon name="keyboard-arrow-down" size={28} color="#fff" />
        </TouchableOpacity>

        <RTCView
          streamURL={remoteURL || ''}
          style={[StyleSheet.absoluteFill, { opacity: remoteURL && videosVisible ? 1 : 0 }]}
          objectFit="cover"
        />

        {/* Placeholder shown when no remote video yet */}
        {!remoteURL && (
          <View style={styles.noVideoPlaceholder}>
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
        )}

        {/* Status overlay when connected */}
        {callStatus === STATUS.CONNECTED && remoteURL && (
          <View style={styles.statusOverlay}>
            <Text style={styles.durationText}>{formatTime(callDuration)}</Text>
            {!!iceState && <Text style={styles.iceStateOverlay}>ICE: {iceState}</Text>}
          </View>
        )}

        {/* Local video (picture-in-picture) — always mounted, hidden when camera off */}
        <View style={[styles.localVideoContainer, (!localURL || cameraOff || !videosVisible) && { opacity: 0 }]}>
          <RTCView
            streamURL={localURL || ''}
            style={styles.localVideo}
            objectFit="cover"
            zOrder={1}
          />
        </View>

        {/* Controls */}
        <View style={styles.callControls}>
          <TouchableOpacity
            style={[styles.controlBtn, muted && styles.controlBtnOn]}
            onPress={toggleMute}
          >
            <Icon name={muted ? 'mic-off' : 'mic'} size={24} color="#fff" />
            <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, !speakerOn && styles.controlBtnOn]}
            onPress={toggleSpeaker}
          >
            <Icon name={speakerOn ? 'volume-up' : 'hearing'} size={24} color="#fff" />
            <Text style={styles.controlLabel}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
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

          <TouchableOpacity style={styles.controlBtn} onPress={openAddSheet}>
            <Icon name="person-add" size={24} color="#fff" />
            <Text style={styles.controlLabel}>Add</Text>
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
                      : <Icon name="videocam" size={20} color="#319241" />
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
  groupCallRow: {
    flexDirection: 'row', marginHorizontal: 14, marginTop: 10,
  },
  groupCallBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#319241',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
    elevation: 3, shadowColor: '#319241', shadowOpacity: 0.35,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  groupCallTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  groupCallSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 1 },

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
  minimizeBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
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
