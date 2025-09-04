###!/bin/Bash Terminal
### scripts/secure-database.sh

### Create dedicated database user
sudo -u postgres psql -c "CREATE USER kbai_user WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE kbai_production OWNER kbai_user;"

### Grant minimal required permissions
sudo -u postgres psql -d kbai_production -c "
GRANT CONNECT ON DATABASE kbai_production TO kbai_user;
GRANT USAGE ON SCHEMA public TO kbai_user;
GRANT CREATE ON SCHEMA public TO kbai_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kbai_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kbai_user;
"

### Configure PostgreSQL security
sudo tee -a /etc/postgresql/14/main/postgresql.conf << EOF
### Security Configuration
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'
password_encryption = scram-sha-256
log_connections = on
log_disconnections = on
log_statement = 'mod'
EOF

### Restart PostgreSQL
sudo systemctl restart postgresql