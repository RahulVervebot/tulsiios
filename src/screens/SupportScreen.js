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
import { rootNavigate } from '../config/RootNavigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AppHeader from '../components/AppHeader';
import ChatList from '../components/chat/ChatList';
import { getOrCreateDirectChat } from '../functions/chat/chatUtils';
import reportbg from '../assets/images/report-bg.png';
const TAB_CONTACTS = 'contacts';
const TAB_HISTORY  = 'history';
const TAB_CHAT     = 'chat';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

// ────────────────────────── helpers ────────────────────────────────────

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

function ContactsTab({ myEmail, myName }) {
  const [users,          setUsers]          = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [refreshing,     setRefreshing]     = useState(false);
  const [isAgent,        setIsAgent]        = useState(false);
  const [storeDomains,   setStoreDomains]   = useState([]);
  const [selectedDomain, setSelectedDomain] = useState('All');
  const [showDropdown,   setShowDropdown]   = useState(false);

  const fetchUsers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const [storeDoc, profilesSnap] = await Promise.all([
        firestore().collection('tulsi').doc('storelist').get(),
        firestore().collection('callProfiles').get(),
      ]);

      const agentList = storeDoc.data()?.Agent || [];

      // Use callUserEmail (myEmail prop) as identity — not the Google/device login email
      const agent = agentList.includes(myEmail);
      if (agent) await AsyncStorage.setItem('userRole', 'Agent');

      // Spread data first, then enforce doc.id as email so key is always unique.
      let contacts = profilesSnap.docs.map((doc) => ({
        ...doc.data(),
        email: doc.id,
      }));

      if (!agent) {
        // Non-agents: only show agent users so they can reach support
        contacts = contacts.filter((u) => agentList.includes(u.email));
      }

      // Build storeDomain list for the Agent dropdown (unique, sorted)
      const uniqueStoreDomains = [...new Set(
        contacts.map((u) => u.storeDomain).filter(Boolean)
      )].sort();

      setIsAgent(agent);
      setStoreDomains(uniqueStoreDomains);
      setUsers(contacts);
    } catch (e) {
      console.log('SupportScreen contacts error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myEmail]);

  useEffect(() => { if (myEmail) fetchUsers(); }, [myEmail, fetchUsers]);

  const filteredUsers = users
    .filter((u) => u.email !== myEmail)
    .filter((u) => {
      if (isAgent && selectedDomain !== 'All') {
        return u.storeDomain === selectedDomain;
      }
      return true;
    })
    .filter((u) => {
      const q = searchQuery.toLowerCase();
      return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });

  const handleUserPress = (user) => {
    Alert.alert(
      user.name || user.email,
      'Choose action',
      [
        {
          text: 'Chat',
          onPress: async () => {
            try {
              const chatId = await getOrCreateDirectChat(myEmail, myName, user.email, user.name || user.email);
              rootNavigate('ChatScreen', { chatId, chatName: user.name || user.email, chatType: 'direct' });
            } catch (e) {
              Alert.alert('Error', 'Could not open chat.');
            }
          },
        },
        { text: 'Voice Call', onPress: () => rootNavigate('VoiceCallScreen', { outgoingUser: user }) },
        { text: 'Video Call', onPress: () => rootNavigate('VideoCallScreen', { outgoingUser: user }) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const MyProfileCard = (
    <View style={styles.myProfileCard}>
      <View style={styles.myProfileAvatar}>
        <Icon name="person" size={26} color="#fff" />
      </View>
      <View style={styles.myProfileMeta}>
        <Text style={styles.myProfileName} numberOfLines={1}>{myName || '—'}</Text>
        <Text style={styles.myProfileEmail} numberOfLines={1}>{myEmail}</Text>
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, { flex: 1 }]}>
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

        {isAgent && storeDomains.length > 0 && (
          <View style={styles.dropdownWrap}>
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setShowDropdown((v) => !v)}
            >
              <Text style={styles.dropdownBtnText} numberOfLines={1}>
                {selectedDomain === 'All' ? 'All' : selectedDomain}
              </Text>
              <Icon name={showDropdown ? 'arrow-drop-up' : 'arrow-drop-down'} size={20} color="#319241" />
            </TouchableOpacity>

            {showDropdown && (
              <View style={styles.dropdownMenu}>
                {['All', ...storeDomains].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dropdownItem, selectedDomain === d && styles.dropdownItemActive]}
                    onPress={() => { setSelectedDomain(d); setShowDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, selectedDomain === d && styles.dropdownItemTextActive]}>
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#319241" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.email}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={MyProfileCard}
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
                {!!item.storeDomain && (
                  <Text style={styles.userStoreDomain}>{item.storeDomain}</Text>
                )}
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
              <Text style={styles.emptyText}>No other users found</Text>
            </View>
          }
        />
      )}
    </>
  );
}

// ─── History tab ───

function HistoryTab({ myEmail }) {
  const [calls,      setCalls]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState({}); // email → bool

  const fetchHistory = useCallback(async (silent = false) => {
    if (!myEmail) return;
    try {
      if (!silent) setLoading(true);
      const cutoff = Date.now() - TEN_DAYS_MS;

      const [outSnap, inSnap] = await Promise.all([
        firestore().collection('calls').where('callerId', '==', myEmail).limit(200).get(),
        firestore().collection('calls').where('calleeId', '==', myEmail).limit(200).get(),
      ]);

      const outgoing = outSnap.docs.map((d) => ({ id: d.id, ...d.data(), isOutgoing: true  }));
      const incoming = inSnap.docs.map((d) => ({ id: d.id, ...d.data(), isOutgoing: false }));

      const merged = [...outgoing, ...incoming]
        .filter((c) => {
          if (!c.createdAt) return true;
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

  // Group calls by other-party email, preserving most-recent-first order
  const grouped = React.useMemo(() => {
    const map = {};
    const order = [];
    for (const c of calls) {
      const email = c.isOutgoing ? c.calleeEmail : c.callerEmail;
      const name  = c.isOutgoing ? (c.calleeName || c.calleeEmail) : (c.callerName || c.callerEmail);
      if (!map[email]) {
        map[email] = { email, name, items: [] };
        order.push(email);
      }
      map[email].items.push(c);
    }
    return order.map((e) => ({
      ...map[e],
      recentItems: map[e].items.slice(0, 10),
    }));
  }, [calls]);

  const toggleExpand = (email) =>
    setExpanded((prev) => ({ ...prev, [email]: !prev[email] }));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#319241" />
      </View>
    );
  }

  return (
    <FlatList
      data={grouped}
      keyExtractor={(item) => item.email}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchHistory(true); }}
          tintColor="#319241"
        />
      }
      renderItem={({ item: group }) => {
        const isOpen  = !!expanded[group.email];
        const latest  = group.items[0];
        const isVideo = latest?.type === 'video';
        const user    = { email: group.email, name: group.name };

        return (
          <View style={styles.historyCard}>
            {/* ── User row (always visible) ── */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.historyUserRow}
              onPress={() => toggleExpand(group.email)}
            >
              <View style={[styles.historyIconWrap, { backgroundColor: isVideo ? '#EFF6FF' : '#DCFCE7' }]}>
                <Icon
                  name={isVideo ? 'videocam' : 'call'}
                  size={22}
                  color={isVideo ? '#2563EB' : '#319241'}
                />
              </View>

              <View style={styles.historyMeta}>
                <Text style={styles.historyName} numberOfLines={1}>{group.name}</Text>
                <Text style={styles.historyEmail} numberOfLines={1}>{group.email}</Text>
                <Text style={styles.historyCount}>{group.items.length} call{group.items.length !== 1 ? 's' : ''}</Text>
              </View>

              <View style={styles.historyRight}>
                <Text style={styles.historyTime}>{formatCallTime(latest?.createdAt)}</Text>
                <Icon
                  name={isOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={22}
                  color="#6B7280"
                />
              </View>
            </TouchableOpacity>

            {/* ── Expanded history list ── */}
            {isOpen && (
              <View style={styles.historyExpanded}>
                {group.recentItems.map((c) => {
                  const { label, color } = callStatusLabel(c.status, c.isOutgoing);
                  const callIsVideo = c.type === 'video';
                  return (
                    <View key={c.id} style={styles.historyDetailRow}>
                      <Icon
                        name={c.isOutgoing ? 'call-made' : 'call-received'}
                        size={14}
                        color={c.isOutgoing ? '#319241' : '#F59E0B'}
                        style={{ marginRight: 6 }}
                      />
                      <Icon
                        name={callIsVideo ? 'videocam' : 'call'}
                        size={14}
                        color={callIsVideo ? '#2563EB' : '#6B7280'}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.historyDetailStatus, { color }]}>{label}</Text>
                      <Text style={styles.historyDetailTime}>{formatCallTime(c.createdAt)}</Text>
                    </View>
                  );
                })}

                {/* ── Call action buttons ── */}
                <View style={styles.historyCallBtns}>
                  <TouchableOpacity
                    style={[styles.historyCallBtn, { marginRight: 6 }]}
                    activeOpacity={0.8}
                    onPress={() => rootNavigate('VoiceCallScreen', { outgoingUser: user })}
                  >
                    <Icon name="call" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.historyCallBtnText}>Voice Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.historyCallBtn, { marginLeft: 6, backgroundColor: '#2563EB' }]}
                    activeOpacity={0.8}
                    onPress={() => rootNavigate('VideoCallScreen', { outgoingUser: user })}
                  >
                    <Icon name="videocam" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.historyCallBtnText}>Video Call</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
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

// ─── Main screen ────

const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

export default function SupportScreen({ navigation }) {
  const [myEmail,   setMyEmail]   = useState('');
  const [myName,    setMyName]    = useState('');
  const [activeTab, setActiveTab] = useState(TAB_CONTACTS);

  useEffect(() => {
    const validateAndLoad = async () => {
      const [[, email], [, name]] = await AsyncStorage.multiGet([
        'callUserEmail', 'callUserName',
      ]);
      if (!email) {
        navigation.replace('CallLoginScreen');
        return;
      }
      // Validate profile still exists in Firestore (allow offline use on error)
      try {
        const doc = await firestore().collection('callProfiles').doc(email).get();
        if (!doc.exists) {
          await AsyncStorage.multiRemove(['callUserEmail', 'callUserName']);
          navigation.replace('CallLoginScreen');
          return;
        }
      } catch (_) {
        // Network error — keep cached credentials so offline use isn't blocked
      }
      setMyEmail(email);
      setMyName(name || email);
    };
    validateAndLoad();
  }, []);

  return (
    <ImageBackground
      source={getImageSource(reportbg)}
      style={styles.screen}
      resizeMode="cover"
    >
      <AppHeader Title="Contact Us" backgroundType="image" backgroundValue={reportbg} />

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
              Calls
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === TAB_CHAT && styles.tabBtnActive]}
            onPress={() => setActiveTab(TAB_CHAT)}
            activeOpacity={0.8}
          >
            <Icon
              name="chat"
              size={16}
              color={activeTab === TAB_CHAT ? '#fff' : '#319241'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabLabel, activeTab === TAB_CHAT && styles.tabLabelActive]}>
              Chats
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === TAB_CONTACTS && (
          <ContactsTab myEmail={myEmail} myName={myName} />
        )}
        {activeTab === TAB_HISTORY && (
          <HistoryTab myEmail={myEmail} />
        )}
        {activeTab === TAB_CHAT && (
          <ChatList myEmail={myEmail} myName={myName} />
        )}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 10,
    gap: 8,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // ── domain dropdown ──
  dropdownWrap: {
    position: 'relative',
    zIndex: 20,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  dropdownBtnText: {
    fontSize: 13,
    color: '#319241',
    fontWeight: '600',
    maxWidth: 90,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 46,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 140,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 6 },
    }),
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dropdownItemActive: {
    backgroundColor: '#F0FDF4',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#374151',
  },
  dropdownItemTextActive: {
    color: '#319241',
    fontWeight: '700',
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
  userStoreDomain: {
    fontSize: 11,
    color: '#319241',
    fontWeight: '600',
    marginTop: 2,
  },
  callIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── history card ──
  historyCard: {
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

  // ── My Profile card ──────────────────────────────────────────────────────────
  myProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  myProfileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#319241',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  myProfileMeta: {
    flex: 1,
  },
  myProfileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  myProfileEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  // ── grouped history ──
  historyUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyCount: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  historyExpanded: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  historyDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  historyDetailStatus: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  historyDetailTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  historyCallBtns: {
    flexDirection: 'row',
    marginTop: 12,
  },
  historyCallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#319241',
    borderRadius: 10,
    paddingVertical: 9,
  },
  historyCallBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});