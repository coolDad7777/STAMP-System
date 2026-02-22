# CLAUDE.md — STAMP System

## Project Overview

**STAMP** (Secure Tracking & Anonymous Meeting Protocol) is a cryptographically secure, privacy-preserving system that replaces paper attendance cards for court-mandated recovery meetings. It uses **Temporal-Spatial Cryptographic Binding (TSCB)** — dual-lock geohash verification requiring physical check-in AND check-out to generate unforgeable, privacy-preserving proof-of-presence tokens.

The system is designed to simultaneously satisfy compliance verification requirements and 4th Amendment privacy protections.

---

## Repository Structure

```
STAMP-System/
├── backend/                  # Node.js/TypeScript API (Fastify)
│   └── src/
│       ├── server.ts         # Fastify entry point, plugin registration
│       ├── config/config.ts  # Zod-validated env config
│       ├── crypto/           # Core cryptographic engine
│       │   ├── CryptoService.ts   # AES-256-GCM, Ed25519, TSCB
│       │   └── TSCBProtocol.ts    # Temporal-Spatial Cryptographic Binding
│       ├── services/         # Application services
│       │   ├── DatabaseService.ts
│       │   ├── GeohashService.ts
│       │   └── BlockchainVerificationService.ts
│       └── tests/            # Jest unit/integration tests
├── validator-portal/         # React 18 web app (Vite + TypeScript)
│   └── src/
│       ├── main.tsx          # React entry point
│       ├── pages/            # Route-level page components
│       ├── components/       # Reusable UI components
│       │   ├── dashboard/    # Dashboard-specific widgets
│       │   └── ui/           # Base/generic UI components
│       └── stores/           # Zustand state stores (AuthStore.tsx, etc.)
├── mobile/                   # React Native 0.72 (iOS + Android)
├── blockchain/               # Ethereum smart contracts (Solidity)
│   ├── contracts/
│   │   └── JurisdictionVerifier.sol
│   └── scripts/
│       └── deploy-contracts.ts
├── database/
│   ├── init.sql              # DB initialization script
│   └── schemas/
│       └── stamp_schema.sql  # PostgreSQL 15 schema with RLS
├── docs/
│   ├── architecture/
│   │   └── SYSTEM_OVERVIEW.md
│   └── deployment/
│       └── DEPLOYMENT_GUIDE.md
├── scripts/
│   └── setup.sh              # Automated dev environment setup
├── docker-compose.yml        # Full local dev stack
├── package.json              # Root npm workspace config
├── verify-tscb.ts            # Standalone TSCB verification script
├── stamp-demo.html           # Interactive STAMP demo
├── demo-portal.html          # Demo validator portal
├── crypto-verification.html  # Crypto verification demo
└── CLAUDE.md                 # This file
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 20+ LTS |
| Backend framework | Fastify 4 |
| Backend language | TypeScript 5 |
| Frontend | React 18, Vite, Tailwind CSS |
| Frontend routing | TanStack Router |
| Frontend state | Zustand + Immer |
| Mobile | React Native 0.72 (iOS & Android) |
| Mobile state | MobX |
| Smart contracts | Solidity (Ethereum) |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Cryptography | libsodium (XChaCha20-Poly1305, Ed25519), Node.js `crypto` |
| HSM simulator | SoftHSM2 via PKCS#11 |
| Validation | Zod (schema validation throughout) |
| API docs | Swagger/OpenAPI (auto-generated via Fastify) |
| Monitoring | Prometheus + Grafana |

---

## Development Setup

### Prerequisites

- Node.js 20+ LTS
- npm 9+
- Docker & Docker Compose
- React Native CLI (mobile work only)
- Xcode (iOS) / Android Studio (Android)

### Initial Setup

```bash
# 1. Install all workspace dependencies
npm run setup:dev

# 2. Start infrastructure services
docker-compose up -d postgres redis softhsm

# 3. Run migrations
npm run db:migrate

# 4. Generate dev crypto keys
npm run setup:keys
```

### Running Services

```bash
# Backend API (port 3000, debug port 9229)
npm run dev:backend

# Validator Portal (port 3001)
npm run dev:portal

# Mobile (starts Metro bundler)
npm run dev:mobile

# Or start everything via Docker
docker-compose up
```

### Key Service Ports

| Service | Port |
|---|---|
| Backend API | 3000 |
| Validator Portal | 3001 |
| API Docs (Swagger) | 3000/docs |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Prometheus | 9090 |
| Grafana | 3003 |

---

## Build & Test

### Running Tests

```bash
# Run all workspace tests
npm run test:all

# Backend only (Jest)
npm run test --workspace=backend

# Backend with coverage
cd backend && npm run test:coverage

# Validator portal (Vitest)
npm run test --workspace=validator-portal

# Mobile (Jest + React Native preset)
npm run test --workspace=mobile

# Mobile E2E (Detox)
# iOS:     detox test -c ios.sim.debug
# Android: detox test -c android.emu.debug
```

### Building

```bash
# Build all workspaces
npm run build:all

# Backend only (tsc + tsc-alias)
npm run build --workspace=backend

# Validator portal only (tsc + vite build)
npm run build --workspace=validator-portal
```

### Linting

```bash
# Lint all workspaces
npm run lint:all

# Auto-fix
npm run lint:fix --workspace=backend
npm run lint:fix --workspace=validator-portal
```

### Security Audits

```bash
# Full security audit (npm audit + Snyk)
npm run security:audit

# SonarQube static analysis
npm run security:scan
```

---

## Architecture

### Core Flow: Check-in / Check-out

1. **Meeting QR generation** — Server generates a time-locked QR code containing a temporal challenge that rotates every 30 seconds. The challenge is HMAC-keyed with the meeting-specific signing key from the HSM.
2. **Check-in** — Mobile app submits GPS coordinates. Server converts to Precision-7 geohash (~153m accuracy). A TSCB partial proof is generated and stored.
3. **Minimum duration enforcement** — Session must be at least 45 minutes (`SESSION_MIN_DURATION_MS`).
4. **Check-out** — User submits exit location. Server validates the geohash is within 200m of check-in. TSCB proof is completed and signed via Ed25519.
5. **Attendance token** — A verifiable, privacy-preserving token is returned to the user and stored in the database.

### TSCB Protocol

The core cryptographic primitive `TSCBProtocol` (`backend/src/crypto/TSCBProtocol.ts`) implements:

- **Temporal challenge**: HMAC-SHA256 keyed per meeting, rotating every 30 seconds. Prevents pre-generation.
- **Spatial commitment**: SHA-256 of `geohash + temporal_challenge + user_secret`. Precision-7 only (privacy enforcement).
- **Binding proof**: SHA-256 of `temporal_challenge || spatial_commitment || user_secret`.
- **Ed25519 signature**: Signs the binding proof, providing non-repudiation.
- **Zero-knowledge proof**: `generateZeroKnowledgeProof()` produces a verifiable attendance commitment without exposing raw coordinates.

### Privacy Architecture

- Raw GPS coordinates are **never stored** — only Precision-7 geohashes (~153m cell).
- User identities are **pseudonymous** — `SHA256(user_pseudonym)` hash stored, never PII.
- Cross-jurisdiction verification uses blockchain ZK proofs, not data sharing.
- Differential privacy is applied to all aggregate analytics.

### Key Management Hierarchy

```
Master Key (HSM Root)
  └── Tenant Keys (Per Jurisdiction)
       └── Meeting Keys (Per Session)
            └── User Session Keys (Ephemeral)
```

Development bypasses HSM (`BYPASS_HSM=true`). Production **must** use real HSM via PKCS#11.

---

## Configuration

All configuration is validated at startup via Zod (`backend/src/config/config.ts`). Missing or invalid values cause immediate failure with a clear error message.

### Critical Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `REDIS_URL` | Redis connection string | required |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | required |
| `ENCRYPTION_KEY` | Master encryption key (exactly 32 chars) | required |
| `HSM_PKCS11_LIB` | Path to PKCS#11 library | optional |
| `BYPASS_HSM` | Use software keys instead of HSM | `false` |
| `GEOHASH_PRECISION` | Geohash precision level | `7` |
| `LOCATION_TOLERANCE_METERS` | Max check-in/check-out distance | `200` |
| `SESSION_MIN_DURATION_MS` | Minimum meeting duration (ms) | `2700000` (45 min) |
| `QR_ROTATION_INTERVAL_MS` | QR challenge rotation period (ms) | `30000` (30 sec) |
| `NODE_ENV` | Environment (`development`/`staging`/`production`) | `development` |

**Production guards** — The config module throws hard errors if `NODE_ENV=production` and:
- `JWT_SECRET` is still the dev default value
- `ENCRYPTION_KEY` is still the dev default value
- `BYPASS_HSM=true`

---

## Coding Conventions

### TypeScript

- Strict TypeScript throughout all workspaces.
- Zod schemas are the source of truth for data validation — validate at API boundaries, not internally.
- Use `timingSafeEqual` (from Node `crypto`) for all cryptographic comparisons. Never use `===` to compare secrets or hashes.
- All crypto operations are `async` and wrapped in try/catch; errors are logged but never expose internals to API responses in production.

### Backend (Fastify)

- Routes are auto-loaded from `src/routes/` via `@fastify/autoload`.
- Plugins are auto-loaded from `src/plugins/`.
- Every route must include a `schema` property for request/response validation and Swagger generation.
- Rate limiting is applied globally (100 req/min by default). Stricter limits should be applied per-route for sensitive endpoints.
- JWT tokens expire in 15 minutes (`expiresIn: '15m'`). Use refresh token flow for longer sessions.

### Frontend (Validator Portal)

- React Query (`@tanstack/react-query`) handles all server state and caching.
- Zustand + Immer for local UI state (`validator-portal/src/stores/`).
- React Hook Form + Zod resolvers for all forms.
- Tailwind CSS for styling; use `clsx` and `tailwind-merge` for conditional classes.
- Components in `src/components/` must be reusable and not contain page-level business logic.

### Mobile (React Native)

- MobX with `mobx-react-lite` for state management.
- Secure storage via `react-native-keychain` for private keys and tokens. Never use AsyncStorage for sensitive data.
- Biometric authentication via `react-native-biometrics`.
- Camera/QR scanning via `react-native-vision-camera`.
- Jest for unit tests; Detox for E2E tests.

### Database

- PostgreSQL schema uses Row Level Security (RLS) for tenant isolation.
- All sensitive fields are AES-256-GCM encrypted at the application layer before storage.
- UUIDs are used as primary keys (`uuid_generate_v4()`).
- Every table includes `created_at`, `updated_at`, `created_by`, `updated_by` audit fields.
- Geohash columns are `VARCHAR(7)` — never store raw lat/lng for user location data.
- Audit retention is 7 years (2555 days) by default per `AUDIT_RETENTION_DAYS`.

---

## Security Requirements

**Never relax these constraints without an explicit security review:**

1. **Constant-time comparisons** — All cryptographic value comparisons must use `timingSafeEqual`. Timing attacks are a real threat in this domain.
2. **Geohash precision** — User location must be stored/transmitted at exactly Precision-7. Precision 8+ is a privacy violation. The `validateSpatialCommitment()` method rejects non-7 precision.
3. **HSM in production** — `BYPASS_HSM` must be `false` in production. The config module enforces this.
4. **No raw coordinates stored** — Never write raw `lat`/`lng` values to the database for user attendance records.
5. **Error messages** — Production error handler returns generic `"Internal Server Error"` only. Stack traces and internal messages must never reach API consumers.
6. **Audit logs** — All check-in, check-out, verification, key rotation, and auth failure events must be written to the audit log with immutable hash chain integrity.
7. **CORS** — Allowed origins are configured via `ALLOWED_ORIGINS` env var. Do not use wildcard `*` in any environment.
8. **Secrets in `.env`** — `.env` files are gitignored. Never commit credentials, keys, or certificates to the repository.

---

## Compliance Notes

The system is designed around several compliance frameworks. Do not add features that compromise:

- **HIPAA Title II** — PHI must remain encrypted; access controls and audit trails are mandatory.
- **4th Amendment** — No continuous location tracking. Location data is collected only during active check-in/check-out. `data_retention_expires` must be set on all participant records.
- **GDPR/CCPA** — Privacy requests (`privacy_request_type` enum in DB) must be processed. Data subject rights (access, erasure, portability) are built into the schema.

---

## Docker Compose Services

The `docker-compose.yml` provides a full local dev stack:

| Service | Purpose | Notes |
|---|---|---|
| `postgres` | Primary database | Port 5432, init script at `database/init.sql` |
| `redis` | Session cache, rate limiting | Port 6379, AOF persistence enabled |
| `softhsm` | HSM simulator for dev | `opendnssec/softhsm2` image |
| `backend` | API server | Port 3000 + 9229 (debug) |
| `validator-portal` | React web app | Port 3001 |
| `nginx` | Reverse proxy | Ports 80/443 |
| `prometheus` | Metrics collection | Port 9090 |
| `grafana` | Metrics dashboards | Port 3003, admin/admin |

---

## Deployment

```bash
# Staging
npm run deploy:staging  # build:all + docker:build + scripts/deploy-staging.sh

# Production (also runs security audit + full test suite first)
npm run deploy:prod     # security:audit + test:all + scripts/deploy-production.sh
```

Production deployment requires all tests to pass and the security audit to be clean.

---

## Key Documentation

- `docs/architecture/SYSTEM_OVERVIEW.md` — Detailed system architecture with Mermaid diagrams
- `docs/deployment/DEPLOYMENT_GUIDE.md` — Kubernetes, staging/production setup, DB backup/recovery, security hardening
- `database/schemas/stamp_schema.sql` — Full PostgreSQL schema
- `backend/src/config/config.ts` — All configuration options and defaults
- `backend/src/tests/TSCBProtocol.test.ts` — Security tests documenting attack vectors
- `verify-tscb.ts` — Standalone script for manual TSCB verification
- `3000/docs` (when running) — Live Swagger API documentation
