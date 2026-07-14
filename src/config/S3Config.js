/**
 * S3Config.js — AWS S3 media storage for chat.
 *
 * Uses crypto-js for SigV4 pre-signed URLs — no AWS SDK, no Node.js
 * polyfills required. Works on Hermes out of the box.
 *
 * In LoginScreen, after fetching S3 config from Firestore, store with:
 *   await AsyncStorage.setItem(S3_ASYNC_KEYS.region,          value);
 *   await AsyncStorage.setItem(S3_ASYNC_KEYS.bucket,          value);
 *   await AsyncStorage.setItem(S3_ASYNC_KEYS.accessKeyId,     value);
 *   await AsyncStorage.setItem(S3_ASYNC_KEYS.secretAccessKey, value);
 *
 * Install: npm install crypto-js react-native-blob-util
 *
 * S3 bucket CORS (Permissions → CORS):
 *   [{ "AllowedHeaders":["*"], "AllowedMethods":["GET","PUT"],
 *      "AllowedOrigins":["*"], "ExposeHeaders":[] }]
 *
 * IAM policy needed (minimum):
 *   s3:PutObject, s3:GetObject  on  arn:aws:s3:::YOUR_BUCKET/*
 */

import CryptoJS   from 'crypto-js';
import RNBlobUtil  from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage key names — use these exact keys in LoginScreen
export const S3_ASYNC_KEYS = {
  region:          '@s3_region',
  bucket:          '@s3_bucket',
  accessKeyId:     '@s3_access_key_id',
  secretAccessKey: '@s3_secret_access_key',
};

const DOWNLOAD_URL_TTL = 604800; // 7 days — file itself lives forever in S3
const UPLOAD_URL_TTL   = 600;    // 10 min — enough for any upload

const LOCAL_DIR = RNBlobUtil.fs.dirs.DocumentDir + '/chat_media/';
const MAP_STORE  = '@chat_s3_map_v1';

// ─── Local download map ───────────────────────────────────────────────────────

let _map = {};
const _loadMap = async () => {
  try { const r = await AsyncStorage.getItem(MAP_STORE); if (r) _map = JSON.parse(r); } catch (_) {}
};
const _saveMap = async () => {
  try { await AsyncStorage.setItem(MAP_STORE, JSON.stringify(_map)); } catch (_) {}
};
_loadMap();

// ─── Config cache ─────────────────────────────────────────────────────────────

let _config = null;

const getConfig = async () => {
  if (_config) return _config;
  const [region, bucket, accessKeyId, secretAccessKey] = await Promise.all([
    AsyncStorage.getItem(S3_ASYNC_KEYS.region),
    AsyncStorage.getItem(S3_ASYNC_KEYS.bucket),
    AsyncStorage.getItem(S3_ASYNC_KEYS.accessKeyId),
    AsyncStorage.getItem(S3_ASYNC_KEYS.secretAccessKey),
  ]);
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 config missing — store credentials in AsyncStorage after login.');
  }
  _config = { region, bucket, accessKeyId, secretAccessKey };
  return _config;
};

// Call on logout so next login rebuilds with fresh credentials
export const clearS3Client = () => { _config = null; };

// ─── AWS SigV4 pre-signed URL (pure JS, Hermes-safe) ─────────────────────────

const encodeRfc3986 = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const signingKey = (secret, dateStamp, region, service) => {
  const kDate    = CryptoJS.HmacSHA256(dateStamp,    'AWS4' + secret);
  const kRegion  = CryptoJS.HmacSHA256(region,       kDate);
  const kService = CryptoJS.HmacSHA256(service,      kRegion);
  return         CryptoJS.HmacSHA256('aws4_request', kService);
};

// contentType must be passed for PUT so it is included in the signature.
// AWS rejects the request if you send a header that was not signed.
const buildPresignedUrl = (method, s3Key, expiresIn, cfg, contentType = null) => {
  const { region, bucket, accessKeyId, secretAccessKey } = cfg;
  const host = `${bucket}.s3.${region}.amazonaws.com`;

  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const credScope = `${dateStamp}/${region}/s3/aws4_request`;

  // content-type must be signed for PUT; alphabetical order required
  const signedHeaders     = (method === 'PUT' && contentType) ? 'content-type;host' : 'host';
  const canonicalHeaders  = (method === 'PUT' && contentType)
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`;

  const qp = {
    'X-Amz-Algorithm':     'AWS4-HMAC-SHA256',
    'X-Amz-Credential':    `${accessKeyId}/${credScope}`,
    'X-Amz-Date':          amzDate,
    'X-Amz-Expires':       String(expiresIn),
    'X-Amz-SignedHeaders': signedHeaders,
  };

  const canonicalQS = Object.keys(qp).sort()
    .map(k => `${encodeRfc3986(k)}=${encodeRfc3986(qp[k])}`)
    .join('&');

  const encodedKey = s3Key.split('/').map(encodeRfc3986).join('/');

  const canonicalRequest = [
    method,
    `/${encodedKey}`,
    canonicalQS,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credScope,
    CryptoJS.SHA256(canonicalRequest).toString(CryptoJS.enc.Hex),
  ].join('\n');

  const sig = CryptoJS.HmacSHA256(
    stringToSign,
    signingKey(secretAccessKey, dateStamp, region, 's3'),
  ).toString(CryptoJS.enc.Hex);

  return `https://${host}/${encodedKey}?${canonicalQS}&X-Amz-Signature=${sig}`;
};

// ─── Public API ───────────────────────────────────────────────────────────────

// Generate a temporary download URL. File itself never expires in S3.
export const getPresignedDownloadUrl = async (s3Key) => {
  const cfg = await getConfig();
  return buildPresignedUrl('GET', s3Key, DOWNLOAD_URL_TTL, cfg);
};

// Upload a local file. Returns s3Key (permanent reference stored in Firestore).
export const uploadToS3 = async (fileUri, s3Key, mimeType, onProgress) => {
  const cfg          = await getConfig();
  const presignedUrl = buildPresignedUrl('PUT', s3Key, UPLOAD_URL_TTL, cfg, mimeType);
  const cleanUri     = fileUri.replace('file://', '');

  console.log('[S3] cfg:', cfg);
  console.log('[S3] file:', cleanUri, '| mime:', mimeType);
  console.log('[S3] FULL URL:', presignedUrl);

  let res;
  try {
    res = await RNBlobUtil
      .config({ timeout: 120000 })
      .fetch('PUT', presignedUrl, { 'Content-Type': mimeType }, RNBlobUtil.wrap(cleanUri))
      .uploadProgress({ interval: 250 }, (written, total) => {
        onProgress?.(written / total);
      });
  } catch (fetchErr) {
    console.log('[S3] network error:', fetchErr?.message, fetchErr?.code);
    throw fetchErr;
  }

  const status = res.info().status;
  console.log('[S3] response status:', status);
  if (status < 200 || status >= 300) {
    const body = await res.text().catch(() => '') || res.data || '';
    console.warn('[S3] ERROR BODY >>>', body);
    throw new Error(`S3 upload failed (${status})`);
  }
  return s3Key;
};

// Download an S3 file to the device.
export const downloadFromS3 = async (s3Key, fileName, onProgress) => {
  try {
    const dirExists = await RNBlobUtil.fs.isDir(LOCAL_DIR).catch(() => false);
    if (!dirExists) await RNBlobUtil.fs.mkdir(LOCAL_DIR);

    const localPath    = LOCAL_DIR + fileName;
    const presignedUrl = await getPresignedDownloadUrl(s3Key);

    await RNBlobUtil
      .config({ fileCache: true, path: localPath, timeout: 120000 })
      .fetch('GET', presignedUrl)
      .progress({ interval: 250 }, (received, total) => {
        onProgress?.(received / total);
      });

    _map[s3Key] = localPath;
    await _saveMap();
    return localPath;
  } catch (e) {
    console.log('[S3] download error:', e?.message);
    throw e;
  }
};

export const isFileDownloaded = async (s3Key) => {
  const p = _map[s3Key];
  if (!p) return false;
  return RNBlobUtil.fs.exists(p).catch(() => false);
};

export const getLocalPath = (s3Key) => _map[s3Key] ?? null;

// Remove the local copy — S3 copy stays intact
export const deleteLocalFile = async (s3Key) => {
  const p = _map[s3Key];
  if (!p) return;
  try { await RNBlobUtil.fs.unlink(p); } catch (_) {}
  delete _map[s3Key];
  await _saveMap();
};
