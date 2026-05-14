import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Modal,
  Image,
  ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import LoginBackground from '../assets/images/Login_screen_white.png';
import LinearGradient from 'react-native-linear-gradient';
import { dbPromise } from '../firebaseConfig';
import { registerDeviceWithStoreUrl, tagDeviceWithStoreUrl, tagDeviceWithUserRole } from '../config/OneSignalConfig';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // fetched from Firestore: public Storage URL to JSON (e.g., https://.../storelist.json?...token=...)
  const [firebaseeurl, setFirebaseUrl] = useState('');
  const inFlightRef = useRef(false);
  const chatAuthInFlightRef = useRef(false);

  // store picker state
  const [storeMap, setStoreMap] = useState(null); // { [domain]: [{ name, storeurl, dbname }] }
  const [storeOptions, setStoreOptions] = useState([]); // options for current email domain
  const [selectedStore, setSelectedStore] = useState(null);
  const [storeModalVisible, setStoreModalVisible] = useState(false);

  // PIN modal state
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');

  // -----------------------------
  // 1) Get Firebase URL (your existing Firestore doc)
  // -----------------------------
  const fetchFirebaseDataLogin = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const db = await dbPromise;
      const docRef = db.collection('tulsi').doc('storelist');
      const docSnapshot = await docRef.get();
      if (docSnapshot.exists) {
        const data = docSnapshot.data();
        // expects { url: 'https://firebasestorage.googleapis.com/.../storelist.json?...' }
        if (data?.url) {
          setFirebaseUrl(String(data.url));
          await AsyncStorage.setItem('bottombanner', data.bottombanner);
          await AsyncStorage.setItem('topabanner', data.topabanner);
          await AsyncStorage.setItem('icms_url', data.icmsurl);
          await AsyncStorage.setItem('local_icms_url', data.local_icms_url);
          await AsyncStorage.setItem('tulsi_websocket', data.tulsi_websocket);
          await AsyncStorage.setItem('tulsi_ai_backend', data.tulsi_ai_backend);
          await AsyncStorage.setItem('tulsifrontendurl', data.tulsifrontendurl);
          await AsyncStorage.setItem('onesignalid', data.onesignalid);
          await AsyncStorage.setItem('onesignalkey', data.onesignalkey);
        }
      } else {
        console.warn('Firestore: tulsi/storelist does not exist');
      }
    } catch (error) {
      console.error('Failed to retrieve Firebase data:', error);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const chatailogin = useCallback(async (baseUrl) => {
    if (chatAuthInFlightRef.current) return;
    if (!email || !password || !baseUrl) {
      console.warn('[ChatLogin] skipped - missing input:', {
        hasEmail: !!email,
        hasPassword: !!password,
        hasBaseUrl: !!baseUrl,
      });
      return;
    }
    chatAuthInFlightRef.current = true;
    try {
      // Use joinUrl helper for consistent URL building (same as login)
      const url = joinUrl(baseUrl, '/auth/widget/login/');
      console.log('[ChatLogin] 🤖 Attempting auth to:', url);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'TulsiApp/1.0 (ChatAI)',
          },
          body: JSON.stringify({ email, password }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Get response text first (safer than assuming JSON)
      const responseText = await res.text();
      const contentType = res.headers.get('content-type');

      console.log('[ChatLogin] 📨 Response:', {
        status: res.status,
        ok: res.ok,
        contentType,
        isJson: contentType?.includes('application/json'),
      });

      let json = {};
      if (responseText && contentType?.includes('application/json')) {
        try {
          json = JSON.parse(responseText);
        } catch (parseErr) {
          console.warn('[ChatLogin] ⚠️ Failed to parse JSON:', parseErr.message);
          console.warn('[ChatLogin] Response text (first 200 chars):', responseText.substring(0, 200));
          json = {};
        }
      } else if (responseText) {
        console.warn('[ChatLogin] ⚠️ Response is not JSON:', {
          contentType,
          length: responseText.length,
          preview: responseText.substring(0, 100),
        });
      }

      if (!res.ok) {
        console.warn('[ChatLogin] ❌ Request failed:', {
          status: res.status,
          message: json?.message || json?.error || 'unknown error',
        });
        return; // Non-blocking - continue anyway
      }

      console.log('[ChatLogin] ✅ Success:', { status: res.status });
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
        console.log('[ChatLogin] 💾 Saved', entries.length, 'keys to AsyncStorage');
      } else {
        console.warn('[ChatLogin] ⚠️ No user/token data returned');
      }
    } catch (error) {
      // Network errors on some devices - log but don't block login
      if (error?.name === 'AbortError') {
        console.warn('[ChatLogin] ⏱️ Request timeout (15s exceeded)');
      } else if (error instanceof TypeError) {
        console.warn('[ChatLogin] 🌐 Network error:', error.message);
        console.warn('[ChatLogin] 💡 Possible causes: invalid URL, no internet, DNS failure, or device on restricted network');
      } else {
        console.warn('[ChatLogin] ❌ Unexpected error:', error);
      }
      // Don't throw - chat auth is not critical for app function
    } finally {
      chatAuthInFlightRef.current = false;
    }
  }, [email, password]);

  useFocusEffect(
    useCallback(() => {
      fetchFirebaseDataLogin();
      return () => { };
    }, [fetchFirebaseDataLogin])
  );


  const fetchStoreListFromFirebaseUrl = useCallback(async (url) => {
    try {
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // normalize -> { domain: [{name, storeurl, dbname}, ...], ... }
      const root = Array.isArray(json) ? json[0] : json;
      const map = {};
      if (root && typeof root === 'object') {
        for (const domain of Object.keys(root)) {
          const arr = Array.isArray(root[domain]) ? root[domain] : [];
          map[domain] = arr
            .map((o) => {
              const name = o && typeof o === 'object' ? Object.keys(o)[0] : null;
              if (!name) return null;
              const { storeurl, dbname, icms_store, icmsurl, storepin, chat_ai_api, chat_ai_baseurl } = o[name] || {};
              if (!storeurl || !dbname) return null;
              return {
                name,
                storeurl,
                dbname,
                icms_store: icms_store ?? icmsurl ?? '',
                storepin: storepin ?? '',
                chat_ai_api,
                chat_ai_baseurl,
              };
            })
            .filter(Boolean);
        }
      }
      setStoreMap(map);
    } catch (e) {
      console.error('Failed to fetch firebase:', e);
    }
  }, []);

  useEffect(() => {
    if (firebaseeurl) fetchStoreListFromFirebaseUrl(firebaseeurl);
  }, [firebaseeurl, fetchStoreListFromFirebaseUrl]);


  useEffect(() => {
    if (!storeMap) return;
    const domain = email.includes('@') ? email.split('@')[1].toLowerCase().trim() : '';
    const options = (domain && storeMap[domain]) ? storeMap[domain] : [];
    setStoreOptions(options);
    // auto-clear selection if domain changes
    setSelectedStore((prev) => (prev && options.find(o => o.name === prev.name) ? prev : null));
  }, [email, storeMap]);

  // Save on select
  const handleSelectStore = async (store) => {
    try {
      setSelectedStore(store);
      await AsyncStorage.setItem('storeurl', store.storeurl);
      await AsyncStorage.setItem('dbname', store.dbname);
      await AsyncStorage.setItem('icms_store', store.icms_store ?? '');
      await AsyncStorage.setItem('storepin', String(store.storepin ?? ''));
      await AsyncStorage.setItem('chat_ai_api', store.chat_ai_api ?? '');
      await AsyncStorage.setItem('chat_ai_baseurl', store.chat_ai_baseurl ?? '');

    } catch (e) {
      console.error('AsyncStorage set error:', e);
    } finally {
      setStoreModalVisible(false);
    }
  };

  // small util to join base + path safely
  const joinUrl = (base, path) => {
    const normalizedBase = String(base || '').trim();
    const normalizedPath = String(path || '').trim();
    if (!normalizedBase) return normalizedPath;

    const withScheme = /^https?:\/\//i.test(normalizedBase)
      ? normalizedBase
      : `http://${normalizedBase}`;

    if (withScheme.endsWith('/') && normalizedPath.startsWith('/')) {
      return withScheme + normalizedPath.slice(1);
    }
    if (!withScheme.endsWith('/') && !normalizedPath.startsWith('/')) {
      return withScheme + '/' + normalizedPath;
    }
    return withScheme + normalizedPath;
  };


  const handleManualLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter email and password.');
      return;
    }
    if (!selectedStore) {
      if (storeOptions.length) {
        Alert.alert('Select store', 'Please choose your store before logging in.');
      } else {
        Alert.alert('No store for this email', 'Your email domain does not match any store.');
      }
      return;
    }

    // Check if store has PIN configured
    const storePin = String(selectedStore?.storepin || '').trim();
    if (storePin) {
      // Show PIN modal for verification
      setPinError('');
      setEnteredPin('');
      setPinModalVisible(true);
    } else {
      // No PIN required, proceed with login
      await performLogin(password);
    }
  };

  const handlePinLogin = async () => {
    const expectedPin = String(selectedStore?.storepin || '').trim();
    const inputPin = String(enteredPin || '').trim();

    if (!inputPin) {
      Alert.alert('Missing PIN', 'Please enter store PIN.');
      return;
    }

    if (inputPin !== expectedPin) {
      setPinError('Please enter valid PIN');
      return;
    }

    // PIN is valid, proceed with login
    setPinModalVisible(false);
    await performLogin(password);
  };

  const performLogin = async (passwordToUse) => {
    try {
      setSigningIn(true);
      const url = joinUrl(selectedStore.storeurl, '/pos/app/login');
      const body = {
        db: selectedStore.dbname,
        login: email,
        password: passwordToUse,
      };
      console.log('Login request URL:', url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
        'Content-Type': 'application/json',
          'credentials': 'omit',
          'Cookie': 'session_id'
         },
        body: JSON.stringify(body),
      });
      console.log("body & url", body, url);
      const data = await res.json().catch(() => ({}));
      console.log("login response:", data);

      // Check if login was successful
      if (!data?.result || data?.error || data?.result?.status === "error" || data?.result?.code === 401) {
        const msg = data?.result?.message ||
          data?.error?.data?.message ||
          data?.error?.message ||
          data?.message ||
          'Invalid credentials or server error';
        Alert.alert('Login Failed', msg);
        return;
      }

      const { pos_role, access_token, expiry, user_full_name, user_context, is_promotion_accessible, is_show_cost_price, is_show_credit_sale, is_product_edit_permission_in_app,is_product_billing_in_app, is_allow_tulsi_ai, is_allow_tulsi_chat_support, is_user_setting_visible_in_app,uid } = data.result || {};
      await AsyncStorage.multiSet([
        ['userRole', String(pos_role || '')],
        ['access_token', String(access_token || '')],
        ['expiry', String(expiry || '')],
        ['userName', String(user_full_name || '')],
        ['userEmail', String(email || '')],
        ['password', String(passwordToUse || '')],
        ['userTimeZone', String(user_context?.tz || '')],
        ['userLang', String(user_context?.lang || '')],
        ['storepin', String(selectedStore?.storepin || '')],
        ['storeurl', String(selectedStore?.storeurl || '')],
        ['is_promotion_accessible', String(is_promotion_accessible || 'false')],
        ['is_show_cost_price', String(is_show_cost_price || 'false')],
        ['is_show_credit_sale', String(is_show_credit_sale || 'false')],
        ['is_product_edit_permission_in_app', String(is_product_edit_permission_in_app || 'false')],
        ['is_product_billing_in_app', String(is_product_billing_in_app || 'false')],
        ['is_allow_tulsi_ai', String(is_allow_tulsi_ai || 'false')],
        ['is_allow_tulsi_chat_support', String(is_allow_tulsi_chat_support || 'false')],
        ['is_user_setting_visible_in_app', String(is_user_setting_visible_in_app || 'false')],
       ['user_id', String(uid || '')],
      ]);

      // Register device with OneSignal using the selected store's URL
      const storeUrlForRegistration = selectedStore?.storeurl || '';
      console.log('📱 Registering device with store URL:', storeUrlForRegistration, pos_role);
      console.log('📝 Store details:', {
        name: selectedStore?.name,
        storeurl: storeUrlForRegistration,
        normalized: storeUrlForRegistration.trim().toLowerCase(),
      });
      // await registerDeviceWithStoreUrl(storeUrlForRegistration);
      const notification_tag = await tagDeviceWithStoreUrl(storeUrlForRegistration, pos_role);
      // await tagDeviceWithUserRole(pos_role);
      const chatBaseUrl = await AsyncStorage.getItem('tulsi_ai_backend');
      console.log('[Login] chat base url from storage:', chatBaseUrl);
      if (chatBaseUrl) {
        await chatailogin(chatBaseUrl);
      } else {
        console.warn('[Login] tulsi_ai_backend missing in AsyncStorage');
      }
      // navigate forward
      navigation.navigate('MainDrawer');
    } catch (error) {
      console.error('Login request failed', {
        storeurl: selectedStore?.storeurl,
        normalizedUrl: joinUrl(selectedStore?.storeurl, '/pos/app/login'),
        message: error?.message,
      });
      Alert.alert('Error', `Login request failed: ${error?.message || 'Unknown network error'}`);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#319241" />
      <ImageBackground source={LoginBackground} style={styles.screen} resizeMode="cover">

        <KeyboardAvoidingView style={styles.keyboardRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.contentWrap,
              {
                paddingTop: Math.max(insets.top, 16) + 8,
                paddingBottom: Math.max(insets.bottom, 16) + 20,
              },
            ]}
          >
            <View style={[styles.brandWrap, { marginTop: 16 }]}>
              <Image
                source={require('../assets/images/tulsi_black_logo.webp')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.heading}>Sign In to Continue</Text>
              <Text style={styles.subtext}></Text>

              <View style={styles.field}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.field}>
                <TouchableOpacity
                  style={[styles.input, styles.selectInput, !storeOptions.length && { opacity: 0.7 }]}
                  onPress={() => storeOptions.length && setStoreModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: selectedStore ? '#111827' : '#9CA3AF' }}>
                    {selectedStore?.name ||
                      (email
                        ? storeOptions.length
                          ? 'Tap to choose store'
                          : 'No stores for this email domain'
                        : 'Select Store')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.field}>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name={showPassword ? 'visibility' : 'visibility-off'}
                      size={22}
                      color="#6B7280"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.termsText}></Text>

              <TouchableOpacity style={styles.primaryBtnWrap} onPress={handleManualLogin} activeOpacity={0.9}>
                <LinearGradient
                  colors={['#C8FF71', '#45D83A', '#33CC33']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Login</Text>
                </LinearGradient>
              </TouchableOpacity>

              {signingIn && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" />
                </View>
              )}
            </View>

            <Text style={styles.helpText}></Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
      {/* Store chooser modal */}
      <Modal visible={storeModalVisible} animationType="slide" transparent onRequestClose={() => setStoreModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Store</Text>
            {storeOptions.map((opt) => (
              <TouchableOpacity key={opt.name} style={styles.modalItem} onPress={() => handleSelectStore(opt)}>
                <Text style={styles.modalItemText}>{opt.name}</Text>
                <Text style={styles.modalItemSub}>{opt.dbname}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.modalItem, { marginTop: 8 }]} onPress={() => setStoreModalVisible(false)}>
              <Text style={[styles.modalItemText, { textAlign: 'center' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PIN verification modal */}
      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => setPinModalVisible(false)}>
        <View style={styles.pinModalBackdrop}>
          <View style={styles.pinModalCard}>
            <Text style={styles.pinModalTitle}>Enter Store PIN</Text>
            <Text style={styles.pinModalSubTitle}>
              {selectedStore?.name ? `Store: ${selectedStore.name}` : 'Selected store'}
            </Text>
            <TextInput
              style={styles.pinInput}
              placeholder="Enter store PIN"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={enteredPin}
              onChangeText={(text) => {
                setEnteredPin(text);
                setPinError('');
              }}
              autoFocus
            />
            {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}
            <View style={styles.pinActions}>
              <TouchableOpacity
                style={[styles.pinActionBtn, styles.pinCancelBtn]}
                onPress={() => {
                  setPinModalVisible(false);
                  setEnteredPin('');
                  setPinError('');
                }}
              >
                <Text style={styles.pinCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pinActionBtn, styles.pinConfirmBtn]}
                onPress={handlePinLogin}
                disabled={signingIn}
              >
                {signingIn ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.pinConfirmText}>Verify</Text>
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
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  keyboardRoot: { flex: 1 },
  contentWrap: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 52,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  brandWrap: {
    alignItems: 'center',
    marginTop: 42,
  },
  logoImage: {
    width: 230,
    height: 130,
  },
  card: {
    backgroundColor: '#ECECEC',
    borderRadius: 34,
    paddingHorizontal: 18,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    marginTop: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  subtext: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  field: { marginBottom: 14 },
  input: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#DCDCDC',
    borderRadius: 16,
    color: '#111827',
    fontSize: 15,
  },
  passwordContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCDCDC',
    borderRadius: 16,
    paddingRight: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 15,
  },
  eyeIcon: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectInput: { justifyContent: 'center' },
  termsText: {
    marginTop: 10,
    textAlign: 'center',
    color: '#1F2937',
    fontSize: 15,
  },
  primaryBtnWrap: {
    marginTop: 18,
    borderRadius: 999,
    overflow: 'hidden',
  },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
    borderRadius: 999,
  },
  primaryBtnText: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: 0.2 },
  helpText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#9CA3AF',
    fontSize: 18,
    fontWeight: '500',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 34,
    zIndex: 2,
  },

  // modal
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
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#1F2937' },
  modalItem: {
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  modalItemText: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  modalItemSub: { fontSize: 12, color: '#6B7280' },

  // PIN modal styles
  pinModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  pinModalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  pinModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#163e25',
  },
  pinModalSubTitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#4f6f5d',
  },
  pinInput: {
    marginTop: 12,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    color: '#111827',
    fontSize: 15,
  },
  pinErrorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#b42318',
  },
  pinActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  pinActionBtn: {
    minWidth: 96,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCancelBtn: {
    backgroundColor: '#E5E7EB',
  },
  pinConfirmBtn: {
    backgroundColor: '#2a8a4f',
  },
  pinCancelText: {
    color: '#111827',
    fontWeight: '700',
  },
  pinConfirmText: {
    color: '#fff',
    fontWeight: '700',
  },
});
