#!/bin/bash
# Phase 6: Database Migration and Setup Script

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${POSTGRES_DB:-pos_system}
DB_USER=${POSTGRES_USER:-postgres}
DB_PASSWORD=${POSTGRES_PASSWORD:-password}

echo -e "${BLUE}🚀 Phase 6: Database Migration and Setup${NC}"
echo -e "${BLUE}======================================${NC}"

# Function to check if PostgreSQL is running
check_postgres() {
    echo -e "${YELLOW}🔍 Checking PostgreSQL connection...${NC}"
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c '\q' 2>/dev/null; then
        echo -e "${GREEN}✅ PostgreSQL is running${NC}"
        return 0
    else
        echo -e "${RED}❌ PostgreSQL is not running or not accessible${NC}"
        return 1
    fi
}

# Function to create database if it doesn't exist
create_database() {
    echo -e "${YELLOW}🏗️  Creating database if not exists...${NC}"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo -e "${GREEN}✅ Database $DB_NAME already exists${NC}"
}

# Function to run SQL migration files
run_migrations() {
    echo -e "${YELLOW}📝 Running database migrations...${NC}"
    
    # Check if migrations directory exists
    if [ ! -d "database/migrations" ]; then
        echo -e "${YELLOW}⚠️  Creating migrations directory...${NC}"
        mkdir -p database/migrations
    fi
    
    # Run each migration file in order
    for migration_file in database/migrations/*.sql; do
        if [ -f "$migration_file" ]; then
            echo -e "${BLUE}🔄 Running migration: $(basename $migration_file)${NC}"
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration_file"
            echo -e "${GREEN}✅ Migration completed: $(basename $migration_file)${NC}"
        fi
    done
}

# Function to seed initial data
seed_data() {
    echo -e "${YELLOW}🌱 Seeding initial data...${NC}"
    
    # Check if seed directory exists
    if [ ! -d "database/seeds" ]; then
        echo -e "${YELLOW}⚠️  Creating seeds directory...${NC}"
        mkdir -p database/seeds
    fi
    
    # Run each seed file
    for seed_file in database/seeds/*.sql; do
        if [ -f "$seed_file" ]; then
            echo -e "${BLUE}🔄 Running seed: $(basename $seed_file)${NC}"
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$seed_file"
            echo -e "${GREEN}✅ Seed completed: $(basename $seed_file)${NC}"
        fi
    done
}

# Function to verify database setup
verify_setup() {
    echo -e "${YELLOW}🔍 Verifying database setup...${NC}"
    
    # Count tables
    table_count=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    echo -e "${GREEN}✅ Found $table_count tables${NC}"
    
    # Check critical tables
    critical_tables=("users" "customers" "products" "sales" "invoices" "ledger_entries" "accounts")
    for table in "${critical_tables[@]}"; do
        exists=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
        if [[ "$exists" =~ "t" ]]; then
            echo -e "${GREEN}✅ Table '$table' exists${NC}"
        else
            echo -e "${YELLOW}⚠️  Table '$table' not found${NC}"
        fi
    done
}

# Main execution
main() {
    echo -e "${BLUE}Starting database setup process...${NC}"
    
    # Check prerequisites
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}❌ PostgreSQL client (psql) is not installed${NC}"
        exit 1
    fi
    
    # Wait for PostgreSQL to be ready
    echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
    retry_count=0
    max_retries=30
    
    while ! check_postgres && [ $retry_count -lt $max_retries ]; do
        retry_count=$((retry_count + 1))
        echo -e "${YELLOW}⏳ Attempt $retry_count/$max_retries - Waiting 2 seconds...${NC}"
        sleep 2
    done
    
    if [ $retry_count -eq $max_retries ]; then
        echo -e "${RED}❌ Failed to connect to PostgreSQL after $max_retries attempts${NC}"
        exit 1
    fi
    
    # Execute setup steps
    create_database
    run_migrations
    seed_data
    verify_setup
    
    echo -e "${GREEN}🎉 Database setup completed successfully!${NC}"
    echo -e "${BLUE}Database: $DB_NAME${NC}"
    echo -e "${BLUE}Host: $DB_HOST:$DB_PORT${NC}"
    echo -e "${BLUE}User: $DB_USER${NC}"
}

# Run main function
main "$@"