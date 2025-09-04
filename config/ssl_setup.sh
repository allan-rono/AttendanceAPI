
#!/bin/bash

# AttendanceAPI SSL/TLS Setup Script
# Configures production-ready SSL certificates and security settings
#
# Security Features:
# - Let's Encrypt SSL certificates with auto-renewal
# - Strong DH parameters generation
# - OCSP stapling configuration
# - Security headers optimization
# - Certificate monitoring and alerting

set -euo pipefail

# Configuration variables
DOMAIN="${1:-your-api-domain.com}"
EMAIL="${2:-admin@your-domain.com}"
NGINX_CONFIG_DIR="/etc/nginx"
SSL_DIR="/etc/nginx/ssl"
LOG_FILE="/var/log/ssl_setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
    fi
}

# Check system requirements
check_requirements() {
    log "Checking system requirements..."
    
    # Check if nginx is installed
    if ! command -v nginx &> /dev/null; then
        error "Nginx is not installed. Please install nginx first."
    fi
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        info "Installing certbot..."
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    fi
    
    # Check if openssl is installed
    if ! command -v openssl &> /dev/null; then
        error "OpenSSL is not installed. Please install openssl first."
    fi
    
    log "System requirements check completed"
}

# Create SSL directory structure
create_ssl_directories() {
    log "Creating SSL directory structure..."
    
    mkdir -p "$SSL_DIR"
    mkdir -p "$SSL_DIR/certs"
    mkdir -p "$SSL_DIR/private"
    mkdir -p "$SSL_DIR/csr"
    
    # Set proper permissions
    chmod 755 "$SSL_DIR"
    chmod 700 "$SSL_DIR/private"
    
    log "SSL directories created"
}

# Generate strong DH parameters
generate_dhparam() {
    local dhparam_file="$SSL_DIR/dhparam.pem"
    
    if [[ -f "$dhparam_file" ]]; then
        warning "DH parameters already exist at $dhparam_file"
        return 0
    fi
    
    log "Generating strong DH parameters (this may take several minutes)..."
    openssl dhparam -out "$dhparam_file" 2048
    chmod 644 "$dhparam_file"
    log "DH parameters generated successfully"
}

# Obtain Let's Encrypt certificate
obtain_letsencrypt_cert() {
    log "Obtaining Let's Encrypt certificate for $DOMAIN..."
    
    # Stop nginx temporarily
    systemctl stop nginx
    
    # Obtain certificate using standalone mode
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "$DOMAIN" \
        --rsa-key-size 4096 \
        --must-staple
    
    if [[ $? -eq 0 ]]; then
        log "SSL certificate obtained successfully"
    else
        error "Failed to obtain SSL certificate"
    fi
    
    # Start nginx
    systemctl start nginx
}

# Configure certificate auto-renewal
setup_auto_renewal() {
    log "Setting up certificate auto-renewal..."
    
    # Create renewal hook script
    cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh << 'EOF'
#!/bin/bash
# Reload nginx after certificate renewal
systemctl reload nginx

# Log renewal
echo "$(date): SSL certificate renewed and nginx reloaded" >> /var/log/ssl_renewal.log

# Send notification (optional - configure your notification method)
# curl -X POST "https://your-monitoring-service.com/webhook" \
#      -H "Content-Type: application/json" \
#      -d '{"message": "SSL certificate renewed for AttendanceAPI"}'
EOF

    chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh
    
    # Test auto-renewal
    certbot renew --dry-run
    
    if [[ $? -eq 0 ]]; then
        log "Auto-renewal configured and tested successfully"
    else
        warning "Auto-renewal test failed. Please check configuration."
    fi
}

# Create OCSP stapling configuration
setup_ocsp_stapling() {
    log "Setting up OCSP stapling..."
    
    local ocsp_cache_dir="/var/cache/nginx/ocsp"
    mkdir -p "$ocsp_cache_dir"
    chown www-data:www-data "$ocsp_cache_dir"
    chmod 755 "$ocsp_cache_dir"
    
    log "OCSP stapling configured"
}

# Generate security configuration snippet
create_security_config() {
    log "Creating security configuration snippet..."
    
    cat > "$NGINX_CONFIG_DIR/snippets/ssl-security.conf" << 'EOF'
# SSL Security Configuration for AttendanceAPI
# Modern SSL/TLS configuration with strong security

# SSL protocols and ciphers
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

# SSL session configuration
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_session_tickets off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
ssl_stapling_file /var/cache/nginx/ocsp/stapling.ocsp;

# DNS resolvers for OCSP
resolver 8.8.8.8 8.8.4.4 1.1.1.1 1.0.0.1 valid=300s;
resolver_timeout 5s;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Certificate Transparency
add_header Expect-CT "max-age=86400, enforce" always;
EOF

    log "Security configuration snippet created"
}

# Create certificate monitoring script
create_cert_monitor() {
    log "Creating certificate monitoring script..."
    
    cat > /usr/local/bin/check-ssl-cert.sh << 'EOF'
#!/bin/bash

# SSL Certificate Monitoring Script for AttendanceAPI
# Checks certificate expiration and sends alerts

DOMAIN="your-api-domain.com"
ALERT_DAYS=30
LOG_FILE="/var/log/ssl_monitor.log"
EMAIL="admin@your-domain.com"

# Get certificate expiration date
CERT_FILE="/etc/letsencrypt/live/$DOMAIN/cert.pem"

if [[ ! -f "$CERT_FILE" ]]; then
    echo "$(date): Certificate file not found: $CERT_FILE" >> "$LOG_FILE"
    exit 1
fi

# Get expiration date
EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
CURRENT_EPOCH=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( (EXPIRY_EPOCH - CURRENT_EPOCH) / 86400 ))

echo "$(date): Certificate expires in $DAYS_UNTIL_EXPIRY days" >> "$LOG_FILE"

# Check if certificate is expiring soon
if [[ $DAYS_UNTIL_EXPIRY -le $ALERT_DAYS ]]; then
    # Send alert (configure your preferred notification method)
    echo "$(date): ALERT - Certificate expires in $DAYS_UNTIL_EXPIRY days!" >> "$LOG_FILE"
    
    # Email alert (requires mail command)
    if command -v mail &> /dev/null; then
        echo "SSL certificate for $DOMAIN expires in $DAYS_UNTIL_EXPIRY days. Please renew immediately." | \
        mail -s "SSL Certificate Expiration Alert - $DOMAIN" "$EMAIL"
    fi
    
    # Webhook alert (optional)
    # curl -X POST "https://your-monitoring-service.com/webhook" \
    #      -H "Content-Type: application/json" \
    #      -d "{\"message\": \"SSL certificate for $DOMAIN expires in $DAYS_UNTIL_EXPIRY days\"}"
fi

# Check certificate validity
if ! openssl x509 -checkend 86400 -noout -in "$CERT_FILE"; then
    echo "$(date): ERROR - Certificate is invalid or expires within 24 hours!" >> "$LOG_FILE"
    exit 1
fi

echo "$(date): Certificate check completed successfully" >> "$LOG_FILE"
EOF

    chmod +x /usr/local/bin/check-ssl-cert.sh
    
    # Add to crontab for daily checks
    (crontab -l 2>/dev/null; echo "0 6 * * * /usr/local/bin/check-ssl-cert.sh") | crontab -
    
    log "Certificate monitoring script created and scheduled"
}

# Test SSL configuration
test_ssl_config() {
    log "Testing SSL configuration..."
    
    # Test nginx configuration
    nginx -t
    
    if [[ $? -eq 0 ]]; then
        log "Nginx configuration test passed"
    else
        error "Nginx configuration test failed"
    fi
    
    # Reload nginx
    systemctl reload nginx
    
    # Test SSL certificate
    echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | \
    openssl x509 -noout -dates
    
    log "SSL configuration test completed"
}

# Create backup script for certificates
create_cert_backup() {
    log "Creating certificate backup script..."
    
    cat > /usr/local/bin/backup-ssl-certs.sh << 'EOF'
#!/bin/bash

# SSL Certificate Backup Script
BACKUP_DIR="/var/backups/ssl"
DATE=$(date +%Y%m%d_%H%M%S)
LETSENCRYPT_DIR="/etc/letsencrypt"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup
tar -czf "$BACKUP_DIR/ssl_backup_$DATE.tar.gz" \
    "$LETSENCRYPT_DIR" \
    "/etc/nginx/ssl" \
    "/etc/nginx/snippets/ssl-security.conf"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "ssl_backup_*.tar.gz" -mtime +30 -delete

echo "$(date): SSL certificates backed up to $BACKUP_DIR/ssl_backup_$DATE.tar.gz" >> /var/log/ssl_backup.log
EOF

    chmod +x /usr/local/bin/backup-ssl-certs.sh
    
    # Add to crontab for weekly backups
    (crontab -l 2>/dev/null; echo "0 2 * * 0 /usr/local/bin/backup-ssl-certs.sh") | crontab -
    
    log "Certificate backup script created and scheduled"
}

# Main execution
main() {
    log "Starting SSL/TLS setup for AttendanceAPI"
    log "Domain: $DOMAIN"
    log "Email: $EMAIL"
    
    check_root
    check_requirements
    create_ssl_directories
    generate_dhparam
    obtain_letsencrypt_cert
    setup_auto_renewal
    setup_ocsp_stapling
    create_security_config
    create_cert_monitor
    create_cert_backup
    test_ssl_config
    
    log "SSL/TLS setup completed successfully!"
    log "Certificate location: /etc/letsencrypt/live/$DOMAIN/"
    log "DH parameters: $SSL_DIR/dhparam.pem"
    log "Security config: $NGINX_CONFIG_DIR/snippets/ssl-security.conf"
    
    info "Next steps:"
    info "1. Update your nginx configuration to use the new certificates"
    info "2. Test your SSL configuration at: https://www.ssllabs.com/ssltest/"
    info "3. Monitor certificate expiration with the installed monitoring script"
    info "4. Configure your notification endpoints in the monitoring scripts"
}

# Run main function
main "$@"
