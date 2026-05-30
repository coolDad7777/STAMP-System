#!/usr/bin/env node
/**
 * stamp_verify — Offline STAMP attendance record auditor
 *
 * Usage:
 *   stamp_verify <record.json> --facility-key <hex-pubkey>
 *   stamp_verify <record.json> --facility-key <hex-pubkey> --master-key <hex>
 *
 * Returns exit code 0 (PASS) or 1 (FAIL).
 * Prints a human-readable report to stdout.
 *
 * No network required. No trust in the STAMP server required.
 * All verification is done locally using only the exported record
 * and the facility's public key (obtained out-of-band from the IOP).
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const recordPath = args[0];
  const facilityKeyIdx = args.indexOf('--facility-key');
  const masterKeyIdx = args.indexOf('--master-key');

  if (!recordPath) {
    die('ERROR: No record file specified.');
  }
  if (facilityKeyIdx === -1 || !args[facilityKeyIdx + 1]) {
    die('ERROR: --facility-key <hex> is required.');
  }

  const facilityKeyHex = args[facilityKeyIdx + 1];
  const masterKeyHex = masterKeyIdx !== -1 ? args[masterKeyIdx + 1] : null;

  let record;
  try {
    const raw = fs.readFileSync(recordPath, 'utf-8');
    record = JSON.parse(raw);
  } catch (err) {
    die(`ERROR: Cannot read record file: ${err.message}`);
  }

  const sodium = require('libsodium-wrappers');
  await sodium.ready;

  const report = verifyRecord(record, facilityKeyHex, masterKeyHex, sodium);
  printReport(report);
  process.exit(report.overall === 'PASS' ? 0 : 1);
}

function verifyRecord(record, facilityKeyHex, masterKeyHex, sodium) {
  const checks = {};
  const failures = [];

  // ── 1. Schema completeness ───────────────────────────────────────────────
  const required = ['proof', 'sessionId', 'meetingId', 'checkinTime', 'status'];
  for (const field of required) {
    if (record[field] === undefined) {
      failures.push(`Missing required field: ${field}`);
    }
  }
  checks.schema = failures.length === 0 ? 'PASS' : 'FAIL';

  if (checks.schema === 'FAIL') {
    return { overall: 'FAIL', checks, failures, record };
  }

  const { proof } = record;

  // ── 2. Temporal challenge integrity ─────────────────────────────────────
  // Verify the stored temporal challenge matches what the epoch should produce.
  // Requires master key. If not provided, skip and note it.
  if (masterKeyHex) {
    try {
      const masterKey = Buffer.from(masterKeyHex, 'hex');
      const meetingKey = crypto.createHmac('sha256', masterKey)
        .update(proof.meetingId)
        .digest();
      const epoch = proof.temporalChallenge.epoch;
      const challengeInput = Buffer.concat([
        meetingKey,
        Buffer.from(epoch.toString())
      ]);
      const expectedChallenge = crypto.createHmac('sha256', meetingKey)
        .update(challengeInput)
        .digest('hex');

      const match = crypto.timingSafeEqual(
        Buffer.from(proof.temporalChallenge.challenge),
        Buffer.from(expectedChallenge)
      );
      checks.temporal_challenge = match ? 'PASS' : 'FAIL';
      if (!match) failures.push('Temporal challenge does not match epoch — possible tampering');
    } catch (err) {
      checks.temporal_challenge = 'ERROR';
      failures.push(`Temporal check error: ${err.message}`);
    }
  } else {
    checks.temporal_challenge = 'SKIPPED (no master key provided)';
  }

  // ── 3. Epoch window sanity ───────────────────────────────────────────────
  const { validFrom, validUntil, epoch } = proof.temporalChallenge;
  const epochSize = 30000;
  const expectedFrom = epoch * epochSize;
  const expectedUntil = (epoch + 1) * epochSize;
  const windowOk = validFrom === expectedFrom && validUntil === expectedUntil;
  checks.epoch_window = windowOk ? 'PASS' : 'FAIL';
  if (!windowOk) failures.push(`Epoch window mismatch: got [${validFrom}, ${validUntil}], expected [${expectedFrom}, ${expectedUntil}]`);

  // ── 4. Check-in time within epoch window ────────────────────────────────
  const checkinTime = record.checkinTime;
  const inWindow = checkinTime >= validFrom && checkinTime <= validUntil + epochSize;
  checks.checkin_in_epoch = inWindow ? 'PASS' : 'FAIL';
  if (!inWindow) failures.push(`Check-in time ${checkinTime} is outside epoch window [${validFrom}, ${validUntil}]`);

  // ── 5. Geohash precision ─────────────────────────────────────────────────
  const geohash = proof.spatialCommitment?.geohash ?? '';
  const precisionOk = geohash.length === 7 && proof.spatialCommitment?.precision === 7;
  checks.geohash_precision = precisionOk ? 'PASS' : 'FAIL';
  if (!precisionOk) failures.push(`Geohash precision violation: got "${geohash}" (length ${geohash.length}), precision field ${proof.spatialCommitment?.precision}`);

  // ── 6. Binding hash integrity ────────────────────────────────────────────
  try {
    const bindingData = Buffer.concat([
      Buffer.from(proof.temporalChallenge.challenge, 'hex'),
      Buffer.from(proof.spatialCommitment.commitment, 'hex'),
      Buffer.from(proof.meetingId)
    ]);
    const recomputedBinding = crypto.createHash('sha256').update(bindingData).digest('hex');
    const bindingMatch = crypto.timingSafeEqual(
      Buffer.from(proof.bindingHash, 'hex'),
      Buffer.from(recomputedBinding, 'hex')
    );
    checks.binding_hash = bindingMatch ? 'PASS' : 'FAIL';
    if (!bindingMatch) failures.push(`Binding hash mismatch — record may have been tampered with`);
  } catch (err) {
    checks.binding_hash = 'ERROR';
    failures.push(`Binding hash check error: ${err.message}`);
  }

  // ── 7. Ed25519 signature verification ───────────────────────────────────
  try {
    const facilityKey = Buffer.from(facilityKeyHex, 'hex');
    const bindingHashBytes = Buffer.from(proof.bindingHash, 'hex');
    const sigBytes = Buffer.from(proof.signature, 'hex');
    const sigValid = sodium.crypto_sign_verify_detached(sigBytes, bindingHashBytes, facilityKey);
    checks.signature = sigValid ? 'PASS' : 'FAIL';
    if (!sigValid) failures.push(`Ed25519 signature invalid — binding hash was not signed by the provided facility key`);
  } catch (err) {
    checks.signature = 'ERROR';
    failures.push(`Signature check error: ${err.message}`);
  }

  // ── 8. Session status ────────────────────────────────────────────────────
  checks.status = record.status === 'completed' ? 'PASS' : 'WARN';
  if (record.status !== 'completed') {
    failures.push(`Session status is "${record.status}" — session may not have been completed`);
  }

  const overall = failures.length === 0 ? 'PASS' : 'FAIL';
  return { overall, checks, failures, record };
}

function printReport(report) {
  const { overall, checks, failures, record } = report;
  const line = '─'.repeat(60);

  console.log('\nSTAMP Record Verification Report');
  console.log(line);
  console.log(`Session ID  : ${record.sessionId ?? 'N/A'}`);
  console.log(`Meeting ID  : ${record.meetingId ?? 'N/A'}`);
  console.log(`Check-in    : ${record.checkinTime ? new Date(record.checkinTime).toISOString() : 'N/A'}`);
  console.log(`Status      : ${record.status ?? 'N/A'}`);
  console.log(line);
  console.log('Checks:');
  for (const [name, result] of Object.entries(checks)) {
    const icon = result === 'PASS' ? '✓' : result === 'FAIL' ? '✗' : result.startsWith('SKIP') ? '~' : '!';
    console.log(`  ${icon} ${name.padEnd(25)} ${result}`);
  }
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  • ${f}`);
    }
  }
  console.log(line);
  console.log(`\nOverall: ${overall}\n`);
}

function printUsage() {
  console.log(`
stamp_verify — Offline STAMP attendance record auditor

Usage:
  stamp_verify <record.json> --facility-key <hex-encoded-ed25519-pubkey> [--master-key <hex>]

Arguments:
  <record.json>           Path to the exported JSON attendance record
  --facility-key <hex>    The IOP facility's Ed25519 public key (32 bytes, hex)
  --master-key <hex>      Optional: TSCB master key for temporal challenge verification

Exit codes:
  0  PASS — all checks passed, record is authentic
  1  FAIL — one or more checks failed, record may be invalid or tampered

Example:
  stamp_verify session_abc123.json --facility-key d75a980182b10ab7...
`);
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
