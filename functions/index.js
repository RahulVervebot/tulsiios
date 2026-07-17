const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineString, defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

const http2 = require('http2');
const crypto = require('crypto');

initializeApp();

// String params are loaded from functions/.env automatically.
// The p8 key is stored as a Firebase Secret (never in a file):
//   base64 -i AuthKey_FST66VR84V.p8 | tr -d '\n'   ← copy output
//   firebase functions:secrets:set APNS_KEY_P8_BASE64   ← paste when prompted
// IMPORTANT: argument is the SECRET NAME only — Firebase fetches the actual p8 value at runtime.
// Do NOT replace this string with the base64 key content.

const APNS_KEY_P8_BASE64 = defineSecret('APNS_KEY_P8_BASE64');
const APNS_KEY_ID        = defineString('APNS_KEY_ID');
const APNS_TEAM_ID       = defineString('APNS_TEAM_ID');
const APNS_BUNDLE_ID     = defineString('APNS_BUNDLE_ID');
const APNS_ENV           = defineString('APNS_ENV', { default: 'production' });

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_PASS = defineSecret('GMAIL_PASS');

// ── JWT helper — ES256 token signed with the p8 private key ──────────────────
let _jwtCache = null;

function getApnsJwt(keyP8Base64, keyId, teamId) {
  const now = Math.floor(Date.now() / 1000);
  if (_jwtCache && now - _jwtCache.issuedAt < 55 * 60) return _jwtCache.token;

  const header   = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
  const payload  = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString('base64url');
  const unsigned = `${header}.${payload}`;

  const key  = Buffer.from(keyP8Base64, 'base64').toString('utf8');
  const sign = crypto.createSign('SHA256');
  sign.update(unsigned);
  const sig = sign.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  const token = `${unsigned}.${sig}`;
  _jwtCache = { token, issuedAt: now };
  return token;
}

// ── Send VoIP push via APNs HTTP/2 ───────────────────────────────────────────
// APNs v3 requires HTTP/2 — Node's https module is HTTP/1.1 only, use http2.
function sendVoipPush({ voipToken, payload, keyP8Base64, keyId, teamId, bundleId, env }) {
  return new Promise((resolve, reject) => {
    const host = env === 'production'
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com';

    const jwt  = getApnsJwt(keyP8Base64, keyId, teamId);
    const body = JSON.stringify(payload);

    const client = http2.connect(`https://${host}`);
    client.on('error', (err) => { reject(err); });

    const req = client.request({
      ':method':       'POST',
      ':path':         `/3/device/${voipToken}`,
      'authorization': `bearer ${jwt}`,
      'apns-topic':    `${bundleId}.voip`,
      'apns-push-type': 'voip',
      'apns-priority':  '10',
      'content-type':   'application/json',
      'content-length': String(Buffer.byteLength(body)),
    });

    let statusCode = 0;
    req.on('response', (headers) => {
      statusCode = headers[':status'];
    });

    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      client.close();
      if (statusCode === 200) {
        resolve({ success: true });
      } else {
        reject(new Error(`APNs ${statusCode}: ${data}`));
      }
    });

    req.on('error', (err) => { client.close(); reject(err); });
    req.write(body);
    req.end();
  });
}

// ── Cloud Function: fires when a new call document is created ────────────────
exports.sendVoipPushOnCall = onDocumentCreated(
  {
    document: 'calls/{callId}',
    secrets:  ['APNS_KEY_P8_BASE64'],
  },
  async (event) => {
    const callId   = event.params.callId;
    console.log(`[VoIP] ── Function triggered for callId: ${callId}`);

    const callData = event.data?.data();
    if (!callData) {
      console.log('[VoIP] ✗ STEP 1 FAIL: No callData in event');
      return;
    }
    console.log(`[VoIP] ✓ STEP 1: callData found — status: ${callData.status}, calleeId: ${callData.calleeId}, type: ${callData.type}`);

    const { calleeId, callerId, callerName, callerEmail, type } = callData;
    if (!calleeId || callData.status !== 'calling') {
      console.log(`[VoIP] ✗ STEP 2 FAIL: Skipping — status="${callData.status}" calleeId="${calleeId}"`);
      return;
    }
    console.log(`[VoIP] ✓ STEP 2: Valid calling doc — callee: ${calleeId}, caller: ${callerId}`);

    const db = getFirestore();
    const profileSnap = await db.collection('callProfiles').doc(calleeId).get();
    if (!profileSnap.exists) {
      console.log(`[VoIP] ✗ STEP 3 FAIL: No callProfile document for: ${calleeId}`);
      return;
    }
    const profileData = profileSnap.data();
    console.log(`[VoIP] ✓ STEP 3: callProfile found — fields: ${Object.keys(profileData).join(', ')}`);

    const { voipToken } = profileData;
    if (!voipToken) {
      console.log(`[VoIP] ✗ STEP 4 FAIL: voipToken missing from callProfile of ${calleeId}`);
      console.log(`[VoIP]   → Open the app on the callee device so PushKit re-registers the token`);
      return;
    }
    console.log(`[VoIP] ✓ STEP 4: voipToken found (length: ${voipToken.length})`);

    // Log all APNs params so we can verify they are correct
    const keyId    = APNS_KEY_ID.value();
    const teamId   = APNS_TEAM_ID.value();
    const bundleId = APNS_BUNDLE_ID.value();
    const env      = APNS_ENV.value();
    const p8raw    = APNS_KEY_P8_BASE64.value();
    console.log(`[VoIP] ✓ STEP 5: APNs params — keyId: ${keyId}, teamId: ${teamId}, bundleId: ${bundleId}, env: ${env}`);
    console.log(`[VoIP]   p8 secret length: ${p8raw?.length ?? 'NULL — secret not injected!'}`);

    if (!p8raw) {
      console.log('[VoIP] ✗ STEP 5 FAIL: APNS_KEY_P8_BASE64 secret is empty — run: firebase functions:secrets:set APNS_KEY_P8_BASE64');
      return;
    }

    const apnsPayload = {
      aps: { 'content-available': 1 },
      callId,
      callerId,
      callerName:  callerName  || callerEmail || callerId,
      callerEmail: callerEmail || callerId,
      callType:    type || 'voice',
    };
    console.log(`[VoIP] ✓ STEP 6: Sending VoIP push to ${env} APNs...`);

    try {
      await sendVoipPush({
        voipToken,
        payload:     apnsPayload,
        keyP8Base64: p8raw,
        keyId,
        teamId,
        bundleId,
        env,
      });
      console.log(`[VoIP] ✓ STEP 7 SUCCESS: Push delivered → ${calleeId} for call ${callId}`);
    } catch (err) {
      console.error(`[VoIP] ✗ STEP 7 FAIL: APNs rejected push — ${err.message}`);
      console.error(`[VoIP]   Full error:`, err);
    }
  },
);

// ── Cloud Function: sends OTP email when a callOtpRequests doc is created ────
// Setup: firebase functions:secrets:set GMAIL_USER  (gmail address used to send)
//        firebase functions:secrets:set GMAIL_PASS  (Gmail app password — NOT your login password)
//        cd functions && npm install   (installs nodemailer)
//        firebase deploy --only functions
exports.sendCallOtpEmail = onDocumentCreated(
  {
    document: 'callOtpRequests/{requestId}',
    secrets:  ['GMAIL_USER', 'GMAIL_PASS'],
  },
  async (event) => {
    const data  = event.data?.data();
    const email = data?.email;
    if (!email) {
      console.log('[OTP] No email in request document — skipping');
      return;
    }
    console.log(`[OTP] Processing OTP request for: ${email}`);

    const db  = getFirestore();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Use a safe Firestore document key (email can contain special chars)
    const emailKey = email.replace(/\./g, '_dot_').replace(/@/g, '_at_');

    try {
      await db.collection('callOtps').doc(emailKey).set({
        email,
        code,
        expiresAt,
        createdAt: new Date(),
        used: false,
      });
      console.log(`[OTP] Stored OTP for ${email} (key: ${emailKey}), expires: ${expiresAt.toISOString()}`);
    } catch (err) {
      console.error(`[OTP] Failed to store OTP: ${err.message}`);
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GMAIL_USER.value(),
          pass: GMAIL_PASS.value(),
        },
      });

      await transporter.sendMail({
        from: `"Tulsi App" <${GMAIL_USER.value()}>`,
        to:   email,
        subject: 'Your OTP for Tulsi Login',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:440px;padding:24px;border:1px solid #E5E7EB;border-radius:12px;">
            <h2 style="color:#111827;margin-bottom:8px;">Login OTP</h2>
            <p style="color:#6B7280;margin-bottom:24px;">Use the code below to log in to Tulsi. It expires in <strong>10 minutes</strong>.</p>
            <div style="background:#F0FDF4;border:1px solid #A7D7AD;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px;">
              <p style="font-size:36px;font-weight:800;letter-spacing:12px;color:#319241;margin:0;">${code}</p>
            </div>
            <p style="color:#9CA3AF;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
        text: `Your Tulsi login OTP is: ${code}\n\nThis code expires in 10 minutes.`,
      });
      console.log(`[OTP] Email sent successfully to ${email}`);
    } catch (err) {
      console.error(`[OTP] Failed to send email to ${email}: ${err.message}`);
    }

    // Clean up the request trigger document
    try {
      await event.data.ref.delete();
    } catch (_) {}
  },
);