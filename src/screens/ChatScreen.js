import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert,
  ActionSheetIOS, StatusBar, Modal, Dimensions, SectionList,
  ScrollView, Linking, NativeModules, PanResponder, Animated,
} from 'react-native';
const { PHAssetHelper } = NativeModules;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  downloadFromS3, isFileDownloaded,
  deleteLocalFile, getLocalPath, getPresignedDownloadUrl,
} from '../config/S3Config';

import {
  sendChatPushNotification, markChatAsRead, incrementUnread,
} from '../functions/chat/chatUtils';

import {
  addToUploadQueue, persistFileForQueue,
} from '../functions/chat/uploadQueue';

import { startUploadManager, subscribeUpload, cancelUpload } from '../functions/chat/UploadManager';

import AddMembersModal from '../components/chat/AddMembersModal';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isSameDay = (tsA, tsB) => {
  if (!tsA || !tsB) return false;
  const a = tsA?.toDate ? tsA.toDate() : new Date(tsA);
  const b = tsB?.toDate ? tsB.toDate() : new Date(tsB);
  return a.toDateString() === b.toDateString();
};

const formatMsgTime = (ts) => {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const formatDayLabel = (ts) => {
  // Pending serverTimestamp arrives as null — treat as Today.
  if (!ts) return 'Today';
  const d   = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return 'Today';
  const now  = new Date();
  const diff = new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0);
  if (diff === 0) return 'Today';
  if (diff === 86_400_000) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const s3KeyFor = (chatId, fileName) => {
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mo   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const HH   = String(now.getHours()).padStart(2, '0');
  const mi   = String(now.getMinutes()).padStart(2, '0');
  const ss   = String(now.getSeconds()).padStart(2, '0');
  const stamp = `${dd}${mo}${yyyy}_${HH}${mi}${ss}`;

  const dot  = fileName.lastIndexOf('.');
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '') || 'file';
  const ext  = dot > 0 ? fileName.slice(dot) : '';

  return `chat/${chatId}/${base}_${stamp}${ext}`;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMP_RE = /rn_image_picker_lib_temp|^rn_|^tmp_/i;

// Extract the last path component from a file:// URI or path string, without query params.
const nameFromPath = (p) => (p || '').split('/').pop()?.split('?')[0] || '';

// Returns true if the base name (without extension) looks like a UUID or temp name.
const isTempName = (name) => {
  const base = name.replace(/\.[^.]+$/, '');
  return !name || TEMP_RE.test(name) || UUID_RE.test(base);
};

const assetToAttachment = (asset) => {
  const isVideo = asset.type?.startsWith('video');

  // Log everything iOS returns so we know which fields carry the real name.
  console.log('[Asset raw]', JSON.stringify({
    fileName: asset.fileName,
    originalPath: asset.originalPath,
    uri: asset.uri,
    id: asset.id,
    type: asset.type,
  }));

  // Try each source in order until we find a non-temp name.
  const sources = [
    asset.originalPath && nameFromPath(asset.originalPath),  // real Photos/Files path
    asset.fileName,                                           // picker-provided name
    nameFromPath(asset.uri),                                  // last URI segment
  ];

  const fileName = sources.find((n) => n && !isTempName(n))
    ?? (isVideo ? 'video.mp4' : 'photo.jpg');

  return {
    uri:      asset.uri,
    type:     isVideo ? 'video' : 'image',
    fileName,
    fileSize: asset.fileSize || 0,
    mimeType: asset.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
  };
};

// ─── Attachment Preview Modal ─────────────────────────────────────────────────
// Shows selected items before upload. User must tap Send to upload.
// Supports multiple items; Camera/Gallery buttons add more.

function AttachmentPreviewModal({ attachments, onAddCamera, onAddGallery, onRemove, onSend, onCancel, sending }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [caption,   setCaption]   = useState('');

  useEffect(() => {
    if (activeIdx >= attachments.length && attachments.length > 0) {
      setActiveIdx(attachments.length - 1);
    }
  }, [attachments.length]);

  if (!attachments || attachments.length === 0) return null;
  const active = attachments[Math.min(activeIdx, attachments.length - 1)];
  const activeSize = formatSize(active.fileSize);
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={pStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={pStyles.header}>
          <TouchableOpacity onPress={onCancel} style={pStyles.headerBtn}>
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={pStyles.headerTitle}>
            {attachments.length} {attachments.length === 1 ? 'item' : 'items'}
          </Text>
          <TouchableOpacity onPress={() => onSend(caption)} disabled={sending} style={pStyles.sendBtn}>
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Icon name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* Large preview */}
        <View style={pStyles.body}>
          {active.type === 'image' ? (
            <>
              <Image
                source={{ uri: active.uri }}
                style={pStyles.previewImage}
                resizeMode="contain"
              />
              {!!activeSize && (
                <View style={pStyles.sizeOverlay}>
                  <Text style={pStyles.sizeOverlayTxt}>{activeSize}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={pStyles.filePlaceholder}>
              <Icon name={active.type === 'video' ? 'videocam' : 'insert-drive-file'} size={72} color="#4B5563" />
              <Text style={pStyles.fileNameTxt} numberOfLines={2}>{active.fileName}</Text>
              {!!activeSize && <Text style={pStyles.fileSizeTxt}>{activeSize}</Text>}
            </View>
          )}
        </View>

        {/* Caption input */}
        <View style={pStyles.captionRow}>
          <TextInput
            style={pStyles.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor="#9CA3AF"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={500}
          />
        </View>

        {/* Thumbnail strip + Add more */}
        <View style={pStyles.strip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={pStyles.stripContent}
          >
            {attachments.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setActiveIdx(idx)}
                style={[pStyles.thumb, idx === activeIdx && pStyles.thumbActive]}
              >
                {item.type === 'image' ? (
                  <Image source={{ uri: item.uri }} style={pStyles.thumbImg} resizeMode="cover" />
                ) : (
                  <View style={pStyles.thumbFile}>
                    <Icon name={item.type === 'video' ? 'videocam' : 'insert-drive-file'} size={22} color="#9CA3AF" />
                  </View>
                )}
                <TouchableOpacity
                  style={pStyles.removeBtn}
                  onPress={() => {
                    onRemove(idx);
                    if (activeIdx >= idx && activeIdx > 0) setActiveIdx(activeIdx - 1);
                  }}
                >
                  <Icon name="cancel" size={17} color="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}

            {/* Add more: camera */}
            <TouchableOpacity style={pStyles.addBtn} onPress={onAddCamera}>
              <Icon name="camera-alt" size={24} color="#9CA3AF" />
              <Text style={pStyles.addTxt}>Camera</Text>
            </TouchableOpacity>

            {/* Add more: gallery */}
            <TouchableOpacity style={pStyles.addBtn} onPress={onAddGallery}>
              <Icon name="photo-library" size={24} color="#9CA3AF" />
              <Text style={pStyles.addTxt}>Gallery</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

}

const pStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 52, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  headerBtn:   { padding: 8 },
  sendBtn: {
    backgroundColor: '#319241', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, color: '#fff', fontSize: 15,
    fontWeight: '600', marginHorizontal: 8,
  },
  body:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  previewImage:  { width: SCREEN_W, height: '100%' },
  filePlaceholder: { alignItems: 'center', gap: 10 },
  fileNameTxt:   { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
  fileSizeTxt:   { color: '#9CA3AF', fontSize: 12 },

  sizeOverlay: {
    position: 'absolute', bottom: 8, right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sizeOverlayTxt: { color: '#fff', fontSize: 11, fontWeight: '600' },

  captionRow: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  captionInput: {
    color: '#fff', fontSize: 14,
    minHeight: 36, maxHeight: 80,
    borderBottomWidth: 1, borderBottomColor: '#4B5563',
    paddingVertical: 4,
  },

  // Thumbnail strip
  strip: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 10,
  },
  stripContent:  { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  thumb: {
    width: 64, height: 64, borderRadius: 8, overflow: 'visible',
    borderWidth: 2, borderColor: 'transparent',
  },
  thumbActive: { borderColor: '#319241' },
  thumbImg:    { width: 64, height: 64, borderRadius: 8 },
  thumbFile: {
    width: 64, height: 64, borderRadius: 8,
    backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#374151', borderRadius: 10,
  },
  addBtn: {
    width: 64, height: 64, borderRadius: 8, borderWidth: 1,
    borderColor: '#4B5563', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  addTxt: { color: '#9CA3AF', fontSize: 9, fontWeight: '600' },
});

// ─── Fullscreen Image Viewer ──────────────────────────────────────────────────

function ImageViewerPage({ message, myEmail }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    if (!message?.mediaKey) return;
    const isMe = message.senderId === myEmail;
    if (isMe) {
      getPresignedDownloadUrl(message.mediaKey).then(setUri).catch(() => {});
    } else {
      const local = getLocalPath(message.mediaKey);
      if (local) setUri('file://' + local);
    }
  }, [message, myEmail]);
  return (
    <View style={vStyles.page}>
      {uri
        ? <Image source={{ uri }} style={vStyles.image} resizeMode="contain" />
        : <ActivityIndicator color="#fff" size="large" />}
    </View>
  );
}

function ImageViewerModal({ images, initialIndex, myEmail, onClose }) {
  const [currentIdx, setCurrentIdx] = useState(initialIndex || 0);
  const flatRef = useRef(null);

  useEffect(() => {
    if (initialIndex !== undefined) setCurrentIdx(initialIndex);
  }, [initialIndex]);

  if (!images || images.length === 0) return null;
  const current = images[currentIdx] ?? images[0];

  const goTo = (idx) => {
    setCurrentIdx(idx);
    flatRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={vStyles.overlay}>
        {/* Header bar */}
        <View style={vStyles.header}>
          <TouchableOpacity style={vStyles.closeBtn} onPress={onClose}>
            <Icon name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {images.length > 1 && (
            <Text style={vStyles.counter}>{currentIdx + 1} / {images.length}</Text>
          )}
          <View style={{ width: 44 }} />
        </View>

        {/* Swipeable pages */}
        <FlatList
          ref={flatRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(m) => m.id}
          initialScrollIndex={initialIndex || 0}
          getItemLayout={(_, idx) => ({ length: SCREEN_W, offset: SCREEN_W * idx, index: idx })}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setCurrentIdx(idx);
          }}
          renderItem={({ item }) => <ImageViewerPage message={item} myEmail={myEmail} />}
        />

        {/* Left arrow */}
        {currentIdx > 0 && (
          <TouchableOpacity style={vStyles.arrowLeft} onPress={() => goTo(currentIdx - 1)}>
            <Icon name="chevron-left" size={40} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Right arrow */}
        {currentIdx < images.length - 1 && (
          <TouchableOpacity style={vStyles.arrowRight} onPress={() => goTo(currentIdx + 1)}>
            <Icon name="chevron-right" size={40} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Caption */}
        {!!current?.fileName && (
          <Text style={vStyles.caption} numberOfLines={1}>{current.fileName}</Text>
        )}
      </View>
    </Modal>
  );
}

const vStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: '#000' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 8, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  closeBtn: { padding: 8 },
  counter: {
    flex: 1, textAlign: 'center',
    color: '#fff', fontSize: 15, fontWeight: '600',
  },
  page:  { width: SCREEN_W, flex: 1, justifyContent: 'center', alignItems: 'center' },
  image: { width: SCREEN_W, height: '85%' },
  arrowLeft: {
    position: 'absolute', left: 8, top: '50%', marginTop: -28,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 28, padding: 4, zIndex: 10,
  },
  arrowRight: {
    position: 'absolute', right: 8, top: '50%', marginTop: -28,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 28, padding: 4, zIndex: 10,
  },
  caption: {
    position: 'absolute', bottom: 40, left: 16, right: 16, zIndex: 10,
    color: '#fff', textAlign: 'center', fontSize: 13,
  },
});

// ─── Shared Media Library ─────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { key: 'all',   label: 'All',       icon: 'perm-media'       },
  { key: 'image', label: 'Photos',    icon: 'photo'            },
  { key: 'video', label: 'Videos',    icon: 'videocam'         },
  { key: 'file',  label: 'Documents', icon: 'insert-drive-file'},
];

const DATE_FILTERS = [
  { key: 'all',    label: 'All' },
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

const fmtShort = (d) =>
  d?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) ?? 'Select';

function PresignedThumb({ mediaKey }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    getPresignedDownloadUrl(mediaKey).then(setUri).catch(() => {});
  }, [mediaKey]);
  return uri
    ? <Image source={{ uri }} style={mStyles.thumb} resizeMode="cover" />
    : <View style={[mStyles.thumb, mStyles.thumbPlaceholder]}>
        <Icon name="image" size={20} color="#9CA3AF" />
      </View>;
}

const SORT_OPTIONS = [
  { key: 'date', label: 'Date', icon: 'schedule' },
  { key: 'name', label: 'Name', icon: 'sort-by-alpha' },
  { key: 'size', label: 'Size', icon: 'data-usage' },
];

function SharedMediaModal({ messages, myEmail, onClose, onViewImage }) {
  const [typeFilter,    setTypeFilter]    = useState('all');
  const [dateFilter,    setDateFilter]    = useState('all');
  const [sortBy,        setSortBy]        = useState('date');
  const [sortDir,       setSortDir]       = useState('desc');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [customFrom,    setCustomFrom]    = useState(null);
  const [customTo,      setCustomTo]      = useState(null);
  const [pickerTarget,  setPickerTarget]  = useState(null);   // 'from' | 'to'
  const [showPicker,    setShowPicker]    = useState(false);
  const [selectMode,    setSelectMode]    = useState(false);
  const [selectedKeys,  setSelectedKeys]  = useState(new Set());
  const [downloadedMap, setDownloadedMap] = useState({});

  const openPicker = (target) => {
    setPickerTarget(target);
    setShowPicker(true);
  };

  const onPickerChange = (event, date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (!date || (Platform.OS === 'android' && event.type !== 'set')) return;
    if (pickerTarget === 'from') setCustomFrom(date);
    else setCustomTo(date);
  };

  // Load downloaded state for all media
  useEffect(() => {
    (async () => {
      const map = {};
      for (const m of messages) {
        if (m.mediaKey) map[m.mediaKey] = await isFileDownloaded(m.mediaKey);
      }
      setDownloadedMap(map);
    })();
  }, [messages]);

  // Any media item can be deleted from local device storage.
  // Sent items have no persistent local cache, so deleteLocalFile is a no-op for them.
  const canDelete = () => true;

  // Filter messages by type then date
  const filteredMedia = useMemo(() => {
    const media = messages.filter(
      (m) => (m.type === 'image' || m.type === 'video' || m.type === 'file')
          && (m.senderId === myEmail || !!downloadedMap[m.mediaKey])
          && (typeFilter === 'all' || m.type === typeFilter),
    );
    if (dateFilter === 'all') return media;
    const now = new Date();
    return media.filter((m) => {
      if (!m.timestamp) return true; // pending serverTimestamp — show under any filter
      const d = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp);
      if (isNaN(d.getTime())) return true;
      if (dateFilter === 'today') return d.toDateString() === now.toDateString();
      if (dateFilter === 'week')  return d >= new Date(now - 7 * 24 * 60 * 60 * 1000);
      if (dateFilter === 'month') {
        const ago = new Date(now); ago.setMonth(ago.getMonth() - 1); return d >= ago;
      }
      if (dateFilter === 'custom') {
        const from = customFrom ? new Date(customFrom.setHours(0, 0, 0, 0)) : null;
        const to   = customTo   ? new Date(customTo.setHours(23, 59, 59, 999)) : null;
        if (from && d < from) return false;
        if (to   && d > to)   return false;
        return true;
      }
      return true;
    });
  }, [messages, typeFilter, dateFilter, customFrom, customTo, downloadedMap]);

  // Flat list sorted by name or size (used when sortBy !== 'date')
  const sortedFlatList = useMemo(() => {
    const arr = [...filteredMedia];
    if (sortBy === 'name') {
      arr.sort((a, b) => {
        const cmp = (a.fileName || '').toLowerCase().localeCompare((b.fileName || '').toLowerCase());
        return sortDir === 'asc' ? cmp : -cmp;
      });
    } else if (sortBy === 'size') {
      arr.sort((a, b) => {
        const cmp = (b.fileSize || 0) - (a.fileSize || 0);
        return sortDir === 'desc' ? cmp : -cmp;
      });
    }
    return arr;
  }, [filteredMedia, sortBy, sortDir]);

  // Date-grouped sections (used when sortBy === 'date')
  const sections = useMemo(() => {
    const groups = {};
    filteredMedia.forEach((m) => {
      const label = formatDayLabel(m.timestamp);
      if (!groups[label]) groups[label] = { title: label, data: [], ts: m.timestamp };
      groups[label].data.push(m);
    });
    return Object.values(groups).sort((a, b) => {
      const ta = a.ts ? (a.ts.toDate ? a.ts.toDate() : new Date(a.ts)) : new Date();
      const tb = b.ts ? (b.ts.toDate ? b.ts.toDate() : new Date(b.ts)) : new Date();
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });
  }, [filteredMedia, typeFilter, sortDir]);

  const deletableKeys = useMemo(
    () => filteredMedia.map((m) => m.mediaKey).filter(Boolean),
    [filteredMedia],
  );

  const imageMessages = useMemo(
    () => filteredMedia.filter((m) => m.type === 'image'),
    [filteredMedia],
  );

  const toggleSelect = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedKeys.size === deletableKeys.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(deletableKeys));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedKeys.size === 0) return;
    Alert.alert(
      `Delete ${selectedKeys.size} item${selectedKeys.size > 1 ? 's' : ''}?`,
      'Removes local copies only. Files stay on S3.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            for (const key of selectedKeys) {
              await deleteLocalFile(key);
            }
            setDownloadedMap((prev) => {
              const next = { ...prev };
              selectedKeys.forEach((k) => { next[k] = false; });
              return next;
            });
            setSelectedKeys(new Set());
            setSelectMode(false);
          },
        },
      ],
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  };

  const renderItem = ({ item: msg }) => {
    const isMe    = msg.senderId === myEmail;
    const isImage = msg.type === 'image';
    const isVideo = msg.type === 'video';
    const dl      = downloadedMap[msg.mediaKey];
    const deletable = canDelete(msg);
    const checked = selectedKeys.has(msg.mediaKey);

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => {
          if (selectMode) {
            if (deletable) toggleSelect(msg.mediaKey);
            return;
          }
          if (isImage) { onViewImage(msg, imageMessages); return; }
          if (isVideo) {
            if (isMe) {
              getPresignedDownloadUrl(msg.mediaKey)
                .then((url) => Linking.openURL(url))
                .catch(() => Alert.alert('Cannot play video'));
            } else if (dl) {
              Linking.openURL('file://' + getLocalPath(msg.mediaKey))
                .catch(() => Alert.alert('Cannot play video'));
            } else {
              Alert.alert('Not downloaded', 'Download this video first to play it.');
            }
          }
        }}
        style={[mStyles.item, selectMode && checked && mStyles.itemSelected]}
      >
        {/* Thumbnail */}
        <View style={mStyles.thumbBox}>
          {isImage || isVideo ? (
            isMe
              ? <PresignedThumb mediaKey={msg.mediaKey} />
              : dl
                ? <Image source={{ uri: 'file://' + getLocalPath(msg.mediaKey) }} style={mStyles.thumb} resizeMode="cover" />
                : <View style={[mStyles.thumb, mStyles.thumbPlaceholder]}>
                    <Icon name={isVideo ? 'videocam' : 'image'} size={20} color="#9CA3AF" />
                  </View>
          ) : (
            <View style={[mStyles.thumb, mStyles.thumbPlaceholder]}>
              <Icon name="insert-drive-file" size={20} color="#9CA3AF" />
            </View>
          )}
          {isVideo && (
            <View style={mStyles.playOverlay}>
              <Icon name="play-circle-outline" size={22} color="#fff" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={mStyles.itemInfo}>
          <Text style={mStyles.itemName} numberOfLines={1}>
            {msg.fileName || (isImage ? 'Photo' : isVideo ? 'Video' : 'File')}
          </Text>
          <Text style={mStyles.itemMeta}>
            {isMe ? 'You' : (msg.senderName || msg.senderId)}
            {'  ·  '}
            {formatMsgTime(msg.timestamp)}
            {msg.fileSize ? `  ·  ${formatSize(msg.fileSize)}` : ''}
          </Text>
          {!isMe && (
            <Text style={[mStyles.itemStatus, { color: dl ? '#319241' : '#9CA3AF' }]}>
              {dl ? 'Downloaded' : 'Not downloaded'}
            </Text>
          )}
        </View>

        {/* Select checkbox OR delete button */}
        {selectMode ? (
          <View style={[mStyles.checkbox, checked && mStyles.checkboxChecked]}>
            {checked && <Icon name="check" size={14} color="#fff" />}
          </View>
        ) : (
          <TouchableOpacity
            style={mStyles.deleteBtn}
            onPress={() => {
              Alert.alert('Delete from device?', 'This removes the local copy. The file stays on the server.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete', style: 'destructive',
                  onPress: async () => {
                    await deleteLocalFile(msg.mediaKey);
                    setDownloadedMap((prev) => ({ ...prev, [msg.mediaKey]: false }));
                  },
                },
              ]);
            }}
          >
            <Icon name="delete-outline" size={22} color="#DC2626" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const allSelected = deletableKeys.length > 0 && selectedKeys.size === deletableKeys.length;

  return (
    <Modal visible animationType="slide" onRequestClose={() => { exitSelectMode(); onClose(); }}>
      <View style={mStyles.container}>
        {/* Header */}
        <View style={mStyles.header}>
          {selectMode ? (
            <>
              <TouchableOpacity onPress={exitSelectMode} style={{ padding: 8 }}>
                <Icon name="close" size={22} color="#111827" />
              </TouchableOpacity>
              <Text style={mStyles.headerTitle}>
                {selectedKeys.size} selected
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  style={mStyles.headerAction}
                  onPress={handleSelectAll}
                >
                  <Text style={mStyles.headerActionTxt}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[mStyles.headerAction, mStyles.deleteAction, selectedKeys.size === 0 && { opacity: 0.4 }]}
                  onPress={handleDeleteSelected}
                  disabled={selectedKeys.size === 0}
                >
                  <Icon name="delete" size={16} color="#fff" />
                  <Text style={mStyles.deleteActionTxt}>Delete</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={mStyles.headerTitle}>Shared Media</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  style={[mStyles.iconBtn, sortBy !== 'date' && mStyles.iconBtnActive]}
                  onPress={() => setShowSortSheet(true)}
                >
                  <Icon name="filter-list" size={20} color={sortBy !== 'date' ? '#319241' : '#6B7280'} />
                </TouchableOpacity>
                {deletableKeys.length > 0 && (
                  <TouchableOpacity
                    style={mStyles.headerAction}
                    onPress={() => setSelectMode(true)}
                  >
                    <Text style={mStyles.headerActionTxt}>Select</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
                  <Icon name="close" size={22} color="#111827" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Type filter tabs */}
        <View style={mStyles.typeBar}>
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[mStyles.typeTab, active && mStyles.typeTabActive]}
                onPress={() => setTypeFilter(f.key)}
              >
                <Icon name={f.icon} size={16} color={active ? '#319241' : '#9CA3AF'} />
                <Text style={[mStyles.typeTabTxt, active && mStyles.typeTabTxtActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={mStyles.filterBar}
          contentContainerStyle={mStyles.filterContent}
        >
          {DATE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[mStyles.chip, dateFilter === f.key && mStyles.chipActive]}
              onPress={() => setDateFilter(f.key)}
            >
              <Text style={[mStyles.chipTxt, dateFilter === f.key && mStyles.chipTxtActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Custom date range row */}
        {dateFilter === 'custom' && (
          <View style={mStyles.customRow}>
            <TouchableOpacity
              style={[mStyles.dateBtn, pickerTarget === 'from' && showPicker && mStyles.dateBtnActive]}
              onPress={() => openPicker('from')}
            >
              <Icon name="event" size={15} color="#319241" style={{ marginRight: 5 }} />
              <Text style={mStyles.dateBtnTxt}>{customFrom ? fmtShort(customFrom) : 'From'}</Text>
            </TouchableOpacity>
            <Icon name="arrow-forward" size={16} color="#9CA3AF" />
            <TouchableOpacity
              style={[mStyles.dateBtn, pickerTarget === 'to' && showPicker && mStyles.dateBtnActive]}
              onPress={() => openPicker('to')}
            >
              <Icon name="event" size={15} color="#319241" style={{ marginRight: 5 }} />
              <Text style={mStyles.dateBtnTxt}>{customTo ? fmtShort(customTo) : 'To'}</Text>
            </TouchableOpacity>
            {(customFrom || customTo) && (
              <TouchableOpacity
                style={mStyles.clearBtn}
                onPress={() => { setCustomFrom(null); setCustomTo(null); }}
              >
                <Icon name="close" size={14} color="#6B7280" />
                <Text style={mStyles.clearBtnTxt}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* iOS date picker sheet */}
        {Platform.OS === 'ios' && showPicker && (
          <Modal visible transparent animationType="slide">
            <View style={mStyles.pickerOverlay}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPicker(false)} />
              <View style={mStyles.pickerSheet}>
                <View style={mStyles.pickerHeader}>
                  <Text style={mStyles.pickerTitle}>
                    {pickerTarget === 'from' ? 'From Date' : 'To Date'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowPicker(false)} style={{ padding: 8 }}>
                    <Text style={mStyles.pickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerTarget === 'from' ? (customFrom || new Date()) : (customTo || new Date())}
                  mode="date"
                  display="inline"
                  maximumDate={new Date()}
                  onChange={onPickerChange}
                  accentColor="#319241"
                  themeVariant="light"
                  style={{ alignSelf: 'center' }}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Android date picker (native dialog) */}
        {Platform.OS === 'android' && showPicker && (
          <DateTimePicker
            value={pickerTarget === 'from' ? (customFrom || new Date()) : (customTo || new Date())}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={onPickerChange}
          />
        )}

        {filteredMedia.length === 0 ? (
          <View style={mStyles.empty}>
            <Icon
              name={TYPE_FILTERS.find((f) => f.key === typeFilter)?.icon ?? 'perm-media'}
              size={56}
              color="#D1D5DB"
            />
            <Text style={mStyles.emptyText}>
              {typeFilter === 'all' ? 'No media found' :
               typeFilter === 'image' ? 'No photos found' :
               typeFilter === 'video' ? 'No videos found' : 'No documents found'}
            </Text>
          </View>
        ) : sortBy === 'date' ? (
          <SectionList
            style={{ flex: 1 }}
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={mStyles.sectionHeader}>
                <Text style={mStyles.sectionTitle}>{section.title}</Text>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={sortedFlatList}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}

        {/* Sort sheet */}
        {showSortSheet && (
          <Modal visible transparent animationType="slide" onRequestClose={() => setShowSortSheet(false)}>
            <TouchableOpacity
              style={mStyles.sortOverlay}
              activeOpacity={1}
              onPress={() => setShowSortSheet(false)}
            >
              <TouchableOpacity activeOpacity={1} style={mStyles.sortSheet}>
                <View style={mStyles.sortHandle} />
                <Text style={mStyles.sortTitle}>Sort by</Text>
                {SORT_OPTIONS.map((opt) => {
                  const active = sortBy === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[mStyles.sortOpt, active && mStyles.sortOptActive]}
                      onPress={() => {
                        if (active) {
                          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                        } else {
                          setSortBy(opt.key);
                          setSortDir(opt.key === 'size' ? 'desc' : 'asc');
                        }
                      }}
                    >
                      <Icon name={opt.icon} size={22} color={active ? '#319241' : '#6B7280'} />
                      <Text style={[mStyles.sortOptTxt, active && mStyles.sortOptTxtActive]}>
                        {opt.label}
                      </Text>
                      <View style={{ flex: 1 }} />
                      {active ? (
                        <View style={mStyles.dirBadge}>
                          <Icon
                            name={sortDir === 'asc' ? 'arrow-upward' : 'arrow-downward'}
                            size={14}
                            color="#319241"
                          />
                          <Text style={mStyles.dirBadgeTxt}>
                            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
                          </Text>
                        </View>
                      ) : (
                        <Icon name="chevron-right" size={20} color="#D1D5DB" />
                      )}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={mStyles.sortDoneBtn}
                  onPress={() => setShowSortSheet(false)}
                >
                  <Text style={mStyles.sortDoneTxt}>Done</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle:     { fontSize: 17, fontWeight: '700', color: '#111827', flex: 1, marginLeft: 4 },
  headerAction: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#D1D5DB',
  },
  headerActionTxt: { fontSize: 13, fontWeight: '600', color: '#374151' },
  deleteAction: {
    backgroundColor: '#DC2626', borderColor: '#DC2626',
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  deleteActionTxt: { fontSize: 13, fontWeight: '600', color: '#fff' },

  // Type filter tabs
  typeBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 5,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  typeTabActive:   { borderBottomColor: '#319241' },
  typeTabTxt:      { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  typeTabTxtActive:{ color: '#319241' },

  // Date filter chips
  filterBar:     { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filterContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  chipActive:    { backgroundColor: '#319241' },
  chipTxt:       { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTxtActive: { color: '#fff' },

  // Sort icon button (header)
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: '#EDF7EF', borderWidth: 1, borderColor: '#A7D7AD' },

  // Sort bottom sheet
  sortOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sortSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingBottom: 40,
  },
  sortHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sortTitle: {
    fontSize: 16, fontWeight: '700', color: '#111827',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4,
  },
  sortOpt: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  sortOptActive:    { backgroundColor: '#F0FDF4' },
  sortOptTxt:       { fontSize: 15, fontWeight: '500', color: '#374151' },
  sortOptTxtActive: { fontSize: 15, fontWeight: '700', color: '#319241' },
  dirBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDF7EF', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#A7D7AD',
  },
  dirBadgeTxt:  { fontSize: 12, fontWeight: '600', color: '#319241' },
  sortDoneBtn: {
    marginHorizontal: 20, marginTop: 14,
    backgroundColor: '#319241', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  sortDoneTxt:  { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Section
  sectionHeader: {
    backgroundColor: '#F9FAFB', paddingHorizontal: 16, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },

  // Item row
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  itemSelected:  { backgroundColor: '#F0FDF4' },
  thumbBox:      { position: 'relative' },
  thumb:         { width: 54, height: 54, borderRadius: 8 },
  thumbPlaceholder: { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  playOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  itemInfo:      { flex: 1, marginLeft: 12 },
  itemName:      { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemMeta:      { fontSize: 12, color: '#6B7280', marginTop: 2 },
  itemStatus:    { fontSize: 11, marginTop: 2 },
  deleteBtn:     { padding: 8 },

  // Checkbox
  checkbox: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked:  { backgroundColor: '#319241', borderColor: '#319241' },
  checkboxDisabled: { borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  // Custom date range
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#EDF7EF',
    borderBottomWidth: 1, borderBottomColor: '#C6E6CB',
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center',
    flex: 1, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#A7D7AD',
    backgroundColor: '#fff',
  },
  dateBtnActive: { borderColor: '#319241', backgroundColor: '#F0FDF4' },
  dateBtnTxt:    { fontSize: 13, fontWeight: '600', color: '#1F2937', flex: 1 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#F3F4F6', borderRadius: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  clearBtnTxt:   { fontSize: 12, color: '#374151', fontWeight: '600' },

  // iOS picker sheet
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 34, borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  pickerTitle:   { fontSize: 16, fontWeight: '700', color: '#111827' },
  pickerDone:    { fontSize: 16, fontWeight: '700', color: '#319241' },
});

// ─── Media bubble ─────────────────────────────────────────────────────────────

function MediaBubble({ message, isMe, onTap }) {
  const [downloaded,   setDownloaded]   = useState(false);
  const [localUri,     setLocalUri]     = useState(null);
  const [presignedUri, setPresignedUri] = useState(null);
  const [progress,     setProgress]     = useState(0);
  const [busy,         setBusy]         = useState(false);

  const isUploading = message.status === 'uploading';

  useEffect(() => {
    // Skip while file is still uploading — it doesn't exist on S3 yet
    if (!message.mediaKey || isUploading) return;
    if (isMe) {
      getPresignedDownloadUrl(message.mediaKey).then(setPresignedUri).catch(() => {});
    } else {
      isFileDownloaded(message.mediaKey).then((yes) => {
        setDownloaded(yes);
        if (yes) setLocalUri('file://' + getLocalPath(message.mediaKey));
      });
    }
  }, [message.mediaKey, isMe, isUploading]); // isUploading in deps → re-fetches when upload finishes

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ext  = message.fileName?.split('.').pop() || 'jpg';
      const name = `${message.id}.${ext}`;
      const path = await downloadFromS3(message.mediaKey, name, (p) => setProgress(p));
      setLocalUri('file://' + path);
      setDownloaded(true);
    } catch {
      Alert.alert('Download failed', 'Please try again.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const deleteLocal = () => {
    Alert.alert(
      'Delete from device?',
      'The file will remain on S3 and can be re-downloaded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteLocalFile(message.mediaKey);
            setDownloaded(false);
            setLocalUri(null);
          },
        },
      ],
    );
  };

  const openFile = async () => {
    if (!downloaded || !localUri) return;
    try { await Linking.openURL(localUri); } catch { Alert.alert('Cannot open file'); }
  };

  const openVideo = async () => {
    const uri = isMe ? presignedUri : localUri;
    if (!uri) {
      if (!isMe && !downloaded) Alert.alert('Not downloaded', 'Download the video first to play it.');
      return;
    }
    try { await Linking.openURL(uri); } catch { Alert.alert('Cannot play video', 'No video player found.'); }
  };

  const isImage    = message.type === 'image';
  const isVideo    = message.type === 'video';
  const displayUri  = isMe ? presignedUri : localUri;
  const showPreview = !!displayUri;

  // File is still uploading — show a placeholder so neither side tries to open/download it
  if (isUploading) {
    return (
      <View style={styles.uploadingOverlay}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />
        <Text style={styles.uploadingText}>{isMe ? 'Sending…' : 'File pending…'}</Text>
      </View>
    );
  }

  return (
    <View>
      {(isImage || isVideo) && (
        <TouchableOpacity
          onPress={() => {
            if (isImage) onTap?.(message);
            else if (isVideo) openVideo();
          }}
          activeOpacity={0.8}
        >
          <View style={styles.mediaThumbnailWrap}>
            {showPreview
              ? <Image source={{ uri: displayUri }} style={styles.mediaThumbnail} resizeMode="cover" />
              : <View style={[styles.mediaThumbnail, styles.mediaPlaceholder]}>
                  <Icon name={isVideo ? 'videocam' : 'image'} size={36} color="#9CA3AF" />
                </View>}
            {isVideo && (
              <View style={styles.playIcon}>
                <Icon name="play-circle-outline" size={40} color="#fff" />
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}

      {!isImage && !isVideo && (
        <TouchableOpacity onPress={openFile} disabled={!downloaded}>
          <View style={styles.fileRow}>
            <Icon name="insert-drive-file" size={32} color="#6B7280" />
            <Text style={styles.fileName} numberOfLines={1}>
              {message.fileName || 'File'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {!isMe && (
        <View style={styles.mediaActions}>
          {busy ? (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color="#319241" />
              <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
            </View>
          ) : downloaded ? (
            <TouchableOpacity style={styles.mediaActionBtn} onPress={deleteLocal}>
              <Icon name="delete-outline" size={16} color="#DC2626" />
              <Text style={[styles.mediaActionTxt, { color: '#DC2626' }]}>Delete from device</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.mediaActionBtn} onPress={download}>
              <Icon name="file-download" size={16} color="#319241" />
              <Text style={[styles.mediaActionTxt, { color: '#319241' }]}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function ReplyQuote({ replyTo, isMe, onPress }) {
  if (!replyTo) return null;
  const preview =
    replyTo.type === 'text' ? replyTo.text :
    replyTo.type === 'image' ? '📷 Photo' :
    replyTo.type === 'video' ? '🎬 Video' : '📎 File';
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress?.(replyTo.id)}
      style={[styles.replyQuote, isMe ? styles.replyQuoteMe : styles.replyQuoteOther]}
    >
      <View style={[styles.replyQuoteAccent, isMe ? styles.replyQuoteAccentMe : styles.replyQuoteAccentOther]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.replyQuoteSender, isMe && styles.replyQuoteSenderMe]} numberOfLines={1}>
          {replyTo.senderName || replyTo.senderId}
        </Text>
        <Text style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]} numberOfLines={2}>
          {preview}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// Split text into plain + @mention spans for inline highlight rendering
function renderMentionText(text, mentions, isMe) {
  if (!text) return null;
  if (!mentions?.length) return text;
  const mentionNames = mentions.map((m) => m.name);
  // Build a regex that matches any @MentionName in the text
  const escaped = mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    if (part.startsWith('@') && mentionNames.includes(part.slice(1))) {
      return (
        <Text key={i} style={isMe ? styles.mentionSpanMe : styles.mentionSpan}>
          {part}
        </Text>
      );
    }
    return part;
  });
}

function MessageBubble({ message, isMe, isGroup, onMediaTap, onSwipeReply, onPressReply, highlighted }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const swipedRef  = useRef(false);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      // allow slide in both directions but cap at ±60
      const dx = Math.max(-60, Math.min(60, g.dx));
      translateX.setValue(dx);
      if (!swipedRef.current && Math.abs(dx) >= 40) {
        swipedRef.current = true;
      }
    },
    onPanResponderRelease: (_, g) => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
      if (swipedRef.current) {
        swipedRef.current = false;
        onSwipeReply?.(message);
      }
    },
    onPanResponderTerminate: (_e, _g) => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
      swipedRef.current = false;
    },
  })).current;

  if (message.type === 'system') {
    return (
      <View style={styles.systemNotice}>
        <Text style={styles.systemNoticeText}>{message.text}</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.bubbleWrap,
        isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther,
        { transform: [{ translateX }] },
        highlighted && styles.bubbleHighlight,
      ]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {isGroup && !isMe && (
          <Text style={styles.bubbleSender}>{message.senderName || message.senderId}</Text>
        )}
        <ReplyQuote replyTo={message.replyTo} isMe={isMe} onPress={onPressReply} />
        {message.type === 'text' ? (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            {renderMentionText(message.text, message.mentions, isMe)}
          </Text>
        ) : (
          <>
            <MediaBubble message={message} isMe={isMe} onTap={onMediaTap} />
            {!!message.text && (
              <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe, { marginTop: 6 }]}>
                {renderMentionText(message.text, message.mentions, isMe)}
              </Text>
            )}
          </>
        )}
        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
          {formatMsgTime(message.timestamp)}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─────────────────── Date separator ───────────────────────────────────────────────────────────

function DateSeparator({ timestamp }) {
  return (
    <View style={styles.dateSep}>
      <View style={styles.dateLine} />
      <Text style={styles.dateLabel}>{formatDayLabel(timestamp)}</Text>
      <View style={styles.dateLine} />
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ChatScreen({ route, navigation }) {
  const { chatId, chatName, chatType } = route.params;
  const insets = useSafeAreaInsets();

  const [myEmail,  setMyEmail]  = useState('');
  const [myName,   setMyName]   = useState('');
  const [isAgent,  setIsAgent]  = useState(false);
  const [messages,         setMessages]         = useState([]);
  const [chatMeta,         setChatMeta]         = useState(null);

  // Refs so the navigation header callback always reads fresh values
  const myEmailRef  = useRef('');
  const chatMetaRef = useRef(null);
  useEffect(() => { myEmailRef.current  = myEmail;  }, [myEmail]);
  useEffect(() => { chatMetaRef.current = chatMeta; }, [chatMeta]);
  const [inputText,        setInputText]        = useState('');
  const [sending,          setSending]          = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadProg, setUploadProg] = useState(0);
  const [replyTo,            setReplyTo]            = useState(null); // message being replied to
  const [highlightedId,      setHighlightedId]      = useState(null); // briefly flash scrolled-to msg
  const [pendingAttachments, setPendingAttachments] = useState([]); // preview before send
  const [viewerImages,     setViewerImages]     = useState([]);
  const [viewerIndex,      setViewerIndex]      = useState(0);
  const [showViewer,       setShowViewer]       = useState(false);
  const [showMediaLib,     setShowMediaLib]     = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState([]); // members matching @query
  const [mentionQuery,       setMentionQuery]       = useState(null); // active @query or null
  const inputRef = useRef(null);

  const listRef         = useRef(null);
  const filteredMsgsRef = useRef([]);   // mirror of filtered list for index lookups

  const scrollToReply = useCallback((replyMsgId) => {
    if (!replyMsgId) return;
    const idx = filteredMsgsRef.current.findIndex((m) => m.id === replyMsgId);
    if (idx === -1) return;
    try {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    } catch (_) {}
    setHighlightedId(replyMsgId);
    setTimeout(() => setHighlightedId(null), 1200);
  }, []);

  useEffect(() => {
    AsyncStorage.multiGet(['callUserEmail', 'callUserName', 'userRole']).then((pairs) => {
      const email = pairs[0][1] || '';
      const name  = pairs[1][1] || email;
      setMyEmail(email);
      setMyName(name);
      setIsAgent(pairs[2][1] === 'Agent');
    });
  }, []);

  useEffect(() => {
    const unsub = firestore()
      .collection('chats').doc(chatId)
      .onSnapshot((snap) => setChatMeta({ id: snap.id, ...snap.data() }), () => {});
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    const unsub = firestore()
      .collection('chats').doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(200)
      .onSnapshot(
        (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.log('[ChatScreen] messages error:', err?.message),
      );
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    if (!myEmail) return;
    markChatAsRead(chatId, myEmail);
  }, [chatId, myEmail, messages.length]);

  // Mirror global upload state into local component state for the progress bar
  useEffect(() => {
    const unsub = subscribeUpload(({ running, progress }) => {
      setUploading(running);
      setUploadProg(progress);
    });
    // Kick off any uploads that were queued while on another screen
    startUploadManager();
    return unsub;
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: chatName,
      headerStyle: { backgroundColor: '#319241' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      // Custom back button — prevents iOS from showing the previous screen name as label
      // and ensures the tap handler works reliably on all devices.
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-back-ios" size={22} color="#fff" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {chatType === 'group' && (
            <TouchableOpacity
              onPress={() => setShowAddMembers(true)}
              style={{ padding: 8 }}
            >
              <Icon name={isAgent ? 'group-add' : 'group'} size={22} color="#fff" />
            </TouchableOpacity>
          )}
          {/* Voice conference call for group, direct voice call for 1-to-1 */}
          <TouchableOpacity
            onPress={() => {
              if (chatType === 'group') {
                // Build participant list for the conference from chatMeta
                const parts = (chatMetaRef.current?.participants || [])
                  .filter((e) => e !== myEmailRef.current);
                const names = chatMetaRef.current?.participantNames || {};
                const preselected = parts.map((e) => ({ email: e, name: names[e] || e }));
                navigation.navigate('ConferenceCallScreen', {
                  callType: 'voice',
                  preselectedUsers: preselected,
                });
              } else {
                // Direct 1-to-1 voice call — derive the other person from participants
                const other = (chatMetaRef.current?.participants || []).find((e) => e !== myEmailRef.current);
                const names = chatMetaRef.current?.participantNames || {};
                if (other) navigation.navigate('VoiceCallScreen', { outgoingUser: { email: other, name: names[other] || other } });
              }
            }}
            style={{ padding: 8 }}
          >
            <Icon name="call" size={22} color="#fff" />
          </TouchableOpacity>
          {/* Video conference call for group, direct video call for 1-to-1 */}
          <TouchableOpacity
            onPress={() => {
              if (chatType === 'group') {
                const parts = (chatMetaRef.current?.participants || [])
                  .filter((e) => e !== myEmailRef.current);
                const names = chatMetaRef.current?.participantNames || {};
                const preselected = parts.map((e) => ({ email: e, name: names[e] || e }));
                navigation.navigate('ConferenceCallScreen', {
                  callType: 'video',
                  preselectedUsers: preselected,
                });
              } else {
                const other = (chatMetaRef.current?.participants || []).find((e) => e !== myEmailRef.current);
                const names = chatMetaRef.current?.participantNames || {};
                if (other) navigation.navigate('VideoCallScreen', { outgoingUser: { email: other, name: names[other] || other } });
              }
            }}
            style={{ padding: 8 }}
          >
            <Icon name="videocam" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowMediaLib(true)}
            style={{ padding: 8, marginRight: 4 }}
          >
            <Icon name="photo-library" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, chatName, chatType]);

  const sendMessage = useCallback(async (type, payload, replyMsg = null) => {
    if (!myEmail) return;
    const msgData = {
      senderId:   myEmail,
      senderName: myName,
      type,
      timestamp:  firestore.FieldValue.serverTimestamp(),
      readBy:     [myEmail],
      ...(replyMsg ? {
        replyTo: {
          id:         replyMsg.id,
          senderId:   replyMsg.senderId,
          senderName: replyMsg.senderName || replyMsg.senderId,
          type:       replyMsg.type,
          text:       replyMsg.text || '',
        },
      } : {}),
      ...payload,
    };
    try {
      const msgRef = await firestore()
        .collection('chats').doc(chatId)
        .collection('messages').add(msgData);

      const preview =
        type === 'text'  ? payload.text :
        type === 'image' ? '📷 Photo' :
        type === 'video' ? '🎬 Video' : '📎 File';

      await firestore().collection('chats').doc(chatId).update({
        lastMessage:     { ...msgData, text: preview, id: msgRef.id },
        lastMessageTime: firestore.FieldValue.serverTimestamp(),
      });

      const meta = chatMetaRef.current;
      if (meta?.participants) {
        incrementUnread(chatId, meta.participants, myEmail);
        sendChatPushNotification(
          chatId, chatName, myName, preview,
          meta.participants, myEmail, chatType,
        );
      }
    } catch (e) {
      console.log('[ChatScreen] send error:', e?.message);
    }
  }, [myEmail, myName, chatId, chatName, chatMeta, chatType]);

  // Parse @mentions out of text — returns [{ email, name }] for each @Name found
  const extractMentions = (text) => {
    const names = chatMeta?.participantNames || {};
    const found = [];
    const nameToEmail = {};
    Object.entries(names).forEach(([email, name]) => {
      if (email !== myEmail) nameToEmail[name] = email;
    });
    const regex = /@([^\s@][^@\n]*?)(?=\s|$)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const email = nameToEmail[m[1].trim()];
      if (email) found.push({ email, name: m[1].trim() });
    }
    return found;
  };

  const handleMentionInput = (text) => {
    setInputText(text);
    // Find the last @ before the cursor that hasn't been closed by a space
    const atIdx = text.lastIndexOf('@');
    if (atIdx === -1) { setMentionQuery(null); setMentionSuggestions([]); return; }
    const afterAt = text.slice(atIdx + 1);
    // If there's a space after @query it means the mention was already completed
    if (afterAt.includes(' ') && afterAt.trim() !== '') { setMentionQuery(null); setMentionSuggestions([]); return; }
    const query = afterAt.toLowerCase();
    setMentionQuery(atIdx);
    const names = chatMeta?.participantNames || {};
    const suggestions = Object.entries(names)
      .filter(([email, name]) => email !== myEmail && typeof name === 'string' && name.toLowerCase().includes(query))
      .map(([email, name]) => ({ email, name }));
    setMentionSuggestions(suggestions);
  };

  const applyMention = (member) => {
    if (mentionQuery === null) return;
    const before = inputText.slice(0, mentionQuery);
    const newText = `${before}@${member.name} `;
    setInputText(newText);
    setMentionQuery(null);
    setMentionSuggestions([]);
    inputRef.current?.focus();
  };

  const handleSendText = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText('');
    setMentionQuery(null);
    setMentionSuggestions([]);
    const reply = replyTo;
    setReplyTo(null);
    const mentions = chatType === 'group' ? extractMentions(text) : [];
    await sendMessage('text', { text, ...(mentions.length ? { mentions } : {}) }, reply);
    setSending(false);
  };


  // When user taps Send:
  //  1. Write every message to Firestore immediately (status:'uploading') so it appears in chat
  //  2. Copy the local file to a persistent path so it survives app restarts
  //  3. Push the upload job to AsyncStorage queue
  //  4. Start processing the queue in the background
  const handleSendAttachments = async (caption) => {
    if (!pendingAttachments.length || uploading) return;
    const items = [...pendingAttachments];
    setPendingAttachments([]);   // close preview modal right away

    const trimmedCaption = (caption || '').trim();
    const reply = replyTo;
    setReplyTo(null);

    for (const { uri, type, fileName, fileSize, mimeType } of items) {
      const s3Key       = s3KeyFor(chatId, fileName);
      const displayName = s3Key.split('/').pop();

      // Pre-allocate a Firestore doc ID so we can update it after upload
      const msgRef = firestore()
        .collection('chats').doc(chatId)
        .collection('messages').doc();

      const msgData = {
        senderId:   myEmail,
        senderName: myName,
        type,
        timestamp:  firestore.FieldValue.serverTimestamp(),
        readBy:     [myEmail],
        mediaKey:   s3Key,
        mediaUrl:   s3Key,
        fileName:   displayName,
        fileSize:   fileSize || 0,
        mimeType,
        status:     'uploading',
        ...(trimmedCaption ? { text: trimmedCaption } : {}),
        ...(reply ? {
          replyTo: {
            id:         reply.id,
            senderId:   reply.senderId,
            senderName: reply.senderName || reply.senderId,
            type:       reply.type,
            text:       reply.text || '',
          },
        } : {}),
      };

      // Write to Firestore first — message shows in chat immediately
      await msgRef.set(msgData);

      const preview =
        type === 'image' ? '📷 Photo' :
        type === 'video' ? '🎬 Video' : '📎 File';

      await firestore().collection('chats').doc(chatId).update({
        lastMessage:     { ...msgData, text: preview, id: msgRef.id },
        lastMessageTime: firestore.FieldValue.serverTimestamp(),
      });

      // Copy file to a persistent path so the queue survives app restarts
      const localUri = await persistFileForQueue(uri, displayName);

      // Notification params are stored in the queue and fired AFTER upload completes
      await addToUploadQueue({
        msgId: msgRef.id, chatId, localUri, s3Key, mimeType, type,
        notif: chatMeta?.participants ? {
          chatId, chatName, senderName: myName, preview,
          participants: chatMeta.participants, senderEmail: myEmail, chatType,
        } : null,
      });
    }

    // Hand off to the global manager — continues even if user leaves this screen
    startUploadManager();
  };

  const addAssetsToPreview = useCallback((resp) => {
    if (resp.didCancel || resp.errorCode) return;
    const assets = resp.assets || [];
    if (!assets.length) return;
    setPendingAttachments((prev) => [...prev, ...assets.map(assetToAttachment)]);
  }, []);

  const openCamera = useCallback((mediaType = 'photo', isHD = false) => {
    const opts = { mediaType, saveToPhotos: false };
    if (mediaType === 'video') {
      opts.videoQuality = isHD ? 'high' : 'low';
    } else {
      opts.quality = isHD ? 1.0 : 0.3;
    }
    launchCamera(opts, addAssetsToPreview);
  }, [addAssetsToPreview]);

  const showQualityPicker = useCallback((mediaType) => {
    const label = mediaType === 'photo' ? 'Photo Quality' : 'Video Quality';
    if (Platform.OS === 'ios') {
      setTimeout(() => {
        ActionSheetIOS.showActionSheetWithOptions(
          { title: label, options: ['Cancel', 'Low Quality (Default)', 'HD'], cancelButtonIndex: 0 },
          (idx) => {
            if (idx === 0) return;
            openCamera(mediaType, idx === 2);
          },
        );
      }, 350);
    } else {
      Alert.alert(label, 'Choose quality', [
        { text: 'Low Quality (Default)', onPress: () => openCamera(mediaType, false) },
        { text: 'HD',                    onPress: () => openCamera(mediaType, true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [openCamera]);

  const openCameraWithOptions = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Photo', 'Video'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) showQualityPicker('photo');
          if (idx === 2) showQualityPicker('video');
        },
      );
    } else {
      Alert.alert('Camera', 'What do you want to capture?', [
        { text: 'Photo - Low Quality', onPress: () => openCamera('photo', false) },
        { text: 'Photo - HD',          onPress: () => openCamera('photo', true) },
        { text: 'Video - Low Quality', onPress: () => openCamera('video', false) },
        { text: 'Video - HD',          onPress: () => openCamera('video', true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [showQualityPicker, openCamera]);

  const openGallery = useCallback(() => {
    launchImageLibrary(
      { mediaType: 'mixed', quality: 0.8, selectionLimit: 0, includeExtra: true },
      async (resp) => {
        if (resp.didCancel || resp.errorCode) return;
        const assets = resp.assets || [];
        if (!assets.length) return;

        // Resolve the real PHAsset filename for any UUID/temp-named asset.
        const resolved = await Promise.all(
          assets.map(async (asset) => {
            const raw      = (asset.fileName || '').trim();
            const nameBase = raw.replace(/\.[^.]+$/, '');
            const needsReal = !raw || TEMP_RE.test(raw) || UUID_RE.test(nameBase);
            if (needsReal && PHAssetHelper && asset.id) {
              try {
                const real = await PHAssetHelper.getFilename(asset.id);
                if (real && !isTempName(real)) {
                  return { ...asset, fileName: real };
                }
              } catch (_) {}
            }
            return asset;
          }),
        );

        setPendingAttachments((prev) => [
          ...prev,
          ...resolved.map(assetToAttachment),
        ]);
      },
    );
  }, []);

  const openDocumentPicker = useCallback(async () => {
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        allowMultiSelection: true,
      });
      const docs = results.map((doc) => ({
        uri:      doc.uri,
        type:     'file',
        fileName: doc.name || 'document',
        fileSize: doc.size || 0,
        mimeType: doc.type || 'application/octet-stream',
      }));
      setPendingAttachments((prev) => [...prev, ...docs]);
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) {
        Alert.alert('Error', 'Could not open document picker.');
      }
    }
  }, []);

  const handlePickMedia = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Camera', 'Photo / Video', 'Document'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) openCameraWithOptions();
          if (idx === 2) openGallery();
          if (idx === 3) openDocumentPicker();
        },
      );
    } else {
      Alert.alert('Attach', 'Choose source', [
        { text: 'Camera',        onPress: openCameraWithOptions },
        { text: 'Photo / Video', onPress: openGallery },
        { text: 'Document',      onPress: openDocumentPicker },
        { text: 'Cancel',        style: 'cancel' },
      ]);
    }
  };

  const openImageViewer = useCallback((msg, imgList) => {
    const list = imgList ?? messages.filter((m) => m.type === 'image');
    const idx  = list.findIndex((m) => m.id === msg.id);
    setViewerImages(list);
    setViewerIndex(Math.max(0, idx));
    setShowViewer(true);
  }, [messages]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F0FDF4' }}>
      <StatusBar barStyle="light-content" backgroundColor="#319241" />

      {/* Attachment preview before send */}
      <AttachmentPreviewModal
        attachments={pendingAttachments}
        onAddCamera={openCameraWithOptions}
        onAddGallery={openGallery}
        onRemove={(idx) => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
        onSend={handleSendAttachments}
        onCancel={() => setPendingAttachments([])}
        sending={uploading}
      />

      {/* Fullscreen image viewer */}
      {showViewer && (
        <ImageViewerModal
          images={viewerImages}
          initialIndex={viewerIndex}
          myEmail={myEmail}
          onClose={() => setShowViewer(false)}
        />
      )}

      {/* Shared media library */}
      {showMediaLib && (
        <SharedMediaModal
          messages={messages}
          myEmail={myEmail}
          onClose={() => setShowMediaLib(false)}
          onViewImage={(msg, imgList) => {
            setShowMediaLib(false);
            setTimeout(() => openImageViewer(msg, imgList), 300);
          }}
        />
      )}

      {/* Manage group members (add + remove) */}
      <AddMembersModal
        visible={showAddMembers}
        chatId={chatId}
        currentParticipants={chatMeta?.participants || []}
        participantNames={chatMeta?.participantNames || {}}
        myEmail={myEmail}
        myName={myName}
        readOnly={!isAgent}
        onClose={() => setShowAddMembers(false)}
        onConfirm={(toAdd, toRemove, actorName) => {
          setShowAddMembers(false);
          // Send system notice into the chat
          const addedNames   = toAdd.map((u) => u.name || u.email).join(', ');
          const removedNames = toRemove.map((u) => u.name || u.email).join(', ');
          let noticeText = '';
          if (toAdd.length && toRemove.length) {
            noticeText = `${actorName} added ${addedNames} and removed ${removedNames}`;
          } else if (toAdd.length) {
            noticeText = `${actorName} added ${addedNames} to the group`;
          } else {
            noticeText = `${actorName} removed ${removedNames} from the group`;
          }
          sendMessage('system', { text: noticeText });
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {uploading && (
          <View style={styles.uploadBar}>
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.uploadText}>
              Uploading {Math.round(uploadProg * 100)}%…
            </Text>
            <TouchableOpacity
              style={styles.uploadCancelBtn}
              onPress={() =>
                Alert.alert(
                  'Cancel Upload?',
                  'The file will not be sent. This cannot be undone.',
                  [
                    { text: 'Keep Uploading', style: 'cancel' },
                    { text: 'Cancel Upload', style: 'destructive', onPress: () => cancelUpload() },
                  ],
                )
              }
            >
              <Icon name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {(() => {
          const filteredMsgs = messages.filter((m) => m.senderId === myEmail || m.status !== 'uploading');
          filteredMsgsRef.current = filteredMsgs;
          return (
        <FlatList
          ref={listRef}
          data={filteredMsgs}
          keyExtractor={(m) => m.id}
          inverted
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.msgList}
          keyboardDismissMode="interactive"
          onScrollToIndexFailed={({ index }) => {
            // fallback: wait a frame then retry
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
            }, 300);
          }}
          renderItem={({ item, index }) => {
            const isMe     = item.senderId === myEmail;
            const prevItem = filteredMsgs[index + 1];
            const showDate = !prevItem || !isSameDay(item.timestamp, prevItem.timestamp);
            return (
              <>
                <MessageBubble
                  message={item}
                  isMe={isMe}
                  isGroup={chatType === 'group'}
                  onMediaTap={(msg) => openImageViewer(msg)}
                  onSwipeReply={(msg) => setReplyTo(msg)}
                  onPressReply={scrollToReply}
                  highlighted={highlightedId === item.id}
                />
                {showDate && <DateSeparator timestamp={item.timestamp} />}
              </>
            );
          }}
          ListEmptyComponent={
            <View style={[styles.center, { paddingTop: 80 }]}>
              <Icon name="chat-bubble-outline" size={48} color="#D1D5DB" />
              <Text style={{ color: '#9CA3AF', marginTop: 10 }}>No messages yet. Say hi!</Text>
            </View>
          }
        />
          );
        })()}

        {replyTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarSender} numberOfLines={1}>
                {replyTo.senderName || replyTo.senderId}
              </Text>
              <Text style={styles.replyBarText} numberOfLines={1}>
                {replyTo.type === 'text' ? replyTo.text :
                 replyTo.type === 'image' ? '📷 Photo' :
                 replyTo.type === 'video' ? '🎬 Video' : '📎 File'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        {/* @ mention suggestions */}
        {chatType === 'group' && mentionSuggestions.length > 0 && (
          <View style={styles.mentionList}>
            {mentionSuggestions.map((m) => (
              <TouchableOpacity
                key={m.email}
                style={styles.mentionItem}
                onPress={() => applyMention(m)}
              >
                <View style={styles.mentionAvatar}>
                  <Text style={styles.mentionAvatarText}>{m.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.mentionName}>{m.name}</Text>
                  <Text style={styles.mentionEmail}>{m.email}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[styles.inputRow, { paddingBottom: 8 + insets.bottom }]}>
          <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
            <Icon name="attach-file" size={24} color="#319241" />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder={'Message'}
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={handleMentionInput}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnOff]}
            onPress={handleSendText}
            disabled={!inputText.trim() || sending}
          >
            <Icon name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },

  uploadBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#319241', paddingHorizontal: 16, paddingVertical: 8,
  },
  uploadText: { color: '#fff', fontSize: 13, flex: 1 },
  uploadCancelBtn: {
    padding: 4,
    marginLeft: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
  },

  uploadingOverlay: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
    marginBottom: 4,
  },

  uploadingText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  msgList: {
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
    flexGrow: 1, justifyContent: 'flex-end',
  },

  bubbleWrap:      { marginBottom: 4, maxWidth: '80%' },
  bubbleWrapMe:    { alignSelf: 'flex-end' },
  bubbleWrapOther: { alignSelf: 'flex-start' },
  bubbleHighlight: { backgroundColor: 'rgba(49,146,65,0.15)', borderRadius: 18 },
  bubble: {
    borderRadius: 18, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 6,
  },
  bubbleMe:    { backgroundColor: '#319241', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  bubbleSender: { fontSize: 11, fontWeight: '700', color: '#7C3AED', marginBottom: 3 },
  bubbleText:   { fontSize: 15, color: '#111827', lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: {
    fontSize: 10, color: '#6B7280',
    alignSelf: 'flex-end', marginTop: 3,
  },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.75)' },

  mediaThumbnailWrap: { borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  mediaThumbnail:     { width: 200, height: 150, borderRadius: 12 },
  mediaPlaceholder:   {
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  playIcon: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  fileRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  fileName:       { fontSize: 13, color: '#374151', flex: 1 },
  mediaActions:   { flexDirection: 'row', marginTop: 4 },
  mediaActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  mediaActionTxt: { fontSize: 12, fontWeight: '600' },
  progressRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressText:   { fontSize: 12, color: '#6B7280' },

  dateSep: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 14, paddingHorizontal: 4,
  },
  dateLine:  { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dateLabel: {
    fontSize: 11, fontWeight: '600', color: '#9CA3AF',
    marginHorizontal: 10, backgroundColor: '#F0FDF4', paddingHorizontal: 6,
  },

  systemNotice: {
    alignSelf: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginVertical: 6,
    maxWidth: '80%',
  },
  systemNoticeText: {
    fontSize: 12, color: '#6B7280', textAlign: 'center', fontStyle: 'italic',
  },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  attachBtn: { padding: 8, marginRight: 4, alignSelf: 'flex-end' },
  textInput: {
    flex: 1, minHeight: 40, maxHeight: 120, fontSize: 15,
    color: '#111827', backgroundColor: '#F9FAFB', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#319241',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8, alignSelf: 'flex-end',
  },
  sendBtnOff: { backgroundColor: '#D1D5DB' },

  // ── @ Mention suggestion list ────────────────────────────────────────────────
  mentionList: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    maxHeight: 180,
  },
  mentionItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  mentionAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  mentionAvatarText: { fontSize: 14, fontWeight: '700', color: '#319241' },
  mentionName:  { fontSize: 14, fontWeight: '600', color: '#111827' },
  mentionEmail: { fontSize: 12, color: '#6B7280' },
  // Mention spans inside message bubbles
  mentionSpan:   { fontWeight: '700', color: '#319241' },
  mentionSpanMe: { fontWeight: '700', color: '#A7F3D0' },

  // ── Reply bar (above input) ──────────────────────────────────────────────────
  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  replyBarAccent: { width: 3, borderRadius: 2, alignSelf: 'stretch', backgroundColor: '#319241' },
  replyBarSender: { fontSize: 12, fontWeight: '700', color: '#319241', marginBottom: 1 },
  replyBarText:   { fontSize: 13, color: '#374151' },

  // ── Reply quote inside bubble ────────────────────────────────────────────────
  replyQuote: {
    flexDirection: 'row', borderRadius: 8, marginBottom: 6,
    overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.07)',
    paddingVertical: 5, paddingHorizontal: 8, gap: 6,
  },
  replyQuoteMe:          { backgroundColor: 'rgba(255,255,255,0.18)' },
  replyQuoteOther:       { backgroundColor: 'rgba(0,0,0,0.06)' },
  replyQuoteAccent:      { width: 3, borderRadius: 2, alignSelf: 'stretch', backgroundColor: '#319241' },
  replyQuoteAccentMe:    { backgroundColor: 'rgba(255,255,255,0.7)' },
  replyQuoteAccentOther: { backgroundColor: '#319241' },
  replyQuoteSender:      { fontSize: 11, fontWeight: '700', color: '#319241', marginBottom: 1 },
  replyQuoteSenderMe:    { color: 'rgba(255,255,255,0.85)' },
  replyQuoteText:        { fontSize: 12, color: '#374151' },
  replyQuoteTextMe:      { color: 'rgba(255,255,255,0.8)' },
});
