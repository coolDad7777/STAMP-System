import { readFileSync } from 'fs';
import { z } from 'zod';
import { GeohashService } from './GeohashService';

const meetingSchema = z.object({
  id: z.string().min(1).max(128),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().finite().positive().max(500),
  maxAccuracyMeters: z.number().finite().positive().max(100),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  minimumDurationMs: z.number().int().positive(),
}).strict().refine(m => m.endsAt > m.startsAt &&
  m.minimumDurationMs <= m.endsAt - m.startsAt &&
  m.maxAccuracyMeters <= m.radiusMeters, 'Invalid meeting window or location policy');

export type RegisteredMeeting = z.infer<typeof meetingSchema>;
export type LocationClaim = { latitude: number; longitude: number; accuracyMeters: number; timestamp: number };

// Operator-owned configuration only; no public endpoint can create or change meetings.
// Missing configuration deliberately accepts no meetings. Malformed configuration stops startup.
export function loadMeetings(path = process.env.STAMP_MEETINGS_FILE): Map<string, RegisteredMeeting> {
  if (!path) return new Map();
  const meetings = z.array(meetingSchema).parse(JSON.parse(readFileSync(path, 'utf8')));
  const result = new Map<string, RegisteredMeeting>();
  for (const meeting of meetings) {
    if (result.has(meeting.id)) throw new Error(`Duplicate meeting ID: ${meeting.id}`);
    result.set(meeting.id, Object.freeze(meeting));
  }
  return result;
}

export function locationError(meeting: RegisteredMeeting, claim: LocationClaim, now: number): string | undefined {
  if (Math.abs(now - claim.timestamp) > 120000) return 'Location timestamp is stale';
  if (now < meeting.startsAt || now > meeting.endsAt) return 'Meeting is outside its attendance window';
  if (!Number.isFinite(claim.accuracyMeters) || claim.accuracyMeters <= 0 ||
      claim.accuracyMeters > meeting.maxAccuracyMeters) return 'Location accuracy is insufficient';
  const distance = GeohashService.distance(meeting.latitude, meeting.longitude, claim.latitude, claim.longitude);
  // Require the entire reported uncertainty circle to fit within the allowed radius.
  if (!Number.isFinite(distance) || distance + claim.accuracyMeters > meeting.radiusMeters) {
    return 'Reported location is outside the meeting boundary';
  }
}

// Explicit version and ordered fields prevent ambiguous concatenation and location substitution.
// This authenticates a claim, not the physical accuracy of the device's GPS.
export function checkinMessage(body: LocationClaim & { participantToken: string; meetingId: string }): Buffer {
  return Buffer.from(JSON.stringify(['stamp.checkin.v2', body.participantToken, body.meetingId,
    body.latitude, body.longitude, body.accuracyMeters, body.timestamp]));
}

export function checkoutMessage(body: LocationClaim & { participantToken: string; sessionId: string }, checkinTime: number): Buffer {
  return Buffer.from(JSON.stringify(['stamp.checkout.v2', body.participantToken, body.sessionId,
    checkinTime, body.latitude, body.longitude, body.accuracyMeters, body.timestamp]));
}
