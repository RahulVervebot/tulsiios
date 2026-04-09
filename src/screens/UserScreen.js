import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import React, { useEffect, useState, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AppHeader from "../components/AppHeader";
import reportbg from '../assets/images/report-bg.png';
import { removeOneSignalTagsOnLogout } from '../config/OneSignalConfig';
const LIGHT_GREEN = '#e6f6ec';

export default function UserScreen({ navigation }) {
  const [access_token, setAccessToken] = useState('');
  const [user_name, setUserName] = useState('');
  const [user_email, setUserEmail] = useState('');
  const [user_role, setUserRole] = useState('');

  const handleLogout = async () => {
    try { await GoogleSignin.signOut(); } catch (e) { console.log('Google signout error:', e); }
    await AsyncStorage.multiRemove(['access_token', 'userRole', 'userEmail', 'userName','onesignalid','onesignalkey','tulsi_ai_backend','tulsifrontendurl','tulsi_websocket','icms_url']);
       navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
               await removeOneSignalTagsOnLogout();
  };

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const accesstoken = await AsyncStorage.getItem('access_token');
        const userName = await AsyncStorage.getItem('userName');
        const userEmail = await AsyncStorage.getItem('userEmail');
        const userRole = await AsyncStorage.getItem('userRole');

        setAccessToken(accesstoken);
        setUserEmail(userEmail || '');
        setUserName(userName || '');
        setUserRole(userRole || '');
        console.log('accesstoken:', accesstoken);
      } catch (e) {
        console.log("error in user screen",e);
        // navigation.replace('Login');
      }
    };
    checkLogin();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (e.data.action?.type !== 'GO_BACK') return;
      e.preventDefault();
      navigation.navigate('Tabs', { screen: 'Home' });
    });
    return unsubscribe;
  }, [navigation]);

  const initials = useMemo(() => {
    if (!user_name) return 'U';
    const parts = user_name.trim().split(/\s+/);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  }, [user_name]);

  const prettyRole = useMemo(() => (user_role ? user_role.replace(/_/g, ' ') : 'user'), [user_role]);

  const isAdmin = useMemo(() => {
  const raw = (user_role || '').toLowerCase();
  const pretty = (prettyRole || '').toLowerCase();
  return raw === 'administrator' || pretty === 'administrator';
}, [user_role, prettyRole]);


  return (
    <View style={styles.screen}>
      <AppHeader Title="PROFILE" backgroundType="image" backgroundValue={reportbg} />

      <View style={styles.container}>
        {access_token ? (
          <View style={styles.card}>
            {/* Avatar + Name */}
            <View style={styles.topRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{user_name || 'User'}</Text>
                <Text style={styles.email} numberOfLines={1}>{user_email || '—'}</Text>
                {!!prettyRole && (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{prettyRole}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Info rows */}
            <View style={styles.infoBlock}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user_name || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user_email || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Role</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{prettyRole}</Text>
              </View>
            </View>

            {/* Actions */}
           <View style={styles.actions}>
  {isAdmin && (
    <TouchableOpacity
      style={[styles.button, styles.secondary]}
      onPress={() => navigation.navigate('SettingScreen')}
      activeOpacity={0.85}
    >
      <Text style={styles.buttonText}>Settings</Text>
    </TouchableOpacity>
  )}

  {/* {user_role !== 'customer' && (
    <TouchableOpacity
      style={[styles.button, styles.primary]}
      onPress={() => navigation.navigate('SignupScreen')}
      activeOpacity={0.85}
    >
      <Text style={styles.buttonText}>Go to Signup</Text>
    </TouchableOpacity>
  )} */}

  <TouchableOpacity
    style={[styles.button, styles.danger]}
    onPress={handleLogout}
    activeOpacity={0.85}
  >
    <Text style={styles.buttonText}>Logout</Text>
  </TouchableOpacity>
</View>

          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No user data available.</Text>
            <TouchableOpacity
              style={[styles.button, styles.primary, { marginTop: 12 }]}
              onPress={() => navigation.replace('Login')}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const COLORS = {
  baseBG: 'rgba(255,255,255,0.85)',
  text: '#1E1E1E',
  sub: '#6B7280',
  primary: '#2C1E70',
  primaryDark: '#66666685',
  danger: '#E53935',
  roleBG: '#319241',
  roleText: '#5B4500',
  stroke: 'rgba(0,0,0,0.08)',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: LIGHT_GREEN },
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 24,
  },
  card: {
    backgroundColor: COLORS.baseBG,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  topRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 40,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: COLORS.roleBG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: COLORS.sub,
    marginBottom: 6,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.roleBG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.roleText,
    textTransform: 'capitalize',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.stroke,
    marginVertical: 16,
  },
  infoBlock: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    width: 80,
    color: COLORS.sub,
    fontSize: 14,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  actions: {
    marginTop: 18,
    gap: 10,
  },
  button: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  danger: {
    backgroundColor: COLORS.danger,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  emptyWrap: {
    marginTop: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.95,
  },
  secondary: {
  backgroundColor: COLORS.primaryDark, // subtle variation from primary
},
});
