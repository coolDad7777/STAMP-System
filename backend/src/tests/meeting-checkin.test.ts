import { beforeAll, beforeEach, afterAll, afterEach, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import sodium from 'libsodium-wrappers';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkinRoutes } from '../routes/checkin';
import { checkinMessage, checkoutMessage, loadMeetings } from '../services/MeetingRegistry';

const START = 1800000000000;
const policy = { id: 'registered-session', latitude: 44.95, longitude: -93.09,
  radiusMeters: 150, maxAccuracyMeters: 50, startsAt: START, endsAt: START + 3600000,
  minimumDurationMs: 2700000 };
let app: FastifyInstance;
let directory: string;
let now: number;
let privateKey: Uint8Array;
let publicKey: string;
let previousFile: string | undefined;

function checkin(overrides: Record<string, unknown> = {}) {
  const body = { version: 2 as const, participantToken: publicKey, meetingId: policy.id,
    latitude: policy.latitude, longitude: policy.longitude, accuracyMeters: 10, timestamp: now, ...overrides };
  return { ...body, signature: Buffer.from(sodium.crypto_sign_detached(checkinMessage(body), privateKey)).toString('hex') };
}
function checkout(session: any, overrides: Record<string, unknown> = {}) {
  const body = { version: 2 as const, participantToken: publicKey, sessionId: session.sessionId,
    latitude: policy.latitude, longitude: policy.longitude, accuracyMeters: 10, timestamp: now, ...overrides };
  return { ...body, signature: Buffer.from(sodium.crypto_sign_detached(checkoutMessage(body, session.serverCheckinTime), privateKey)).toString('hex') };
}

beforeAll(async () => {
  await sodium.ready;
  const keys = sodium.crypto_sign_keypair(); privateKey = keys.privateKey;
  publicKey = Buffer.from(keys.publicKey).toString('hex');
  directory = mkdtempSync(join(tmpdir(), 'stamp-meetings-'));
  writeFileSync(join(directory, 'meetings.json'), JSON.stringify([policy]));
  previousFile = process.env.STAMP_MEETINGS_FILE;
});
beforeEach(async () => {
  now = START + 10000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  process.env.STAMP_MEETINGS_FILE = join(directory, 'meetings.json');
  app = Fastify(); await app.register(checkinRoutes); await app.ready();
});
afterEach(async () => { await app.close(); jest.restoreAllMocks(); });
afterAll(() => {
  if (previousFile === undefined) delete process.env.STAMP_MEETINGS_FILE;
  else process.env.STAMP_MEETINGS_FILE = previousFile;
  rmSync(directory, { recursive: true });
});

it('rejects the original arbitrary meeting attack even with a valid participant signature', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/checkin', payload: checkin({ meetingId: 'invented' }) });
  expect(res.statusCode).toBe(404);
});
it('rejects signed out-of-area, low-accuracy, stale and out-of-time claims', async () => {
  for (const change of [{ latitude: 45.5 }, { accuracyMeters: 90 }, { accuracyMeters: 0 },
    { timestamp: now - 120001 }, { latitude: 91 }]) {
    const res = await app.inject({ method: 'POST', url: '/api/checkin', payload: checkin(change) });
    expect(res.statusCode).toBe(400);
  }
  now = START - 1;
  expect((await app.inject({ method: 'POST', url: '/api/checkin', payload: checkin() })).statusCode).toBe(400);
  now = policy.endsAt + 1;
  expect((await app.inject({ method: 'POST', url: '/api/checkin', payload: checkin() })).statusCode).toBe(400);
});
it('rejects location or accuracy substitution after signing, and legacy requests', async () => {
  for (const change of [{ latitude: policy.latitude + 0.00001 }, { accuracyMeters: 11 }]) {
    const res = await app.inject({ method: 'POST', url: '/api/checkin', payload: { ...checkin(), ...change } });
    expect(res.statusCode).toBe(401);
  }
  const old: any = checkin(); delete old.version;
  expect((await app.inject({ method: 'POST', url: '/api/checkin', payload: old })).statusCode).toBe(400);
});
it('requires fresh location and actual server elapsed duration before completing a session', async () => {
  const incoming = await app.inject({ method: 'POST', url: '/api/checkin', payload: checkin() });
  expect(incoming.statusCode).toBe(201); const session = incoming.json();
  const early = await app.inject({ method: 'POST', url: '/api/checkout', payload: checkout(session) });
  expect(early.statusCode).toBe(409);
  expect((await app.inject({ url: '/api/session/' + session.sessionId })).json().status).toBe('active');
  now += policy.minimumDurationMs;
  expect((await app.inject({ method: 'POST', url: '/api/checkout', payload: checkout(session, { latitude: 46 }) })).statusCode).toBe(400);
  const altered = { ...checkout(session), longitude: policy.longitude + 0.00001 };
  expect((await app.inject({ method: 'POST', url: '/api/checkout', payload: altered })).statusCode).toBe(401);
  const completed = await app.inject({ method: 'POST', url: '/api/checkout', payload: checkout(session) });
  expect(completed.statusCode).toBe(200); expect(completed.json().meetsMinimum).toBe(true);
  expect((await app.inject({ method: 'POST', url: '/api/checkout', payload: checkout(session) })).statusCode).toBe(409);
});
it('accepts no meetings without operator configuration and fails startup on invalid configuration', async () => {
  delete process.env.STAMP_MEETINGS_FILE; expect(loadMeetings().size).toBe(0);
  const invalid = join(directory, 'invalid.json');
  writeFileSync(invalid, JSON.stringify([{ ...policy, endsAt: START - 1 }]));
  expect(() => loadMeetings(invalid)).toThrow();
  writeFileSync(invalid, JSON.stringify([policy, policy])); expect(() => loadMeetings(invalid)).toThrow('Duplicate');
  await app.close(); app = Fastify(); await app.register(checkinRoutes); await app.ready();
  expect((await app.inject({ method: 'POST', url: '/api/checkin', payload: checkin() })).statusCode).toBe(404);
});
