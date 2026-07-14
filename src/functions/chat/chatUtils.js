import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    const onesignalid  = await AsyncStorage.getItem('onesignalid');
    const onesignalkey = await AsyncStorage.getItem('onesignalkey');
    if (!onesignalid || !onesignalkey) return;

    const recipients = participants.filter((e) => e !== senderEmail);
    const playerIds  = [];

    await Promise.all(
      recipients.map(async (email) => {
        try {
          const snap = await firestore().collection('callProfiles').doc(email).get();
          const pid  = snap.data()?.oneSignalPlayerId;
          if (pid) playerIds.push(pid);
        } catch (_) {}
      }),
    );

    if (playerIds.length === 0) return;

    const payload = {
      app_id:             onesignalid,
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

    await fetch('https://onesignal.com/api/v1/notifications', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Basic ${onesignalkey}`,
      },
      body: JSON.stringify(payload),
    });
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
