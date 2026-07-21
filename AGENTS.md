# STAMP — Agent Notes

STAMP (Secure Tracking & Anonymous Meeting Protocol) is a court-mandated attendance verification prototype. The core protocol is TSCB (Temporal-Spatial Cryptographic Binding): geohash + time-epoch + Ed25519-signed proof-of-presence tokens.

See `README.md` for the product overview and `docs/` for architecture/deployment notes.

## Current Development Goal

Prioritize a boring, working vertical slice over new conceptual expansion:

1. backend starts locally with development defaults
2. participant check-in creates a signed session proof
3. participant check-out uses server-authoritative duration
4. verifier endpoint and `stamp_verify` can validate records
5. validator portal can run against the backend

Do not add more blockchain, federated learning, HSM, Kubernetes, or compliance-claim surface area until the core check-in/check-out flow is tested end to end.

## Repo Layout

This is an npm-workspaces monorepo:

- `backend` — Node/TypeScript API
- `mobile` — React Native app
- `validator-portal` — React/Vite portal

It also contains non-workspace components:

- `stamp_verify` — offline attendance-record verifier
- `serve.js` + static `*.html` demos
- `blockchain` — experimental smart contract materials
- `database` — schema/migration material

## Install

Use:

```bash
npm run setup:dev
```

This currently runs `npm install`. Do not reintroduce missing setup scripts unless they are committed and tested.

## Run Commands

```bash
npm run dev:backend
npm run dev:portal
npm run dev:demo
npm run test:backend
```

The backend has development defaults. If Postgres is unavailable, `DatabaseService` falls back to mock mode.

## Static Demo Portal

`node serve.js` serves `demo-portal.html` at:

```text
http://localhost:3002/demo-portal.html
```

The static demo is useful for investor/product walkthroughs, but it is not proof that the full monorepo is production-ready.

## `stamp_verify` CLI

The offline verifier lives in `stamp_verify/`:

```bash
cd stamp_verify
node verify.js <record.json> --facility-key <hex-ed25519-pubkey> [--master-key <hex>]
```

Exit code `0` means PASS. Exit code `1` means FAIL.

## Known Constraints

- Mobile still requires a real React Native local setup with Xcode or Android tooling.
- Docker Compose is only reliable for image-backed services that actually exist in the repo.
- The blockchain service is currently a buildable local adapter, not a deployed chain integration.
- Compliance references are requirements and review targets, not completed certifications.
- Production must not use development secrets or ephemeral facility keys.

## Engineering Rules

- Fix install/build/test blockers before adding features.
- Keep compliance wording factual and conservative.
- Treat government, court, probation, health, and recovery data as sensitive by default.
- Do not store legal names, precise location trails, or recovery-meeting details in proof records unless a reviewed product requirement demands it.
