
#!/bin/bash

# AttendanceAPI Production Backup Script
# Optimized for Ubuntu Server 24.04

set -euo pipefail

# Configuration
BACKUP_DIR="/var/backups/attendance-api"
DB_NAME="attendance_db"
DB_USER="attendance_user"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_DIR="/opt/attendance-api"
RETENTION_DAYS=30
LOG_FILE="/var/log/attendance-api/backup.log"
NOTIFICATION_EMAIL="admin@yourdomain.com"

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    echo "Backup failed: $1" | mail -s "AttendanceAPI Backup Failed" "$NOTIFICATION_EMAIL" 2>/dev/null || true
    exit 1
}

# Success notification
success_notification() {
    local backup_size=$(du -sh "$1" | cut -f1)
    log "SUCCESS: Backup completed successfully. Size: $backup_size"
    echo "Backup completed successfully. Location: $1, Size: $backup_size" | \
        mail -s "AttendanceAPI Backup Successful" "$NOTIFICATION_EMAIL" 2>/dev/null || true
}

# Main backup function
main() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_path="$BACKUP_DIR/backup_$timestamp"
    
    log "Starting backup process..."
    
    # Create timestamped backup directory
    mkdir -p "$backup_path"
    
    # 1. Database Backup
    log "Backing up PostgreSQL database..."
    if ! pg_dump -h localhost -U "$DB_USER" -d "$DB_NAME" \
        --no-password --verbose --format=custom \
        --file="$backup_path/database.dump" 2>>"$LOG_FILE"; then
        error_exit "Database backup failed"
    fi
    
    # 2. Redis Backup
    log "Backing up Redis data..."
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$backup_path/redis.rdb" 2>>"$LOG_FILE"; then
        error_exit "Redis backup failed"
    fi
    
    # 3. Application Files Backup
    log "Backing up application files..."
    if ! tar -czf "$backup_path/application.tar.gz" \
        -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" \
        --exclude="node_modules" \
        --exclude="*.log" \
        --exclude="tmp" 2>>"$LOG_FILE"; then
        error_exit "Application files backup failed"
    fi
    
    # 4. Configuration Files Backup
    log "Backing up configuration files..."
    mkdir -p "$backup_path/configs"
    
    # Nginx configuration
    if [ -f "/etc/nginx/sites-available/attendance-api" ]; then
        cp "/etc/nginx/sites-available/attendance-api" "$backup_path/configs/"
    fi
    
    # PostgreSQL configuration
    if [ -f "/etc/postgresql/*/main/postgresql.conf" ]; then
        cp /etc/postgresql/*/main/postgresql.conf "$backup_path/configs/"
    fi
    
    # SSL certificates
    if [ -d "/etc/ssl/certs" ]; then
        mkdir -p "$backup_path/configs/ssl"
        cp /etc/ssl/certs/attendance-api.* "$backup_path/configs/ssl/" 2>/dev/null || true
        cp /etc/ssl/private/attendance-api.* "$backup_path/configs/ssl/" 2>/dev/null || true
    fi
    
    # 5. System Configuration
    log "Backing up system configuration..."
    mkdir -p "$backup_path/system"
    
    # Systemd services
    cp /etc/systemd/system/attendance-api.service "$backup_path/system/" 2>/dev/null || true
    
    # Cron jobs
    crontab -l > "$backup_path/system/crontab.txt" 2>/dev/null || true
    
    # 6. Logs (last 7 days)
    log "Backing up recent logs..."
    mkdir -p "$backup_path/logs"
    find /var/log/attendance-api -name "*.log" -mtime -7 -exec cp {} "$backup_path/logs/" \; 2>/dev/null || true
    
    # 7. Create backup manifest
    log "Creating backup manifest..."
    cat > "$backup_path/manifest.txt" << EOF
AttendanceAPI Backup Manifest
============================
Backup Date: $(date)
Backup Path: $backup_path
Database: $DB_NAME
Redis Host: $REDIS_HOST:$REDIS_PORT
Application Directory: $APP_DIR

Contents:
- database.dump: PostgreSQL database backup
- redis.rdb: Redis data backup
- application.tar.gz: Application files
- configs/: Configuration files
- system/: System configuration
- logs/: Recent log files

Backup Size: $(du -sh "$backup_path" | cut -f1)
EOF
    
    # 8. Compress entire backup
    log "Compressing backup..."
    if ! tar -czf "$backup_path.tar.gz" -C "$BACKUP_DIR" "backup_$timestamp" 2>>"$LOG_FILE"; then
        error_exit "Backup compression failed"
    fi
    
    # Remove uncompressed backup
    rm -rf "$backup_path"
    
    # 9. Cleanup old backups
    log "Cleaning up old backups..."
    find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>>"$LOG_FILE" || true
    
    # 10. Verify backup integrity
    log "Verifying backup integrity..."
    if ! tar -tzf "$backup_path.tar.gz" >/dev/null 2>>"$LOG_FILE"; then
        error_exit "Backup verification failed"
    fi
    
    # 11. Upload to remote storage (optional)
    if [ -n "${REMOTE_BACKUP_PATH:-}" ]; then
        log "Uploading to remote storage..."
        if ! rsync -avz "$backup_path.tar.gz" "$REMOTE_BACKUP_PATH/" 2>>"$LOG_FILE"; then
            log "WARNING: Remote backup upload failed"
        else
            log "Remote backup upload successful"
        fi
    fi
    
    success_notification "$backup_path.tar.gz"
    log "Backup process completed successfully"
}

# Check prerequisites
check_prerequisites() {
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        error_exit "This script must be run as root or with sudo"
    fi
    
    # Check required commands
    for cmd in pg_dump redis-cli tar gzip; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            error_exit "Required command not found: $cmd"
        fi
    done
    
    # Check database connectivity
    if ! pg_isready -h localhost -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        error_exit "Cannot connect to PostgreSQL database"
    fi
    
    # Check Redis connectivity
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
        error_exit "Cannot connect to Redis server"
    fi
}

# Script execution
if [ "${1:-}" = "--check" ]; then
    check_prerequisites
    log "Prerequisites check passed"
    exit 0
fi

check_prerequisites
main "$@"
