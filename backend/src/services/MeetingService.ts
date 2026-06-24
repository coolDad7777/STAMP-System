import { TSCBProtocol } from '../crypto/TSCBProtocol';
import { config } from '../config/config';
import { FileStore } from './FileStore';

export interface MeetingRecord {
  id: string;
  name: string;
  meetingType: string;
  latitude: number;
  longitude: number;
  geohash: string;
  minimumDurationMinutes: number;
  isActive: boolean;
}

interface MeetingDb {
  meetings: MeetingRecord[];
}

const DEFAULT_MEETINGS: MeetingRecord[] = [
  {
    id: 'meeting_iop_demo_001',
    name: 'Riverside IOP — Afternoon Group',
    meetingType: 'IOP Outpatient',
    latitude: 40.7128,
    longitude: -74.006,
    geohash: '',
    minimumDurationMinutes: 1,
    isActive: true
  }
];

class MeetingServiceClass {
  private store = new FileStore<MeetingDb>('meetings.json', { meetings: [] });
  private protocol: TSCBProtocol | null = null;

  async initialize(protocol: TSCBProtocol): Promise<void> {
    this.protocol = protocol;
    const data = this.store.read();
    if (data.meetings.length === 0) {
      const meetings = DEFAULT_MEETINGS.map((m) => ({
        ...m,
        geohash: protocol.generateSpatialCommitment(
          m.latitude,
          m.longitude,
          protocol.generateTemporalChallenge(m.id, Date.now())
        ).geohash
      }));
      this.store.write({ meetings });
    } else {
      const meetings = data.meetings.map((m) => {
        let updated = m;
        if (!m.geohash) {
          updated = {
            ...m,
            geohash: protocol.generateSpatialCommitment(
              m.latitude,
              m.longitude,
              protocol.generateTemporalChallenge(m.id, Date.now())
            ).geohash
          };
        }
        if (m.minimumDurationMinutes < 1) {
          updated = { ...updated, minimumDurationMinutes: 1 };
        }
        return updated;
      });
      this.store.write({ meetings });
    }
  }

  listActive(): MeetingRecord[] {
    return this.store.read().meetings.filter((m) => m.isActive);
  }

  getById(id: string): MeetingRecord | undefined {
    return this.store.read().meetings.find((m) => m.id === id);
  }

  validateAtMeeting(
    meetingId: string,
    latitude: number,
    longitude: number,
    timestamp: number
  ): { ok: true; meeting: MeetingRecord } | { ok: false; error: string } {
    if (!this.protocol) {
      return { ok: false, error: 'Meeting service not initialized' };
    }

    const meeting = this.getById(meetingId);
    if (!meeting || !meeting.isActive) {
      return { ok: false, error: 'Meeting not found or inactive' };
    }

    const challenge = this.protocol.generateTemporalChallenge(meetingId, timestamp);
    const userCommitment = this.protocol.generateSpatialCommitment(
      latitude,
      longitude,
      challenge
    );

    const valid = this.protocol.validateSpatialCommitment(
      userCommitment,
      meeting.geohash,
      config.LOCATION_TOLERANCE_METERS
    );

    if (!valid) {
      return {
        ok: false,
        error: `Location is outside the ${config.LOCATION_TOLERANCE_METERS}m boundary for this outpatient session`
      };
    }

    return { ok: true, meeting };
  }

  buildQrPayload(meetingId: string, timestamp: number = Date.now()) {
    if (!this.protocol) {
      throw new Error('Meeting service not initialized');
    }
    const meeting = this.getById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    const temporal = this.protocol.generateTemporalChallenge(meetingId, timestamp);
    return {
      meetingId,
      meetingName: meeting.name,
      meetingType: meeting.meetingType,
      challenge: temporal.challenge,
      epoch: temporal.epoch,
      validFrom: temporal.validFrom,
      validUntil: temporal.validUntil
    };
  }
}

export const MeetingService = new MeetingServiceClass();
