#!/bin/bash

# itsnotes - Docker Test Script
# This script tests if the Docker deployment is working correctly

echo "🧪 Testing Docker Deployment"
echo "============================"

# Check if containers are running
echo "📊 Checking container status..."
if ! docker-compose ps | grep -q "Up"; then
    echo "❌ Containers are not running. Please run docker-setup.sh first."
    exit 1
fi

echo "✅ Containers are running"

# Test database connection
echo "🗄️ Testing database connection..."
if docker-compose exec -T postgres pg_isready -U itsnotesuser -d itsnotes > /dev/null 2>&1; then
    echo "✅ Database is ready"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Test server health
echo "🔧 Testing server health..."
sleep 5  # Give server time to start
if curl -f http://localhost:3000/api/notes > /dev/null 2>&1; then
    echo "✅ Server API is responding"
else
    echo "❌ Server API is not responding"
    echo "   Try waiting a few more seconds and run the test again"
    exit 1
fi

# Test client
echo "🌐 Testing client..."
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Client is serving"
else
    echo "❌ Client is not responding"
    exit 1
fi

echo ""
echo "🎉 All tests passed!"
echo "Your itsnotes is ready to use at http://localhost:3000"
