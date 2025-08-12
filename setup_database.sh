#!/bin/bash
# setup-database.sh - Complete Database Setup Script

set -e

echo "🚀 Setting up KBAI API Databases..."

# --- Configuration ---
DB_HOST="localhost"
DB_PORT="5432"
MAIN_DB="kbai_db"
TEST_DB="kbai_db_test"
MAIN_USER="postgres"
TEST_USER="test_user"
TEST_PASSWORD="test_password"

export PGPASSWORD="Kiron2002."

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Helper Functions ---
echo_success() { echo -e "${GREEN}✅ $1${NC}"; }
echo_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
echo_error()   { echo -e "${RED}❌ $1${NC}"; }

# --- PostgreSQL Functions ---

# Check if PostgreSQL is running
check_postgres() {
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" > /dev/null 2>&1; then
        echo_error "PostgreSQL is not running on $DB_HOST:$DB_PORT"
        echo "Please start PostgreSQL service first"
        exit 1
    fi
    echo_success "PostgreSQL is running"
}

# Drop database if it exists
drop_database() {
    local db_name="$1"
    echo "Dropping database: $db_name (if it exists)"
    psql -v ON_ERROR_STOP=1 --username "$MAIN_USER" -d "postgres" -c "DROP DATABASE IF EXISTS \"$db_name\";"
}

# Create database
create_database() {
    local db_name="$1"
    echo "Creating database: $db_name"
    psql -v ON_ERROR_STOP=1 --username "$MAIN_USER" -d "postgres" -c "CREATE DATABASE \"$db_name\";"
}

# Create user if it doesn't exist
create_user() {
    local username="$1"
    local password="$2"
    echo "Creating user: $username"
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$MAIN_USER" -t -c "SELECT 1 FROM pg_roles WHERE rolname='$username'" | grep -q 1; then
        echo_warning "User $username already exists"
    else
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$MAIN_USER" -c "CREATE USER \"$username\" WITH PASSWORD '$password';"
        echo_success "User $username created"
    fi
}

# Grant permissions
grant_permissions() {
    local db_name="$1"
    local username="$2"
    echo "Granting permissions on $db_name to $username"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$MAIN_USER" -d "$db_name" -c "
        GRANT ALL PRIVILEGES ON DATABASE \"$db_name\" TO \"$username\";
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"$username\";
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"$username\";
        GRANT ALL PRIVILEGES ON SCHEMA public TO \"$username\";
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"$username\";
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"$username\";
    "
    echo_success "Permissions granted to $username on $db_name"
}

# --- Main Script ---

# Check PostgreSQL
check_postgres

# Drop and Create Main Database
drop_database "$MAIN_DB"
create_database "$MAIN_DB"

# Create Test User and Database
create_user "$TEST_USER" "$TEST_PASSWORD"
drop_database "$TEST_DB"
create_database "$TEST_DB"

# Grant Permissions
grant_permissions "$MAIN_DB" "$MAIN_USER"
grant_permissions "$TEST_DB" "$TEST_USER"

# Run Migrations
echo "Running migrations for main database..."
NODE_ENV=development npx knex migrate:latest
echo_success "Main database migrations completed"

echo "Running migrations for test database..."
NODE_ENV=test npx knex migrate:latest
echo_success "Test database migrations completed"

# Seed Test Data
echo "Seeding test database..."
NODE_ENV=test npx knex seed:run
echo_success "Test database seeded"

echo_success "Database setup completed successfully!"

echo ""
echo "📋 Database Information:"
echo "  Main Database: $MAIN_DB (user: $MAIN_USER)"
echo "  Test Database: $TEST_DB (user: $TEST_USER)"
echo ""
echo "🔧 Next steps:"
echo "  1. Update your .env file with correct database credentials"
echo "  2. Run 'npm test' to verify everything is working"
echo "  3. Run 'npm start' to start the API server"