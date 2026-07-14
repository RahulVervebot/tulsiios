import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert,
  ActionSheetIOS, StatusBar, Modal, Dimensions, SectionList,
  ScrollView, Linking,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  uploadToS3, downloadFromS3, isFileDownloaded,
  deleteLocalFile, getLocalPath, getPresignedDownloadUrl,
} from '../config/S3Config';
import {
  sendChatPushNotification, markChatAsRead, incrementUnread,
} from '../functions/chat/chatUtils';

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
  if (!ts) return '';
  const d   = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0);
  if (diff === 0) return 'Today';
  if (diff === 86_400_000) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const s3KeyFor = (chatId, fileName) =>
  `chat/${chatId}/${Date.now()}_${fileName.replace(/\s+/g, '_')}`;

const assetToAttachment = (asset) => {
  const isVideo = asset.type?.startsWith('video');
  return {
    uri:      asset.uri,
    type:     isVideo ? 'video' : 'image',
    fileName: asset.fileName || `media.${isVideo ? 'mp4' : 'jpg'}`,
    fileSize: asset.fileSize || 0,
    mimeType: asset.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
  };
};

// ─── Attachment Preview Modal ─────────────────────────────────────────────────
// Shows selected items before upload. User must tap Send to upload.
// Supports multiple items; Camera/Gallery buttons add more.

function AttachmentPreviewModal({ attachments, onAddCamera, onAddGallery, onRemove, onSend, onCancel, sending }) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (activeIdx >= attachments.length && attachments.length > 0) {
      setActiveIdx(attachments.length - 1);
    }
  }, [attachments.length]);

  if (!attachments || attachments.length === 0) return null;
  const active = attachments[Math.min(activeIdx, attachments.length - 1)];

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCancel}>
      <View style={pStyles.overlay}>
        {/* Header */}
        <View style={pStyles.header}>
          <TouchableOpacity onPress={onCancel} style={pStyles.headerBtn}>
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={pStyles.headerTitle}>
            {attachments.length} {attachments.length === 1 ? 'item' : 'items'}
          </Text>
          <TouchableOpacity onPress={onSend} disabled={sending} style={pStyles.sendBtn}>
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Icon name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* Large preview */}
        <View style={pStyles.body}>
          {active.type === 'image' ? (
            <Image
              source={{ uri: active.uri }}
              style={pStyles.previewImage}
              resizeMode="contain"
            />
          ) : (
            <View style={pStyles.filePlaceholder}>
              <Icon name="videocam" size={80} color="#4B5563" />
              <Text style={pStyles.fileNameTxt}>{active.fileName}</Text>
            </View>
          )}
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
                    <Icon name="videocam" size={22} color="#9CA3AF" />
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
      </View>
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
  filePlaceholder: { alignItems: 'center', gap: 12 },
  fileNameTxt:   { color: '#fff', fontSize: 15, fontWeight: '600' },

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

function SharedMediaModal({ messages, myEmail, onClose, onViewImage }) {
  const [dateFilter,    setDateFilter]    = useState('all');
  const [customFrom,    setCustomFrom]    = useState(null);   // Date | null
  const [customTo,      setCustomTo]      = useState(null);   // Date | null
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

  // canDelete: only received + downloaded items
  const canDelete = (msg) => msg.senderId !== myEmail && !!downloadedMap[msg.mediaKey];

  // Filter messages by date
  const filteredMedia = useMemo(() => {
    const media = messages.filter(
      (m) => m.type === 'image' || m.type === 'video' || m.type === 'file',
    );
    if (dateFilter === 'all') return media;
    const now = new Date();
    return media.filter((m) => {
      const d = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp || 0);
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
  }, [messages, dateFilter, customFrom, customTo]);

  // Group into sections
  const sections = useMemo(() => {
    const groups = {};
    filteredMedia.forEach((m) => {
      const label = formatDayLabel(m.timestamp);
      if (!groups[label]) groups[label] = { title: label, data: [], ts: m.timestamp };
      groups[label].data.push(m);
    });
    return Object.values(groups).sort((a, b) => {
      const ta = a.ts?.toDate ? a.ts.toDate() : new Date(a.ts || 0);
      const tb = b.ts?.toDate ? b.ts.toDate() : new Date(b.ts || 0);
      return tb - ta;
    });
  }, [filteredMedia]);

  const deletableKeys = useMemo(
    () => filteredMedia.filter(canDelete).map((m) => m.mediaKey),
    [filteredMedia, downloadedMap],
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
          } else if (isImage) {
            onViewImage(msg, imageMessages);
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
          </Text>
          {!isMe && (
            <Text style={[mStyles.itemStatus, { color: dl ? '#319241' : '#9CA3AF' }]}>
              {dl ? 'Downloaded' : 'Not downloaded'}
            </Text>
          )}
        </View>

        {/* Select checkbox OR delete button */}
        {selectMode ? (
          <View style={[mStyles.checkbox, deletable && checked && mStyles.checkboxChecked, !deletable && mStyles.checkboxDisabled]}>
            {checked && <Icon name="check" size={14} color="#fff" />}
          </View>
        ) : (
          !isMe && dl && (
            <TouchableOpacity
              style={mStyles.deleteBtn}
              onPress={() => {
                Alert.alert('Delete from device?', 'File stays on S3.', [
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
          )
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {deletableKeys.length > 0 && (
                  <TouchableOpacity
                    style={mStyles.headerAction}
                    onPress={() => setSelectMode(true)}
                  >
                    <Text style={mStyles.headerActionTxt}>Select</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                  <Icon name="close" size={22} color="#111827" />
                </TouchableOpacity>
              </View>
            </>
          )}
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

        {sections.length === 0 ? (
          <View style={mStyles.empty}>
            <Icon name="perm-media" size={56} color="#D1D5DB" />
            <Text style={mStyles.emptyText}>No media found</Text>
          </View>
        ) : (
          <SectionList
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

  // Filter chips
  filterBar:     { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  chipActive:    { backgroundColor: '#319241' },
  chipTxt:       { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTxtActive: { color: '#fff' },

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

  useEffect(() => {
    if (!message.mediaKey) return;
    if (isMe) {
      getPresignedDownloadUrl(message.mediaKey).then(setPresignedUri).catch(() => {});
    } else {
      isFileDownloaded(message.mediaKey).then((yes) => {
        setDownloaded(yes);
        if (yes) setLocalUri('file://' + getLocalPath(message.mediaKey));
      });
    }
  }, [message.mediaKey, isMe]);

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

  const isImage = message.type === 'image';
  const isVideo = message.type === 'video';
  const displayUri  = isMe ? presignedUri : localUri;
  const showPreview = !!displayUri;

  return (
    <View>
      {(isImage || isVideo) && (
        <TouchableOpacity
          onPress={() => isImage && onTap?.(message)}
          activeOpacity={isImage ? 0.8 : 1}
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

function MessageBubble({ message, isMe, isGroup, onMediaTap }) {
  if (message.type === 'image' || message.type === 'video' || message.type === 'file') {
    // media messages always shown
  }

  return (
    <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {isGroup && !isMe && (
          <Text style={styles.bubbleSender}>{message.senderName || message.senderId}</Text>
        )}
        {message.type === 'text' ? (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            {message.text}
          </Text>
        ) : (
          <MediaBubble message={message} isMe={isMe} onTap={onMediaTap} />
        )}
        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
          {formatMsgTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

// ─── Date separator ───────────────────────────────────────────────────────────

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

  const [myEmail,  setMyEmail]  = useState('');
  const [myName,   setMyName]   = useState('');
  const [messages,         setMessages]         = useState([]);
  const [chatMeta,         setChatMeta]         = useState(null);
  const [inputText,        setInputText]        = useState('');
  const [sending,          setSending]          = useState(false);
  const [uploading,        setUploading]        = useState(false);
  const [uploadProg,       setUploadProg]       = useState(0);
  const [uploadIdx,        setUploadIdx]        = useState(0);
  const [uploadTotal,      setUploadTotal]      = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState([]); // preview before send
  const [viewerImages,     setViewerImages]     = useState([]);
  const [viewerIndex,      setViewerIndex]      = useState(0);
  const [showViewer,       setShowViewer]       = useState(false);
  const [showMediaLib,     setShowMediaLib]     = useState(false);

  const listRef = useRef(null);

  useEffect(() => {
    AsyncStorage.multiGet(['callUserEmail', 'callUserName']).then((pairs) => {
      const email = pairs[0][1] || '';
      const name  = pairs[1][1] || email;
      setMyEmail(email);
      setMyName(name);
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

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: chatName,
      headerStyle: { backgroundColor: '#319241' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowMediaLib(true)}
          style={{ padding: 10, marginRight: 6 }}
        >
          <Icon name="photo-library" size={22} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, chatName]);

  const sendMessage = useCallback(async (type, payload) => {
    if (!myEmail) return;
    const msgData = {
      senderId:   myEmail,
      senderName: myName,
      type,
      timestamp:  firestore.FieldValue.serverTimestamp(),
      readBy:     [myEmail],
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

      if (chatMeta?.participants) {
        incrementUnread(chatId, chatMeta.participants, myEmail);
        sendChatPushNotification(
          chatId, chatName, myName, preview,
          chatMeta.participants, myEmail, chatType,
        );
      }
    } catch (e) {
      console.log('[ChatScreen] send error:', e?.message);
    }
  }, [myEmail, myName, chatId, chatName, chatMeta, chatType]);

  const handleSendText = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText('');
    await sendMessage('text', { text });
    setSending(false);
  };

  // Upload all pending attachments sequentially, send each as a message
  const handleSendAttachments = async () => {
    if (!pendingAttachments.length || uploading) return;
    const items = [...pendingAttachments];
    setPendingAttachments([]);
    setUploading(true);
    setUploadTotal(items.length);

    for (let i = 0; i < items.length; i++) {
      const { uri, type, fileName, fileSize, mimeType } = items[i];
      const key = s3KeyFor(chatId, fileName);
      setUploadIdx(i + 1);
      setUploadProg(0);
      try {
        await uploadToS3(uri, key, mimeType, (p) => setUploadProg(p));
        await sendMessage(type, { mediaUrl: key, mediaKey: key, fileName, fileSize: fileSize || 0, mimeType });
      } catch {
        Alert.alert(`Upload failed (${fileName})`, 'Could not upload. Check your S3 configuration.');
      }
    }
    setUploading(false);
    setUploadIdx(0);
    setUploadTotal(0);
  };

  const addAssetsToPreview = useCallback((resp) => {
    if (resp.didCancel || resp.errorCode) return;
    const assets = resp.assets || [];
    if (!assets.length) return;
    setPendingAttachments((prev) => [...prev, ...assets.map(assetToAttachment)]);
  }, []);

  const openCamera = useCallback(() => {
    launchCamera({ mediaType: 'photo', quality: 0.85, saveToPhotos: false }, addAssetsToPreview);
  }, [addAssetsToPreview]);

  const openGallery = useCallback(() => {
    launchImageLibrary(
      { mediaType: 'mixed', quality: 0.8, selectionLimit: 0 },
      addAssetsToPreview,
    );
  }, [addAssetsToPreview]);

  const handlePickMedia = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Camera', 'Photo / Video'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) openCamera();
          if (idx === 2) openGallery();
        },
      );
    } else {
      Alert.alert('Attach', 'Choose source', [
        { text: 'Camera',        onPress: openCamera },
        { text: 'Photo / Video', onPress: openGallery },
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
        onAddCamera={openCamera}
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {uploading && (
          <View style={styles.uploadBar}>
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.uploadText}>
              Uploading {uploadTotal > 1 ? `${uploadIdx}/${uploadTotal}  ` : ''}
              {Math.round(uploadProg * 100)}%…
            </Text>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.msgList}
          keyboardDismissMode="interactive"
          renderItem={({ item, index }) => {
            const isMe     = item.senderId === myEmail;
            const prevItem = messages[index + 1];
            const showDate = !prevItem || !isSameDay(item.timestamp, prevItem.timestamp);
            return (
              <>
                <MessageBubble
                  message={item}
                  isMe={isMe}
                  isGroup={chatType === 'group'}
                  onMediaTap={(msg) => openImageViewer(msg)}
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

        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
            <Icon name="attach-file" size={24} color="#319241" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
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
  uploadText: { color: '#fff', fontSize: 13 },

  msgList: {
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
    flexGrow: 1, justifyContent: 'flex-end',
  },

  bubbleWrap:      { marginBottom: 4, maxWidth: '80%' },
  bubbleWrapMe:    { alignSelf: 'flex-end' },
  bubbleWrapOther: { alignSelf: 'flex-start' },
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
});
