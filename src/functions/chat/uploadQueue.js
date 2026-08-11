import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBlobUtil from 'react-native-blob-util';
import firestore from '@react-native-firebase/firestore';
import { uploadToS3, registerLocalFile } from '../../config/S3Config';
import { sendChatPushNotification, incrementUnread } from './chatUtils';

const QUEUE_KEY   = '@chat_upload_queue_v2';
const PENDING_DIR = RNBlobUtil.fs.dirs.DocumentDir + '/chat_pending/';

let _processing        = false;
let _cancelled         = false;
let _cancelCurrentTask = null; // RNBlobUtil task for the in-progress upload

// ─── Copy picker temp-file to a path that survives app restarts ───────────────
export const persistFileForQueue = async (uri, fileName) => {
  try {
    const dirExists = await RNBlobUtil.fs.isDir(PENDING_DIR).catch(() => false);
    if (!dirExists) await RNBlobUtil.fs.mkdir(PENDING_DIR);

    const stamp = Date.now();
    const ext   = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
    const base  = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const dest  = PENDING_DIR + `${base}_${stamp}.${ext}`;

    await RNBlobUtil.fs.cp(uri.replace('file://', ''), dest);
    return 'file://' + dest;
  } catch (e) {
    // If copy fails (e.g. uri is already permanent), fall back to original
    console.log('[UploadQueue] persistFile fallback:', e?.message);
    return uri;
  }
};

// ─── Clean up a persisted pending file after a successful upload ──────────────
const deletePersisted = async (uri) => {
  try {
    if (uri.includes(PENDING_DIR.replace('file://', ''))) {
      await RNBlobUtil.fs.unlink(uri.replace('file://', ''));
    }
  } catch (_) {}
};

// ─── Read / write queue ───────────────────────────────────────────────────────
const readQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const writeQueue = async (q) => {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (_) {}
};

export const addToUploadQueue = async (task) => {
  const q = await readQueue();
  q.push(task);
  await writeQueue(q);
};

// ─── Cancel all pending uploads ───────────────────────────────────────────────
// Aborts the in-progress upload, deletes all queued Firestore messages, and
// clears the queue. Called after the user confirms the cancel Alert.
export const cancelUploadQueue = async () => {
  _cancelled = true;

  // Abort the in-flight RNBlobUtil request immediately
  try { _cancelCurrentTask?.cancel(); } catch (_) {}
  _cancelCurrentTask = null;

  // Clean up every queued task: remove its Firestore placeholder + local file
  const q = await readQueue();
  for (const task of q) {
    try {
      await firestore()
        .collection('chats').doc(task.chatId)
        .collection('messages').doc(task.msgId)
        .delete();
    } catch (_) {}
    await deletePersisted(task.localUri).catch(() => {});
  }
  await writeQueue([]);
};

// ─── Process all pending uploads ─────────────────────────────────────────────
export const processUploadQueue = async (onProgress) => {
  if (_processing) return;
  _cancelled  = false;
  _processing = true;

  try {
    const q = await readQueue();
    if (!q.length) return;

    const remaining = [];

    for (const task of q) {
      if (_cancelled) break; // user cancelled — stop processing further items

      const { msgId, chatId, localUri, s3Key, mimeType, fileName } = task;
      try {
        await uploadToS3(localUri, s3Key, mimeType, onProgress, (t) => {
          _cancelCurrentTask = t;
        });
        _cancelCurrentTask = null;

        if (_cancelled) break; // cancelled mid-upload; don't mark as sent

        // Mark message as sent (remove uploading status) — receiver can now see it
        await firestore()
          .collection('chats').doc(chatId)
          .collection('messages').doc(msgId)
          .update({ status: firestore.FieldValue.delete() });

        // Now that the file is on S3, notify receivers
        if (task.notif) {
          const { chatName, senderName, preview, participants, senderEmail, chatType } = task.notif;
          incrementUnread(chatId, participants, senderEmail);
          sendChatPushNotification(chatId, chatName, senderName, preview, participants, senderEmail, chatType);
        }

        // Keep a local copy so the sender can also delete it from device later
        const cacheName = fileName || s3Key.split('/').pop();
        await registerLocalFile(s3Key, localUri, cacheName);
        await deletePersisted(localUri);
        console.log('[UploadQueue] ✓ uploaded:', s3Key);
      } catch (err) {
        if (_cancelled) break;
        console.log('[UploadQueue] ✗ failed (will retry):', err?.message);
        remaining.push(task);
      }
    }

    if (!_cancelled) await writeQueue(remaining);
  } finally {
    _processing        = false;
    _cancelCurrentTask = null;
  }
};
