import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONE_SIGNAL_APP_ID, ONE_SIGNAL_REST_API_KEY } from '../../config/OneSignalConfig';

// Find or create a 1-on-1 chat; participants keyed by email (stable across reinstalls)
export const getOrCreateDirectChat = async (myEmail, myName, otherEmail, otherName) => {
  const snap = await firestore()
    .collection('chats')
    .where('type', '==', 'direct')
    .where('participants', 'array-contains', myEmail)
    .get();

  const existing = snap.docs.find((d) =>
    d.data().participants?.includes(otherEmail),
  );
  if (existing) return existing.id;

  const ref = await firestore().collection('chats').add({
    type: 'direct',
    participants: [myEmail, otherEmail],
    participantNames: {
      [myEmail]:    myName    || myEmail,
      [otherEmail]: otherName || otherEmail,
    },
    createdAt:       firestore.FieldValue.serverTimestamp(),
    lastMessageTime: firestore.FieldValue.serverTimestamp(),
    lastMessage:     null,
    unread:          {},
  });
  return ref.id;
};

// Send a push notification for a new chat message.
// participants[] are emails; player IDs are looked up from callProfiles.

export const sendChatPushNotification = async (chatId, chatName, senderName, messageText, participants, senderEmail, chatType = 'direct') => {
  try {
    const appId  = (await AsyncStorage.getItem('onesignalid'))  || ONE_SIGNAL_APP_ID;
    const apiKey = (await AsyncStorage.getItem('onesignalkey')) || ONE_SIGNAL_REST_API_KEY;

    const recipients = participants.filter((e) => e !== senderEmail);
    const playerIds  = [];

    await Promise.all(
      recipients.map(async (email) => {
        try {
          const snap = await firestore().collection('callProfiles').doc(email).get();
          const pid  = snap.data()?.oneSignalPlayerId;
          console.log(`[ChatPush] playerId for ${email}:`, pid ?? 'MISSING');
          if (pid) playerIds.push(pid);
        } catch (e) {
          console.log(`[ChatPush] lookup error for ${email}:`, e?.message);
        }
      }),
    );

    if (playerIds.length === 0) {
      console.log('[ChatPush] No player IDs found — notification not sent');
      return;
    }

    const payload = {
      app_id:             appId,
      include_player_ids: playerIds,
      headings:           { en: chatName || senderName },
      contents:           { en: `${senderName}: ${messageText}` },
      data:               { type: 'chat_message', chatId, chatName, chatType },
      priority:           7,
      ttl:                86400,
      ios_sound:          'default',
      ios_badge_type:     'Increase',
      ios_badge_count:    1,
    };

    const res = await fetch('https://api.onesignal.com/notifications', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    console.log('[ChatPush] status:', res.status, '| id:', data?.id, '| errors:', data?.errors);
  } catch (e) {
    console.log('[ChatPush] error:', e?.message);
  }
};

// Reset unread count to 0 for myEmail in a chat
export const markChatAsRead = async (chatId, myEmail) => {
  try {
    await firestore()
      .collection('chats')
      .doc(chatId)
      .update({ [`unread.${myEmail}`]: 0 });
  } catch (_) {}
};

// Increment unread count for all participants except sender
export const incrementUnread = async (chatId, participants, senderEmail) => {
  try {
    const updates = {};
    participants
      .filter((e) => e !== senderEmail)
      .forEach((e) => {
        updates[`unread.${e}`] = firestore.FieldValue.increment(1);
      });
    await firestore().collection('chats').doc(chatId).update(updates);
  } catch (_) {}
};
