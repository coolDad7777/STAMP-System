import { TSCBProof } from '../crypto/TSCBProtocol';
import { FileStore } from './FileStore';

export interface AttendanceSession {
  sessionId: string;
  participantToken: string;
  participantDisplay: string;
  meetingId: string;
  meetingName: string;
  meetingType: string;
  checkinProof: TSCBProof;
  checkoutProof?: TSCBProof;
  checkinTime: number;
  checkoutTime?: number;
  checkinGeohash: string;
  checkoutGeohash?: string;
  status: 'active' | 'completed' | 'verified' | 'invalid';
  durationMinutes?: number;
  meetsMinimum?: boolean;
  locationVerified: boolean;
  validatorNotes?: string;
}

interface SessionDb {
  sessions: AttendanceSession[];
}

class SessionServiceClass {
  private store = new FileStore<SessionDb>('sessions.json', { sessions: [] });

  get(sessionId: string): AttendanceSession | undefined {
    return this.store.read().sessions.find((s) => s.sessionId === sessionId);
  }

  list(): AttendanceSession[] {
    return [...this.store.read().sessions].sort((a, b) => b.checkinTime - a.checkinTime);
  }

  listPending(): AttendanceSession[] {
    return this.list().filter((s) => s.status === 'completed');
  }

  save(session: AttendanceSession): void {
    this.store.update((db) => {
      const idx = db.sessions.findIndex((s) => s.sessionId === session.sessionId);
      if (idx >= 0) {
        db.sessions[idx] = session;
      } else {
        db.sessions.push(session);
      }
      return db;
    });
  }

  markVerified(sessionIds: string[]): number {
    let count = 0;
    this.store.update((db) => {
      db.sessions = db.sessions.map((s) => {
        if (sessionIds.includes(s.sessionId) && s.status === 'completed') {
          count += 1;
          return { ...s, status: 'verified' as const };
        }
        return s;
      });
      return db;
    });
    return count;
  }
}

export const SessionService = new SessionServiceClass();
