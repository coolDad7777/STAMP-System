# STAMP: Secure Tracking & Anonymous Meeting Protocol

## Overview

STAMP is a prototype court-mandated attendance verification system that replaces forgeable paper cards with privacy-preserving digital attendance records. The current working core focuses on temporal-spatial cryptographic binding: users check in and check out from meeting locations, and the system produces signed proof-of-presence records that can be independently verified.

## Current Scope

This repository is in prototype stabilization. The working target is a practical vertical slice:

1. A participant checks in with a pseudonymous Ed25519 key, current timestamp, and location.
2. The backend verifies key ownership and creates a server-side session.
3. The participant checks out against the same session.
4. The backend reports duration using server time, not client-supplied time.
5. A verifier can check signed TSCB attendance records.

## Key Concepts

1. **Temporal-Spatial Cryptographic Binding (TSCB)** - Binds attendance proofs to time windows and geographic boundaries.
2. **Pseudonymous participant keys** - Participants prove key ownership without putting a legal name into the proof itself.
3. **Server-authoritative duration** - Check-in and check-out duration uses server wall-clock time.
4. **Offline verification path** - The `stamp_verify` CLI can audit attendance records independently.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mobile App    │    │  Validator      │    │  Backend        │
│                 │    │  Portal         │    │  Services       │
│ • Check-in/out  │    │ • Verification  │    │ • Crypto Engine │
│ • QR Scanning   │◄──►│ • Compliance    │◄──►│ • Geohash       │
│ • Offline Mode  │    │ • Reporting     │    │ • Audit Logs    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                              ┌─────────────────┐
                                              │  Database       │
                                              │                 │
                                              │ • Encrypted     │
                                              │ • Auditable     │
                                              │ • Compliant     │
                                              └─────────────────┘
```

## Project Structure

```
stamp-system/
├── backend/                 # Node.js/TypeScript API services
├── mobile/                  # React Native mobile application
├── validator-portal/        # React web application for validators
├── blockchain/              # Experimental smart contract materials
├── database/                # PostgreSQL schemas, migrations, seeds
├── stamp_verify/            # Offline verification CLI
└── docs/                    # Architecture, API, and compliance documentation
```

## Quick Start

### Prerequisites

- Node.js 20+ LTS
- npm 9+
- Optional: PostgreSQL 15+ and Redis 7+ for non-mock local services

### Development Setup

1. **Install dependencies**

   ```bash
   npm run setup:dev
   ```

2. **Run the backend**

   ```bash
   npm run dev:backend
   ```

   The backend now has development defaults. If PostgreSQL is unavailable, it falls back to mock database mode.

3. **Run the validator portal**

   ```bash
   npm run dev:portal
   ```

4. **Run the static demo portal**

   ```bash
   npm run dev:demo
   ```

   Then open `http://localhost:3002/demo-portal.html`.

5. **Run backend tests**

   ```bash
   npm run test:backend
   ```

## Security Features Under Development

- Ed25519 signing for proof verification
- HMAC-backed time challenges
- Precision-7 geohash location commitment
- Server-authoritative session duration
- Constant-time hash comparison where applicable
- Pseudonymous participant identifiers

## Compliance Status

STAMP is **not yet certified or audited** for HIPAA, SOC 2, GDPR, CCPA, court-system deployment, or law-enforcement deployment. Those are product requirements and review targets, not completed compliance claims.

Before production or government use, STAMP needs legal review, security review, privacy-impact review, documented policies, audit controls, data-retention rules, incident response procedures, and any required third-party assessments.

## License

Proprietary - All rights reserved

## Contact

For questions about STAMP implementation, security reviews, or deployment assistance, please contact the development team.
