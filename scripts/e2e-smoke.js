#!/usr/bin/env node
/**
 * End-to-end smoke test: check-in -> wait -> check-out -> list sessions
 */
const sodium = require('libsodium-wrappers');

const API = process.env.API_URL || 'http://127.0.0.1:3000';

async function main() {
  await sodium.ready;
  const kp = sodium.crypto_sign_keypair();
  const pubHex = Buffer.from(kp.publicKey).toString('hex');

  const qrRes = await fetch(`${API}/api/meetings/meeting_iop_demo_001/qr`);
  const qr = await qrRes.json();

  const meetingId = 'meeting_iop_demo_001';
  const timestamp = Date.now();
  const msg = Buffer.from(meetingId + timestamp);
  const sig = sodium.crypto_sign_detached(msg, kp.privateKey);

  const checkinRes = await fetch(`${API}/api/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantToken: pubHex,
      meetingId,
      latitude: 40.7128,
      longitude: -74.006,
      timestamp,
      signature: Buffer.from(sig).toString('hex'),
      qrChallenge: qr.challenge,
      qrEpoch: qr.epoch
    })
  });
  const checkin = await checkinRes.json();
  if (!checkinRes.ok) throw new Error('checkin failed: ' + JSON.stringify(checkin));
  console.log('checkin ok', checkin.sessionId);

  await new Promise((r) => setTimeout(r, 65000));

  const coMsg = Buffer.from(checkin.sessionId + checkin.serverCheckinTime);
  const coSig = sodium.crypto_sign_detached(coMsg, kp.privateKey);
  const checkoutRes = await fetch(`${API}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: checkin.sessionId,
      participantToken: pubHex,
      latitude: 40.7128,
      longitude: -74.006,
      signature: Buffer.from(coSig).toString('hex')
    })
  });
  const checkout = await checkoutRes.json();
  if (!checkoutRes.ok) throw new Error('checkout failed: ' + JSON.stringify(checkout));
  console.log('checkout ok', checkout);

  const sessionsRes = await fetch(`${API}/api/sessions`);
  const sessions = await sessionsRes.json();
  console.log('sessions', sessions.sessions.length, 'pending', sessions.sessions.filter(s => s.status === 'pending').length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
