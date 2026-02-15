#!/bin/bash
# Production Health Check Script
# File: scripts/health-check.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
TIMEOUT=30
RETRY_COUNT=3
HEALTH_ENDPOINTS=(
    "http://localhost:3001/api/health"
    "http://localhost:3002/health" 
    "http://localhost:80/health"
)

SERVICE_NAMES=(
    "Node.js Backend"
    "C# Accounting API"
    "Nginx Load Balancer"
)

# Function to check endpoint health
check_endpoint() {
    local endpoint=$1
    local service_name=$2
    local retry_count=0
    
    echo -e "${YELLOW}Checking ${service_name}...${NC}"
    
    while [ $retry_count -lt $RETRY_COUNT ]; do
        if curl -f -s --max-time $TIMEOUT "$endpoint" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ ${service_name} is healthy${NC}"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        echo -e "${YELLOW}  Attempt ${retry_count}/${RETRY_COUNT} failed, retrying...${NC}"
        sleep 2
    done
    
    echo -e "${RED}✗ ${service_name} is unhealthy${NC}"
    return 1
}

# Function to check database connectivity
check_database() {
    echo -e "${YELLOW}Checking database connectivity...${NC}"
    
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Database is accessible${NC}"
        return 0
    else
        echo -e "${RED}✗ Database is not accessible${NC}"
        return 1
    fi
}

# Function to check Redis connectivity
check_redis() {
    echo -e "${YELLOW}Checking Redis connectivity...${NC}"
    
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Redis is accessible${NC}"
        return 0
    else
        echo -e "${RED}✗ Redis is not accessible${NC}"
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    echo -e "${YELLOW}Checking disk space...${NC}"
    
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    local threshold=90
    
    if [ "$disk_usage" -lt "$threshold" ]; then
        echo -e "${GREEN}✓ Disk space is adequate (${disk_usage}% used)${NC}"
        return 0
    else
        echo -e "${RED}✗ Disk space is critical (${disk_usage}% used)${NC}"
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    echo -e "${YELLOW}Checking memory usage...${NC}"
    
    local memory_usage=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')
    local threshold=90
    
    if (( $(echo "$memory_usage < $threshold" | bc -l) )); then
        echo -e "${GREEN}✓ Memory usage is normal (${memory_usage}%)${NC}"
        return 0
    else
        echo -e "${RED}✗ Memory usage is high (${memory_usage}%)${NC}"
        return 1
    fi
}

# Function to check Docker containers
check_containers() {
    echo -e "${YELLOW}Checking Docker container status...${NC}"
    
    local unhealthy_containers=$(docker-compose ps | grep -v "Up" | grep -v "Name" | wc -l)
    
    if [ "$unhealthy_containers" -eq 0 ]; then
        echo -e "${GREEN}✓ All containers are running${NC}"
        return 0
    else
        echo -e "${RED}✗ ${unhealthy_containers} containers are not running${NC}"
        docker-compose ps
        return 1
    fi
}

# Main health check function
main() {
    echo "========================================="
    echo "SamplePOS Production Health Check"
    echo "========================================="
    echo ""
    
    local overall_status=0
    
    # Check infrastructure components
    check_containers || overall_status=1
    echo ""
    
    check_database || overall_status=1
    echo ""
    
    check_redis || overall_status=1
    echo ""
    
    # Check system resources
    check_disk_space || overall_status=1
    echo ""
    
    check_memory || overall_status=1
    echo ""
    
    # Check application endpoints
    for i in "${!HEALTH_ENDPOINTS[@]}"; do
        check_endpoint "${HEALTH_ENDPOINTS[$i]}" "${SERVICE_NAMES[$i]}" || overall_status=1
        echo ""
    done
    
    # Final status
    echo "========================================="
    if [ $overall_status -eq 0 ]; then
        echo -e "${GREEN}✓ Overall system health: HEALTHY${NC}"
        exit 0
    else
        echo -e "${RED}✗ Overall system health: UNHEALTHY${NC}"
        echo ""
        echo "Please check the failed components above."
        exit 1
    fi
}

# Parse command line arguments
case "${1:-check}" in
    "check")
        main
        ;;
    "endpoints-only")
        echo "Checking application endpoints only..."
        echo ""
        overall_status=0
        for i in "${!HEALTH_ENDPOINTS[@]}"; do
            check_endpoint "${HEALTH_ENDPOINTS[$i]}" "${SERVICE_NAMES[$i]}" || overall_status=1
        done
        exit $overall_status
        ;;
    "infrastructure-only")
        echo "Checking infrastructure components only..."
        echo ""
        overall_status=0
        check_containers || overall_status=1
        check_database || overall_status=1
        check_redis || overall_status=1
        exit $overall_status
        ;;
    *)
        echo "Usage: $0 [check|endpoints-only|infrastructure-only]"
        exit 1
        ;;
esac