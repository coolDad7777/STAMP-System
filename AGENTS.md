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
- Dev `.env` files (`backend/.env`, `validator-portal/.env`, `mobile/.env`) and `keys/dev/*`
  are created during environment setup and persist in the VM snapshot. If they are ever missing,
  recreate them from the heredoc templates inside `scripts/setup.sh` (the env-file + key-gen
  sections); do not run the whole script (its Docker/db steps fail).
- After creating `keys/dev/master.key`, append `TSCB_MASTER_KEY=<that hex>` to `backend/.env`
  when the line is absent. Check-in reads it at process start. `stamp_verify --master-key`
  must be the same hex or the temporal-challenge check will not match.

### What actually runs (use these to develop/test)
- **Backend API** — from `backend/`: `npx tsx src/server.ts` (or `npm run dev`). Listens on
  `0.0.0.0:3000`. Postgres is not running here, so `DatabaseService` logs a warning and stays
  in mock mode. `GET /health` returns `{"status":"healthy"}`. `POST /api/checkin` then
  `POST /api/checkout` keep the session in memory; `GET /api/session/:id` returns the TSCB
  proof and `GET /api/facility-pubkey` returns the Ed25519 facility key for auditors.
- **Static demo portal** — `node serve.js` serves `demo-portal.html` at
  http://localhost:3002/demo-portal.html and `participant-demo.html` at
  http://localhost:3002/participant-demo.html. Self-contained validator-portal UI (demo logins:
  officer/admin/auditor, dashboard, stamp verification, bulk verify). No build step.
  `crypto-verification.html` and `stamp-demo.html` are additional self-contained demos
  (`serve.js` does not route them; open them as files or with a static server).
- **`stamp_verify` CLI** — offline attendance-record auditor (the real core crypto). Run from
  `stamp_verify/`: `node verify.js <record.json> --facility-key <hex-ed25519-pubkey> [--master-key <hex>]`.
  Exit 0 = PASS, 1 = FAIL. Feed it the JSON from `GET /api/session/:id` plus the facility
  public key and `TSCB_MASTER_KEY`. It imports `libsodium-wrappers` via CommonJS `require`,
  which works correctly; the dependency is resolved from the hoisted root `node_modules`
  (stamp_verify is not a workspace, so it has no local install).
- **Backend tests** — `npm test --workspace=backend` (Jest, `backend/jest.config.js`). They
  pass when `backend/.env` exists.

### Known-broken pieces (PRE-EXISTING source/config defects, NOT environment issues — do not assume these work)
- **Backend build (`npm run build --workspace=backend`) fails** typechecking:
  `BlockchainVerificationService.ts` imports a missing `ethers` module and references config
  keys that don't exist. `server.ts` does not import that service at runtime.
- **Validator-portal Vite app fails to load**: `npm run dev` starts Vite but the app imports
  `react-router-dom` throughout while `package.json` declares `@tanstack/react-router` instead,
  so module resolution fails. `build`/`lint`/`test` are likewise blocked. Use `serve.js` for
  the demo UI.
- **Lint is unconfigured repo-wide**: there are no ESLint config files, so every `npm run lint`
  errors with "couldn't find a configuration file".
- **`docker-compose.yml` cannot build the app services**: it references non-existent
  `backend/Dockerfile.dev`, `validator-portal/Dockerfile.dev`, an `infrastructure/` dir, and
  `database/init.sql`. Only the `postgres`/`redis`/`softhsm` image services are valid. The
  backend does not actually need them anyway: `DatabaseService` silently falls back to "mock
  mode" if Postgres is unreachable, and Redis is declared in config but never connected.
