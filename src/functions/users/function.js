import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
} from 'react-native';
// Get all POS users
export async function getPosUsers() {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  console.log('Fetching users with storeUrl:', storeUrl, 'token:', token);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  const res = await fetch(`${apiBase}/pos/app/pos_get_users`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      access_token: token,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch users (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return {
    users: Array.isArray(json?.result?.users) ? json.result.users : [],
    count: json?.result?.count || 0,
  };
}

// Create a new POS user
export async function createPosUser({ name, email, login, password, pos_role }) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  const res = await fetch(`${apiBase}/pos/app/pos_create_user`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      access_token: token,
    },
    body: JSON.stringify({
      name,
      email,
      login,
      password,
      pos_role,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create user (${res.status}): ${text || 'No details'}`);
  }
  const resData = await res.json();
//  Alert.alert('Success', resData?.result?.message || 'User created successfully');
console.log('Create user response:', resData);
  return resData;
}

// Update a POS user
export async function updatePosUser(userId, updates = {}) {
  const [storeUrl, baseUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('baseurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  const apiBase = storeUrl || baseUrl;
  if (!apiBase || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  const res = await fetch(`${apiBase}/pos/app/pos_update_user`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      access_token: token,
    },
    body: JSON.stringify({
      user_id: userId,
      ...updates,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update user (${res.status}): ${text || 'No details'}`);
  }

  return res.json();
}

export async function getPosAuthStatus() {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing storeurl/baseurl or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/api/verify-token`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      access_token: token,
    },
  });

  console.log('Auth status response status:', res.status);
  
  if (!res.ok) {
    const error = new Error(`Auth check failed (${res.status})`);
    error.status = res.status;
    throw error;
  }

  const json = await res.json();
  return json;
}