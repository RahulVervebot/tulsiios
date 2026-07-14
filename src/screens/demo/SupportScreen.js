import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Platform,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AppHeader from '../components/AppHeader';
import { getPosUsers } from '../functions/users/function';
import reportbg from '../assets/images/report-bg.png';

const TAB_CONTACTS = 'contacts';
const TAB_HISTORY  = 'history';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatCallTime(ts) {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const now  = new Date();
  const diff = now - date;
  if (diff < 60_000)       return 'Just now';
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2 * 86_400_000) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function callStatusLabel(status, isOutgoing) {
  if (status === 'ended')    return { label: 'Completed',  color: '#16A34A' };
  if (status === 'rejected') return { label: isOutgoing ? 'Declined' : 'Declined', color: '#DC2626' };
  if (status === 'calling')  return { label: isOutgoing ? 'No Answer' : 'Missed',  color: '#F59E0B' };
  if (status === 'answered') return { label: 'Answered',   color: '#16A34A' };
  return { label: status || '—', color: '#6B7280' };
}

// ─── Contacts tab ─────────────────────────────────────────────────────────────

function ContactsTab({ myEmail }) {
  const navigation  = useNavigation();
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [refreshing,   setRefreshing]   = useState(false);

  const fetchUsers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const result = await getPosUsers();
      setUsers(result.users || []);
    } catch (e) {
      console.log('SupportScreen contacts error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = users
    .filter((u) => u.email !== myEmail)
    .filter((u) => {
      const q = searchQuery.toLowerCase();
      return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });

  const handleUserPress = (user) => {
    Alert.alert(
      user.name || user.email,
      'Choose call type',
      [
        { text: 'Voice Call', onPress: () => navigation.navigate('VoiceCallScreen', { outgoingUser: user }) },
        { text: 'Video Call', onPress: () => navigation.navigate('VideoCallScreen', { outgoingUser: user }) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <>
      <View style={styles.searchBar}>
        <Icon name="search" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#319241" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => String(item.id || item.email)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchUsers(true); }}
              tintColor="#319241"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.userCard}
              onPress={() => handleUserPress(item)}
            >
              <View style={styles.userAvatar}>
                <Icon name="person" size={26} color="#319241" />
              </View>
              <View style={styles.userMeta}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              <View style={styles.callIcons}>
                <Icon name="call"     size={20} color="#319241" style={{ marginRight: 12 }} />
                <Icon name="videocam" size={20} color="#319241" />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="people" size={48} color="#B0C4B8" />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}
    </>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ myEmail }) {
  const navigation = useNavigation();
  const [calls,      setCalls]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async (silent = false) => {
    if (!myEmail) return;
    try {
      if (!silent) setLoading(true);
      const cutoff = Date.now() - TEN_DAYS_MS;

      // Simple single-field queries — no composite index needed.
      // Date filtering and sorting happen in JS.
      const [outSnap, inSnap] = await Promise.all([
        firestore().collection('calls').where('callerId', '==', myEmail).limit(200).get(),
        firestore().collection('calls').where('calleeId', '==', myEmail).limit(200).get(),
      ]);

      const outgoing = outSnap.docs.map((d) => ({ id: d.id, ...d.data(), isOutgoing: true  }));
      const incoming = inSnap.docs.map((d) => ({ id: d.id, ...d.data(), isOutgoing: false }));

      const merged = [...outgoing, ...incoming]
        .filter((c) => {
          if (!c.createdAt) return true; // show if no timestamp rather than hide
          const ms = c.createdAt?.toMillis?.() ?? new Date(c.createdAt).getTime();
          return ms >= cutoff;
        })
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });

      setCalls(merged);
    } catch (e) {
      console.log('SupportScreen history error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myEmail]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleCallBack = (call) => {
    const otherEmail = call.isOutgoing ? call.calleeId : call.callerId;
    const otherName  = call.isOutgoing ? call.calleeName : call.callerName;
    const user = { email: otherEmail, name: otherName };
    Alert.alert(
      otherName || otherEmail,
      'Choose call type',
      [
        { text: 'Voice Call', onPress: () => navigation.navigate('VoiceCallScreen', { outgoingUser: user }) },
        { text: 'Video Call', onPress: () => navigation.navigate('VideoCallScreen', { outgoingUser: user }) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#319241" />
      </View>
    );
  }

  return (
    <FlatList
      data={calls}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchHistory(true); }}
          tintColor="#319241"
        />
      }
      renderItem={({ item }) => {
        const otherName  = item.isOutgoing ? (item.calleeName || item.calleeId) : (item.callerName || item.callerId);
        const otherEmail = item.isOutgoing ? item.calleeId : item.callerId;
        const isVideo    = item.type === 'video';
        const { label, color } = callStatusLabel(item.status, item.isOutgoing);

        return (
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.historyCard}
            onPress={() => handleCallBack(item)}
          >
            {/* Call type icon */}
            <View style={[styles.historyIconWrap, { backgroundColor: isVideo ? '#EFF6FF' : '#DCFCE7' }]}>
              <Icon
                name={isVideo ? 'videocam' : 'call'}
                size={22}
                color={isVideo ? '#2563EB' : '#319241'}
              />
            </View>

            {/* Info */}
            <View style={styles.historyMeta}>
              <View style={styles.historyRow}>
                <Icon
                  name={item.isOutgoing ? 'call-made' : 'call-received'}
                  size={13}
                  color={item.isOutgoing ? '#319241' : '#F59E0B'}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.historyName} numberOfLines={1}>{otherName}</Text>
              </View>
              <Text style={styles.historyEmail} numberOfLines={1}>{otherEmail}</Text>
              <Text style={[styles.historyStatus, { color }]}>{label}</Text>
            </View>

            {/* Time + callback */}
            <View style={styles.historyRight}>
              <Text style={styles.historyTime}>{formatCallTime(item.createdAt)}</Text>
              <View style={styles.callbackBtn}>
                <Icon name="call" size={16} color="#319241" />
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Icon name="history" size={48} color="#B0C4B8" />
          <Text style={styles.emptyText}>No calls in the last 10 days</Text>
        </View>
      }
    />
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

export default function SupportScreen() {
  const [myEmail,  setMyEmail]  = useState('');
  const [activeTab, setActiveTab] = useState(TAB_CONTACTS);

  useEffect(() => {
    AsyncStorage.getItem('userEmail').then((e) => { if (e) setMyEmail(e); });
  }, []);

  return (
    <ImageBackground
      source={getImageSource(reportbg)}
      style={styles.screen}
      resizeMode="cover"
    >
      <AppHeader Title="Support" backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.panel}>
        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === TAB_CONTACTS && styles.tabBtnActive]}
            onPress={() => setActiveTab(TAB_CONTACTS)}
            activeOpacity={0.8}
          >
            <Icon
              name="contacts"
              size={16}
              color={activeTab === TAB_CONTACTS ? '#fff' : '#319241'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabLabel, activeTab === TAB_CONTACTS && styles.tabLabelActive]}>
              Contacts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === TAB_HISTORY && styles.tabBtnActive]}
            onPress={() => setActiveTab(TAB_HISTORY)}
            activeOpacity={0.8}
          >
            <Icon
              name="history"
              size={16}
              color={activeTab === TAB_HISTORY ? '#fff' : '#319241'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabLabel, activeTab === TAB_HISTORY && styles.tabLabelActive]}>
              Recent Calls
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === TAB_CONTACTS
          ? <ContactsTab myEmail={myEmail} />
          : <HistoryTab  myEmail={myEmail} />
        }
      </View>
    </ImageBackground>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  panel: {
    flex: 1,
    backgroundColor: '#D4E7DC',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    ...Platform.select({
      ios:     { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },

  // ── tabs ──
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#319241',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#319241',
  },
  tabLabelActive: {
    color: '#fff',
  },

  // ── search ──
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },

  // ── shared list ──
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 30,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 15,
    color: '#9CA3AF',
  },

  // ── contact card ──
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
    }),
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userMeta: { flex: 1 },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#6B7280',
  },
  callIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── history card ──
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
    }),
  },
  historyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyMeta: { flex: 1 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  historyName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  historyEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 3,
  },
  historyStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyRight: {
    alignItems: 'center',
    marginLeft: 8,
    gap: 8,
  },
  historyTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  callbackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
