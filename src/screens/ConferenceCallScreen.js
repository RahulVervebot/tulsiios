/**
 * ConferenceCallScreen — multi-party video call (mesh WebRTC, no media server).
 *
 * Architecture:
 *   • Firestore doc:  conferenceCalls/{roomId}
 *     - participants: [{ email, name }]
 *     - status: 'active' | 'ended'
 *   • Per peer-pair signalling: conferenceCalls/{roomId}/signals/{A}_{B}
 *     - offer, answer, callerCandidates (A→B), calleeCandidates (B→A)
 *
 *   The user who creates the room sends invites (push notifications).
 *   Every joiner creates a PC to each existing participant (mesh).
 *   Works well for ≤ 6 participants.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Alert, StatusBar, ScrollView, Modal, AppState,
} from 'react-native';
import {
  RTCPeerConnection, RTCIceCandidate, RTCSessionDescription,
  RTCView, RTCPIPView, startIOSPIP, stopIOSPIP, mediaDevices,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import InCallManager from 'react-native-incall-manager';
import AppHeader from '../components/AppHeader';
import { sendCallPushNotification } from '../config/OneSignalConfig';
import { useActiveCall } from '../context/ActiveCallContext';
import { useFocusEffect, StackActions } from '@react-navigation/native';

const makeUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80',              username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',             username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];
// Stable pair key — always smaller email first so A→B and B→A share one doc
const pairKey = (a, b) => [a, b].sort().join('__');

export default function ConferenceCallScreen({ route, navigation }) {

  const {
    roomId: paramRoomId,
    isCreator: paramIsCreator,
    preselectedUsers,   // [{ email, name }] — passed from ChatScreen group call
    callType = 'video', // 'video' | 'voice'
    startNow = false,   // true → skip picker, start immediately and add from inside
  } = route?.params || {};

  const isVoiceOnly = callType === 'voice';
  const [myEmail,       setMyEmail]       = useState('');
  const [myName,        setMyName]        = useState('');
  const [users,         setUsers]         = useState([]);        // all call profiles
  const [loadingUsers,  setLoadingUsers]  = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedEmails, setSelectedEmails] = useState(
    preselectedUsers ? preselectedUsers.map((u) => u.email) : [],
  );
  const [inCall,        setInCall]        = useState(false);
  const [roomId,        setRoomId]        = useState(paramRoomId || null);
  const [participants,  setParticipants]  = useState([]);        // { email, name }
  const [remoteStreams, setRemoteStreams] = useState({});         // { email: MediaStream }
  const [remoteURLs,   setRemoteURLs]   = useState({});         // { email: string } — stable toURL() per stream
  const [localURL,      setLocalURL]     = useState(null);       // RTCView stream URL for local
  const [showAddSheet,  setShowAddSheet]  = useState(false);     // add-participant modal during call
  const [addSearch,     setAddSearch]     = useState('');
  const [muted,         setMuted]        = useState(false);
  const [cameraOff,     setCameraOff]    = useState(false);
  const [speakerOn,     setSpeakerOn]    = useState(true);
  const [callDuration,  setCallDuration] = useState(0);
  // refs — survive re-renders, not tied to React state
  const myEmailRef      = useRef('');
  const myNameRef       = useRef('');
  const localStreamRef  = useRef(null);
  const pcsRef          = useRef({});   // { pairKey: RTCPeerConnection }
  const unsubsRef       = useRef([]);
  const roomRef         = useRef(null);
  const endFiredRef     = useRef(false);
  const inCallRef       = useRef(false);
  const isMinimizedRef  = useRef(false);
  const timerRef        = useRef(null);
  const pipViewRef      = useRef(null);
  const { setActiveCall, setMiniDuration, setMiniRemoteURL } = useActiveCall();
  // ────────────────────────────── Init ─────────────────────────────────────
  useEffect(() => {
    AsyncStorage.multiGet(['callUserEmail', 'callUserName']).then((pairs) => {
      const email = pairs[0][1] || '';
      const name  = pairs[1][1] || email;
      myEmailRef.current = email;
      myNameRef.current  = name;
      setMyEmail(email);
      setMyName(name);
    });
  }, []);
  useEffect(() => {
    if (myEmail) fetchUsers();
  }, [myEmail]);
  // Auto-join if opened as an invitee (roomId passed via push notification)
  // Also handles creator joining their own pre-created room (mid-call upgrade from 1:1)
  useEffect(() => {
    if (myEmail && paramRoomId && !paramIsCreator) {
      joinRoom(paramRoomId);
    } else if (myEmail && paramRoomId && paramIsCreator) {
      joinRoomAsCreator(paramRoomId);
    }
  }, [myEmail]);
  // Auto-start when launched from ChatScreen with pre-selected group members
  useEffect(() => {
    if (myEmail && preselectedUsers?.length) {
      createRoom(preselectedUsers);
    }
  }, [myEmail]);
  // Auto-start immediately with no invitees — user adds participants from inside the call
  useEffect(() => {
    if (myEmail && startNow && !preselectedUsers?.length && !paramRoomId) {
      createRoom([]);
    }
  }, [myEmail]);
  // Block back gesture/back-button while a call is active so the screen stays mounted.
  // Only block GO_BACK actions — allow explicit navigate() calls to other screens.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (inCallRef.current && e.data?.action?.type === 'GO_BACK') {
        e.preventDefault();
      }
    });
    return unsub;
  }, [navigation]);
  const reacquireConferenceVideo = useCallback(() => {
    if (isVoiceOnly || cameraOff) return;
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    const needsReacquire =
      videoTracks.length === 0 ||
      videoTracks.some((t) => t.readyState === 'ended' || t.muted);
    if (needsReacquire) {
         mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: 640, height: 480 } })
        .then((newStream) => {
        if (!inCallRef.current) { newStream.getTracks().forEach((t) => t.stop()); return; }
        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) return;
        Object.values(pcsRef.current).forEach((pc) => {
        const sender = pc.getSenders?.().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack).catch(() => {});
        });
          localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
          localStreamRef.current = newStream;
          setLocalURL(newStream.toURL());
        })
        .catch(() => {});
    } else {
      videoTracks.forEach((t) => { t.enabled = true; });
      if (localStreamRef.current) setLocalURL(localStreamRef.current.toURL());
    }
  }, [cameraOff, isVoiceOnly]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        isMinimizedRef.current = false;
        try { stopIOSPIP(pipViewRef); } catch (_) {}
        if (!cameraOff) {
          localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = true; });
        }
        setTimeout(() => reacquireConferenceVideo(), 300);
      } else if (nextState === 'background') {
        if (inCallRef.current) {
          isMinimizedRef.current = true;
          localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = true; });
          try { startIOSPIP(pipViewRef); } catch (_) {}
        }
      }
    });
    return () => {
      sub.remove();
      if (!inCallRef.current) cleanup();
    };
  }, [reacquireConferenceVideo, cameraOff]);

  useFocusEffect(
    useCallback(() => {
      if (inCallRef.current) {
        isMinimizedRef.current = false;
        try { stopIOSPIP(pipViewRef); } catch (_) {}
        if (!cameraOff) {
          localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = true; });
        }
        setTimeout(() => reacquireConferenceVideo(), 100);
        // Refresh all remote stream URLs — Metal/GL surface may freeze when screen loses focus
        setRemoteURLs((prev) => {
          const refreshed = {};
          Object.entries(prev).forEach(([email]) => {
            const stream = remoteStreams[email];
            if (stream) refreshed[email] = stream.toURL();
          });
          return refreshed;
        });
      }
    }, [reacquireConferenceVideo, remoteStreams, cameraOff])
  );

  // ─── Audio routing ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!inCall) return;
    try {
      InCallManager.start({ media: 'video', auto: false });
      InCallManager.setSpeakerphoneOn(true);
      InCallManager.setForceSpeakerphoneOn(true);
    } catch (_) {}
    setSpeakerOn(true);
  }, [inCall]);

  // ─── Call duration timer — feeds the minimized floating card ─────────────
  useEffect(() => {
    if (!inCall) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCallDuration((d) => { setMiniDuration(d + 1); return d + 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [inCall]);

  // ─── Fetch users (filtered by storeDomain like SupportScreen) ───────────
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const localDomain = await AsyncStorage.getItem('storeDomain');
      const snap = await firestore().collection('callProfiles').get();
      const all  = snap.docs.map((d) => ({ ...d.data(), email: d.id }));
      setUsers(
        all.filter((u) => {
          if (u.email === myEmailRef.current) return false;
          if (localDomain && u.storeDomain && u.storeDomain !== localDomain) return false;
          return true;
        }),
      );
    } catch (e) {
      console.log('[Conf] fetchUsers error:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  // ─── Media stream (video or voice-only) ──────────────────────────────────
  const getVideoStream = async () => {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: isVoiceOnly ? false : { facingMode: 'user', width: 640, height: 480 },
    });
    localStreamRef.current = stream;
    if (!isVoiceOnly) setLocalURL(stream.toURL());
    return stream;
  };

  // ─── Build a peer connection to one remote participant ────────────────────
  const buildPC = useCallback((remoteEmail) => {
    const key = pairKey(myEmailRef.current, remoteEmail);
    if (pcsRef.current[key]) return pcsRef.current[key];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current[key] = pc;

    // Add local tracks
    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));

    pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        const stream = event.streams[0];
        const url = stream.toURL();
        setRemoteStreams((prev) => ({ ...prev, [remoteEmail]: stream }));
        setRemoteURLs((prev) => ({ ...prev, [remoteEmail]: url }));
        setMiniRemoteURL(url);
      }
    };

    pc.onconnectionstatechange = () => {
      // 'disconnected' is transient on mobile networks (ICE re-checks, brief network
      // congestion — especially when another peer joins and triggers a signaling burst).
      // Only 'failed'/'closed' are terminal — mirrors VideoCallScreen.js's pc handling.
      if (['failed', 'closed'].includes(pc.connectionState)) {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[remoteEmail];
          return next;
        });
        setRemoteURLs((prev) => {
          const next = { ...prev };
          delete next[remoteEmail];
          return next;
        });
        pc.close();
        delete pcsRef.current[key];
      }
      if (pc.connectionState === 'connected') {
        // connection established
      }
    };

    return pc;
  }, []);

  // ─── Create room & invite selected users ─────────────────────────────────
  // explicitInvitees: [{ email, name }] — used when called from ChatScreen
  const createRoom = async (explicitInvitees) => {
    const invitees = explicitInvitees
      || users
          .filter((u) => selectedEmails.includes(u.email))
          .map((u) => ({ email: u.email, name: u.name || u.email }));

    if (!invitees.length && !startNow) {
      Alert.alert('Select participants', 'Pick at least one person to call.');
      return;
    }
    try {
      await getVideoStream();
      const rId = makeUUID();
      setRoomId(rId);

      const me = { email: myEmailRef.current, name: myNameRef.current };

      const allParticipants = [me, ...invitees];

      const rRef = firestore().collection('conferenceCalls').doc(rId);
      roomRef.current = rRef;

      await rRef.set({
        createdBy:      me.email,
        createdByName:  me.name,
        participants:   allParticipants,
        status:         'active',
        callType:       isVoiceOnly ? 'voice' : 'video',
        createdAt:      firestore.FieldValue.serverTimestamp(),
      });

      setParticipants(allParticipants);
      inCallRef.current = true;
      setInCall(true);
      setActiveCall({
        screen: 'ConferenceCallScreen',
        label: isVoiceOnly ? 'Group Voice Call' : 'Group Video Call',
        params: { roomId: rId, isCreator: true, callType },
      });

      // Single listener: watch for ended status AND new participants.
      // initiateOffer() guards duplicates itself — no need for pcsRef check here.
      const unsubRoom = rRef.onSnapshot(async (snap) => {
        const data = snap.data();
        if (data?.status === 'ended') { leaveCall(false); return; }
        const parts = data?.participants || [];
        const seen = new Set();
        const unique = parts.filter((p) => seen.has(p.email) ? false : seen.add(p.email));
        setParticipants(unique);
        for (const p of unique) {
          if (p.email === myEmailRef.current) continue;
          await initiateOffer(p.email, rId);
        }
      });
      unsubsRef.current.push(unsubRoom);

      // Send push notification to each invitee
      const confCallType = isVoiceOnly ? 'conference_voice' : 'conference_video';
      // for (const invitee of invitees) {
      //   sendCallPushNotification(
      //     invitee.email, myNameRef.current, confCallType, rId,
      //   ).catch(() => {});
      // }
    } catch (e) {
      Alert.alert('Error', 'Could not start conference: ' + e.message);
      cleanup();
    }
  };

  // ─── Join pre-created room as creator (mid-call 1:1 upgrade) ─────────────
  // Room doc already exists in Firestore. Acquire media, watch participants,
  // and send offers to everyone else in the room.

  const joinRoomAsCreator = async (rId) => {
    try {
      await getVideoStream();
      const rRef = firestore().collection('conferenceCalls').doc(rId);
      roomRef.current = rRef;
      setRoomId(rId);

      const snap = await rRef.get();
      if (!snap.exists || snap.data()?.status === 'ended') {
        Alert.alert('Call ended', 'This conference room is no longer active.');
        navigation.goBack();
        return;
      }

      const rawParts = snap.data()?.participants || [];
      const seenC = new Set();
      const currentParts = rawParts.filter((p) => seenC.has(p.email) ? false : seenC.add(p.email));
      setParticipants(currentParts);
      inCallRef.current = true;
      setInCall(true);
      setActiveCall({
        screen: 'ConferenceCallScreen',
        label: isVoiceOnly ? 'Group Voice Call' : 'Group Video Call',
        params: { roomId: rId, isCreator: true, callType },
      });

      // Snapshot fires immediately on attach — handles current + future participants.
      // initiateOffer() now guards against duplicates itself (pcsRef check at entry).
      const unsubRoom = rRef.onSnapshot(async (s) => {
        const data = s.data();
        if (data?.status === 'ended') { leaveCall(false); return; }
        const parts = data?.participants || [];
        const seen = new Set();
        const unique = parts.filter((p) => seen.has(p.email) ? false : seen.add(p.email));
        setParticipants(unique);
        for (const p of unique) {
          if (p.email === myEmailRef.current) continue;
          await initiateOffer(p.email, rId);
        }
      });
      unsubsRef.current.push(unsubRoom);
    } catch (e) {
      Alert.alert('Error', 'Could not join conference: ' + e.message);
    }
  };

  // ─── Join an existing room ────────────────────────────────────────────────
  const joinRoom = async (rId) => {
    try {
      const stream = await getVideoStream();
      const rRef   = firestore().collection('conferenceCalls').doc(rId);
      roomRef.current = rRef;
      setRoomId(rId);

      const snap = await rRef.get();
      if (!snap.exists || snap.data()?.status === 'ended') {
        Alert.alert('Call ended', 'This conference call has already ended.');
        navigation.goBack();
        return;
      }

      const me = { email: myEmailRef.current, name: myNameRef.current };

      // Add self to participants list
      await rRef.update({
        participants: firestore.FieldValue.arrayUnion(me),
      });

      const currentParts = snap.data()?.participants || [];
      // Deduplicate — creator already has me in participants list
      const seenInit = new Set();
      const uniqueInit = [...currentParts, me].filter((p) =>
        seenInit.has(p.email) ? false : seenInit.add(p.email)
      );
      setParticipants(uniqueInit);
      inCallRef.current = true;
      setInCall(true);
      setActiveCall({
        screen: 'ConferenceCallScreen',
        label: 'Conference Call',
        params: { roomId: rId, isCreator: false, callType },
      });

      // Watch room for status changes and participant list updates
      const unsubRoom = rRef.onSnapshot((s) => {
        const data = s.data();
        if (data?.status === 'ended') { leaveCall(false); return; }
        const parts = data?.participants || [];
        const seen = new Set();
        const unique = parts.filter((p) => seen.has(p.email) ? false : seen.add(p.email));
        setParticipants(unique);
      });
      unsubsRef.current.push(unsubRoom);

      // Single signals watcher handles ALL incoming offers (existing + late joiners)
      const unsubSigs = rRef.collection('signals').onSnapshot((sigsSnap) => {
        sigsSnap.docChanges().forEach(({ type, doc }) => {
          if (type !== 'added') return;
          const [a, b] = doc.id.split('__');
          const otherEmail = a === myEmailRef.current ? b : b === myEmailRef.current ? a : null;
          if (!otherEmail) return;
          const data = doc.data();
          if (data.callerEmail === myEmailRef.current) return; // we sent this, skip
          const key = pairKey(myEmailRef.current, otherEmail);
          if (pcsRef.current[key]) return; // already handling this pair
          if (data.offer) {
            handleIncomingOffer(otherEmail, doc.id, data, rId);
          }
        });
      });
      unsubsRef.current.push(unsubSigs);

    } catch (e) {
      Alert.alert('Error', 'Could not join conference: ' + e.message);
    }
  };

  // ─── Send offer to a specific peer ───────────────────────────────────────
  // ICE field naming is based on pair-key order (sorted emails), NOT caller/callee role:
  //   smaller-email side always writes to 'callerCandidates', reads from 'calleeCandidates'
  //   larger-email side always writes to 'calleeCandidates', reads from 'callerCandidates'

  const initiateOffer = async (remoteEmail, rId) => {
    const rRef   = roomRef.current || firestore().collection('conferenceCalls').doc(rId);
    const key    = pairKey(myEmailRef.current, remoteEmail);
    if (pcsRef.current[key]) return; // already in-flight or established
    const sigRef = rRef.collection('signals').doc(key);

    const pc = buildPC(remoteEmail);

    // Initiator is the smaller email in the sorted pair → writes to 'callerCandidates'
    const iAmSmaller = myEmailRef.current < remoteEmail;
    const myIceField     = iAmSmaller ? 'callerCandidates' : 'calleeCandidates';
    const theirIceField  = iAmSmaller ? 'calleeCandidates' : 'callerCandidates';

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      sigRef.collection(myIceField).add(candidate.toJSON()).catch(() => {});
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sigRef.set({
      offer: { type: offer.type, sdp: offer.sdp },
      callerEmail: myEmailRef.current,
      calleeEmail: remoteEmail,
    }, { merge: true });

    // Wait for answer
    const unsubAnswer = sigRef.onSnapshot(async (snap) => {
      const data = snap.data();
      if (data?.answer && !pc.remoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });
    unsubsRef.current.push(unsubAnswer);

    // Listen for callee's ICE candidates
    const unsubIce = sigRef.collection(theirIceField).onSnapshot((snap) => {
      snap.docChanges().forEach(async ({ type, doc }) => {
        if (type === 'added') {
          try { await pc.addIceCandidate(new RTCIceCandidate(doc.data())); } catch (_) {}
        }
      });
    });
    unsubsRef.current.push(unsubIce);
  };

  // ─── Listen for an offer from a specific peer ─────────────────────────────
  const listenForOffer = (remoteEmail, rId) => {
    const rRef   = roomRef.current || firestore().collection('conferenceCalls').doc(rId);
    const key    = pairKey(myEmailRef.current, remoteEmail);
    const sigRef = rRef.collection('signals').doc(key);

    const unsub = sigRef.onSnapshot(async (snap) => {
      const data = snap.data();
      if (!data?.offer) return;
      if (pcsRef.current[key]?.remoteDescription) return; // already handled

      await handleIncomingOffer(remoteEmail, key, data, rId);
    });
    unsubsRef.current.push(unsub);
  };

  // ─── Respond to an offer ──────────────────────────────────────────────────
  const handleIncomingOffer = async (remoteEmail, key, data, rId) => {
    const rRef   = roomRef.current || firestore().collection('conferenceCalls').doc(rId);
    const sigRef = rRef.collection('signals').doc(key);

    const pc = buildPC(remoteEmail);
    if (pc.remoteDescription) return;

    // Answerer uses opposite ice fields from initiator:
    //   if remoteEmail (initiator) is smaller → initiator wrote to 'callerCandidates'
    //   so we (answerer/larger) write to 'calleeCandidates' and read from 'callerCandidates'
    const iAmSmaller    = myEmailRef.current < remoteEmail;
    const myIceField    = iAmSmaller ? 'callerCandidates' : 'calleeCandidates';
    const theirIceField = iAmSmaller ? 'calleeCandidates' : 'callerCandidates';

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sigRef.collection(myIceField).add(candidate.toJSON()).catch(() => {});
    };

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sigRef.set({ answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });

    // Listen for initiator's ICE candidates
    const unsubIce = sigRef.collection(theirIceField).onSnapshot((snap) => {
      snap.docChanges().forEach(async ({ type, doc }) => {
        if (type === 'added') {
          try { await pc.addIceCandidate(new RTCIceCandidate(doc.data())); } catch (_) {}
        }
      });
    });
    unsubsRef.current.push(unsubIce);
  };

  // ─── Leave / end call ─────────────────────────────────────────────────────
  const leaveCall = async (updateDb = true) => {
    if (endFiredRef.current) return;
    endFiredRef.current = true;
    inCallRef.current = false;

    if (updateDb && roomRef.current) {
      const me = { email: myEmailRef.current, name: myNameRef.current };
      try {
        await roomRef.current.update({
          participants: firestore.FieldValue.arrayRemove(me),
        });
        // If last person leaving, mark room as ended
        const snap = await roomRef.current.get();
        const remaining = snap.data()?.participants || [];
        if (remaining.length === 0) {
          await roomRef.current.update({ status: 'ended' });
        }
      } catch (_) {}
    }

    cleanup();
    navigation.reset({ index: 0, routes: [{ name: 'MainDrawer' }] });
    // Deferred: clearing the shared call context here would update ActiveCallProvider
    // synchronously while React is still committing the navigation.reset() unmount of
    // this screen, triggering "Cannot update a component while rendering a different
    // component". Push it to the next tick so it lands after that commit finishes.
    setTimeout(() => setActiveCall(null), 0);
  };

  const cleanup = () => {
    unsubsRef.current.forEach((u) => u?.());
    unsubsRef.current = [];
    Object.values(pcsRef.current).forEach((pc) => { try { pc.close(); } catch (_) {} });
    pcsRef.current = {};
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalURL(null);
    setRemoteStreams({});
    setRemoteURLs({});
    setMiniRemoteURL(null);
    setMiniDuration(0);
    roomRef.current = null;
    try { InCallManager.stop(); } catch (_) {}
  };

  // ─── Controls ─────────────────────────────────────────────────────────────
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCameraOff((c) => !c);
  };

  const flipCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => t._switchCamera?.());
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

  // ─── Invite a new participant during an active call ───────────────────────
  const inviteParticipant = async (user) => {
    if (!roomRef.current) return;
    const entry = { email: user.email, name: user.name || user.email };
    try {
      await roomRef.current.update({
        participants: firestore.FieldValue.arrayUnion(entry),
      });
      const confCallType = isVoiceOnly ? 'conference_voice' : 'conference_video';
      // sendCallPushNotification(
      //   user.email, myNameRef.current, confCallType, roomId,
      // ).catch(() => {});
      await initiateOffer(user.email, roomId);
      setShowAddSheet(false);
    } catch (e) {
      Alert.alert('Error', 'Could not invite participant: ' + e.message);
    }
  };

  // ─── User selection ───────────────────────────────────────────────────────
  const toggleSelect = (email) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  // ─── Active conference UI ─────────────────────────────────────────────────
  if (inCall) {
    const others = participants.filter((p) => p.email !== myEmailRef.current);
    const pipStreamURL = !isVoiceOnly
      ? (others.map((p) => remoteURLs[p.email]).find(Boolean) || localURL || '')
      : '';

    return (
      <View style={styles.callScreen}>
        <StatusBar barStyle="light-content" />

        {/* RTCPIPView must always be mounted so iOS PiP has pixel content to capture */}
        {!isVoiceOnly && (
          <RTCPIPView
            ref={pipViewRef}
            streamURL={pipStreamURL}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            iosPIP={{
              enabled: true,
              startAutomatically: false,
              stopAutomatically: true,
              preferredSize: { width: 180, height: 320 },
            }}
          />
        )}

        {/* Duration / room bar */}
        <View style={styles.roomBar}>
          <TouchableOpacity
            style={styles.minimizeBtn}
            onPress={() => {
              isMinimizedRef.current = true;
              if (!isVoiceOnly) {
                try { startIOSPIP(pipViewRef); } catch (_) {}
              }
              navigation.dispatch(StackActions.push('MainDrawer'));
            }}
          >
            <Icon name="keyboard-arrow-down" size={22} color="#fff" />
          </TouchableOpacity>
          <Icon name={isVoiceOnly ? 'call' : 'videocam'} size={16} color="#6EE7B7" style={{ marginRight: 6 }} />
          <Text style={[styles.roomBarText, { flex: 1 }]}>
            {isVoiceOnly ? 'Voice ' : 'Video '}Conference · {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            style={styles.addParticipantBtn}
            onPress={() => { setAddSearch(''); setShowAddSheet(true); }}
          >
            <Icon name="person-add" size={18} color="#6EE7B7" />
          </TouchableOpacity>
        </View>

        {/* Participant grid — video tiles for video calls, avatar tiles for voice calls */}
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {others.map((p) => {
            const url = !isVoiceOnly ? remoteURLs[p.email] : null;
            return (
              <View key={p.email} style={styles.remoteCell}>
                {url ? (
                  <RTCView
                    key={`remote-${p.email}`}
                    streamURL={url}
                    style={StyleSheet.absoluteFill}
                    objectFit="cover"
                  />
                ) : (
                  <View style={styles.remoteAvatar}>
                    <Icon name="person" size={36} color="#fff" />
                  </View>
                )}
                <View style={styles.remoteName}>
                  <Text style={styles.remoteNameText} numberOfLines={1}>{p.name || p.email}</Text>
                  {isVoiceOnly && remoteStreams[p.email] && (
                    <Icon name="mic" size={12} color="#6EE7B7" style={{ marginLeft: 4 }} />
                  )}
                </View>
              </View>
            );
          })}
          {others.length === 0 && (
            <View style={styles.waitingWrap}>
              <ActivityIndicator color="#6EE7B7" size="large" />
              <Text style={styles.waitingText}>Waiting for others to join…</Text>
            </View>
          )}
        </ScrollView>

        {/* Local PiP */}
        {localURL && !cameraOff && (
          <View style={styles.localPip}>
            <RTCView
              key="local-pip"
              streamURL={localURL}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              zOrder={1}
            />
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={[styles.ctrlBtn, muted && styles.ctrlBtnOn]} onPress={toggleMute}>
            <Icon name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
            <Text style={styles.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.ctrlBtn, !speakerOn && styles.ctrlBtnOn]} onPress={toggleSpeaker}>
            <Icon name={speakerOn ? 'volume-up' : 'hearing'} size={22} color="#fff" />
            <Text style={styles.ctrlLabel}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.endBtn} onPress={() => leaveCall()}>
            <Icon name="call-end" size={28} color="#fff" />
          </TouchableOpacity>

          {!isVoiceOnly && (
            <TouchableOpacity style={[styles.ctrlBtn, cameraOff && styles.ctrlBtnOn]} onPress={toggleCamera}>
              <Icon name={cameraOff ? 'videocam-off' : 'videocam'} size={22} color="#fff" />
              <Text style={styles.ctrlLabel}>{cameraOff ? 'Show' : 'Hide'}</Text>
            </TouchableOpacity>
          )}

          {!isVoiceOnly && (
            <TouchableOpacity style={styles.ctrlBtn} onPress={flipCamera}>
              <Icon name="flip-camera-ios" size={22} color="#fff" />
              <Text style={styles.ctrlLabel}>Flip</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Add Participant Modal */}
        <Modal
          visible={showAddSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddSheet(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.addSheet}>
              <View style={styles.addSheetHeader}>
                <Text style={styles.addSheetTitle}>Add Participant</Text>
                <TouchableOpacity onPress={() => setShowAddSheet(false)}>
                  <Icon name="close" size={22} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.addSearchBar}>
                <Icon name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.addSearchInput}
                  placeholder="Search by name or email…"
                  placeholderTextColor="#9CA3AF"
                  value={addSearch}
                  onChangeText={setAddSearch}
                  autoFocus
                />
                {addSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setAddSearch('')}>
                    <Icon name="close" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={users.filter((u) => {
                  const alreadyIn = participants.some((p) => p.email === u.email);
                  if (alreadyIn) return false;
                  const q = addSearch.toLowerCase();
                  return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
                })}
                keyExtractor={(item) => item.email}
                style={styles.addList}
                renderItem={({ item }) => (
                  <View style={styles.addUserRow}>
                    <View style={styles.addUserAvatar}>
                      <Icon name="person" size={22} color="#319241" />
                    </View>
                    <View style={styles.addUserMeta}>
                      <Text style={styles.addUserName}>{item.name}</Text>
                      <Text style={styles.addUserEmail}>{item.email}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.inviteBtn}
                      onPress={() => inviteParticipant(item)}
                    >
                      <Icon name="person-add" size={16} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.inviteBtnText}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.addEmpty}>
                    <Text style={styles.addEmptyText}>No available users</Text>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─── User picker UI ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <AppHeader Title={isVoiceOnly ? 'Group Voice Call' : 'Group Video Call'} backgroundType="color" backgroundValue="#319241" />

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

      {selectedEmails.length > 0 && (
        <View style={styles.selectedBar}>
          <Text style={styles.selectedCount}>
            {selectedEmails.length} selected
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => createRoom()}>
            <Icon name={isVoiceOnly ? 'call' : 'videocam'} size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.startBtnText}>{isVoiceOnly ? 'Start Voice Call' : 'Start Video Call'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loadingUsers ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#319241" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.email}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const selected = selectedEmails.includes(item.email);
            return (
              <TouchableOpacity
                style={[styles.userCard, selected && styles.userCardSelected]}
                onPress={() => toggleSelect(item.email)}
                activeOpacity={0.8}
              >
                <View style={[styles.userAvatar, selected && styles.userAvatarSelected]}>
                  {selected
                    ? <Icon name="check" size={24} color="#fff" />
                    : <Icon name="person" size={26} color="#319241" />
                  }
                </View>
                <View style={styles.userMeta}>
                  <Text style={styles.userName}>{item.name}</Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
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
  container:     { flex: 1, backgroundColor: '#F5F6FA' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText:     { marginTop: 10, fontSize: 15, color: '#9CA3AF' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    margin: 14, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },

  selectedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 14, marginBottom: 8,
    backgroundColor: '#DCFCE7', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#86EFAC',
  },
  selectedCount: { fontSize: 14, fontWeight: '600', color: '#166534' },
  startBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#319241', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  listContent: { paddingHorizontal: 14, paddingBottom: 30 },
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    elevation: 1,
  },
  userCardSelected: { borderColor: '#319241', backgroundColor: '#F0FDF4' },
  userAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  userAvatarSelected: { backgroundColor: '#319241' },
  userMeta:  { flex: 1 },
  userName:  { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  userEmail: { fontSize: 13, color: '#6B7280' },

  // ─── Active call ──────────────────────────────────────────────────────────
  callScreen: { flex: 1, backgroundColor: '#0a0a0a' },

  roomBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingBottom: 8, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  roomBarText: { color: '#6EE7B7', fontSize: 13, fontWeight: '600' },
  minimizeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: 6, paddingBottom: 120,
  },
  remoteCell: {
    width: '48%', aspectRatio: 0.75,
    margin: '1%', borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
  },
  remoteAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  remoteName: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  remoteNameText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  waitingWrap: {
    width: '100%', alignItems: 'center', paddingTop: 80,
  },
  waitingText: { color: '#6B7280', marginTop: 14, fontSize: 14 },

  localPip: {
    position: 'absolute', top: 100, right: 12,
    width: 90, height: 130, borderRadius: 10,
    overflow: 'hidden', borderWidth: 2, borderColor: '#fff',
    elevation: 10,
  },

  controls: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
    paddingHorizontal: 16,
  },
  ctrlBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctrlBtnOn: { backgroundColor: '#374151' },
  ctrlLabel: {
    color: '#D1D5DB', fontSize: 9, fontWeight: '600',
    position: 'absolute', bottom: -18,
  },
  endBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#DC2626',
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#DC2626',
    shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  addParticipantBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(110,231,183,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ─── Add-participant modal ────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  addSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '75%', paddingBottom: 34,
  },
  addSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  addSheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  addSearchBar: {
    flexDirection: 'row', alignItems: 'center',
    margin: 14, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#F9FAFB', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  addSearchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  addList: { paddingHorizontal: 14 },
  addUserRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  addUserAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  addUserMeta: { flex: 1 },
  addUserName:  { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  addUserEmail: { fontSize: 12, color: '#6B7280' },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#319241', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  addEmpty: { alignItems: 'center', paddingTop: 30, paddingBottom: 16 },
  addEmptyText: { color: '#9CA3AF', fontSize: 14 },
});
