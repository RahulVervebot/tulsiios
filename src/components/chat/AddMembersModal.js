import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function AddMembersModal({
  visible, chatId, currentParticipants, participantNames,
  myEmail, myName, readOnly, onClose, onConfirm,
}) {
  const [search,          setSearch]          = useState('');
  const [users,           setUsers]           = useState([]);
  const [selected,        setSelected]        = useState(new Set());
  const [loading,         setLoading]         = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [isAgent,         setIsAgent]         = useState(false);
  const [storeDomains,    setStoreDomains]    = useState([]);
  const [selectedDomain,  setSelectedDomain]  = useState('All');
  const [showDropdown,    setShowDropdown]    = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelectedDomain('All');
    setShowDropdown(false);
    setSelected(new Set(currentParticipants || []));
    setLoading(true);

    firestore().collection('tulsi').doc('storelist').get().then((storeDoc) => {
      const agentList = storeDoc.data()?.Agent || [];
      const agent = agentList.includes(myEmail);
      setIsAgent(agent);

      if (!agent) {
        // Non-agents: view-only — show exactly who is in the group using participantNames
        const members = (currentParticipants || [])
          .filter((e) => e !== myEmail)
          .map((e) => ({ email: e, name: (participantNames || {})[e] || e, storeDomain: '' }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setUsers(members);
        setLoading(false);
        return;
      }

      // Agents: load all callProfiles with domain filter support
      firestore().collection('callProfiles').get().then((snap) => {
        let contacts = snap.docs.map((d) => ({
          email: d.id,
          name: d.data().name || d.id,
          storeDomain: d.data().storeDomain || '',
        })).filter((u) => u.email !== myEmail);

        const domains = [...new Set(contacts.map((u) => u.storeDomain).filter(Boolean))].sort();
        setStoreDomains(domains);

        contacts.sort((a, b) => {
          const aIn = (currentParticipants || []).includes(a.email);
          const bIn = (currentParticipants || []).includes(b.email);
          if (aIn !== bIn) return aIn ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        setUsers(contacts);
      }).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = currentParticipants || [];

  const toAdd = useMemo(
    () => users.filter((u) => !current.includes(u.email) && selected.has(u.email)),
    [users, selected, current],
  );

  const toRemove = useMemo(
    () => users.filter((u) => current.includes(u.email) && !selected.has(u.email)),
    [users, selected, current],
  );

  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  const toggle = (email) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!hasChanges || saving) return;
    const addNames    = toAdd.map((u) => u.name).join(', ');
    const removeNames = toRemove.map((u) => u.name).join(', ');
    let msg = '';
    if (toAdd.length && toRemove.length) {
      msg = `Add: ${addNames}\n\nRemove: ${removeNames}`;
    } else if (toAdd.length) {
      msg = `Add ${toAdd.length} member${toAdd.length > 1 ? 's' : ''}: ${addNames}`;
    } else {
      msg = `Remove ${toRemove.length} member${toRemove.length > 1 ? 's' : ''}: ${removeNames}`;
    }
    Alert.alert('Confirm changes?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: doUpdate },
    ]);
  };

  const doUpdate = async () => {
    setSaving(true);
    try {
      const updates = {};
      if (toAdd.length > 0 && toRemove.length === 0) {
        updates.participants = firestore.FieldValue.arrayUnion(...toAdd.map((u) => u.email));
        toAdd.forEach((u) => { updates[`participantNames.${u.email}`] = u.name; });
      } else if (toRemove.length > 0 && toAdd.length === 0) {
        updates.participants = firestore.FieldValue.arrayRemove(...toRemove.map((u) => u.email));
        toRemove.forEach((u) => { updates[`participantNames.${u.email}`] = firestore.FieldValue.delete(); });
      } else {
        const finalList = [
          ...current.filter((e) => !toRemove.some((u) => u.email === e)),
          ...toAdd.map((u) => u.email),
        ];
        updates.participants = finalList;
        toAdd.forEach((u) => { updates[`participantNames.${u.email}`] = u.name; });
        toRemove.forEach((u) => { updates[`participantNames.${u.email}`] = firestore.FieldValue.delete(); });
      }
      await firestore().collection('chats').doc(chatId).update(updates);
      onConfirm?.(toAdd, toRemove, myName);
      onClose();
    } catch (e) {
      console.log('[AddMembersModal]', e?.message);
      Alert.alert('Error', 'Could not update members. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const domainFiltered = useMemo(() => {
    if (!isAgent || selectedDomain === 'All') return users;
    return users.filter((u) => u.storeDomain === selectedDomain);
  }, [users, isAgent, selectedDomain]);

  const filtered = domainFiltered.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const summaryLabel = () => {
    if (readOnly) return `${current.length} member${current.length !== 1 ? 's' : ''}`;
    const parts = [];
    if (toAdd.length)    parts.push(`${toAdd.length} to add`);
    if (toRemove.length) parts.push(`${toRemove.length} to remove`);
    if (!parts.length)   return `${current.length} current members`;
    return parts.join(' · ');
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
            <Text style={styles.title}>{readOnly ? 'Group Members' : 'Manage Members'}</Text>
            {readOnly ? (
              <View style={styles.memberCountBadge}>
                <Text style={styles.memberCountText}>{(currentParticipants || []).length}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.confirmBtn, !hasChanges && styles.confirmBtnOff]}
                onPress={handleConfirm}
                disabled={!hasChanges || saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmBtnText}>
                      {hasChanges ? `Update (${toAdd.length + toRemove.length})` : 'No changes'}
                    </Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* Domain filter — agents only, not in readOnly mode */}
          {!readOnly && isAgent && storeDomains.length > 0 && (
            <View style={styles.domainRow}>
              <TouchableOpacity
                style={styles.domainBtn}
                onPress={() => setShowDropdown((v) => !v)}
                activeOpacity={0.8}
              >
                <Icon name="filter-list" size={16} color="#319241" style={{ marginRight: 6 }} />
                <Text style={styles.domainBtnText}>
                  {selectedDomain === 'All' ? 'All Stores' : selectedDomain}
                </Text>
                <Icon name={showDropdown ? 'expand-less' : 'expand-more'} size={18} color="#319241" />
              </TouchableOpacity>
              {showDropdown && (
                <View style={styles.dropdown}>
                  <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                    {['All', ...storeDomains].map((d) => (
                      <TouchableOpacity
                        key={d}
                        style={[styles.dropdownItem, selectedDomain === d && styles.dropdownItemActive]}
                        onPress={() => { setSelectedDomain(d); setShowDropdown(false); }}
                      >
                        <Text style={[styles.dropdownItemText, selectedDomain === d && styles.dropdownItemTextActive]}>
                          {d === 'All' ? 'All Stores' : d}
                        </Text>
                        {selectedDomain === d && <Icon name="check" size={16} color="#319241" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Change chips — hidden in readOnly mode */}
          {!readOnly && (toAdd.length > 0 || toRemove.length > 0) && (
            <View style={styles.chips}>
              {toAdd.map((u) => (
                <TouchableOpacity key={u.email} style={styles.chipAdd} onPress={() => toggle(u.email)}>
                  <Icon name="person-add" size={12} color="#319241" style={{ marginRight: 3 }} />
                  <Text style={styles.chipAddText}>{u.name}</Text>
                  <Icon name="close" size={12} color="#319241" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              ))}
              {toRemove.map((u) => (
                <TouchableOpacity key={u.email} style={styles.chipRemove} onPress={() => toggle(u.email)}>
                  <Icon name="person-remove" size={12} color="#DC2626" style={{ marginRight: 3 }} />
                  <Text style={styles.chipRemoveText}>{u.name}</Text>
                  <Icon name="close" size={12} color="#DC2626" style={{ marginLeft: 3 }} />
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
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Icon name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.sectionLabel}>{summaryLabel()}</Text>

          {loading ? (
            <ActivityIndicator color="#319241" style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(u) => u.email}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const inGroup    = current.includes(item.email);
                const isChecked  = selected.has(item.email);
                const isAdding   = !readOnly && !inGroup && isChecked;
                const isRemoving = !readOnly && inGroup && !isChecked;

                let avatarStyle = styles.avatarDefault;
                let avatarIcon  = 'person';
                let avatarIconColor = '#319241';

                if (!readOnly) {
                  if (isAdding)   { avatarStyle = styles.avatarAdding;   avatarIcon = 'check'; avatarIconColor = '#fff'; }
                  if (isRemoving) { avatarStyle = styles.avatarRemoving; avatarIcon = 'close'; avatarIconColor = '#fff'; }
                  if (inGroup && isChecked && !isRemoving) {
                    avatarStyle = styles.avatarInGroup; avatarIcon = 'check'; avatarIconColor = '#fff';
                  }
                }

                return (
                  <TouchableOpacity
                    style={[
                      styles.userRow,
                      isAdding   && styles.userRowAdding,
                      isRemoving && styles.userRowRemoving,
                    ]}
                    onPress={readOnly ? undefined : () => toggle(item.email)}
                    activeOpacity={readOnly ? 1 : 0.75}
                  >
                    <View style={[styles.avatar, avatarStyle]}>
                      <Icon name={avatarIcon} size={18} color={avatarIconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.userName,
                        isRemoving && styles.userNameRemoving,
                        isAdding   && styles.userNameAdding,
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.userEmail}>{item.email}</Text>
                      {isAgent && !!item.storeDomain && (
                        <Text style={styles.userDomain}>{item.storeDomain}</Text>
                      )}
                    </View>
                    {!readOnly && inGroup && !isRemoving && (
                      <View style={styles.inGroupBadge}>
                        <Text style={styles.inGroupText}>In group</Text>
                      </View>
                    )}
                    {!readOnly && isRemoving && (
                      <View style={styles.removeBadge}>
                        <Text style={styles.removeBadgeText}>Will remove</Text>
                      </View>
                    )}
                    {!readOnly && isAdding && (
                      <View style={styles.addBadge}>
                        <Text style={styles.addBadgeText}>Will add</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Icon name="group" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No contacts found</Text>
                </View>
              }
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
    maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  memberCountBadge: {
    minWidth: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10,
  },
  memberCountText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  confirmBtn: {
    backgroundColor: '#319241', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, minWidth: 90, alignItems: 'center',
  },
  confirmBtnOff:  { backgroundColor: '#D1D5DB' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── Domain filter ──
  domainRow: {
    marginHorizontal: 14,
    marginTop: 10,
    zIndex: 10,
  },
  domainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7D7AD',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  domainBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#319241',
    marginRight: 2,
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  dropdownItemActive:     { backgroundColor: '#F0FDF4' },
  dropdownItemText:       { fontSize: 14, color: '#374151' },
  dropdownItemTextActive: { color: '#319241', fontWeight: '600' },

  chips: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 14, paddingTop: 10, gap: 6,
  },
  chipAdd: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EDE9FE', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chipAddText:    { fontSize: 12, color: '#319241', fontWeight: '600' },
  chipRemove: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEE2E2', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chipRemoveText: { fontSize: 12, color: '#DC2626', fontWeight: '600' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },

  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: '#9CA3AF',
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  list: { maxHeight: 380 },

  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  userRowAdding:   { backgroundColor: '#F5F3FF' },
  userRowRemoving: { backgroundColor: '#FEF2F2' },

  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarDefault:  { backgroundColor: '#DCFCE7' },
  avatarInGroup:  { backgroundColor: '#319241' },
  avatarAdding:   { backgroundColor: '#319241' },
  avatarRemoving: { backgroundColor: '#DC2626' },

  userName:         { fontSize: 14, fontWeight: '600', color: '#111827' },
  userNameAdding:   { color: '#319241' },
  userNameRemoving: { color: '#DC2626' },
  userEmail:        { fontSize: 12, color: '#6B7280' },
  userDomain:       { fontSize: 11, color: '#9CA3AF', marginTop: 1 },

  inGroupBadge: {
    backgroundColor: '#DCFCE7', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#A7D7AD',
  },
  inGroupText:     { fontSize: 11, fontWeight: '700', color: '#319241' },
  addBadge: {
    backgroundColor: '#EDE9FE', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#d4f3d9',
  },
  addBadgeText:    { fontSize: 11, fontWeight: '700', color: '#319241' },
  removeBadge: {
    backgroundColor: '#FEE2E2', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#FECACA',
  },
  removeBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  empty:     { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32 },
});
