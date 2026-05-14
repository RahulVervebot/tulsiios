// icms_config/api.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ICMSAPIsURL } from '@env'; // optional fallback

// Helper to get the correct storage key based on developer_mode
const getStorageKey = async () => {
  try {
    const devMode = await AsyncStorage.getItem('developer_mode');
    return devMode === 'true' ? 'local_icms_url' : 'icms_url';
  } catch {
    return 'icms_url'; // fallback to production key
  }
};

const PATHS = {
VENDORS: '/api/getvendorlist',
FINDPRODUCTFROMHICKSVILL: '/find-hicksville-products-for-mobile',
PRODUCTLINKING: '/api/invoice/product/update',
SEARCHVENDOR: '/api/searchvendor',
GETINVOICEDATA: '/api/getCompletedInvoiceData',
GETINVOICELIST: '/api/getinvoicelist',
UPLOAD_IMAGE: '/api/upload-image',
OCR_RESPONSE: '/api/ocr',
SETPRODUCTINTABLEFROMOCR: '/api/setproductintable',
PREVIEW_OCR: '/api/ocr-preview',
SAVE_INVOICE: '/api/invoice/scaninvoicedata',
FETCH_INVOICE: '/api/invoice/getsavedinvoices',
  // CREATE_INVOICE: '/api/invoice/create_data',
UPDATE_INVOICE: '/api/invoice/updateinvoicedetails',
RED_PRODUCTS: '/api/proxy/redproducts',
UPDATE_RED_PRODUCTS: '/api/update-redproduct',
ROWINOVICE: '/api/icms-raw-invoices-proxy',
GET_ROWINOVICE: '/api/get_storeRawInvoice',
UPDATE_ROWINOVICE: '/api/update_invoice_status',
linkingcollectiontransfer: '/api/linkingcollectiontransfer',
REMOVE_LINKING: '/api/remove_Linking_Bulk',
REMOVE_LINKED_ITEM: '/api/invoice/removeLinkedItem',
STEPPER_COUNT: '/api/step_count',
QUANTITY_SP_COSTUPDATE: '/api/invoice/quantity_sellinprice_and_cost_update',
SingleLinking: '/api/linkingcollectiontransfer-for-mobile/',
PENDINGINVOICES: '/api/icms-raw-invoices/pending-jobs',
SAVEDINVSTATUS: '/api/invoice/updatesaveinvociestatus',
};

// normalize base: strip trailing slashes
const normalizeBase = (url) => (url || '').replace(/\/+$/, '');

let BASE = normalizeBase(ICMSAPIsURL || globalThis.__ICMS_BASE__ || ''); // env or any pre-set global

export function setICMSBase(url) {
  BASE = normalizeBase(url);
  // keep a global copy so if this module is reloaded, the value persists
  globalThis.__ICMS_BASE__ = BASE;
}

export async function saveICMSBase(url) {
  try {
    const storageKey = await getStorageKey();
    await AsyncStorage.setItem(storageKey, normalizeBase(url));
    setICMSBase(url);
  } catch (error) {
    console.error('Failed to save ICMS base URL:', error);
  }
}

export async function initICMSBase() {
  try {
    const storageKey = await getStorageKey();
    const fromStorage = await AsyncStorage.getItem(storageKey);
    if (fromStorage) setICMSBase(fromStorage);
  } catch {
    // ignore and keep fallback
  }
}

export { getStorageKey };

// Build an object with live getters so usage stays: API_ENDPOINTS.FETCH_INVOICE
const API_ENDPOINTS = {};
for (const [key, path] of Object.entries(PATHS)) {
  Object.defineProperty(API_ENDPOINTS, key, {
    enumerable: true,
    get() {
      return `${BASE}${path}`;
    },
  });
}

export default API_ENDPOINTS;
