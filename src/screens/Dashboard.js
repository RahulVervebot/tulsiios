import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomHeader from '../components/CustomHeader';
import HomeIcon from '../assets/icons/Products.svg';
import ReportIcon from '../assets/icons/Reportsicon.svg';
import POSIcon from '../assets/icons/payment_2.svg';
import Icon from 'react-native-vector-icons/MaterialIcons';
import TulsiIcon from '../assets/icons/inventory_1.svg';
import { dbPromise } from '../firebaseConfig';

import Chat from '../components/Chat';
 import { tagDeviceWithStoreUrl } from '../config/OneSignalConfig';
const LIGHT_GREEN = '#e6f6ec';
const HEADER_FALLBACK = '#ffffff';

const cards = [
  {
    key: 'products',
    title: 'Products',
    subtitle: 'Manage Products',
    icon: HomeIcon,
    target: 'ProductScreen',
  },
  {
    key: 'report',
    title: 'Report',
    subtitle: 'Sales & Analytics',
    icon: ReportIcon,
    target: 'Report',
  },
  {
    key: 'pos',
    title: 'POS Management',
    subtitle: 'Manager Your POS',
    icon: POSIcon,
    target: 'POSScreen',
  },
  {
    key: 'tulsi-ai',
    title: 'TulsiAI',
    subtitle: 'Inventory Management',
    icon: TulsiIcon,
    target: 'ICMSScreen',
  },
];


export default function Dashboard() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [headerBg, setHeaderBg] = useState({ type: 'color', value: HEADER_FALLBACK });
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');
  const [isUserSettingVisible, setIsUserSettingVisible] = useState(false);
  const [isAllowTulsiAi, setIsAllowTulsiAi] = useState(false);
  const [storeOptions, setStoreOptions] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchPin, setSwitchPin] = useState('');
  const [storedPassword, setStoredPassword] = useState('');
  const [switchAuthMode, setSwitchAuthMode] = useState('password');
  const [switchError, setSwitchError] = useState('');
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const inFlightRef = useRef(false);
  const chatAuthInFlightRef = useRef(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);

  useEffect(() => {
    const loadHeader = async () => {
      try {
        const topBanner = await AsyncStorage.getItem('topabanner');
        if (topBanner) {
          setHeaderBg({ type: 'image', value: topBanner });
        } else {
          setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
        }
      } catch (e) {
        setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
      }
    };
    loadHeader();
  }, []);

  const fetchFirebaseDataLogin = useCallback(async () => {
    if (inFlightRef.current) return '';
    inFlightRef.current = true;
    try {
      const db = await dbPromise;
      const docRef = db.collection('tulsi').doc('storelist');
      const docSnapshot = await docRef.get();
      if (!docSnapshot.exists) return '';
      const data = docSnapshot.data() || {};
      if (data?.bottombanner) await AsyncStorage.setItem('bottombanner', data.bottombanner);
      if (data?.topabanner) await AsyncStorage.setItem('topabanner', data.topabanner);
      if (data?.icmsurl) await AsyncStorage.setItem('icms_url', data.icmsurl);
      if (data?.local_icms_url) await AsyncStorage.setItem('local_icms_url', data.local_icms_url);
      if (data?.tulsi_websocket) await AsyncStorage.setItem('tulsi_websocket', data.tulsi_websocket);
      if (data?.tulsi_ai_backend) await AsyncStorage.setItem('tulsi_ai_backend', data.tulsi_ai_backend);
      if (data?.tulsifrontendurl) await AsyncStorage.setItem('tulsifrontendurl', data.tulsifrontendurl);
      return data?.url ? String(data.url) : '';
    } catch (error) {
      console.error('Failed to retrieve Firebase data:', error);
      return '';
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const fetchStoreListFromFirebaseUrl = useCallback(async (url) => {
    if (!url) return {};
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Store list HTTP ${res.status}`);
    const json = await res.json();
    const root = Array.isArray(json) ? json[0] : json;
    const map = {};
    if (root && typeof root === 'object') {
      for (const domain of Object.keys(root)) {
        const arr = Array.isArray(root[domain]) ? root[domain] : [];
        map[domain] = arr
          .map((o) => {
            const name = o && typeof o === 'object' ? Object.keys(o)[0] : null;
            if (!name) return null;
            const {
              storeurl,
              dbname,
              icms_store,
              icmsurl,
              storepin,
              chat_ai_api,
              chat_ai_baseurl,
            } = o[name] || {};
            if (!storeurl || !dbname) return null;
            return {
              name,
              storeurl,
              dbname,
              icms_store: icms_store ?? icmsurl ?? '',
              storepin: storepin ?? '',
              chat_ai_api: chat_ai_api ?? '',
              chat_ai_baseurl: chat_ai_baseurl ?? '',
            };
          })
          .filter(Boolean);
      }
    }
    return map;
  }, []);

  const joinUrl = (base, path) => {
    const normalizedBase = String(base || '').trim();
    const normalizedPath = String(path || '').trim();
    if (!normalizedBase) return normalizedPath;

    const withScheme = /^https?:\/\//i.test(normalizedBase)
      ? normalizedBase
      : `http://${normalizedBase}`;

    if (withScheme.endsWith('/') && normalizedPath.startsWith('/')) return withScheme + normalizedPath.slice(1);
    if (!withScheme.endsWith('/') && !normalizedPath.startsWith('/')) return `${withScheme}/${normalizedPath}`;
    return withScheme + normalizedPath;
  };

  const chatailogin = useCallback(async (baseUrl, email, password) => {
    if (chatAuthInFlightRef.current) return;
    if (!email || !password || !baseUrl) return;
    chatAuthInFlightRef.current = true;
    try {
      const url = baseUrl.endsWith('/')
        ? `${baseUrl}auth/widget/login/`
        : `${baseUrl}/auth/widget/login/`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const user = json?.user || {};
      const tokens = json?.tokens || {};
      const entries = [];
      Object.keys(user).forEach((key) => {
        if (key === 'last_login' || key === 'date_joined') return;
        entries.push([`chatai_${key}`, String(user[key] ?? '')]);
      });
      Object.keys(tokens).forEach((key) => {
        entries.push([`chatai_${key}`, String(tokens[key] ?? '')]);
      });
      if (entries.length) {
        await AsyncStorage.multiSet(entries);
      }
    } catch (error) {
      console.warn('Chat AI login error:', error);
    } finally {
      chatAuthInFlightRef.current = false;
    }
  }, []);

  const handleSwitchAccountPress = useCallback(async () => {
    if (!userEmail) {
      Alert.alert('Missing email', 'No saved user email found. Please login again.');
      return;
    }
    try {
      setSwitchingAccount(true);
      const firebaseUrl = await fetchFirebaseDataLogin();
      if (!firebaseUrl) {
        Alert.alert('Store list unavailable', 'Could not load store list.');
        return;
      }
      const map = await fetchStoreListFromFirebaseUrl(firebaseUrl);
      const domain = userEmail.includes('@') ? userEmail.split('@')[1].toLowerCase().trim() : '';
      const currentDbName = ((await AsyncStorage.getItem('dbname')) || '').trim().toLowerCase();
      const options = (domain && map[domain] ? map[domain] : []).filter((opt) => {
        const optionDb = String(opt?.dbname || '').trim().toLowerCase();
        return optionDb && optionDb !== currentDbName;
      });
      setStoreOptions(options);
      if (!options.length) {
        Alert.alert('No other store available', 'No alternate store found for this account.');
        return;
      }
      setStoreModalVisible(true);
    } catch (error) {
      console.error('Switch store load failed:', error);
      Alert.alert('Error', 'Failed to load stores for switching account.');
    } finally {
      setSwitchingAccount(false);
    }
  }, [fetchFirebaseDataLogin, fetchStoreListFromFirebaseUrl, userEmail]);

  const handleSelectStoreForSwitch = useCallback(async (store) => {
    const savedPassword = (await AsyncStorage.getItem('password')) || '';
    setSelectedStore(store);
    setStoreModalVisible(false);
    setStoredPassword(savedPassword);
    setSwitchAuthMode(savedPassword && store?.storepin ? 'pin' : 'password');
    setSwitchPin('');
    setSwitchPassword('');
    setSwitchError('');
    setPasswordModalVisible(true);
  }, []);

  const handleSwitchLogin = useCallback(async () => {
    if (!selectedStore) {
      Alert.alert('Select store', 'Please select a store first.');
      return;
    }
    if (switchAuthMode === 'pin' && !switchPin) {
      Alert.alert('Missing PIN', 'Please enter store PIN.');
      return;
    }
    if (switchAuthMode === 'password' && !switchPassword) {
      Alert.alert('Missing password', 'Please enter your password.');
      return;
    }

    if (switchAuthMode === 'pin') {
      const expectedPin = String(selectedStore.storepin || '');
      if (!expectedPin || String(switchPin) !== expectedPin) {
        Alert.alert('Invalid PIN', 'Entered store PIN is incorrect.');
        return;
      }
    }

    const passwordToUse = switchAuthMode === 'pin' ? storedPassword : switchPassword;

    try {
      setSwitchingAccount(true);
      setSwitchError('');
      // Clear old store configuration completely before setting new one
      await AsyncStorage.multiRemove([
        'storeurl',
        'dbname',
        'icms_store',
        'chat_ai_api',
        'chat_ai_baseurl',
        'storepin',
      ]);
      // Set new store configuration
      await AsyncStorage.multiSet([
        ['storeurl', String(selectedStore.storeurl || '')],
        ['dbname', String(selectedStore.dbname || '')],
        ['icms_store', String(selectedStore.icms_store || '')],
        ['chat_ai_api', String(selectedStore.chat_ai_api || '')],
        ['chat_ai_baseurl', String(selectedStore.chat_ai_baseurl || '')],
        ['storepin', String(selectedStore.storepin || '')],
      ]);
     

      const url = joinUrl(selectedStore.storeurl, '/pos/app/login');
      console.log('Switch login request URL:', url);
      const res = await fetch(url, {
        method: 'POST',
         headers: { 
        'Content-Type': 'application/json',
         'credentials': 'omit',
          'Cookie': 'session_id'
         },
        body: JSON.stringify({
          db: selectedStore.dbname,
          login: userEmail,
          password: passwordToUse,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.result) {
        const msg = (data && data.error && (data.error.data?.message || data.error.message)) || 'Invalid credentials or server error';
        if (switchAuthMode === 'pin') {
          setSwitchError('Password invalid for this store.');
          setSwitchingAccount(false);
          return;
        }
        Alert.alert('Login Failed', msg);
        return;
      }

      const { pos_role, access_token, expiry, user_full_name, user_context, is_user_setting_visible_in_app, is_allow_tulsi_ai, is_allow_icms, is_allow_tulsi_chat_support, is_promotion_accessible, is_product_edit_permission_in_app } = data.result || {};
      await AsyncStorage.multiSet([
        ['userRole', String(pos_role || '')],
        ['access_token', String(access_token || '')],
        ['expiry', String(expiry || '')],
        ['userName', String(user_full_name || '')],
        ['userEmail', String(userEmail || '')],
        ['userTimeZone', String(user_context?.tz || '')],
        ['userLang', String(user_context?.lang || '')],
        ['password', String(passwordToUse || '')],
        ['storepin', String(selectedStore.storepin || '')],
        ['is_user_setting_visible_in_app', String(is_user_setting_visible_in_app || 'false')],
        ['is_allow_tulsi_ai', String(is_allow_tulsi_ai || 'false')],
        ['is_allow_icms', String(is_allow_icms || 'false')],
        ['is_allow_tulsi_chat_support', String(is_allow_tulsi_chat_support || 'false')],
        ['is_promotion_accessible', String(is_promotion_accessible || 'false')],
        ['is_product_edit_permission_in_app', String(is_product_edit_permission_in_app || 'false')],
      ]);

      // Register device with OneSignal using the new store's URL
      console.log('📱 Switching device to new store:', selectedStore?.storeurl);
      // await registerDeviceWithStoreUrl(selectedStore?.storeurl || '');
          await tagDeviceWithStoreUrl(selectedStore?.storeurl || '', pos_role || '');
      const chatBaseUrl = await AsyncStorage.getItem('tulsi_ai_backend');
      if (chatBaseUrl) {
        await chatailogin(chatBaseUrl, userEmail, passwordToUse);
      }

      setUserName(String(user_full_name || ''));
      setUserRole(String(pos_role || ''));
      setIsUserSettingVisible(is_user_setting_visible_in_app === true || is_user_setting_visible_in_app === 'true');
      setIsAllowTulsiAi(is_allow_tulsi_ai === true || is_allow_tulsi_ai === 'true');
      setSwitchPassword('');
      setSwitchPin('');
      setSwitchError('');
      setPasswordModalVisible(false);
      Alert.alert('Success', 'Store switched successfully.');
    } catch (error) {
      console.error('Switch login error:', {
        storeurl: selectedStore?.storeurl,
        normalizedUrl: joinUrl(selectedStore?.storeurl, '/pos/app/login'),
        message: error?.message,
      });
      Alert.alert('Error', `Something went wrong while switching account: ${error?.message || 'Unknown network error'}`);
    } finally {
      setSwitchingAccount(false);
    }
  }, [chatailogin, selectedStore, storedPassword, switchAuthMode, switchPassword, switchPin, userEmail]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedName = await AsyncStorage.getItem('userName');
        const storedEmail = await AsyncStorage.getItem('userEmail');
        const storedRole = await AsyncStorage.getItem('userRole');
        const storedSettingVisible = await AsyncStorage.getItem('is_user_setting_visible_in_app');
        const storedAllowTulsiAi = await AsyncStorage.getItem('is_allow_tulsi_ai');
        const storedDeveloperMode = await AsyncStorage.getItem('developer_mode');
        setUserName(storedName || '');
        setUserEmail(storedEmail || '');
        setUserRole(storedRole || '');
        setIsUserSettingVisible(storedSettingVisible === 'true');
        setIsAllowTulsiAi(storedAllowTulsiAi === 'true');
        setDeveloperMode(storedDeveloperMode === 'true');
      } catch (e) {
        setUserName('');
        setUserEmail('');
        setUserRole('');
        setIsUserSettingVisible(false);
        setIsAllowTulsiAi(false);
        setDeveloperMode(false);
      }
    };
    loadUser();
  }, []);

  const initials = useMemo(() => {
    if (!userName) return 'U';
    const parts = userName.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
  }, [userName]);

  const prettyRole = useMemo(() => (userRole ? userRole.replace(/_/g, ' ') : ''), [userRole]);
  
  const handleDeveloperModeToggle = useCallback(async (value) => {
    try {
      setDeveloperMode(value);
      await AsyncStorage.setItem('developer_mode', String(value));
    } catch (error) {
      console.error('Failed to save developer mode:', error);
      Alert.alert('Error', 'Failed to save developer mode setting.');
    }
  }, []);
  
  const visibleCards = useMemo(() => {
    return cards.filter((card) => {
      // Only show tulsi-ai card if user has permission
      if (card.key === 'tulsi-ai') {
        return isAllowTulsiAi;
      }
      return true;
    });
  }, [isAllowTulsiAi]);
  
  const statusBg = headerBg.type === 'image' ? 'transparent' : headerBg.value;
  const statusStyle = headerBg.type === 'image' ? 'light-content' : 'dark-content';

	return (
	    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
	      <StatusBar backgroundColor={'#319241'} barStyle={statusStyle} />
	      <CustomHeader Title="Dashboard" backgroundType={headerBg.type} backgroundValue={headerBg.value} />
	      <ScrollView
	        contentContainerStyle={[styles.content, { paddingBottom: 104 + insets.bottom }]}
	        showsVerticalScrollIndicator={false}
	      >
        <View style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{initials}</Text>
            </View>
            <View style={styles.userMeta}>
              <Text style={styles.userName} numberOfLines={1}>
                {userName || 'User'}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {userEmail || '—'}
              </Text>
              {!!prettyRole && (
                <View style={styles.userRoleBadge}>
                  <Text style={styles.userRoleText}>{prettyRole}</Text>
                </View>
              )}
            </View>
            <View style={styles.userActions}>
              {isUserSettingVisible && (
                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={() => navigation.navigate('UserList')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.settingsButtonText}>User Setting</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.switchAccountButton}
                onPress={handleSwitchAccountPress}
                activeOpacity={0.85}
                disabled={switchingAccount}
              >
                <Text style={styles.switchAccountButtonText}>
                  {switchingAccount ? 'Loading...' : 'Switch Store'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {isUserSettingVisible && (
            <View style={styles.developerModeSection}>
              <View style={styles.developerModeContent}>
                <View style={styles.developerModeInfo}>
                  <Text style={styles.developerModeLabel}>Developer Mode</Text>
                  <Text style={styles.developerModeDescription}>
                    {developerMode ? 'Advanced features enabled' : 'Enable advanced features'}
                  </Text>
                </View>
                <Switch
                  value={developerMode}
                  onValueChange={handleDeveloperModeToggle}
                  trackColor={{ false: '#d1d5db', true: '#86efac' }}
                  thumbColor={developerMode ? '#2a8a4f' : '#f3f4f6'}
                  ios_backgroundColor="#d1d5db"
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.grid}>

          {visibleCards.map((card) => {
            const Icon = card.icon;
            return (
              <TouchableOpacity
                key={card.key}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate(card.target)}
              >
                <View style={styles.iconWrap}>
                  <Icon width={28} height={28} fill={styles.iconFill.color} />
                </View>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
          
        </View>

      </ScrollView>

      <Modal visible={storeModalVisible} animationType="slide" transparent onRequestClose={() => setStoreModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Store</Text>
            {storeOptions.map((opt) => (
              <TouchableOpacity key={opt.name} style={styles.modalItem} onPress={() => handleSelectStoreForSwitch(opt)}>
                <Text style={styles.modalItemText}>{opt.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.modalItem, { marginTop: 8 }]} onPress={() => setStoreModalVisible(false)}>
              <Text style={[styles.modalItemText, { textAlign: 'center' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={passwordModalVisible} transparent animationType="fade" onRequestClose={() => setPasswordModalVisible(false)}>
        <View style={styles.passwordModalBackdrop}>
          <View style={styles.passwordModalCard}>
            <Text style={styles.passwordModalTitle}>{switchAuthMode === 'pin' ? 'Enter Store PIN' : 'Confirm Password'}</Text>
            <Text style={styles.passwordModalSubTitle}>
              {selectedStore?.name ? `Store: ${selectedStore.name}` : 'Selected store'}
            </Text>
            {switchAuthMode === 'pin' ? (
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter store PIN"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={switchPin}
                onChangeText={setSwitchPin}
              />
            ) : (
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                value={switchPassword}
                onChangeText={setSwitchPassword}
              />
            )}
            {switchError ? <Text style={styles.passwordErrorText}>{switchError}</Text> : null}
            {/* {switchAuthMode === 'pin' ? (
              <TouchableOpacity
                style={styles.passwordLinkWrap}
                onPress={() => {
                  setSwitchAuthMode('password');
                  setSwitchError('');
                }}>
                <Text style={styles.passwordLinkText}>Enter store password</Text>
              </TouchableOpacity>
            ) : null} */}
            <View style={styles.passwordActions}>
              <TouchableOpacity
                style={[styles.passwordActionBtn, styles.passwordCancelBtn]}
                onPress={() => {
                  setPasswordModalVisible(false);
                  setSwitchPassword('');
                  setSwitchPin('');
                  setSwitchError('');
                }}
              >
                <Text style={styles.passwordCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.passwordActionBtn, styles.passwordConfirmBtn]}
                onPress={handleSwitchLogin}
                disabled={switchingAccount}
              >
                {switchingAccount ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.passwordConfirmText}>Login</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: LIGHT_GREEN,

  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
  },
  userCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cfe9d9',
    shadowColor: '#0f2f19',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f5fff8',
    borderWidth: 2,
    borderColor: '#2a8a4f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2a8a4f',
    letterSpacing: 1,
  },
  userMeta: {
    flex: 1,
  },
  settingsButton: {
    backgroundColor: '#2a8a4f',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  userActions: {
    gap: 8,
  },
  settingsButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  switchAccountButton: {
    backgroundColor: '#1f5f38',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  switchAccountButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#163e25',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4f6f5d',
    marginBottom: 6,
  },
  userRoleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#d7f2df',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#cfe9d9',
  },
  userRoleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2a8a4f',
    textTransform: 'capitalize',
  },
  developerModeSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#e8f5ec',
  },
  developerModeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  developerModeInfo: {
    flex: 1,
    marginRight: 12,
  },
  developerModeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#163e25',
    marginBottom: 2,
  },
  developerModeDescription: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b7f73',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f2f19',
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
   fullcard: {
     width: '48%%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#cfe9d9',
    shadowColor: '#0f2f19',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#cfe9d9',
    shadowColor: '#0f2f19',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#d7f2df',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconFill: {
    color: '#2a8a4f',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#163e25',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4f6f5d',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '70%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1F2937',
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  passwordModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  passwordModalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  passwordModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#163e25',
  },
  passwordModalSubTitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#4f6f5d',
  },
  passwordInput: {
    marginTop: 12,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    color: '#111827',
  },
  passwordErrorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#b42318',
  },
  passwordLinkWrap: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  passwordLinkText: {
    fontSize: 13,
    color: '#1d4ed8',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  passwordActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  passwordActionBtn: {
    minWidth: 96,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordCancelBtn: {
    backgroundColor: '#E5E7EB',
  },
  passwordConfirmBtn: {
    backgroundColor: '#2a8a4f',
  },
  passwordCancelText: {
    color: '#111827',
    fontWeight: '700',
  },
  passwordConfirmText: {
    color: '#fff',
    fontWeight: '700',
  },
});
