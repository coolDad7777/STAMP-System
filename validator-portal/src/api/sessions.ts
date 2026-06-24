const API_URL = import.meta.env.VITE_API_URL || '';

export interface ValidatorStamp {
  id: string;
  participantId: string;
  meetingDate: string;
  meetingType: string;
  meetingName: string;
  duration: number;
  locationVerified: boolean;
  cryptographicSignature: string;
  status: 'pending' | 'verified' | 'invalid' | 'active';
  meetsMinimum: boolean;
}

export async function fetchSessions(): Promise<ValidatorStamp[]> {
  const res = await fetch(`${API_URL}/api/sessions`);
  if (!res.ok) throw new Error('Failed to load sessions');
  const data = await res.json();
  return data.sessions;
}

export async function verifySessions(sessionIds: string[]): Promise<number> {
  const res = await fetch(`${API_URL}/api/sessions/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionIds })
  });
  if (!res.ok) throw new Error('Verification failed');
  const data = await res.json();
  return data.verified as number;
}
