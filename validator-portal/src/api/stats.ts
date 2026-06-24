const API_URL = import.meta.env.VITE_API_URL || '';

export interface DashboardStats {
  totalVerifications: number;
  pendingReviews: number;
  invalidStamps: number;
  activeSessions: number;
  activeParticipants: number;
  complianceRate: number;
  recent: Array<{
    id: string;
    participantId: string;
    meetingType: string;
    meetingName: string;
    status: string;
    checkinTime: number;
  }>;
}

export async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/api/stats`);
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}
