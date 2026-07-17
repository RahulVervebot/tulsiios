import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function RemoveMembersModal({
  visible, chatId, currentParticipants, participantNames, myEmail, onClose, onRemoved,
}) {
  const [users,    setUsers]    = useState([]);
  const [selected, setSelected] = useState([]);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected([]);
    // Show every participant except the current user (can't remove yourself)
    const others = (currentParticipants || []).filter((e) => e !== myEmail);
    const items  = others.map((email) => ({
      email,
      name: participantNames?.[email] || email,
    }));
    setUsers(items);
  }, [visible, currentParticipants, participantNames, myEmail]);

  const toggle = (email) =>
    setSelected((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );

  const confirmRemove = () => {
    if (!selected.length || saving) return;
    const names = selected
      .map((e) => participantNames?.[e] || e)
      .join(', ');
    Alert.alert(
      `Remove ${selected.length} member${selected.length > 1 ? 's' : ''}?`,
      names,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ],
    );
  };

  const doRemove = async () => {
    setSaving(true);
    try {
      const updates = {
        participants: firestore.FieldValue.arrayRemove(...selected),
      };
      selected.forEach((email) => {
        updates[`participantNames.${email}`] = firestore.FieldValue.delete();
      });
      await firestore().collection('chats').doc(chatId).update(updates);
      onRemoved?.(selected);
      onClose();
    } catch (e) {
      console.log('[RemoveMembers]', e?.message);
      Alert.alert('Error', 'Could not remove members. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.title}>Remove Members</Text>
            <TouchableOpacity
              style={[styles.removeBtn, !selected.length && styles.removeBtnOff]}
              onPress={confirmRemove}
              disabled={!selected.length || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.removeBtnText}>
                    Remove{selected.length > 0 ? ` (${selected.length})` : ''}
                  </Text>}
            </TouchableOpacity>
          </View>

          {/* Selected chips */}
          {selected.length > 0 && (
            <View style={styles.chips}>
              {selected.map((email) => (
                <TouchableOpacity key={email} style={styles.chip} onPress={() => toggle(email)}>
                  <Text style={styles.chipText}>{participantNames?.[email] || email}</Text>
                  <Icon name="close" size={13} color="#DC2626" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.sectionLabel}>
            {users.length} member{users.length !== 1 ? 's' : ''} · tap to select
          </Text>

          {users.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="group" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No other members in this group</Text>
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => u.email}
              style={styles.list}
              renderItem={({ item }) => {
                const sel = selected.includes(item.email);
                return (
                  <TouchableOpacity
                    style={[styles.userRow, sel && styles.userRowSel]}
                    onPress={() => toggle(item.email)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.avatar, sel && styles.avatarSel]}>
                      {sel
                        ? <Icon name="close" size={18} color="#fff" />
                        : <Icon name="person" size={18} color="#319241" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, sel && styles.userNameSel]}>
                        {item.name}
                      </Text>
                      <Text style={styles.userEmail}>{item.email}</Text>
                    </View>
                    {sel && (
                      <View style={styles.removeBadge}>
                        <Text style={styles.removeBadgeText}>Will be removed</Text>
                      </View>
                    )}
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
    paddingBottom: 40,
    maxHeight: '88%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 10, marginBottom: 4,
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
  removeBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 80,
    alignItems: 'center',
  },
  removeBtnOff:  { backgroundColor: '#D1D5DB' },
  removeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

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
    backgroundColor: '#FEE2E2',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },

  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: '#9CA3AF',
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  list: { maxHeight: 400 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userRowSel: { backgroundColor: '#FEF2F2' },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarSel:     { backgroundColor: '#DC2626' },
  userName:      { fontSize: 14, fontWeight: '600', color: '#111827' },
  userNameSel:   { color: '#DC2626' },
  userEmail:     { fontSize: 12, color: '#6B7280' },
  removeBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  removeBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  empty: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32 },
});
