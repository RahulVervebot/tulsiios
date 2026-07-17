import { useEffect, useState } from 'react';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { displayIncomingCall, endCallKeep } from '../config/CallKeepConfig';

// Listens for incoming calls in Firestore and triggers the native CallKit UI
// via react-native-callkeep. No custom modal needed — CallKit handles the UI.
export default function IncomingCallOverlay({ navigationRef }) {
  const [myEmail, setMyEmail] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('callUserEmail').then((email) => {
      if (email) setMyEmail(email);
    });
  }, []);

  useEffect(() => {
    if (!myEmail) return;

    // Track calls we've already shown so re-subscriptions don't re-ring.
    const shownCalls = new Set();
    // Ignore any call created more than 30 seconds before we subscribed.
    const subscribeTime = Date.now();

    console.log('[IncomingCall] Starting Firestore listener for calleeId:', myEmail);
    // Single-field query only — composite (calleeId + status) needs a Firestore index.
    // Status and type are filtered in JS below.
    const unsub = firestore()
      .collection('calls')
      .where('calleeId', '==', myEmail)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          // Caller cancelled before callee answered — dismiss the CallKit UI.
          if (change.type === 'modified') {
            if (data.status === 'ended' || data.status === 'rejected') {
              try { endCallKeep(docId); } catch (_) {}
            }
            return;
          }

          if (change.type !== 'added') return;
          if (shownCalls.has(docId)) return;
          if (data.status !== 'calling') return;
          if (data.type !== 'voice' && data.type !== 'video') return;

          // Filter out stale calls — createdAt must be within 30s of our subscribe time.
          const createdMs = data.createdAt?.toMillis?.() ?? 0;
          if (createdMs && subscribeTime - createdMs > 30000) return;

          const currentRoute = navigationRef.current?.getCurrentRoute?.()?.name;
          if (currentRoute === 'VoiceCallScreen' || currentRoute === 'VideoCallScreen') return;

          shownCalls.add(docId);
          try {
            displayIncomingCall({
              callId:      docId,
              callerId:    data.callerId,
              callerName:  data.callerName || data.callerEmail || data.callerId,
              callerEmail: data.callerEmail || data.callerId,
              callType:    data.type,
            });
          } catch (e) {
            console.log('[IncomingCall] displayIncomingCall error:', e?.message);
          }
        });
      }, (e) => console.log('[IncomingCall] snapshot error:', e?.message));

    return () => unsub();
  }, [myEmail]);

  return null;
}
