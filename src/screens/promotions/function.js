import AsyncStorage from '@react-native-async-storage/async-storage';
import { criticallyDampedSpringCalculations } from 'react-native-reanimated/lib/typescript/animation/springUtils';
const getBaseUrl = async () => {
  const storeUrl = await AsyncStorage.getItem('storeurl');
  if (!storeUrl) {
    throw new Error('Missing store_url in AsyncStorage.');
  }
  return storeUrl.replace(/\/$/, '');
};

const buildHeaders = async () => {
  const token = await AsyncStorage.getItem('access_token');
  if (!token) {
    throw new Error('Missing access token.');
  }
  return {
    // accept: 'application/json',
    access_token: token,
  };
};
const buildpostHeaders = async () => {
  const token = await AsyncStorage.getItem('access_token');
  if (!token) {
    throw new Error('Missing access token.');
  }
  return {
    // accept: 'application/json',
     'Content-Type': 'application/json',
    access_token: token,
  };
};

export async function getPromotionGroupsDetails({ page = 1, limit = 10 } = {}) {
  const headers = await buildHeaders();
  const baseUrl = await getBaseUrl();
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  const res = await fetch(`${baseUrl}/api/app/get_promotion_groups_details?${params.toString()}`, {
    method: 'GET',
    headers,
  });
console.log("store url:",baseUrl);
console.log("resoonse:",res);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch promotions (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json().catch(() => ({}));
  return {
    data: Array.isArray(json?.data) ? json.data : [],
    page: Number(json?.page ?? page) || page,
    total_pages: Number(json?.total_pages ?? 1) || 1,
    total_records: Number(json?.total_records ?? 0) || 0,
  };
}

export async function createMixMatchPromotion(payload) {
  const headers = await buildpostHeaders();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/app/create/mix/match`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Failed to create mix match (${res.status})`);
  }
console.log("resonose josn for mix",json);
  return json;
}
export async function updateMixMatchPromotion(payload) {
  const headers = await buildpostHeaders();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/app/update/mix_match`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
console.log("udpate body",payload);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Failed to update mix match (${res.status})`);
  }
console.log("json response put:",json);
  return json;
}

export async function deleteMixMatchPromotion(groupId) {
  const headers = await buildpostHeaders();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/delete/mix_match_promotion`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ group_id: groupId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Failed to delete mix match (${res.status})`);
  }
  return json;
}

export async function getDaysList() {
  const headers = await buildHeaders();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/get/app/days_list`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch days list (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json().catch(() => ({}));
  return Array.isArray(json) ? json : [];
}

export async function searchProductsByBarcode(text) {
  const headers = await buildHeaders();
  const baseUrl = await getBaseUrl();
  const runSearch = async (q) => {
    const res = await fetch(`${baseUrl}/pos/app/product/search?query=${encodeURIComponent(q)}`, {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      const textRes = await res.text().catch(() => '');
      throw new Error(`Failed to search products (${res.status}): ${textRes || 'No details'}`);
    }
    const json = await res.json().catch(() => ({}));
    return Array.isArray(json?.products) ? json.products : [];
  };

  const raw = String(text || '').trim();
  if (!raw) return [];

  // 1) Try exact first
  let results = await runSearch(raw);
  if (results.length) return results;

  // Only retry when not found
  let candidates = [];
  if (/^00/.test(raw)) {
    candidates.push(raw.replace(/^00/, '0'));
  }
  if (/^0/.test(raw)) {
    candidates.push(raw.replace(/^0/, ''));
  }
  if (raw.length > 1) {
    candidates.push(raw.slice(0, -1));
  }
  if (/^0/.test(raw) && raw.length > 1) {
    candidates.push(raw.replace(/^0/, '').slice(0, -1));
  }
  if (!/^0/.test(raw)) {
    candidates.push(`0${raw}`);
  }

  // Deduplicate + remove empties
  candidates = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];

  for (const q of candidates) {
    results = await runSearch(q);
    if (results.length) return results;
  }

  return [];
}

export async function getQuantityDiscountPromotions({ page = 1, limit = 10, start_date, end_date }) {
  const headers = await buildHeaders();
  const baseUrl = await getBaseUrl();
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (start_date) params.set('start_date', start_date);
  if (end_date) params.set('end_date', end_date);

  const res = await fetch(`${baseUrl}/api/app/get/quantity/discount/promotion?${params.toString()}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch quantity discounts (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json().catch(() => ({}));
  return {
    data: Array.isArray(json?.data) ? json.data : [],
    page: Number(json?.page ?? page) || page,
    total_pages: Number(json?.total_pages ?? 1) || 1,
    total_records: Number(json?.total_records ?? 0) || 0,
  };
}

export async function updateQuantityDiscountPromotion(payload) {
  const headers = await buildpostHeaders();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/app/update/quantity/discount/promotion`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Failed to update quantity discount (${res.status})`);
  }
  return json;
}

export async function createQuantityDiscountPromotion(payload) {
  const headers = await buildpostHeaders();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/app/create/quantity/discount/promotion`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Failed to create quantity discount (${res.status})`);
  }
  return json;

}

export async function deleteQuantityDiscountPromotion(productId) {
  const headers = await buildpostHeaders();
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/app/delete/quantity/discount/promotion`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ product_id: productId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Failed to delete quantity discount (${res.status})`);
  }
  return json;
}