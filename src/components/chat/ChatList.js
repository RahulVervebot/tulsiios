import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialIcons';
import CreateGroupModal from './CreateGroupModal';

function relativeTime(ts) {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff  = Date.now() - date.getTime();
  if (diff < 60_000)         return 'now';
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 2 * 86_400_000) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function ChatList({ myEmail, myName, navigation }) {
  const [chats,      setChats]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!myEmail) return;

    const unsub = firestore()
      .collection('chats')
      .where('participants', 'array-contains', myEmail)
      .orderBy('lastMessageTime', 'desc')
      .onSnapshot(
        (snap) => {
          setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
          setRefreshing(false);
        },
        (err) => {
          // Likely missing composite index — log the URL in the error to create it
          console.log('[ChatList] snapshot error:', err?.message);
          setLoading(false);
          setRefreshing(false);
        },
      );
    return () => unsub();
  }, [myEmail]);

  const displayName = (chat) => {
    if (chat.type === 'group') return chat.name || 'Group';
    const other = (chat.participants || []).find((p) => p !== myEmail);
    return chat.participantNames?.[other] || other || 'Unknown';
  };

  const lastPreview = (chat) => {
    const lm = chat.lastMessage;
    if (!lm) return 'No messages yet';
    const prefix = chat.type === 'group'
      ? `${lm.senderName || lm.senderId?.split('@')[0]}: `
      : '';
    if (lm.type === 'text')  return prefix + (lm.text || '');
    if (lm.type === 'image') return prefix + '📷 Photo';
    if (lm.type === 'video') return prefix + '🎬 Video';
    return prefix + '📎 File';
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#319241" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={chats}
        keyExtractor={(c) => c.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setRefreshing(true)}
            tintColor="#319241"
          />
        }
        renderItem={({ item }) => {
          const unread = item.unread?.[myEmail] ?? 0;
          const name   = displayName(item);
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.75}
              onPress={() =>
                navigation.navigate('ChatScreen', {
                  chatId:   item.id,
                  chatName: name,
                  chatType: item.type,
                })
              }
            >
              <View style={[styles.avatar, item.type === 'group' && styles.groupAvatar]}>
                <Icon
                  name={item.type === 'group' ? 'group' : 'person'}
                  size={24}
                  color={item.type === 'group' ? '#7C3AED' : '#319241'}
                />
              </View>
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text
                  style={[styles.last, unread > 0 && styles.lastUnread]}
                  numberOfLines={1}
                >
                  {lastPreview(item)}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.time}>{relativeTime(item.lastMessageTime)}</Text>
                {unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : String(unread)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Icon name="chat-bubble-outline" size={48} color="#B0C4B8" />
            <Text style={styles.empty}>No conversations yet</Text>
            <Text style={styles.hint}>Tap + to start a group or chat from Contacts</Text>
          </View>
        }
      />

      {/* Create Group FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => setShowCreate(true)}>
        <Icon name="group-add" size={26} color="#fff" />
      </TouchableOpacity>

      <CreateGroupModal
        visible={showCreate}
        myEmail={myEmail}
        myName={myName}
        onClose={() => setShowCreate(false)}
        onCreated={(chat) => {
          setShowCreate(false);
          navigation.navigate('ChatScreen', {
            chatId:   chat.id,
            chatName: chat.name,
            chatType: 'group',
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  list:   { paddingHorizontal: 14, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  groupAvatar: { backgroundColor: '#EDE9FE' },
  meta: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  last: { fontSize: 13, color: '#6B7280' },
  lastUnread: { fontWeight: '600', color: '#1F2937' },
  right: { alignItems: 'flex-end', minWidth: 44, gap: 5 },
  time:  { fontSize: 11, color: '#9CA3AF' },
  badge: {
    backgroundColor: '#319241',
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { marginTop: 10, fontSize: 15, color: '#9CA3AF' },
  hint:  { marginTop: 4, fontSize: 13, color: '#B0C4B8', textAlign: 'center', paddingHorizontal: 40 },
  fab: {
    position: 'absolute', bottom: 24, right: 18,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#319241',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#319241', shadowOpacity: 0.45,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});