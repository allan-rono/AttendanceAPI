#!/bin/bash

set -e

echo "Setting up KBAI PostgreSQL database..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

DB_USER=${DB_USER:-kbai_user}
DB_NAME=${DB_NAME:-kbai_db}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}

echo "Creating database user and database..."

# Create user and database (run as postgres user)
sudo -u postgres psql << EOF
-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo "Running migrations..."
npx knex migrate:latest

if [ "$NODE_ENV" != "production" ]; then
    echo "Running seeds (development only)..."
    npx knex seed:run
fi

echo "Database setup complete!"