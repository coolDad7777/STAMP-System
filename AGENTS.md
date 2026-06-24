# STAMP — Agent Notes

STAMP (Secure Tracking & Anonymous Meeting Protocol) is a court-mandated attendance
verification system. The core protocol is TSCB (Temporal-Spatial Cryptographic Binding):
geohash + time-epoch + Ed25519-signed proof-of-presence tokens.

See `README.md` for the product overview and `docs/` for architecture/deployment.

## Cursor Cloud specific instructions

This is an npm-workspaces monorepo (`backend`, `mobile`, `validator-portal`) plus several
non-workspace components (`stamp_verify`, `serve.js` + static `*.html` demos, `blockchain`,
`database`). Node 20+/npm 9+ (VM has Node 22). Docker is NOT installed in this VM.

### Install
- Install with `npm install --legacy-peer-deps`. The plain `npm install` fails because the
  `mobile` workspace has a peer-dependency conflict (`react-native-svg@12` vs
  `react-native-qrcode-svg` wanting `>=14`). `mobile` is not runnable here anyway (needs
  Xcode/Android emulators).
- Do NOT run `npm run setup:dev` — it calls `scripts/generate-dev-keys.js` (missing) and a
  backend `db:migrate` (missing); it will fail.
- Dev `.env` files (`backend/.env`, `validator-portal/.env`) and `keys/dev/*` are created
  during environment setup and persist in the VM snapshot. If they are ever missing, recreate
  them from the heredoc templates inside `scripts/setup.sh` (the env-file + key-gen sections);
  do not run the whole script (its Docker/db steps fail).

### What actually runs (use these to develop/test)
- **Full stack** — in two terminals: `npm run dev:backend` (API on :3000) and `npm run dev:demo` (gateway on :4747, proxies `/api` to backend).
  - Validator portal (static): http://localhost:4747/
  - Client check-in: http://localhost:4747/client
  - Facility QR display: http://localhost:4747/facility-qr.html
  - React validator portal: `npm run dev:portal` (Vite on :3001, proxies `/api` to :3000)
- **`stamp_verify` CLI** — offline attendance-record auditor (the real core crypto). Run from
  `stamp_verify/`: `node verify.js <record.json> --facility-key <hex-ed25519-pubkey> [--master-key <hex>]`.
  Exit 0 = PASS, 1 = FAIL. It imports `libsodium-wrappers` via CommonJS `require`, which works
  correctly; the dependency is resolved from the hoisted root `node_modules` (stamp_verify is
  not a workspace, so it has no local install).

### Known-broken / partial pieces
- **Backend build (`npm run build`)** still fails on `BlockchainVerificationService.ts` (missing `ethers`; not imported by `server.ts`).
- **Backend tests** may need `npm test` re-run after `CryptoService` typing fixes; TSCB protocol tests exist.
- **Validator-portal React app** requires `react-router-dom` (now in package.json). Verification page uses live `/api/sessions`; dashboard still partly mocked.
- **Mobile app** — `mobile/` is package.json only; use `participant-client.html` at `/client` instead.
- **Postgres** — optional; sessions/meetings persist to `backend/data/*.json` via `FileStore`.
- **Lint** is unconfigured repo-wide.
- **`docker-compose.yml`** app service Dockerfiles are missing; postgres/redis images only.
