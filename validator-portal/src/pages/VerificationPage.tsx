import React, { useState } from 'react';
import { CheckCircleIcon, ExclamationIcon, UploadIcon } from '@heroicons/react/outline';
import toast from 'react-hot-toast';

interface AttendanceStamp {
  id: string;
  participantId: string;
  meetingDate: string;
  meetingType: string;
  duration: number;
  locationVerified: boolean;
  cryptographicSignature: string;
  status: 'pending' | 'verified' | 'invalid';
}

const mockStamps: AttendanceStamp[] = [
  {
    id: 'stamp_001',
    participantId: 'P-1234',
    meetingDate: '2024-01-15',
    meetingType: 'AA Meeting',
    duration: 3600, // seconds
    locationVerified: true,
    cryptographicSignature: 'ed25519:a7b9c8d2e...',
    status: 'pending',
  },
  {
    id: 'stamp_002',
    participantId: 'P-5678',
    meetingDate: '2024-01-15',
    meetingType: 'NA Meeting',
    duration: 2700,
    locationVerified: true,
    cryptographicSignature: 'ed25519:f3e1d4a5b...',
    status: 'pending',
  },
  {
    id: 'stamp_003',
    participantId: 'P-9012',
    meetingDate: '2024-01-14',
    meetingType: 'Group Therapy',
    duration: 3300,
    locationVerified: false,
    cryptographicSignature: 'ed25519:invalid_sig',
    status: 'invalid',
  },
];

export function VerificationPage() {
  const [stamps, setStamps] = useState<AttendanceStamp[]>(mockStamps);
  const [selectedStamps, setSelectedStamps] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectAll = () => {
    if (selectedStamps.length === stamps.filter(s => s.status === 'pending').length) {
      setSelectedStamps([]);
    } else {
      setSelectedStamps(stamps.filter(s => s.status === 'pending').map(s => s.id));
    }
  };

  const handleSelectStamp = (stampId: string) => {
    setSelectedStamps(prev => 
      prev.includes(stampId) 
        ? prev.filter(id => id !== stampId)
        : [...prev, stampId]
    );
  };

  const handleBulkVerify = async () => {
    if (selectedStamps.length === 0) {
      toast.error('Please select stamps to verify');
      return;
    }

    setIsProcessing(true);
    
    try {
      // Simulate verification process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setStamps(prev => 
        prev.map(stamp => 
          selectedStamps.includes(stamp.id)
            ? { ...stamp, status: 'verified' as const }
            : stamp
        )
      );
      
      setSelectedStamps([]);
      toast.success(`${selectedStamps.length} stamps verified successfully`);
    } catch (error) {
      toast.error('Verification failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSingleVerify = async (stampId: string) => {
    setIsProcessing(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setStamps(prev => 
        prev.map(stamp => 
          stamp.id === stampId
            ? { ...stamp, status: 'verified' as const }
            : stamp
        )
      );
      
      toast.success('Stamp verified successfully');
    } catch (error) {
      toast.error('Verification failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: AttendanceStamp['status']) => {
    switch (status) {
      case 'verified':
        return <span className="badge-success">Verified</span>;
      case 'invalid':
        return <span className="badge-danger">Invalid</span>;
      default:
        return <span className="badge-warning">Pending</span>;
    }
  };

  const pendingStamps = stamps.filter(s => s.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stamp Verification</h2>
          <p className="mt-1 text-sm text-gray-700">
            Verify attendance stamps and process compliance records
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button className="btn-secondary">
            <UploadIcon className="w-4 h-4 mr-2" />
            Import Stamps
          </button>
          {selectedStamps.length > 0 && (
            <button
              onClick={handleBulkVerify}
              disabled={isProcessing}
              className="btn-primary"
            >
              {isProcessing ? (
                <>
                  <div className="loading-spinner mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4 mr-2" />
                  Verify Selected ({selectedStamps.length})
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="w-8 h-8 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="stat-label">Verified Today</p>
              <p className="stat-value">{stamps.filter(s => s.status === 'verified').length}</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ExclamationIcon className="w-8 h-8 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="stat-label">Pending Review</p>
              <p className="stat-value">{pendingStamps.length}</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ExclamationIcon className="w-8 h-8 text-danger-600" />
            </div>
            <div className="ml-4">
              <p className="stat-label">Invalid Stamps</p>
              <p className="stat-value">{stamps.filter(s => s.status === 'invalid').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Verification table */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Attendance Stamps</h3>
          <p className="text-sm text-gray-500">
            Review and verify submitted attendance stamps
          </p>
        </div>
        
        <div className="overflow-hidden">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    checked={selectedStamps.length === pendingStamps.length && pendingStamps.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="table-header-cell">Participant ID</th>
                <th className="table-header-cell">Meeting Details</th>
                <th className="table-header-cell">Duration</th>
                <th className="table-header-cell">Location</th>
                <th className="table-header-cell">Status</th>
                <th className="table-header-cell">Actions</th>
              </tr>
            </thead>
            <tbody className="table-body">
              {stamps.map((stamp) => (
                <tr key={stamp.id} className="table-row">
                  <td className="table-cell">
                    {stamp.status === 'pending' && (
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        checked={selectedStamps.includes(stamp.id)}
                        onChange={() => handleSelectStamp(stamp.id)}
                      />
                    )}
                  </td>
                  <td className="table-cell">
                    <div className="font-mono text-sm">{stamp.participantId}</div>
                  </td>
                  <td className="table-cell">
                    <div>
                      <div className="font-medium text-gray-900">{stamp.meetingType}</div>
                      <div className="text-sm text-gray-500">{stamp.meetingDate}</div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm">
                      {Math.floor(stamp.duration / 60)} minutes
                    </div>
                  </td>
                  <td className="table-cell">
                    {stamp.locationVerified ? (
                      <CheckCircleIcon className="w-5 h-5 text-success-600" />
                    ) : (
                      <ExclamationIcon className="w-5 h-5 text-danger-600" />
                    )}
                  </td>
                  <td className="table-cell">
                    {getStatusBadge(stamp.status)}
                  </td>
                  <td className="table-cell">
                    {stamp.status === 'pending' && (
                      <button
                        onClick={() => handleSingleVerify(stamp.id)}
                        disabled={isProcessing}
                        className="text-brand-600 hover:text-brand-900 text-sm font-medium"
                      >
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}