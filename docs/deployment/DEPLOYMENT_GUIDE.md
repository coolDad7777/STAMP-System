# STAMP System Deployment Guide

This guide provides comprehensive instructions for deploying the STAMP system in development, staging, and production environments.

## Prerequisites

### Required Software
- Docker 24.0+ and Docker Compose 2.0+
- Node.js 20+ LTS
- PostgreSQL 15+
- Redis 7+
- Git 2.40+

### Required Hardware (Production)
- **Application Servers**: 4 CPU cores, 16GB RAM, 100GB SSD (minimum 2 instances)
- **Database Server**: 8 CPU cores, 32GB RAM, 500GB SSD with backup storage
- **Redis Cache**: 2 CPU cores, 8GB RAM, 50GB SSD
- **Load Balancer**: 2 CPU cores, 4GB RAM

### Network Requirements
- TLS 1.3 certificates (Let's Encrypt or CA-signed)
- Firewall rules configured for required ports
- Domain names configured with DNS

## Development Environment Setup

### 1. Clone Repository
```bash
git clone https://github.com/stamp-system/stamp.git
cd stamp-system
```

### 2. Environment Configuration
```bash
# Copy environment templates
cp backend/.env.example backend/.env
cp validator-portal/.env.example validator-portal/.env
cp mobile/.env.example mobile/.env

# Generate development keys
npm run setup:keys

# Configure database connection
nano backend/.env
```

### 3. Start Development Services
```bash
# Start infrastructure services
docker-compose up -d postgres redis softhsm

# Install dependencies
npm install

# Initialize database
npm run db:migrate
npm run db:seed

# Start development servers
npm run dev:backend    # Terminal 1
npm run dev:portal     # Terminal 2
npm run dev:mobile     # Terminal 3
```

### 4. Verify Installation
```bash
# Check API health
curl http://localhost:3000/health

# Check validator portal
open http://localhost:3001

# Run tests
npm run test:all
```

## Staging Environment Deployment

### 1. Infrastructure Setup
```bash
# Create staging infrastructure
cd infrastructure/terraform/staging
terraform init
terraform plan
terraform apply
```

### 2. Deploy Application
```bash
# Build production images
npm run build:all
docker-compose -f docker-compose.staging.yml build

# Deploy to staging
./scripts/deploy-staging.sh
```

### 3. Configuration Management
```bash
# Set staging environment variables
kubectl create configmap stamp-config \
  --from-env-file=config/staging.env

# Create secrets
kubectl create secret generic stamp-secrets \
  --from-literal=jwt-secret=$JWT_SECRET \
  --from-literal=encryption-key=$ENCRYPTION_KEY \
  --from-literal=database-password=$DB_PASSWORD
```

## Production Deployment

### 1. Pre-deployment Checklist
- [ ] Security audit completed
- [ ] Performance testing passed
- [ ] Backup procedures tested
- [ ] Monitoring configured
- [ ] SSL certificates obtained
- [ ] DNS records configured
- [ ] Firewall rules implemented

### 2. Infrastructure Provisioning

#### AWS Deployment (Recommended)
```bash
cd infrastructure/terraform/aws-production

# Configure AWS credentials
aws configure

# Initialize Terraform
terraform init -backend-config="bucket=stamp-terraform-state"

# Plan deployment
terraform plan -var-file="production.tfvars"

# Apply infrastructure
terraform apply -var-file="production.tfvars"
```

#### Kubernetes Deployment
```yaml
# production-namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: stamp-production
  labels:
    name: stamp-production
    environment: production

---
# stamp-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stamp-backend
  namespace: stamp-production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: stamp-backend
  template:
    metadata:
      labels:
        app: stamp-backend
    spec:
      containers:
      - name: stamp-backend
        image: stamp/backend:v1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: stamp-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: stamp-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### 3. Database Setup
```bash
# Create production database
psql -h $DB_HOST -U postgres -c "CREATE DATABASE stamp_production;"

# Run migrations
NODE_ENV=production npm run db:migrate

# Create initial admin user
NODE_ENV=production npm run db:seed:admin
```

### 4. SSL Configuration
```nginx
# /etc/nginx/sites-available/stamp
server {
    listen 443 ssl http2;
    server_name api.stamp-system.gov;
    
    ssl_certificate /etc/letsencrypt/live/stamp-system.gov/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stamp-system.gov/privkey.pem;
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    location / {
        proxy_pass http://stamp-backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting
        limit_req zone=api burst=10 nodelay;
    }
}
```

### 5. Monitoring Setup
```yaml
# prometheus-config.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'stamp-backend'
    static_configs:
      - targets: ['stamp-backend:3000']
    scrape_interval: 5s
    metrics_path: /metrics

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
    
  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

rule_files:
  - "stamp_alerts.yml"
```

## Security Hardening

### 1. Network Security
```bash
# Configure firewall rules
ufw deny incoming
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow from 10.0.0.0/8 to any port 5432
ufw enable
```

### 2. Application Security
```javascript
// backend/src/middleware/security.ts
export const securityMiddleware = {
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
  },
  
  // Content Security Policy
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
};
```

### 3. Database Security
```sql
-- Create read-only user for monitoring
CREATE USER stamp_monitor WITH PASSWORD 'secure_monitor_password';
GRANT CONNECT ON DATABASE stamp_production TO stamp_monitor;
GRANT USAGE ON SCHEMA public TO stamp_monitor;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO stamp_monitor;

-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
```

## Backup and Recovery

### 1. Database Backup
```bash
#!/bin/bash
# scripts/backup-database.sh

BACKUP_DIR="/var/backups/stamp"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="stamp_backup_$TIMESTAMP.sql.gz"

# Create encrypted database backup
pg_dump -h $DB_HOST -U $DB_USER stamp_production | \
  gzip | \
  gpg --symmetric --cipher-algo AES256 --compress-algo 2 --s2k-mode 3 \
      --s2k-digest-algo SHA512 --s2k-count 65536 \
      --passphrase-file /etc/stamp/backup.key \
      > "$BACKUP_DIR/$BACKUP_FILE"

# Upload to S3 with encryption
aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" \
  s3://stamp-backups/database/ \
  --sse aws:kms \
  --sse-kms-key-id arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012

# Cleanup local backup (keep last 7 days)
find "$BACKUP_DIR" -name "stamp_backup_*.sql.gz" -mtime +7 -delete
```

### 2. Recovery Procedures
```bash
#!/bin/bash
# scripts/restore-database.sh

BACKUP_FILE="$1"
RESTORE_DB="stamp_restore_$(date +%s)"

# Download and decrypt backup
aws s3 cp "s3://stamp-backups/database/$BACKUP_FILE" /tmp/
gpg --decrypt --passphrase-file /etc/stamp/backup.key \
    "/tmp/$BACKUP_FILE" | gunzip > "/tmp/restore.sql"

# Create restoration database
createdb -h $DB_HOST -U postgres "$RESTORE_DB"

# Restore data
psql -h $DB_HOST -U postgres -d "$RESTORE_DB" -f "/tmp/restore.sql"

echo "Database restored to: $RESTORE_DB"
```

## Performance Optimization

### 1. Database Optimization
```sql
-- Performance tuning for production
ALTER SYSTEM SET shared_buffers = '4GB';
ALTER SYSTEM SET effective_cache_size = '12GB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- Reload configuration
SELECT pg_reload_conf();

-- Create additional indexes for performance
CREATE INDEX CONCURRENTLY idx_attendance_sessions_perf ON attendance_sessions 
  (tenant_id, status, checkin_timestamp) 
  WHERE status IN ('checked_in', 'completed');

-- Analyze tables for query planning
ANALYZE;
```

### 2. Redis Configuration
```bash
# /etc/redis/redis.conf
maxmemory 4gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
```

### 3. Application Caching
```typescript
// Implement intelligent caching
export class CacheService {
  static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const data = await fetcher();
    await redis.setex(key, ttl, JSON.stringify(data));
    return data;
  }
}
```

## Troubleshooting

### Common Issues

#### 1. High API Latency
```bash
# Check database connections
psql -h $DB_HOST -c "SELECT count(*) FROM pg_stat_activity;"

# Monitor slow queries
psql -h $DB_HOST -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check Redis performance
redis-cli --latency-history
```

#### 2. Authentication Failures
```bash
# Check JWT token validity
node -e "console.log(require('jsonwebtoken').decode('$TOKEN', {complete: true}))"

# Verify database connectivity
psql -h $DB_HOST -U $DB_USER -d stamp_production -c "SELECT NOW();"

# Check HSM connectivity
pkcs11-tool --module /usr/lib/softhsm/libsofthsm2.so --list-slots
```

#### 3. Mobile App Issues
```bash
# Check React Native dependencies
npx react-native doctor

# Clear Metro cache
npx react-native start --reset-cache

# Verify device permissions
adb shell dumpsys package permissions
```

## Maintenance

### Regular Maintenance Tasks

#### Daily
- [ ] Monitor system health dashboards
- [ ] Check backup completion
- [ ] Review security alerts
- [ ] Monitor disk space usage

#### Weekly  
- [ ] Database maintenance (VACUUM, ANALYZE)
- [ ] Log rotation and cleanup
- [ ] Security patch updates
- [ ] Performance metrics review

#### Monthly
- [ ] Security vulnerability scan
- [ ] Disaster recovery test
- [ ] Capacity planning review
- [ ] Compliance audit preparation

## Support and Escalation

For deployment issues or questions:

1. **Level 1**: Check logs and monitoring dashboards
2. **Level 2**: Review this deployment guide and documentation
3. **Level 3**: Contact STAMP development team with:
   - Environment details
   - Error messages and logs  
   - Steps to reproduce issue
   - Impact assessment

## Next Steps

After successful deployment:
1. Configure monitoring alerts
2. Set up automated backups
3. Schedule regular security updates
4. Plan capacity scaling
5. Document operational procedures