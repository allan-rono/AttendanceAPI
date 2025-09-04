###!/bin/Bash Terminal
### scripts/health-monitor.sh

API_URL="https://your-api-domain.com"
LOG_FILE="/var/log/attendance-api-monitor.log"

check_api_health() {
    response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
    if [ "$response" != "200" ]; then
        echo "$(date): API health check failed - HTTP $response" >> $LOG_FILE
        systemctl restart attendance-api
    fi
}

check_database() {
    if ! sudo -u postgres psql -d attendance_api_prod -c "SELECT 1;" > /dev/null 2>&1; then
        echo "$(date): Database connection failed" >> $LOG_FILE
    fi
}

check_disk_space() {
    usage=$(df /opt/attendance-api | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$usage" -gt 80 ]; then
        echo "$(date): Disk usage high: ${usage}%" >> $LOG_FILE
    fi
}

### Run checks
check_api_health
check_database
check_disk_space