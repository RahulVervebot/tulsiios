import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, ImageBackground,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppHeader from '../components/AppHeader';
import { saveUserCallProfile, saveVoipToken } from '../config/OneSignalConfig';
import reportbg from '../assets/images/report-bg.png';

const getImageSource = (val) => (typeof val === 'number' ? val : { uri: val });

const saveStoredVoipToken = async (email) => {
  if (Platform.OS !== 'ios') return;
  const token = await AsyncStorage.getItem('voipToken');
  if (token) await saveVoipToken(email, token);
};

// Firestore document key — email has chars not valid in doc IDs
const toEmailKey = (email) =>
  email.replace(/\./g, '_dot_').replace(/@/g, '_at_');

export default function CallLoginScreen({ navigation }) {
  const [step,        setStep]        = useState('email'); // 'email' | 'otp' | 'create'
  const [email,       setEmail]       = useState('');
  const [otp,         setOtp]         = useState('');
  const [name,        setName]        = useState('');
  const [loading,     setLoading]     = useState(false);
  const [cooldown,    setCooldown]    = useState(0);
  const [storeDomain, setStoreDomain] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('storeDomain').then((v) => setStoreDomain(v || ''));
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCooldown = () => {
    setCooldown(60);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      Alert.alert('Error', 'Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await firestore().collection('callOtpRequests').add({
        email: e,
        requestedAt: firestore.FieldValue.serverTimestamp(),
      });
      setStep('otp');
      startCooldown();
      Alert.alert('OTP Sent', `A 6-digit code has been sent to ${e}. Check your inbox.`);
    } catch (err) {
      console.log('[CallLogin] sendOtp error:', err?.message);
      Alert.alert('Error', 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = () => {
    if (cooldown > 0) return;
    setOtp('');
    handleSendOtp();
  };

  const handleVerifyOtp = async () => {
    const e    = email.trim().toLowerCase();
    const code = otp.trim();
    if (code.length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit OTP from your email.');
      return;
    }
    setLoading(true);
    try {
      const key    = toEmailKey(e);
      const otpDoc = await firestore().collection('callOtps').doc(key).get();

      if (!otpDoc.exists) {
        Alert.alert('Invalid OTP', 'OTP not found or expired. Request a new one.');
        return;
      }
      const d = otpDoc.data();
      const expiresAt = d.expiresAt?.toDate?.() || new Date(d.expiresAt);

      if (d.used) {
        Alert.alert('OTP Already Used', 'This OTP was already used. Request a new one.');
        return;
      }
      if (new Date() > expiresAt) {
        Alert.alert('OTP Expired', 'This code has expired. Request a new one.');
        return;
      }
      if (d.code !== code) {
        Alert.alert('Incorrect OTP', 'The code does not match. Please try again.');
        return;
      }

      // Mark OTP as used
      await firestore().collection('callOtps').doc(key).update({ used: true });

      // Check if call profile exists AND has a real name (not just the email)
      const profileDoc = await firestore().collection('callProfiles').doc(e).get();
      const savedName  = (profileDoc.exists && profileDoc.data()?.name) || '';
      const hasName    = savedName.length > 0 && savedName !== e;

      if (hasName) {
        // Existing user — verify storeDomain matches the one saved at app login
        const profileStoreDomain   = profileDoc.data()?.storeDomain || '';
        const localStoreDomain     = await AsyncStorage.getItem('storeDomain') || '';
        if (profileStoreDomain && localStoreDomain && profileStoreDomain !== localStoreDomain) {
          Alert.alert(
            'Login Failed',
            'Your account is registered with a different store. Please log in with the correct store.',
          );
          return;
        }
        await _finishLogin(e, savedName);
      } else {
        // New user OR profile has no proper name — ask for display name
        if (savedName && savedName !== e) setName(savedName);
        setStep('create');
      }
    } catch (err) {
      console.log('[CallLogin] verifyOtp error:', err?.message);
      Alert.alert('Error', `Verification failed: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const e = email.trim().toLowerCase();
    const n = name.trim();
    if (!n) { Alert.alert('Error', 'Please enter your display name.'); return; }
    setLoading(true);
    try {
      const profileData = {
        email: e,
        name:  n,
        createdAt: firestore.FieldValue.serverTimestamp(),
        ...(storeDomain ? { storeDomain } : {}),
      };
      await firestore().collection('callProfiles').doc(e).set(profileData, { merge: true });
      await _finishLogin(e, n);
    } catch (err) {
      console.log('[CallLogin] create error:', err?.message);
      Alert.alert('Error', `Could not create account: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const _finishLogin = async (e, userName) => {
    await AsyncStorage.multiSet([
      ['callUserEmail', e],
      ['callUserName',  userName],
    ]);
    // Navigate immediately — OneSignal registration can take up to 12 s and runs in background
    navigation.replace('MainDrawer');
    saveUserCallProfile(e, userName).catch(() => {});
    saveStoredVoipToken(e).catch(() => {});
  };

  const headerTitle = step === 'otp' ? 'Enter OTP' : step === 'create' ? 'Create Account' : 'Call Login';

  return (
    <ImageBackground
      source={getImageSource(reportbg)}
      style={styles.safe}
      resizeMode="cover"
    >
      <AppHeader
        Title={headerTitle}
        backgroundType="image"
        backgroundValue={reportbg}
        hideCartIcon
        hidePrintIcon
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ── Step 1: Email ── */}
          {step === 'email' && (
            <>
              <Text style={styles.title}>Call & Chat Login</Text>
              <Text style={styles.sub}>Enter your email to receive a one-time password.</Text>

              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Email address"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {/* {!!storeDomain && (
                  <View style={styles.domainBadge}>
                    <Text style={styles.domainBadgeText} numberOfLines={1}>{storeDomain}</Text>
                  </View>
                )} */}
              </View>

              <TouchableOpacity
                style={[styles.btn, loading && { opacity: 0.6 }]}
                onPress={handleSendOtp}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Send OTP</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <>
              <Text style={styles.title}>Enter OTP</Text>
              <Text style={styles.sub}>
                A 6-digit code was sent to{'\n'}
                <Text style={styles.highlight}>{email}</Text>
              </Text>

              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="_ _ _ _ _ _"
                placeholderTextColor="#D1D5DB"
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />

              <TouchableOpacity
                style={[styles.btn, loading && { opacity: 0.6 }]}
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Verify OTP</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.linkBtn, cooldown > 0 && { opacity: 0.45 }]}
                onPress={handleResendOtp}
                disabled={cooldown > 0}
              >
                <Text style={styles.linkText}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => { setStep('email'); setOtp(''); }}
              >
                <Text style={[styles.linkText, { color: '#9CA3AF' }]}>← Change email</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 3: Create Account ── */}
          {step === 'create' && (
            <>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.sub}>
                No account found for{'\n'}
                <Text style={styles.highlight}>{email}</Text>
                {'\n\n'}Enter your name to create one.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Display Name"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoFocus
              />

              <TouchableOpacity
                style={[styles.btn, loading && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Create Account</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => { setStep('email'); setOtp(''); setName(''); }}
              >
                <Text style={[styles.linkText, { color: '#9CA3AF' }]}>← Start over</Text>
              </TouchableOpacity>
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  content: { flexGrow: 1, padding: 28, paddingTop: 32, backgroundColor: '#fff', borderTopLeftRadius: 0, borderTopRightRadius: 0 },

  title: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8 },
  sub:   { fontSize: 14, color: '#6B7280', marginBottom: 32, lineHeight: 21 },
  highlight: { color: '#319241', fontWeight: '700' },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, gap: 8,
  },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#111827', marginBottom: 14, backgroundColor: '#FAFAFA',
  },
  otpInput: {
    textAlign: 'center', fontSize: 28, fontWeight: '800', letterSpacing: 14,
  },

  domainBadge: {
    backgroundColor: '#DCFCE7', borderRadius: 10,
    borderWidth: 1, borderColor: '#A7D7AD',
    paddingHorizontal: 10, paddingVertical: 10,
    maxWidth: 130,
  },
  domainBadgeText: { fontSize: 12, fontWeight: '700', color: '#319241' },

  btn: {
    backgroundColor: '#319241', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 6,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  linkBtn:  { alignItems: 'center', marginTop: 18 },
  linkText: { color: '#319241', fontSize: 14, fontWeight: '600' },
});
