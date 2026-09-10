// src/services/vendorApi.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_ENDPOINTS from '../../../icms_config/api';

/** Search vendors by query. Returns array of vendor objects. */
export async function searchVendors(query) {
  if (!query || query.trim().length < 2) return [];
  const token = await AsyncStorage.getItem('access_token');
  const icms_store = await AsyncStorage.getItem('icms_store');
  const res = await fetch(API_ENDPOINTS.RED_PRODUCTS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': token ?? '',
      'mode': 'MOBILE',
      'store': icms_store,
    },
    body: JSON.stringify({ q: query }),
  });

  if (!res.ok) {
    console.warn('RED_PRODUCTS failed:', res.status, await res.text().catch(()=>''));
    return [];
  }

  const data = await res.json().catch(() => ({}));
  console.log("RED_PRODUCTS search data:",data)
  return Array.isArray(data?.results) ? data.results : [];
}

/** Fetch red products list. */
export async function fetchRedProducts({ startDate, endDate } = {}) {
    const token = await AsyncStorage.getItem('access_token');
  const icms_store = await AsyncStorage.getItem('icms_store');
  const dbname = await AsyncStorage.getItem('dbname');
  
  const body = { q: '' };
  if (startDate) body.startDate = startDate;
  if (endDate) body.endDate = endDate;

  const res = await fetch(API_ENDPOINTS.RED_PRODUCTS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': token ?? '',
      'mode': 'MOBILE',
      'store': icms_store,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn('RED_PRODUCTS failed:', res.status, await res.text().catch(()=>''));
    return [];
  }

  const data = await res.json().catch(() => ({}));
  console.log("red data:",data);
  const list = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];
  return list;
}
