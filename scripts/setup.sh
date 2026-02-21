#!/bin/bash

# STAMP System Development Setup Script
# This script automates the initial setup of the STAMP development environment

set -e  # Exit on any error

echo "🚀 Starting STAMP System Setup..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check Node.js version
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'.' -f1 | cut -d'v' -f2)
        if [ "$NODE_VERSION" -ge 20 ]; then
            log_success "Node.js $(node --version) is installed"
        else
            log_error "Node.js 20+ is required. Current version: $(node --version)"
            exit 1
        fi
    else
        log_error "Node.js is not installed. Please install Node.js 20+ LTS"
        exit 1
    fi
    
    # Check npm version
    if command_exists npm; then
        NPM_VERSION=$(npm --version | cut -d'.' -f1)
        if [ "$NPM_VERSION" -ge 9 ]; then
            log_success "npm $(npm --version) is installed"
        else
            log_warning "npm 9+ is recommended. Current version: $(npm --version)"
        fi
    else
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check Docker
    if command_exists docker; then
        log_success "Docker is installed"
        
        # Check if Docker daemon is running
        if docker info >/dev/null 2>&1; then
            log_success "Docker daemon is running"
        else
            log_error "Docker daemon is not running. Please start Docker"
            exit 1
        fi
    else
        log_error "Docker is required but not installed. Please install Docker"
        exit 1
    fi
    
    # Check Docker Compose
    if command_exists docker-compose || docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose is available"
    else
        log_error "Docker Compose is required but not available"
        exit 1
    fi
    
    # Check PostgreSQL client (optional but recommended)
    if command_exists psql; then
        log_success "PostgreSQL client is available"
    else
        log_warning "PostgreSQL client (psql) is not installed. Consider installing it for database management"
    fi
    
    # Check Git
    if command_exists git; then
        log_success "Git is installed"
    else
        log_error "Git is required but not installed"
        exit 1
    fi
}

# Generate development environment files
generate_env_files() {
    log_info "Generating environment configuration files..."
    
    # Backend .env file
    if [ ! -f "backend/.env" ]; then
        cat > backend/.env << EOF
# STAMP Backend Development Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
API_HOST=localhost:3000
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3000,http://localhost:19006

# Database Configuration
DATABASE_URL=postgres://stamp_user:secure_dev_password@localhost:5432/stamp_dev
DB_POOL_SIZE=20
DB_TIMEOUT=30000
DB_SSL=false

# Redis Configuration
REDIS_URL=redis://:secure_redis_password@localhost:6379
REDIS_DB=0
REDIS_TTL=3600

# Cryptography (Development Keys - CHANGE IN PRODUCTION)
JWT_SECRET=dev_jwt_secret_32_characters_long_change_in_production
ENCRYPTION_KEY=dev_encryption_key_32_bytes_long
HSM_PKCS11_LIB=/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so
BYPASS_HSM=true

# Geohash and Location
GEOHASH_PRECISION=7
LOCATION_TOLERANCE_METERS=200
SESSION_MIN_DURATION_MS=2700000
SESSION_MAX_DURATION_MS=14400000

# QR Code Configuration
QR_ROTATION_INTERVAL_MS=30000
QR_EXPIRY_MS=14400000

# Security
BCRYPT_ROUNDS=12
SESSION_TIMEOUT_MS=900000
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Development Flags
MOCK_LOCATION=false
DISABLE_RATE_LIMITING=true
EOF
        log_success "Created backend/.env"
    else
        log_info "backend/.env already exists, skipping..."
    fi
    
    # Validator Portal .env file
    if [ ! -f "validator-portal/.env" ]; then
        cat > validator-portal/.env << EOF
# STAMP Validator Portal Development Configuration
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=STAMP Validator Portal
VITE_APP_VERSION=1.0.0
VITE_ENVIRONMENT=development

# Authentication
VITE_AUTH_PROVIDER=local
VITE_SESSION_TIMEOUT=1800000

# Features
VITE_ENABLE_BULK_VERIFICATION=true
VITE_ENABLE_COMPLIANCE_REPORTS=true
VITE_ENABLE_AUDIT_VIEWER=true
VITE_MAX_BATCH_SIZE=100

# Development
VITE_MOCK_DATA=true
VITE_DEBUG_MODE=true
EOF
        log_success "Created validator-portal/.env"
    else
        log_info "validator-portal/.env already exists, skipping..."
    fi
    
    # Mobile .env file
    if [ ! -f "mobile/.env" ]; then
        cat > mobile/.env << EOF
# STAMP Mobile App Development Configuration
API_URL=http://localhost:3000
ENVIRONMENT=development

# App Configuration
APP_NAME=STAMP
APP_VERSION=1.0.0
BUNDLE_ID=gov.stamp.mobile

# Security
ENABLE_BIOMETRICS=true
ENABLE_DEVICE_FINGERPRINTING=true
OFFLINE_MODE_ENABLED=true

# Development
DEBUG_MODE=true
MOCK_LOCATION_SERVICES=false
ENABLE_FLIPPER=true
EOF
        log_success "Created mobile/.env"
    else
        log_info "mobile/.env already exists, skipping..."
    fi
}

# Generate development cryptographic keys
generate_dev_keys() {
    log_info "Generating development cryptographic keys..."
    
    mkdir -p keys/dev
    
    # Generate Ed25519 key pair for development
    if [ ! -f "keys/dev/signing_key.private" ]; then
        # Generate private key
        openssl genpkey -algorithm Ed25519 -out keys/dev/signing_key.private
        
        # Generate public key
        openssl pkey -in keys/dev/signing_key.private -pubout -out keys/dev/signing_key.public
        
        log_success "Generated Ed25519 signing keys"
    else
        log_info "Development signing keys already exist, skipping..."
    fi
    
    # Generate master key for AES encryption (development only)
    if [ ! -f "keys/dev/master.key" ]; then
        openssl rand -hex 32 > keys/dev/master.key
        log_success "Generated master encryption key"
    else
        log_info "Development master key already exists, skipping..."
    fi
    
    # Set appropriate permissions
    chmod 600 keys/dev/*
    log_success "Set secure permissions on key files"
}

# Initialize workspace dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Install root workspace dependencies
    npm install
    log_success "Installed root workspace dependencies"
    
    # Install backend dependencies
    cd backend
    npm install
    cd ..
    log_success "Installed backend dependencies"
    
    # Install validator portal dependencies
    cd validator-portal
    npm install
    cd ..
    log_success "Installed validator portal dependencies"
    
    # Install mobile dependencies
    cd mobile
    npm install
    
    # iOS specific setup (if on macOS)
    if [[ "$OSTYPE" == "darwin"* ]] && command_exists pod; then
        cd ios
        pod install
        cd ..
        log_success "Installed iOS CocoaPods dependencies"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        log_warning "CocoaPods not found. Run 'cd mobile/ios && pod install' manually for iOS development"
    fi
    
    cd ..
    log_success "Installed mobile dependencies"
}

# Start infrastructure services
start_infrastructure() {
    log_info "Starting infrastructure services..."
    
    # Start Docker services
    docker-compose up -d postgres redis softhsm
    
    # Wait for PostgreSQL to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if docker-compose exec -T postgres pg_isready -U stamp_user -d stamp_dev >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        
        if [ $i -eq 30 ]; then
            log_error "PostgreSQL failed to start within 30 seconds"
            exit 1
        fi
        
        sleep 1
    done
    
    # Wait for Redis to be ready
    log_info "Waiting for Redis to be ready..."
    for i in {1..30}; do
        if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
            log_success "Redis is ready"
            break
        fi
        
        if [ $i -eq 30 ]; then
            log_error "Redis failed to start within 30 seconds"
            exit 1
        fi
        
        sleep 1
    done
    
    log_success "Infrastructure services are running"
}

# Initialize database
initialize_database() {
    log_info "Initializing database..."
    
    # Run database migrations
    cd backend
    npm run db:migrate
    log_success "Database migrations completed"
    
    # Seed development data
    npm run db:seed
    log_success "Database seeded with development data"
    
    cd ..
}

# Run initial tests
run_tests() {
    log_info "Running initial tests..."
    
    # Run backend tests
    cd backend
    npm test
    cd ..
    log_success "Backend tests passed"
    
    # Test cryptographic functions
    cd backend
    npm run crypto:test
    cd ..
    log_success "Cryptographic functions tested"
}

# Display final instructions
display_instructions() {
    log_success "🎉 STAMP System setup completed successfully!"
    
    echo ""
    echo "=== Next Steps ==="
    echo ""
    echo "1. Start the development servers:"
    echo "   Terminal 1: npm run dev:backend"
    echo "   Terminal 2: npm run dev:portal" 
    echo "   Terminal 3: npm run dev:mobile"
    echo ""
    echo "2. Access the applications:"
    echo "   • API Documentation: http://localhost:3000/docs"
    echo "   • Validator Portal: http://localhost:3001"
    echo "   • API Health Check: http://localhost:3000/health"
    echo ""
    echo "3. For mobile development:"
    echo "   • iOS: npx react-native run-ios"
    echo "   • Android: npx react-native run-android"
    echo ""
    echo "4. Useful commands:"
    echo "   • Run all tests: npm run test:all"
    echo "   • Build all: npm run build:all"
    echo "   • Security audit: npm run security:audit"
    echo ""
    echo "=== Database Access ==="
    echo "Connection string: postgres://stamp_user:secure_dev_password@localhost:5432/stamp_dev"
    echo ""
    echo "=== Need Help? ==="
    echo "Check the documentation in the docs/ directory"
    echo "or visit https://github.com/stamp-system/stamp/wiki"
    echo ""
}

# Main execution
main() {
    echo "🔧 STAMP Development Environment Setup"
    echo "======================================"
    echo ""
    
    check_requirements
    echo ""
    
    generate_env_files
    echo ""
    
    generate_dev_keys
    echo ""
    
    install_dependencies
    echo ""
    
    start_infrastructure
    echo ""
    
    initialize_database
    echo ""
    
    run_tests
    echo ""
    
    display_instructions
}

# Cleanup function for interruption
cleanup() {
    log_warning "Setup interrupted. Cleaning up..."
    docker-compose down >/dev/null 2>&1 || true
    exit 1
}

# Set trap for cleanup on interruption
trap cleanup INT TERM

# Run main function
main "$@"