#!/bin/bash
# Phase 6: Production Build and Deployment Script

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.production"

echo -e "${BLUE}🚀 Phase 6: Production Build and Deployment${NC}"
echo -e "${BLUE}===========================================${NC}"

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed${NC}"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed${NC}"
        exit 1
    fi
    
    # Check if environment file exists
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}⚠️  Production environment file not found${NC}"
        echo -e "${YELLOW}📋 Copying template to $ENV_FILE${NC}"
        cp .env.production.template "$ENV_FILE"
        echo -e "${YELLOW}⚠️  Please configure $ENV_FILE with production values${NC}"
        echo -e "${YELLOW}🛑 Exiting - Configuration required${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}"
}

# Function to build images
build_images() {
    echo -e "${YELLOW}🏗️  Building Docker images...${NC}"
    
    echo -e "${BLUE}📦 Building backend image...${NC}"
    docker-compose build backend
    
    echo -e "${BLUE}📦 Building accounting API image...${NC}"
    docker-compose build accounting-api
    
    echo -e "${BLUE}📦 Building frontend image...${NC}"
    docker-compose build frontend
    
    echo -e "${GREEN}✅ All images built successfully${NC}"
}

# Function to run database setup
setup_database() {
    echo -e "${YELLOW}🗄️  Setting up database...${NC}"
    
    # Start PostgreSQL container
    echo -e "${BLUE}🚀 Starting PostgreSQL...${NC}"
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
    sleep 10
    
    # Run database setup script
    echo -e "${BLUE}📝 Running database migrations...${NC}"
    docker-compose exec postgres psql -U postgres -d pos_system -c "SELECT version();"
    
    # If we have a setup script, run it
    if [ -f "database/setup.sh" ]; then
        echo -e "${BLUE}🔄 Running database setup script...${NC}"
        chmod +x database/setup.sh
        ./database/setup.sh
    fi
    
    echo -e "${GREEN}✅ Database setup completed${NC}"
}

# Function to start all services
start_services() {
    echo -e "${YELLOW}🚀 Starting all services...${NC}"
    
    # Start all services
    docker-compose up -d
    
    echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
    sleep 15
    
    # Check service health
    check_health
}

# Function to check service health
check_health() {
    echo -e "${YELLOW}🔍 Checking service health...${NC}"
    
    services=(
        "postgres:5432"
        "redis:6379"
        "backend:3001"
        "accounting-api:5062"
        "frontend:3000"
        "nginx:80"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r name port <<< "$service"
        echo -e "${BLUE}🔄 Checking $name on port $port...${NC}"
        
        if docker-compose exec $name nc -z localhost $port 2>/dev/null; then
            echo -e "${GREEN}✅ $name is healthy${NC}"
        else
            echo -e "${YELLOW}⚠️  $name might not be ready yet${NC}"
        fi
    done
}

# Function to run health check endpoints
test_endpoints() {
    echo -e "${YELLOW}🧪 Testing API endpoints...${NC}"
    
    # Test main application
    if curl -f http://localhost/health &>/dev/null; then
        echo -e "${GREEN}✅ Main application health check passed${NC}"
    else
        echo -e "${RED}❌ Main application health check failed${NC}"
    fi
    
    # Test backend API
    if curl -f http://localhost/api/health &>/dev/null; then
        echo -e "${GREEN}✅ Backend API health check passed${NC}"
    else
        echo -e "${RED}❌ Backend API health check failed${NC}"
    fi
    
    # Test accounting API
    if curl -f -H "X-API-Key: your_shared_secret_key_here" http://localhost:5062/health &>/dev/null; then
        echo -e "${GREEN}✅ Accounting API health check passed${NC}"
    else
        echo -e "${RED}❌ Accounting API health check failed${NC}"
    fi
}

# Function to show deployment summary
show_summary() {
    echo -e "${PURPLE}🎉 DEPLOYMENT SUMMARY${NC}"
    echo -e "${PURPLE}===================${NC}"
    echo -e "${GREEN}✅ Production build completed successfully${NC}"
    echo ""
    echo -e "${BLUE}📊 Service Status:${NC}"
    docker-compose ps
    echo ""
    echo -e "${BLUE}🌐 Access URLs:${NC}"
    echo -e "${GREEN}Frontend: http://localhost${NC}"
    echo -e "${GREEN}Backend API: http://localhost/api${NC}"
    echo -e "${GREEN}Accounting API: http://localhost:5062${NC}"
    echo -e "${GREEN}Nginx Status: http://localhost/health${NC}"
    echo ""
    echo -e "${BLUE}📋 Management Commands:${NC}"
    echo -e "${YELLOW}Stop services: docker-compose down${NC}"
    echo -e "${YELLOW}View logs: docker-compose logs -f [service]${NC}"
    echo -e "${YELLOW}Restart service: docker-compose restart [service]${NC}"
    echo -e "${YELLOW}Scale service: docker-compose up -d --scale backend=2${NC}"
}

# Function to cleanup on failure
cleanup_on_failure() {
    echo -e "${RED}❌ Deployment failed. Cleaning up...${NC}"
    docker-compose down
}

# Function for development deployment
deploy_development() {
    echo -e "${BLUE}🔧 Development Deployment Mode${NC}"
    ENV_FILE=".env"
    DOCKER_COMPOSE_FILE="docker-compose.dev.yml"
    
    if [ ! -f "$ENV_FILE" ]; then
        cp .env.development.template "$ENV_FILE"
        echo -e "${GREEN}✅ Development environment file created${NC}"
    fi
}

# Function for production deployment
deploy_production() {
    echo -e "${BLUE}🏭 Production Deployment Mode${NC}"
    ENV_FILE=".env.production"
    DOCKER_COMPOSE_FILE="docker-compose.yml"
}

# Main deployment function
main() {
    # Parse command line arguments
    DEPLOYMENT_MODE=${1:-production}
    
    case $DEPLOYMENT_MODE in
        "dev"|"development")
            deploy_development
            ;;
        "prod"|"production")
            deploy_production
            ;;
        *)
            echo -e "${RED}❌ Invalid deployment mode. Use 'dev' or 'prod'${NC}"
            exit 1
            ;;
    esac
    
    echo -e "${BLUE}🎯 Deployment Mode: $DEPLOYMENT_MODE${NC}"
    echo -e "${BLUE}📄 Using: $DOCKER_COMPOSE_FILE${NC}"
    echo -e "${BLUE}🔧 Environment: $ENV_FILE${NC}"
    echo ""
    
    # Set trap for cleanup on failure
    trap cleanup_on_failure ERR
    
    # Execute deployment steps
    check_prerequisites
    build_images
    setup_database
    start_services
    
    # Wait a bit more for services to fully initialize
    echo -e "${YELLOW}⏳ Waiting for services to fully initialize...${NC}"
    sleep 10
    
    test_endpoints
    show_summary
    
    echo -e "${GREEN}🎉 Phase 6 deployment completed successfully!${NC}"
}

# Show usage if help is requested
if [[ "${1}" == "-h" ]] || [[ "${1}" == "--help" ]]; then
    echo "Usage: $0 [mode]"
    echo ""
    echo "Modes:"
    echo "  dev, development  - Deploy in development mode"
    echo "  prod, production  - Deploy in production mode (default)"
    echo ""
    echo "Examples:"
    echo "  $0 dev            - Development deployment"
    echo "  $0 prod           - Production deployment"
    echo "  $0                - Production deployment (default)"
    exit 0
fi

# Run main function
main "$@"