import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function CreateGroupModal({ visible, myEmail, myName, onClose, onCreated }) {
  const [groupName, setGroupName] = useState('');
  const [search,    setSearch]    = useState('');
  const [users,     setUsers]     = useState([]);
  const [selected,  setSelected]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [creating,  setCreating]  = useState(false);

  useEffect(() => {
    if (!visible) return;
    setGroupName('');
    setSearch('');
    setSelected([]);
    setLoading(true);
    firestore()
      .collection('callProfiles')
      .get()
      .then((snap) => {
        const contacts = snap.docs
          .map((d) => ({ email: d.id, ...d.data() }))
          .filter((u) => u.email !== myEmail);
        setUsers(contacts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, myEmail]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const toggle = (user) => {
    setSelected((prev) =>
      prev.find((u) => u.email === user.email)
        ? prev.filter((u) => u.email !== user.email)
        : [...prev, user],
    );
  };

  const create = async () => {
    if (!groupName.trim() || selected.length === 0 || creating) return;
    setCreating(true);
    try {
      const participants = [myEmail, ...selected.map((u) => u.email)];
      const names = { [myEmail]: myName || myEmail };
      selected.forEach((u) => { names[u.email] = u.name || u.email || u.email; });

      const ref = await firestore().collection('chats').add({
        type:             'group',
        name:             groupName.trim(),
        participants,
        participantNames: names,
        createdBy:        myEmail,
        createdAt:        firestore.FieldValue.serverTimestamp(),
        lastMessageTime:  firestore.FieldValue.serverTimestamp(),
        lastMessage:      null,
        unread:           {},
      });
      onCreated({ id: ref.id, name: groupName.trim() });
    } catch (e) {
      console.log('[CreateGroup]', e?.message);
    } finally {
      setCreating(false);
    }
  };

  const canCreate = groupName.trim().length > 0 && selected.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.title}>New Group</Text>
            <TouchableOpacity
              style={[styles.createBtn, !canCreate && styles.createBtnOff]}
              onPress={create}
              disabled={!canCreate || creating}
            >
              {creating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.createBtnText}>Create</Text>}
            </TouchableOpacity>
          </View>

          {/* Group name */}
          <View style={styles.nameRow}>
            <View style={styles.groupIconWrap}>
              <Icon name="group" size={26} color="#7C3AED" />
            </View>
            <TextInput
              style={styles.nameInput}
              placeholder="Group name..."
              placeholderTextColor="#9CA3AF"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={60}
            />
          </View>

          {/* Selected chips */}
          {selected.length > 0 && (
            <View style={styles.chips}>
              {selected.map((u) => (
                <TouchableOpacity
                  key={u.email}
                  style={styles.chip}
                  onPress={() => toggle(u)}
                >
                  <Text style={styles.chipText}>{u.name || u.email}</Text>
                  <Icon name="close" size={13} color="#7C3AED" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Search */}
          <View style={styles.searchBar}>
            <Icon name="search" size={18} color="#9CA3AF" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <Text style={styles.sectionLabel}>
            {selected.length > 0 ? `${selected.length} selected` : 'Add people'}
          </Text>

          {loading ? (
            <ActivityIndicator color="#319241" style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(u) => u.email}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const sel = !!selected.find((u) => u.email === item.email);
                return (
                  <TouchableOpacity
                    style={[styles.userRow, sel && styles.userRowSel]}
                    onPress={() => toggle(item)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.avatar, sel && styles.avatarSel]}>
                      {sel
                        ? <Icon name="check" size={18} color="#fff" />
                        : <Icon name="person" size={18} color="#319241" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{item.name}</Text>
                      <Text style={styles.userEmail}>{item.email}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 40,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  createBtn: {
    backgroundColor: '#319241',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minWidth: 72,
    alignItems: 'center',
  },
  createBtnOff: { backgroundColor: '#D1D5DB' },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  groupIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    padding: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: { maxHeight: 340 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userRowSel: { backgroundColor: '#F0FDF4' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarSel: { backgroundColor: '#319241' },
  userName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 12, color: '#6B7280' },
});
