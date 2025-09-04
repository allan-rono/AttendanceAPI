
#!/bin/bash

# AttendanceAPI Production Restore Script
# Optimized for Ubuntu Server 24.04

set -euo pipefail

# Configuration
BACKUP_DIR="/var/backups/attendance-api"
DB_NAME="attendance_db"
DB_USER="attendance_user"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_DIR="/opt/attendance-api"
LOG_FILE="/var/log/attendance-api/restore.log"
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
    echo "Restore failed: $1" | mail -s "AttendanceAPI Restore Failed" "$NOTIFICATION_EMAIL" 2>/dev/null || true
    exit 1
}

# Success notification
success_notification() {
    log "SUCCESS: Restore completed successfully"
    echo "Restore completed successfully from backup: $1" | \
        mail -s "AttendanceAPI Restore Successful" "$NOTIFICATION_EMAIL" 2>/dev/null || true
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS] BACKUP_FILE

Restore AttendanceAPI from backup

OPTIONS:
    -h, --help              Show this help message
    -f, --force             Force restore without confirmation
    -d, --database-only     Restore database only
    -a, --app-only          Restore application files only
    -c, --config-only       Restore configuration files only
    --dry-run               Show what would be restored without doing it

BACKUP_FILE:
    Path to the backup file (.tar.gz) to restore from
    Use 'latest' to restore from the most recent backup

Examples:
    $0 /var/backups/attendance-api/backup_20250826_120000.tar.gz
    $0 latest
    $0 --database-only latest
    $0 --dry-run backup_20250826_120000.tar.gz
EOF
}

# Find latest backup
find_latest_backup() {
    local latest_backup
    latest_backup=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [ -z "$latest_backup" ]; then
        error_exit "No backup files found in $BACKUP_DIR"
    fi
    
    echo "$latest_backup"
}

# Validate backup file
validate_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        error_exit "Backup file not found: $backup_file"
    fi
    
    if ! tar -tzf "$backup_file" >/dev/null 2>&1; then
        error_exit "Invalid or corrupted backup file: $backup_file"
    fi
    
    log "Backup file validation successful: $backup_file"
}

# Stop services
stop_services() {
    log "Stopping services..."
    
    systemctl stop attendance-api 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true
    
    # Wait for services to stop
    sleep 5
    
    log "Services stopped"
}

# Start services
start_services() {
    log "Starting services..."
    
    systemctl start postgresql 2>/dev/null || true
    systemctl start redis-server 2>/dev/null || true
    sleep 3
    
    systemctl start attendance-api 2>/dev/null || true
    systemctl start nginx 2>/dev/null || true
    
    # Wait for services to start
    sleep 10
    
    log "Services started"
}

# Restore database
restore_database() {
    local extract_dir="$1"
    local db_backup="$extract_dir/database.dump"
    
    if [ ! -f "$db_backup" ]; then
        log "WARNING: Database backup not found in archive"
        return 0
    fi
    
    log "Restoring PostgreSQL database..."
    
    # Create backup of current database
    local current_backup="/tmp/current_db_backup_$(date +%s).dump"
    pg_dump -h localhost -U "$DB_USER" -d "$DB_NAME" \
        --no-password --format=custom --file="$current_backup" 2>/dev/null || true
    
    # Drop and recreate database
    dropdb -h localhost -U postgres "$DB_NAME" 2>/dev/null || true
    createdb -h localhost -U postgres -O "$DB_USER" "$DB_NAME" || error_exit "Failed to create database"
    
    # Restore database
    if ! pg_restore -h localhost -U "$DB_USER" -d "$DB_NAME" \
        --no-password --verbose "$db_backup" 2>>"$LOG_FILE"; then
        log "Database restore failed, attempting to restore current backup..."
        pg_restore -h localhost -U "$DB_USER" -d "$DB_NAME" \
            --no-password "$current_backup" 2>/dev/null || true
        error_exit "Database restore failed"
    fi
    
    # Clean up temporary backup
    rm -f "$current_backup"
    
    log "Database restore completed"
}

# Restore Redis
restore_redis() {
    local extract_dir="$1"
    local redis_backup="$extract_dir/redis.rdb"
    
    if [ ! -f "$redis_backup" ]; then
        log "WARNING: Redis backup not found in archive"
        return 0
    fi
    
    log "Restoring Redis data..."
    
    # Stop Redis
    systemctl stop redis-server
    
    # Backup current Redis data
    local redis_data_dir="/var/lib/redis"
    if [ -f "$redis_data_dir/dump.rdb" ]; then
        cp "$redis_data_dir/dump.rdb" "/tmp/redis_backup_$(date +%s).rdb"
    fi
    
    # Restore Redis data
    cp "$redis_backup" "$redis_data_dir/dump.rdb"
    chown redis:redis "$redis_data_dir/dump.rdb"
    
    # Start Redis
    systemctl start redis-server
    sleep 3
    
    log "Redis restore completed"
}

# Restore application files
restore_application() {
    local extract_dir="$1"
    local app_backup="$extract_dir/application.tar.gz"
    
    if [ ! -f "$app_backup" ]; then
        log "WARNING: Application backup not found in archive"
        return 0
    fi
    
    log "Restoring application files..."
    
    # Backup current application
    if [ -d "$APP_DIR" ]; then
        local current_app_backup="/tmp/current_app_backup_$(date +%s).tar.gz"
        tar -czf "$current_app_backup" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" 2>/dev/null || true
    fi
    
    # Remove current application directory
    rm -rf "$APP_DIR"
    
    # Extract application files
    if ! tar -xzf "$app_backup" -C "$(dirname "$APP_DIR")" 2>>"$LOG_FILE"; then
        log "Application restore failed, attempting to restore current backup..."
        tar -xzf "$current_app_backup" -C "$(dirname "$APP_DIR")" 2>/dev/null || true
        error_exit "Application restore failed"
    fi
    
    # Set proper permissions
    chown -R www-data:www-data "$APP_DIR"
    chmod -R 755 "$APP_DIR"
    
    # Install dependencies if package.json exists
    if [ -f "$APP_DIR/package.json" ]; then
        log "Installing application dependencies..."
        cd "$APP_DIR"
        npm install --production 2>>"$LOG_FILE" || log "WARNING: npm install failed"
    fi
    
    log "Application restore completed"
}

# Restore configuration files
restore_configuration() {
    local extract_dir="$1"
    local config_dir="$extract_dir/configs"
    
    if [ ! -d "$config_dir" ]; then
        log "WARNING: Configuration backup not found in archive"
        return 0
    fi
    
    log "Restoring configuration files..."
    
    # Nginx configuration
    if [ -f "$config_dir/attendance-api" ]; then
        cp "$config_dir/attendance-api" "/etc/nginx/sites-available/"
        ln -sf "/etc/nginx/sites-available/attendance-api" "/etc/nginx/sites-enabled/" 2>/dev/null || true
    fi
    
    # PostgreSQL configuration
    if [ -f "$config_dir/postgresql.conf" ]; then
        local pg_config_dir="/etc/postgresql/$(ls /etc/postgresql/ | head -1)/main"
        if [ -d "$pg_config_dir" ]; then
            cp "$config_dir/postgresql.conf" "$pg_config_dir/"
        fi
    fi
    
    # SSL certificates
    if [ -d "$config_dir/ssl" ]; then
        cp "$config_dir/ssl"/* "/etc/ssl/certs/" 2>/dev/null || true
        cp "$config_dir/ssl"/* "/etc/ssl/private/" 2>/dev/null || true
    fi
    
    # System configuration
    local system_dir="$extract_dir/system"
    if [ -d "$system_dir" ]; then
        # Systemd service
        if [ -f "$system_dir/attendance-api.service" ]; then
            cp "$system_dir/attendance-api.service" "/etc/systemd/system/"
            systemctl daemon-reload
        fi
        
        # Cron jobs
        if [ -f "$system_dir/crontab.txt" ]; then
            crontab "$system_dir/crontab.txt" 2>/dev/null || true
        fi
    fi
    
    log "Configuration restore completed"
}

# Main restore function
main() {
    local backup_file="$1"
    local restore_type="${2:-all}"
    local force="${3:-false}"
    local dry_run="${4:-false}"
    
    # Resolve backup file path
    if [ "$backup_file" = "latest" ]; then
        backup_file=$(find_latest_backup)
        log "Using latest backup: $backup_file"
    fi
    
    # Validate backup
    validate_backup "$backup_file"
    
    # Show backup information
    local backup_size=$(du -sh "$backup_file" | cut -f1)
    log "Backup file: $backup_file"
    log "Backup size: $backup_size"
    
    # Extract backup to temporary directory
    local temp_dir=$(mktemp -d)
    local extract_dir="$temp_dir/$(basename "$backup_file" .tar.gz)"
    
    log "Extracting backup to temporary directory..."
    if ! tar -xzf "$backup_file" -C "$temp_dir" 2>>"$LOG_FILE"; then
        rm -rf "$temp_dir"
        error_exit "Failed to extract backup file"
    fi
    
    # Show manifest if available
    if [ -f "$extract_dir/manifest.txt" ]; then
        log "Backup manifest:"
        cat "$extract_dir/manifest.txt" | tee -a "$LOG_FILE"
    fi
    
    # Dry run mode
    if [ "$dry_run" = "true" ]; then
        log "DRY RUN MODE - No changes will be made"
        log "Would restore the following components:"
        [ -f "$extract_dir/database.dump" ] && log "  - Database"
        [ -f "$extract_dir/redis.rdb" ] && log "  - Redis data"
        [ -f "$extract_dir/application.tar.gz" ] && log "  - Application files"
        [ -d "$extract_dir/configs" ] && log "  - Configuration files"
        rm -rf "$temp_dir"
        return 0
    fi
    
    # Confirmation prompt
    if [ "$force" != "true" ]; then
        echo
        echo "WARNING: This will overwrite the current AttendanceAPI installation!"
        echo "Backup file: $backup_file"
        echo "Restore type: $restore_type"
        echo
        read -p "Are you sure you want to continue? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log "Restore cancelled by user"
            rm -rf "$temp_dir"
            exit 0
        fi
    fi
    
    log "Starting restore process..."
    
    # Stop services
    stop_services
    
    # Perform restore based on type
    case "$restore_type" in
        "all")
            restore_database "$extract_dir"
            restore_redis "$extract_dir"
            restore_application "$extract_dir"
            restore_configuration "$extract_dir"
            ;;
        "database")
            restore_database "$extract_dir"
            ;;
        "app")
            restore_application "$extract_dir"
            ;;
        "config")
            restore_configuration "$extract_dir"
            ;;
        *)
            error_exit "Invalid restore type: $restore_type"
            ;;
    esac
    
    # Start services
    start_services
    
    # Verify services are running
    sleep 10
    if ! systemctl is-active --quiet attendance-api; then
        log "WARNING: AttendanceAPI service is not running after restore"
    fi
    
    # Clean up
    rm -rf "$temp_dir"
    
    success_notification "$backup_file"
    log "Restore process completed successfully"
}

# Check prerequisites
check_prerequisites() {
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        error_exit "This script must be run as root or with sudo"
    fi
    
    # Check required commands
    for cmd in pg_restore redis-cli tar gzip; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            error_exit "Required command not found: $cmd"
        fi
    done
}

# Parse command line arguments
BACKUP_FILE=""
RESTORE_TYPE="all"
FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -d|--database-only)
            RESTORE_TYPE="database"
            shift
            ;;
        -a|--app-only)
            RESTORE_TYPE="app"
            shift
            ;;
        -c|--config-only)
            RESTORE_TYPE="config"
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
            if [ -z "$BACKUP_FILE" ]; then
                BACKUP_FILE="$1"
            else
                error_exit "Multiple backup files specified"
            fi
            shift
            ;;
    esac
done

# Check if backup file is specified
if [ -z "$BACKUP_FILE" ]; then
    usage
    error_exit "Backup file not specified"
fi

# Script execution
check_prerequisites
main "$BACKUP_FILE" "$RESTORE_TYPE" "$FORCE" "$DRY_RUN"
