// src/function/function.js
import { API_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Build generic headers for API requests
 * @param {string} token - Access token
 * @param {object} options - Additional options
 * @param {boolean} options.includeContentType - Whether to include Content-Type header
 * @returns {object} Headers object
 */
function buildHeaders(token, options = {}) {
  const headers = {
    accept: 'application/json',
    access_token: token,
    credentials: 'omit',
    Cookie: 'session_id',
  };

  if (options.includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

/**
 * Fetch all products
 * @returns {Promise<Array>} products array
 */
export async function getProducts() {
  const url = `${API_URL}/api/products`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch products (${res.status}): ${text || 'No details'}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}



export function capitalizeWords(str = '') {
  if (!str) return '';
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function toAbsoluteUri(input) {
    return input;
}

/** Quick check if a uri looks like an SVG (mime or extension or xml payload) */
export function looksLikeSvg(uriOrData) {
  if (!uriOrData) return false;
  const u = uriOrData.toLowerCase();
  return (
    u.startsWith('data:image/svg+xml') ||
    u.endsWith('.svg') ||
    u.includes('<svg') // in case server sends raw xml string (rare)
  );
}

/**
 * Fetches POS categories with access token.
 * Endpoint: {store_url}/pos/app/categories
 * Header:   access_token
 *
 * Returns items with BOTH new fields (id, categoryName, topList, etc.)
 * and legacy aliases (_id, category, toplist, topicon...) so existing UI keeps working.
 */


export async function getTopCategories() {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/pos/app/categories`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  console.log("rest:",res);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch categories (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();

  const items = Array.isArray(json?.categories) ? json.categories : [];
console.log("items:",items);
  return items.map((c) => {
    // Normalize/alias fields for backward compatibility
    const absoluteImage         = toAbsoluteUri(c.image,          storeUrl) ?? c.image ?? null;
    const absoluteTopIcon       = toAbsoluteUri(c.topIcon,        storeUrl) ?? c.topIcon ?? null;
    const absoluteTopBanner     = toAbsoluteUri(c.topBanner,      storeUrl) ?? c.topBanner ?? null;
    const absoluteTopBannerBtm  = toAbsoluteUri(c.topBannerBottom,storeUrl) ?? c.topBannerBottom ?? null;

    return {
      // New POS fields
      id: c.id,
      categoryName: c.categoryName,
      parentId: c.parentId ?? null,
      image: absoluteImage,
      topList: !!c.topList,
      topIcon: absoluteTopIcon,
      topBanner: absoluteTopBanner,
      topBannerBottom: absoluteTopBannerBtm,
      totalAvailableInPOSProducts: c.totalAvailableInPOSProducts ?? null,

      // Legacy aliases (so existing UI e.g. Picker using _id / category still works)
      _id: String(c.id),
      category: c.categoryName,
      toplist: !!c.topList,
      topicon: absoluteTopIcon,
      topbanner: absoluteTopBanner,
      topbannerbottom: absoluteTopBannerBtm,
    };
  });
}

export async function getCategoryProducts(id) {
  if (!id) return [];

  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/pos/app/product/search?categoryId=${id}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch categories (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return Array.isArray(json?.products) ? json.products : [];
}



export async function getLatestProducts() {
    if (!id) return [];
    console.log("category function:",id);
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/pos/app/product/search`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch categories (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return Array.isArray(json?.products) ? json.products : [];
}

export async function getUOMList() {

  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/pos/app/uom-list`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch UOM (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

export async function TaxList() {

  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/pos/app/account-tax-list`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch UOM (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function VendorList(text) {

  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }
console.log("function text:",text);
  const res = await fetch(`${storeUrl}/pos/app/vendor-list?query=${text}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch UOM (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function createCustomVariantProduct(payload) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(
    `${storeUrl}/api/pos/app/product/create/custom-attributes-and-variants`,
    {
      method: 'POST',
      headers: buildHeaders(token, { includeContentType: true }),
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json().catch(() => ({}));
  console.log("variant data:",data)
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Failed to create variant product');
  }
  return data;
}

export async function updateCustomVariantProduct(productId, payload) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(
    `${storeUrl}/api/pos/app/product/update/custom-attributes-and-variants/${productId}`,
    {
      method: 'PUT',
      headers: buildHeaders(token, { includeContentType: true }),
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json().catch(() => ({}));
 
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Failed to update variant product');
  }
  return data;
}

export async function archiveProduct(productId) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const pid = Number(productId);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error('Invalid product id');
  }

  const res = await fetch(
    `${storeUrl}/pos/app/product/archive?product_id=${encodeURIComponent(pid)}`,
    {
      method: 'PUT',
      headers: buildHeaders(token),
    }
  );

  const raw = await res.text().catch(() => '');
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }
  console.log("archive id:",pid);
console.log("archive data:",data);
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Failed to archive product (${res.status})`);
  }
  return data;
}

export async function getArchivedProducts() {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/pos/app/list-archived-products`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  const raw = await res.text().catch(() => '');
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Failed to fetch archived products (${res.status})`);
  }

  const rows = Array.isArray(data?.archived_products) ? data.archived_products : [];
  return {
    count: Number(data?.count ?? rows.length ?? 0),
    rows,
  };
}

export async function unarchiveProduct(productId) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const pid = Number(productId);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error('Invalid product id');
  }

  const res = await fetch(
    `${storeUrl}/pos/app/product/unarchive?product_id=${encodeURIComponent(pid)}`,
    {
      method: 'PUT',
      headers: buildHeaders(token),
    }
  );

  const raw = await res.text().catch(() => '');
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Failed to unarchive product (${res.status})`);
  }
  return data;
}

// for multi store product search and notify functions

export async function searchMultiStoreProducts(searchQuery) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);
  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }
  if (!searchQuery || searchQuery.trim().length < 3) {
    throw new Error('Search query must be at least 3 characters');
  }

  const query = encodeURIComponent(searchQuery.trim());
  const res = await fetch(`${storeUrl}/api/multi-store-products/search?q=${query}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to search multi-store products (${res.status}): ${text || 'No details'}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : (json?.products ?? json?.results ?? []);
}

export async function notifyMultiStoreProduct(productData) {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const { product_name, barcode, department, size, stores, store_requested, customer_name, customer_phone, notes } = productData;

  const res = await fetch(`${storeUrl}/api/product-notification/create`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify({ product_name, barcode, department, size, stores, store_requested, customer_name, customer_phone, notes }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Failed to create product notification (${res.status})`);
  }
  return data;
}

export async function getProductNotificationList() {
  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/api/product-notification/list`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Failed to fetch product notification list (${res.status})`);
  }
  return Array.isArray(data) ? data : (data?.notifications ?? data ?? []);
}

export async function updateProductNotification({ id, status, store_accepted }) {
  if (!id) {
    throw new Error('ID is required to update product notification');
  }

  const [storeUrl, token] = await Promise.all([
    AsyncStorage.getItem('storeurl'),
    AsyncStorage.getItem('access_token'),
  ]);

  if (!storeUrl || !token) {
    throw new Error('Missing store_url or access_token in AsyncStorage.');
  }

  const res = await fetch(`${storeUrl}/api/product-notification/update`, {
    method: 'POST',
    headers: buildHeaders(token, { includeContentType: true }),
    body: JSON.stringify({ id, status, store_accepted }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Failed to update product notification (${res.status})`);
  }
  return data;
}
