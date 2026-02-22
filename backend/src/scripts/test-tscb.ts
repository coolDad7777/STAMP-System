import * as crypto from 'crypto';
import { TSCBProtocol } from '../crypto/TSCBProtocol';

async function main() {
  const protocol = new TSCBProtocol('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  await protocol.initialize();

  const meetingId = 'meeting-123';
  const timestamp = Date.now();
  
  // Use the same key for signing and verification (symmetric HMAC)
  const userKey = crypto.randomBytes(32);

  console.log('Generating TSCB proof...');
  
  const proof = await protocol.generateTSCBProof(
    meetingId,
    37.7749, // latitude
    -122.4194, // longitude
    timestamp,
    userKey
  );

  console.log('Proof generated successfully');
  console.log('Challenge:', proof.temporalChallenge.challenge.substring(0, 16) + '...');
  console.log('Geohash:', proof.spatialCommitment.geohash);

  console.log('\nVerifying proof...');
  const result = await protocol.verifyTSCBProof(proof, userKey, Date.now());
  
  console.log('Verification result:', JSON.stringify(result, null, 2));
  
  if (result.isValid) {
    console.log('\n✅ TSCB Proof verification PASSED');
  } else {
    console.log('\n❌ TSCB Proof verification FAILED');
    console.log('Checks:', result.checks);
  }
}

main().catch(console.error);
