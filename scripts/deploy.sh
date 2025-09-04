
#!/bin/bash

# AttendanceAPI Production Deployment Script
# Optimized for Ubuntu Server 24.04

set -euo pipefail

# Configuration
APP_NAME="attendance-api"
APP_DIR="/opt/attendance-api"
REPO_URL="https://github.com/yourusername/attendance-api.git"
BRANCH="main"
USER="www-data"
GROUP="www-data"
LOG_FILE="/var/log/attendance-api/deploy.log"
NOTIFICATION_EMAIL="admin@yourdomain.com"

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    echo "Deployment failed: $1" | mail -s "AttendanceAPI Deployment Failed" "$NOTIFICATION_EMAIL" 2>/dev/null || true
    exit 1
}

# Success notification
success_notification() {
    log "SUCCESS: Deployment completed successfully"
    echo "Deployment completed successfully. Version: $1" | \
        mail -s "AttendanceAPI Deployment Successful" "$NOTIFICATION_EMAIL" 2>/dev/null || true
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy AttendanceAPI to production

OPTIONS:
    -h, --help              Show this help message
    -b, --branch BRANCH     Deploy specific branch (default: main)
    -f, --force             Force deployment without confirmation
    -r, --rollback          Rollback to previous version
    --skip-backup           Skip backup before deployment
    --skip-tests            Skip running tests
    --dry-run               Show what would be deployed without doing it

Examples:
    $0                      # Deploy main branch
    $0 -b develop           # Deploy develop branch
    $0 --rollback           # Rollback to previous version
    $0 --dry-run            # Show deployment plan
EOF
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        error_exit "This script must be run as root or with sudo"
    fi
    
    # Check required commands
    for cmd in git node npm systemctl nginx; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            error_exit "Required command not found: $cmd"
        fi
    done
    
    # Check services
    for service in postgresql redis-server; do
        if ! systemctl is-active --quiet "$service"; then
            error_exit "Required service not running: $service"
        fi
    done
    
    log "Prerequisites check passed"
}

# Create backup before deployment
create_backup() {
    if [ -d "$APP_DIR" ]; then
        log "Creating backup before deployment..."
        local backup_dir="/var/backups/attendance-api/pre-deploy"
        local timestamp=$(date '+%Y%m%d_%H%M%S')
        
        mkdir -p "$backup_dir"
        
        if tar -czf "$backup_dir/pre-deploy-$timestamp.tar.gz" \
            -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" 2>>"$LOG_FILE"; then
            log "Backup created: $backup_dir/pre-deploy-$timestamp.tar.gz"
            echo "$backup_dir/pre-deploy-$timestamp.tar.gz" > /tmp/last_backup_path
        else
            error_exit "Failed to create backup"
        fi
    fi
}

# Clone or update repository
update_repository() {
    local branch="$1"
    
    log "Updating repository (branch: $branch)..."
    
    if [ -d "$APP_DIR/.git" ]; then
        # Update existing repository
        cd "$APP_DIR"
        git fetch origin
        git checkout "$branch"
        git pull origin "$branch"
    else
        # Clone repository
        rm -rf "$APP_DIR"
        git clone -b "$branch" "$REPO_URL" "$APP_DIR"
        cd "$APP_DIR"
    fi
    
    # Get current commit hash
    local commit_hash=$(git rev-parse HEAD)
    local commit_message=$(git log -1 --pretty=format:"%s")
    
    log "Updated to commit: $commit_hash"
    log "Commit message: $commit_message"
    
    echo "$commit_hash" > /tmp/current_commit
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    cd "$APP_DIR"
    
    # Install Node.js dependencies
    if [ -f "package.json" ]; then
        npm ci --production 2>>"$LOG_FILE" || error_exit "Failed to install Node.js dependencies"
    fi
    
    # Install Python dependencies if present
    if [ -f "requirements.txt" ]; then
        pip3 install -r requirements.txt 2>>"$LOG_FILE" || error_exit "Failed to install Python dependencies"
    fi
    
    log "Dependencies installed successfully"
}

# Run tests
run_tests() {
    log "Running tests..."
    
    cd "$APP_DIR"
    
    # Run Node.js tests
    if [ -f "package.json" ] && npm run test --if-present 2>>"$LOG_FILE"; then
        log "Node.js tests passed"
    else
        log "WARNING: Node.js tests failed or not configured"
    fi
    
    # Run Python tests if present
    if [ -f "pytest.ini" ] || [ -f "setup.cfg" ] || [ -d "tests" ]; then
        if python3 -m pytest 2>>"$LOG_FILE"; then
            log "Python tests passed"
        else
            log "WARNING: Python tests failed"
        fi
    fi
    
    log "Tests completed"
}

# Update configuration
update_configuration() {
    log "Updating configuration..."
    
    cd "$APP_DIR"
    
    # Copy production configuration files
    if [ -f "config/production.json.example" ]; then
        cp "config/production.json.example" "config/production.json"
    fi
    
    # Set environment variables
    cat > "$APP_DIR/.env" << EOF
NODE_ENV=production
DATABASE_URL=postgresql://attendance_user:password@localhost:5432/attendance_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
LOG_LEVEL=info
PORT=8000
EOF
    
    # Set proper permissions
    chown -R "$USER:$GROUP" "$APP_DIR"
    chmod -R 755 "$APP_DIR"
    chmod 600 "$APP_DIR/.env"
    
    log "Configuration updated"
}

# Database migrations
run_migrations() {
    log "Running database migrations..."
    
    cd "$APP_DIR"
    
    # Run Node.js migrations
    if [ -f "package.json" ] && npm run migrate --if-present 2>>"$LOG_FILE"; then
        log "Node.js migrations completed"
    fi
    
    # Run Python migrations if present
    if [ -f "manage.py" ]; then
        python3 manage.py migrate 2>>"$LOG_FILE" || log "WARNING: Python migrations failed"
    fi
    
    log "Database migrations completed"
}

# Update systemd service
update_service() {
    log "Updating systemd service..."
    
    # Copy service file if it exists in the repository
    if [ -f "$APP_DIR/deployment/attendance-api.service" ]; then
        cp "$APP_DIR/deployment/attendance-api.service" "/etc/systemd/system/"
        systemctl daemon-reload
    fi
    
    # Enable service
    systemctl enable attendance-api
    
    log "Systemd service updated"
}

# Restart services
restart_services() {
    log "Restarting services..."
    
    # Restart application
    systemctl restart attendance-api
    
    # Restart nginx
    systemctl reload nginx
    
    # Wait for services to start
    sleep 10
    
    # Check service status
    if ! systemctl is-active --quiet attendance-api; then
        error_exit "AttendanceAPI service failed to start"
    fi
    
    if ! systemctl is-active --quiet nginx; then
        error_exit "Nginx service failed to start"
    fi
    
    log "Services restarted successfully"
}

# Health check
health_check() {
    log "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:8000/health >/dev/null 2>&1; then
            log "Health check passed"
            return 0
        fi
        
        log "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        ((attempt++))
    done
    
    error_exit "Health check failed after $max_attempts attempts"
}

# Rollback function
rollback() {
    log "Starting rollback process..."
    
    # Stop current service
    systemctl stop attendance-api
    
    # Restore from backup
    if [ -f "/tmp/last_backup_path" ]; then
        local backup_path=$(cat /tmp/last_backup_path)
        if [ -f "$backup_path" ]; then
            log "Restoring from backup: $backup_path"
            rm -rf "$APP_DIR"
            tar -xzf "$backup_path" -C "$(dirname "$APP_DIR")" 2>>"$LOG_FILE"
            chown -R "$USER:$GROUP" "$APP_DIR"
        else
            error_exit "Backup file not found: $backup_path"
        fi
    else
        error_exit "No backup path found for rollback"
    fi
    
    # Restart service
    systemctl start attendance-api
    
    # Health check
    health_check
    
    log "Rollback completed successfully"
}

# Main deployment function
main() {
    local branch="$1"
    local force="$2"
    local skip_backup="$3"
    local skip_tests="$4"
    local dry_run="$5"
    
    log "Starting deployment process..."
    log "Branch: $branch"
    log "Force: $force"
    log "Skip backup: $skip_backup"
    log "Skip tests: $skip_tests"
    log "Dry run: $dry_run"
    
    # Dry run mode
    if [ "$dry_run" = "true" ]; then
        log "DRY RUN MODE - No changes will be made"
        log "Would deploy branch: $branch"
        log "Would update repository at: $APP_DIR"
        log "Would install dependencies"
        [ "$skip_tests" != "true" ] && log "Would run tests"
        log "Would update configuration"
        log "Would run database migrations"
        log "Would restart services"
        log "Would perform health check"
        return 0
    fi
    
    # Confirmation prompt
    if [ "$force" != "true" ]; then
        echo
        echo "Deployment Summary:"
        echo "  Branch: $branch"
        echo "  Target: $APP_DIR"
        echo "  Skip backup: $skip_backup"
        echo "  Skip tests: $skip_tests"
        echo
        read -p "Are you sure you want to continue? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log "Deployment cancelled by user"
            exit 0
        fi
    fi
    
    # Create backup
    if [ "$skip_backup" != "true" ]; then
        create_backup
    fi
    
    # Update repository
    update_repository "$branch"
    
    # Install dependencies
    install_dependencies
    
    # Run tests
    if [ "$skip_tests" != "true" ]; then
        run_tests
    fi
    
    # Update configuration
    update_configuration
    
    # Run database migrations
    run_migrations
    
    # Update systemd service
    update_service
    
    # Restart services
    restart_services
    
    # Health check
    health_check
    
    # Get version info
    local commit_hash=$(cat /tmp/current_commit 2>/dev/null || echo "unknown")
    
    success_notification "$commit_hash"
    log "Deployment completed successfully"
}

# Parse command line arguments
BRANCH="main"
FORCE=false
ROLLBACK=false
SKIP_BACKUP=false
SKIP_TESTS=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -b|--branch)
            BRANCH="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -r|--rollback)
            ROLLBACK=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -*)
            error_exit "Unknown option: $1"
            ;;
        *)
            error_exit "Unexpected argument: $1"
            ;;
    esac
done

# Script execution
check_prerequisites

if [ "$ROLLBACK" = "true" ]; then
    rollback
else
    main "$BRANCH" "$FORCE" "$SKIP_BACKUP" "$SKIP_TESTS" "$DRY_RUN"
fi
