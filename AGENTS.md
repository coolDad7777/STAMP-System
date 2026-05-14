# AGENTS.md

## Cursor Cloud specific instructions

### Overview
STAMP (Secure Tracking & Anonymous Meeting Protocol) is a cryptographically secure attendance verification system. It has three main services: Backend API (Fastify/Node.js, port 3000), Validator Portal (React/Vite, port 3001), and a Mobile app (React Native, not runnable in Cloud Agent VMs).

### Services and how to run them

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Backend API | `npm run dev:backend` | 3000 | Requires PostgreSQL + Redis running |
| Validator Portal | `npm run dev:portal` | 3001 | Proxies `/api` to backend via Vite config |
| PostgreSQL | `sudo docker run -d --name stamp-postgres -e POSTGRES_DB=stamp_dev -e POSTGRES_USER=stamp_user -e POSTGRES_PASSWORD=secure_dev_password -p 5432:5432 postgres:15-alpine` | 5432 | |
| Redis | `sudo docker run -d --name stamp-redis -p 6379:6379 redis:7-alpine redis-server --requirepass secure_redis_password --appendonly yes` | 6379 | |

### Important caveats

- **Docker Compose volumes issue**: The `docker-compose.yml` mounts `./database/init.sql` (which doesn't exist) and `./database/schemas` (a directory) into the PostgreSQL init directory. This causes the postgres container to crash on startup. Use standalone `docker run` commands (see table above) instead of `docker-compose up -d postgres redis`.
- **Database schema initialization**: After starting PostgreSQL, run: `sudo docker exec -i stamp-postgres psql -U stamp_user -d stamp_dev < database/schemas/stamp_schema.sql`
- **Backend .env required**: The backend needs a `.env` file at `backend/.env`. The `scripts/setup.sh` generates one, or see the setup script for the full template. Key settings: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (min 32 chars), `ENCRYPTION_KEY` (exactly 32 chars), `BYPASS_HSM=true`.
- **npm install requires `--legacy-peer-deps`**: The mobile workspace has React Native peer dependency conflicts. Always use `npm install --legacy-peer-deps`.
- **No ESLint config**: The repo has ESLint as a devDependency but no `.eslintrc` config file. Lint commands will fail.
- **Pre-existing TypeScript errors**: The backend has TS errors in `BlockchainVerificationService.ts` (missing `ethers` dep) and the test file has broken imports. The `tsx` dev runner ignores these.
- **Backend tests**: Run with `NODE_ENV=development` and use `moduleNameMapper` to fix the broken import path: `cd backend && NODE_ENV=development npx jest --config '{"preset":"ts-jest","testEnvironment":"node","transform":{"^.+\\.ts$":["ts-jest",{"diagnostics":false}]},"moduleNameMapper":{"^../src/(.*)$":"<rootDir>/src/$1"},"modulePathIgnorePatterns":["dist"]}'`
- **Docker daemon in Cloud Agent VM**: Requires `fuse-overlayfs` storage driver and `iptables-legacy`. Start with `sudo dockerd &>/tmp/dockerd.log &`.
- **Validator Portal vite.config.ts**: The portal dev server listens on port 3001 (configured in `vite.config.ts`, not the package.json `dev` script which says port 3000 via `--port 3000`). The vite.config.ts port (3001) takes precedence.
