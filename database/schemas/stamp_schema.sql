-- STAMP Database Schema
-- Secure Tracking & Anonymous Meeting Protocol
-- PostgreSQL 15+ with Row Level Security and Encryption

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Custom types for enhanced data integrity
CREATE TYPE attendance_status AS ENUM ('checked_in', 'completed', 'expired', 'invalidated');
CREATE TYPE verification_result AS ENUM ('valid', 'invalid', 'expired', 'tampered');
CREATE TYPE audit_event_type AS ENUM ('checkin', 'checkout', 'verification', 'key_rotation', 'auth_failure', 'privacy_request');
CREATE TYPE privacy_request_type AS ENUM ('access', 'rectification', 'erasure', 'portability', 'objection');
CREATE TYPE user_role AS ENUM ('participant', 'probation_officer', 'court_administrator', 'auditor', 'system_admin');

-- Core participant table (pseudonymous identities)
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pseudonym_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA256 of user pseudonym
    encrypted_court_ref TEXT NOT NULL, -- AES-256-GCM encrypted court reference
    device_fingerprint_hash VARCHAR(64) NOT NULL,
    registration_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
    
    -- Privacy and compliance fields
    consent_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    consent_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_retention_expires TIMESTAMP WITH TIME ZONE,
    
    -- Row-level security labels
    tenant_id UUID NOT NULL,
    data_classification VARCHAR(20) DEFAULT 'restricted',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Constraints
    CONSTRAINT participants_pseudonym_unique UNIQUE (pseudonym_hash),
    CONSTRAINT participants_tenant_valid CHECK (tenant_id IS NOT NULL),
    CONSTRAINT participants_status_valid CHECK (status IN ('active', 'suspended', 'terminated'))
);

-- Indexes for performance optimization
CREATE INDEX idx_participants_tenant ON participants (tenant_id);
CREATE INDEX idx_participants_status ON participants (status) WHERE status = 'active';
CREATE INDEX idx_participants_last_activity ON participants (last_activity);
CREATE INDEX idx_participants_expiry ON participants (data_retention_expires) WHERE data_retention_expires IS NOT NULL;

-- Meeting locations with geospatial constraints
CREATE TABLE meeting_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_name VARCHAR(255) NOT NULL,
    geohash_precision7 VARCHAR(7) NOT NULL, -- Precision-7 geohash (153m accuracy)
    encrypted_address TEXT, -- AES-256-GCM encrypted full address
    meeting_type VARCHAR(50) NOT NULL,
    
    -- Geospatial constraints for validation
    latitude_center DECIMAL(10, 8) NOT NULL,
    longitude_center DECIMAL(11, 8) NOT NULL,
    location_radius_meters INTEGER NOT NULL DEFAULT 200,
    
    -- Temporal constraints
    active_hours TSTZRANGE[], -- Array of active time ranges
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Validation constraints
    CONSTRAINT meeting_locations_geohash_valid CHECK (char_length(geohash_precision7) = 7),
    CONSTRAINT meeting_locations_radius_positive CHECK (location_radius_meters > 0),
    CONSTRAINT meeting_locations_lat_valid CHECK (latitude_center >= -90 AND latitude_center <= 90),
    CONSTRAINT meeting_locations_lng_valid CHECK (longitude_center >= -180 AND longitude_center <= 180)
);

-- Spatial and performance indexes
CREATE INDEX idx_meeting_locations_geohash ON meeting_locations USING GIN (geohash_precision7);
CREATE INDEX idx_meeting_locations_tenant ON meeting_locations (tenant_id);
CREATE INDEX idx_meeting_locations_type ON meeting_locations (meeting_type);
CREATE INDEX idx_meeting_locations_active ON meeting_locations (is_active) WHERE is_active = true;

-- Scheduled meetings with cryptographic key management
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES meeting_locations(id) ON DELETE RESTRICT,
    meeting_name VARCHAR(255),
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    
    -- Duration constraints
    minimum_duration INTERVAL DEFAULT '45 minutes',
    maximum_duration INTERVAL DEFAULT '4 hours',
    grace_period INTERVAL DEFAULT '15 minutes',
    
    -- QR code and cryptographic metadata
    qr_rotation_interval INTERVAL DEFAULT '30 seconds',
    last_qr_generation TIMESTAMP WITH TIME ZONE,
    qr_generation_count INTEGER DEFAULT 0,
    
    -- Cryptographic keys (encrypted with master key)
    encrypted_meeting_key TEXT NOT NULL, -- AES-256-GCM encrypted
    key_derivation_salt BYTEA NOT NULL,
    key_version INTEGER DEFAULT 1,
    
    -- Meeting status and metadata
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Validation constraints
    CONSTRAINT meetings_duration_valid CHECK (scheduled_end > scheduled_start),
    CONSTRAINT meetings_min_duration_positive CHECK (minimum_duration > INTERVAL '0'),
    CONSTRAINT meetings_max_duration_reasonable CHECK (maximum_duration <= INTERVAL '8 hours'),
    CONSTRAINT meetings_participant_count_valid CHECK (current_participants >= 0)
);

-- Performance indexes for meetings
CREATE INDEX idx_meetings_schedule ON meetings (scheduled_start, scheduled_end);
CREATE INDEX idx_meetings_location ON meetings (location_id);
CREATE INDEX idx_meetings_tenant ON meetings (tenant_id);
CREATE INDEX idx_meetings_status ON meetings (status);
CREATE INDEX idx_meetings_active ON meetings (scheduled_start, scheduled_end) WHERE status IN ('scheduled', 'active');

-- Attendance sessions with comprehensive tracking
CREATE TABLE attendance_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
    
    -- Check-in data
    checkin_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    checkin_geohash VARCHAR(7) NOT NULL,
    checkin_device_fingerprint VARCHAR(128) NOT NULL,
    checkin_ip_hash VARCHAR(64), -- Hashed IP for audit
    
    -- Check-out data (nullable until check-out occurs)
    checkout_timestamp TIMESTAMP WITH TIME ZONE,
    checkout_geohash VARCHAR(7),
    checkout_device_fingerprint VARCHAR(128),
    checkout_ip_hash VARCHAR(64),
    
    -- Session metadata and validation
    session_duration INTERVAL,
    location_variance_meters NUMERIC(8,2), -- Distance between check-in/out
    device_consistency_verified BOOLEAN DEFAULT false,
    temporal_constraints_met BOOLEAN DEFAULT false,
    spatial_constraints_met BOOLEAN DEFAULT false,
    
    -- Session status
    status attendance_status NOT NULL DEFAULT 'checked_in',
    failure_reason TEXT, -- Details if session fails validation
    
    -- Cryptographic proof data
    encrypted_session_data TEXT NOT NULL, -- AES-256-GCM encrypted session details
    tscb_proof JSONB, -- Temporal-Spatial Cryptographic Binding proof
    integrity_hash VARCHAR(64) NOT NULL, -- SHA256 of all session data
    cryptographic_signature TEXT, -- Ed25519 signature (set on completion)
    
    -- Anti-replay and security
    nonce BYTEA NOT NULL UNIQUE,
    session_token VARCHAR(128), -- Temporary session identifier
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Validation constraints
    CONSTRAINT attendance_sessions_nonce_unique UNIQUE (nonce),
    CONSTRAINT attendance_sessions_checkin_required CHECK (
        checkin_timestamp IS NOT NULL AND 
        checkin_geohash IS NOT NULL AND 
        checkin_device_fingerprint IS NOT NULL
    ),
    CONSTRAINT attendance_sessions_checkout_complete CHECK (
        (status = 'checked_in' AND checkout_timestamp IS NULL) OR
        (status != 'checked_in' AND checkout_timestamp IS NOT NULL)
    ),
    CONSTRAINT attendance_sessions_geohash_valid CHECK (
        char_length(checkin_geohash) = 7 AND
        (checkout_geohash IS NULL OR char_length(checkout_geohash) = 7)
    )
);

-- Comprehensive indexes for attendance sessions
CREATE INDEX idx_attendance_sessions_participant ON attendance_sessions (participant_id);
CREATE INDEX idx_attendance_sessions_meeting ON attendance_sessions (meeting_id);
CREATE INDEX idx_attendance_sessions_status ON attendance_sessions (status);
CREATE INDEX idx_attendance_sessions_checkin_time ON attendance_sessions (checkin_timestamp);
CREATE INDEX idx_attendance_sessions_integrity ON attendance_sessions (integrity_hash);
CREATE INDEX idx_attendance_sessions_expires ON attendance_sessions (expires_at) WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX idx_attendance_sessions_participant_meeting_date ON attendance_sessions 
    (participant_id, meeting_id, DATE(checkin_timestamp));

-- Verification records for probation officer validations
CREATE TABLE verification_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
    validator_id UUID NOT NULL, -- Encrypted probation officer identifier
    validator_role user_role NOT NULL DEFAULT 'probation_officer',
    verification_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Verification results
    verification_result verification_result NOT NULL,
    cryptographic_proof_valid BOOLEAN NOT NULL,
    location_proof_valid BOOLEAN NOT NULL,
    duration_requirements_met BOOLEAN NOT NULL,
    device_consistency_valid BOOLEAN NOT NULL,
    temporal_constraints_valid BOOLEAN NOT NULL,
    
    -- Zero-knowledge proof data for privacy-preserving verification
    zkp_challenge BYTEA NOT NULL,
    zkp_response BYTEA NOT NULL,
    proof_verification_hash VARCHAR(64) NOT NULL,
    verification_confidence NUMERIC(3,2) DEFAULT 1.0, -- 0.00 to 1.00
    
    -- Additional validation metadata
    verification_method VARCHAR(50) NOT NULL DEFAULT 'manual_verification',
    batch_verification_id UUID, -- For bulk verifications
    verification_duration_ms INTEGER, -- Time taken to verify
    
    -- Audit trail for verification process
    client_ip_hash VARCHAR(64), -- Hashed IP for audit
    user_agent_hash VARCHAR(64), -- Hashed user agent
    session_id_validator VARCHAR(128), -- Validator's session
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Validation constraints
    CONSTRAINT verification_records_confidence_valid CHECK (verification_confidence BETWEEN 0.0 AND 1.0),
    CONSTRAINT verification_records_result_consistency CHECK (
        (verification_result = 'valid' AND cryptographic_proof_valid = true AND 
         location_proof_valid = true AND duration_requirements_met = true) OR
        (verification_result != 'valid')
    )
);

-- Indexes for verification records
CREATE INDEX idx_verification_records_session ON verification_records (session_id);
CREATE INDEX idx_verification_records_validator ON verification_records (validator_id);
CREATE INDEX idx_verification_records_result ON verification_records (verification_result);
CREATE INDEX idx_verification_records_timestamp ON verification_records (verification_timestamp);
CREATE INDEX idx_verification_records_batch ON verification_records (batch_verification_id) WHERE batch_verification_id IS NOT NULL;

-- Cryptographic key management with rotation support
CREATE TABLE encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_type VARCHAR(50) NOT NULL CHECK (key_type IN ('master', 'session', 'signing', 'verification', 'archive')),
    key_version INTEGER NOT NULL,
    key_purpose VARCHAR(100), -- Specific use case for the key
    
    -- Encrypted key material (encrypted with HSM/KMS)
    encrypted_key_material TEXT NOT NULL,
    key_derivation_info JSONB NOT NULL,
    key_algorithm VARCHAR(50) NOT NULL, -- AES-256-GCM, Ed25519, etc.
    key_length INTEGER NOT NULL,
    
    -- Key lifecycle management
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    
    -- Key usage tracking
    usage_count BIGINT DEFAULT 0,
    max_usage_count BIGINT,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    created_by UUID,
    
    -- Validation constraints
    CONSTRAINT encryption_keys_version_type_unique UNIQUE (key_type, key_version, tenant_id),
    CONSTRAINT encryption_keys_lifecycle_valid CHECK (
        expires_at > created_at AND
        (activated_at IS NULL OR activated_at >= created_at) AND
        (revoked_at IS NULL OR revoked_at >= created_at)
    ),
    CONSTRAINT encryption_keys_usage_valid CHECK (
        usage_count >= 0 AND
        (max_usage_count IS NULL OR usage_count <= max_usage_count)
    )
);

-- Indexes for key management
CREATE INDEX idx_encryption_keys_type_version ON encryption_keys (key_type, key_version);
CREATE INDEX idx_encryption_keys_active ON encryption_keys (key_type, expires_at) 
    WHERE revoked_at IS NULL AND expires_at > NOW();
CREATE INDEX idx_encryption_keys_tenant ON encryption_keys (tenant_id);
CREATE INDEX idx_encryption_keys_expiry ON encryption_keys (expires_at);

-- Immutable audit log with hash chain integrity
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type audit_event_type NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    -- Event context and relationships
    participant_id UUID, -- May be NULL for system events
    session_id UUID,
    meeting_id UUID,
    validator_id UUID,
    related_entity_id UUID, -- Generic reference to other entities
    related_entity_type VARCHAR(50), -- Type of related entity
    
    -- Event details (encrypted for privacy)
    encrypted_event_data TEXT NOT NULL,
    event_summary TEXT, -- Non-sensitive summary for search
    severity VARCHAR(10) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical')),
    
    -- Tamper detection and integrity
    event_hash VARCHAR(64) NOT NULL, -- SHA256 of all event data
    previous_event_hash VARCHAR(64), -- Hash chain for tamper detection
    merkle_tree_path BYTEA, -- Merkle tree inclusion proof
    block_number BIGINT, -- For blockchain-style integrity
    
    -- Request metadata (hashed for privacy)
    client_ip_hash VARCHAR(64),
    user_agent_hash VARCHAR(64),
    request_id UUID,
    correlation_id UUID, -- For tracing across services
    
    -- Geographic and temporal metadata
    event_location_geohash VARCHAR(7), -- Where the event occurred (if applicable)
    processing_duration_ms INTEGER, -- How long the event took to process
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    service_name VARCHAR(50) DEFAULT 'stamp-api',
    service_version VARCHAR(20),
    
    -- Validation constraints
    CONSTRAINT audit_events_hash_not_empty CHECK (char_length(event_hash) = 64),
    CONSTRAINT audit_events_severity_valid CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical'))
);

-- Indexes for audit events (optimized for search and integrity verification)
CREATE INDEX idx_audit_events_timestamp ON audit_events (event_timestamp DESC);
CREATE INDEX idx_audit_events_type ON audit_events (event_type);
CREATE INDEX idx_audit_events_participant ON audit_events (participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX idx_audit_events_session ON audit_events (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_audit_events_hash_chain ON audit_events (previous_event_hash);
CREATE INDEX idx_audit_events_tenant ON audit_events (tenant_id);
CREATE INDEX idx_audit_events_severity ON audit_events (severity) WHERE severity IN ('error', 'critical');
CREATE INDEX idx_audit_events_correlation ON audit_events (correlation_id) WHERE correlation_id IS NOT NULL;

-- Privacy request tracking for GDPR/CCPA compliance
CREATE TABLE privacy_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_type privacy_request_type NOT NULL,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    pseudonym_hash VARCHAR(64), -- In case participant is deleted
    
    -- Request details
    request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    requested_by VARCHAR(255), -- Email or identifier of requester
    verification_method VARCHAR(50), -- How identity was verified
    legal_basis TEXT, -- Legal justification for the request
    
    -- Processing details
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    assigned_to UUID, -- Staff member handling the request
    processing_started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    -- Results and artifacts
    export_file_path TEXT, -- For data export requests
    export_file_hash VARCHAR(64), -- Integrity check
    actions_taken JSONB, -- What was done to fulfill the request
    
    -- Compliance tracking
    response_deadline TIMESTAMP WITH TIME ZONE, -- Legal deadline (usually 30 days)
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for privacy request management
CREATE INDEX idx_privacy_requests_participant ON privacy_requests (participant_id);
CREATE INDEX idx_privacy_requests_status ON privacy_requests (status);
CREATE INDEX idx_privacy_requests_deadline ON privacy_requests (response_deadline) WHERE response_deadline IS NOT NULL;
CREATE INDEX idx_privacy_requests_tenant ON privacy_requests (tenant_id);

-- Data retention policy configuration
CREATE TABLE data_retention_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    retention_period INTERVAL NOT NULL,
    anonymization_period INTERVAL,
    
    -- Retention rules
    cascade_delete BOOLEAN DEFAULT false,
    soft_delete BOOLEAN DEFAULT true,
    archive_before_delete BOOLEAN DEFAULT true,
    
    -- Policy metadata
    policy_name VARCHAR(255),
    description TEXT,
    legal_basis TEXT,
    
    -- Administrative fields
    tenant_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    
    CONSTRAINT data_retention_policies_table_tenant_unique UNIQUE (table_name, tenant_id),
    CONSTRAINT data_retention_policies_retention_positive CHECK (retention_period > INTERVAL '0')
);

-- Enable Row Level Security on all sensitive tables
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for multi-tenancy
CREATE POLICY participants_tenant_isolation ON participants
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY attendance_sessions_tenant_isolation ON attendance_sessions
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY verification_records_tenant_isolation ON verification_records
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY audit_events_tenant_isolation ON audit_events
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY privacy_requests_tenant_isolation ON privacy_requests
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY encryption_keys_tenant_isolation ON encryption_keys
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Create indexes for tenant isolation
CREATE INDEX idx_participants_tenant_rls ON participants (tenant_id);
CREATE INDEX idx_attendance_sessions_tenant_rls ON attendance_sessions (tenant_id);
CREATE INDEX idx_verification_records_tenant_rls ON verification_records (tenant_id);
CREATE INDEX idx_audit_events_tenant_rls ON audit_events (tenant_id);
CREATE INDEX idx_privacy_requests_tenant_rls ON privacy_requests (tenant_id);
CREATE INDEX idx_encryption_keys_tenant_rls ON encryption_keys (tenant_id);