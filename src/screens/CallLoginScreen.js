import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, SafeAreaView,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveUserCallProfile } from '../config/OneSignalConfig';

export default function CallLoginScreen({ navigation }) {
  const [mode,    setMode]    = useState('login'); // 'login' | 'create'
  const [email,   setEmail]   = useState('');
  const [pin,     setPin]     = useState('');
  const [name,    setName]    = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const e = email.trim().toLowerCase();
    const p = pin.trim();
    if (!e || !p)     { Alert.alert('Error', 'Enter email and PIN.'); return; }
    if (p.length < 4) { Alert.alert('Error', 'PIN must be at least 4 digits.'); return; }
    setLoading(true);
    try {
      let userData = null;
      // Transaction reads from server — bypasses local cache.
      await firestore().runTransaction(async (tx) => {
        const doc = await tx.get(firestore().collection('callProfiles').doc(e));
        if (doc.data()?.pin === p) userData = doc.data();
      });
      if (!userData) {
        Alert.alert('Not found', 'No account found with that email + PIN.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Account', onPress: () => setMode('create') },
        ]);
        return;
      }
      const userName = userData.name || e;
      await AsyncStorage.multiSet([
        ['callUserEmail', e],
        ['callUserName',  userName],
        ['callUserPin',   p],
      ]);
      await saveUserCallProfile(e, userName);
      navigation.replace('MainDrawer');
    } catch (err) {
      console.log('[CallLogin] login error:', err?.message);
      Alert.alert('Error', `Login failed: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const e = email.trim().toLowerCase();
    const p = pin.trim();
    const n = name.trim();
    if (!e || !p || !n) { Alert.alert('Error', 'Fill in all fields.'); return; }
    if (p.length < 4)   { Alert.alert('Error', 'PIN must be at least 4 digits.'); return; }
    setLoading(true);
    try {
      const ref = firestore().collection('callProfiles').doc(e);
      let alreadyExists = false;
      // Transaction reads from server then writes atomically.
      await firestore().runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        // Only blocked if a PIN was previously registered on this email.
        if (doc.data()?.pin) { alreadyExists = true; return; }
        tx.set(ref, { email: e, name: n, pin: p, createdAt: firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
      if (alreadyExists) {
        Alert.alert('Already registered', 'An account with this email already exists. Please login.');
        setMode('login');
        return;
      }
      await AsyncStorage.multiSet([
        ['callUserEmail', e],
        ['callUserName',  n],
        ['callUserPin',   p],
      ]);
      await saveUserCallProfile(e, n);
      navigation.replace('MainDrawer');
    } catch (err) {
      console.log('[CallLogin] create error:', err?.message);
      Alert.alert('Error', `Could not create account: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <Text style={styles.title}>
            {isLogin ? 'Call & Chat Login' : 'Create Account'}
          </Text>
          <Text style={styles.sub}>
            {isLogin
              ? 'Login with your unique call identity to access calls and chats.'
              : 'Create a unique identity for calls and chats. This email+PIN is yours alone.'}
          </Text>

          {!isLogin && (
            <TextInput
              style={styles.input}
              placeholder="Display Name"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="PIN (4–6 digits)"
            placeholderTextColor="#9CA3AF"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={isLogin ? handleLogin : handleCreate}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{isLogin ? 'Login' : 'Create Account'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => setMode(isLogin ? 'create' : 'login')}
          >
            <Text style={styles.switchText}>
              {isLogin
                ? "Don't have an account? Create one"
                : 'Already have an account? Login'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#fff' },
  content: { padding: 28, paddingTop: 70 },
  title: {
    fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8,
  },
  sub: {
    fontSize: 14, color: '#6B7280', marginBottom: 32, lineHeight: 20,
  },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#111827', marginBottom: 14, backgroundColor: '#FAFAFA',
  },
  btn: {
    backgroundColor: '#319241', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 6,
  },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchBtn:  { alignItems: 'center', marginTop: 28 },
  switchText: { color: '#319241', fontSize: 14, fontWeight: '600' },
});
