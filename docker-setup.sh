#!/bin/bash

# itsnotes - Docker Setup Script
# This script sets up and starts the application with Docker

set -e

echo "🚀 itsnotes - Docker Setup"
echo "=================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker and try again."
    echo "   Download from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose and try again."
    echo "   Usually included with Docker Desktop"
    exit 1
fi

echo "✅ Docker found: $(docker --version)"
echo "✅ Docker Compose found: $(docker-compose --version)"

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running. Please start Docker and try again."
    exit 1
fi

echo "✅ Docker daemon is running"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file. You can customize it if needed."
    else
        echo "🔧 Creating default .env file..."
        cat > .env << EOF
# Database Configuration
DB_USER=itsnotesuser
DB_PASSWORD=keeppassword
DB_NAME=itsnotes

# Client Configuration
CLIENT_PORT=3000
EOF
        echo "✅ Created default .env file."
    fi
else
    echo "📄 Using existing .env file."
fi

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
docker-compose down 2>/dev/null || true

# Build and start the application
echo "🔨 Building and starting containers..."
echo "   This may take a few minutes on first run..."

if docker-compose up -d --build; then
    echo "✅ Containers started successfully!"
    
    # Wait for services to be ready
    echo "⏳ Waiting for services to start..."
    sleep 15
    
    # Check service status
    echo "📊 Checking service status..."
    docker-compose ps
    
    # Test if services are responding
    echo "🧪 Testing services..."
    
    # Wait a bit more for services to fully initialize
    sleep 10
    
    # Test database
    if docker-compose exec -T postgres pg_isready -U itsnotesuser -d itsnotes &>/dev/null; then
        echo "✅ Database is ready"
    else
        echo "⚠️  Database might still be starting up"
    fi
    
    # Display access information
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "🌐 Application URLs:"
    echo "   Frontend: http://localhost:3000"
    echo "   API: http://localhost:3000/api"
    echo ""
    echo "📝 Useful commands:"
    echo "   docker-compose logs -f          # View logs"
    echo "   docker-compose ps               # Check status"
    echo "   docker-compose down             # Stop app"
    echo "   docker-compose restart          # Restart services"
    echo "   docker-compose exec postgres psql -U itsnotesuser -d itsnotes  # Database access"
    echo ""
    echo "🔧 To customize configuration, edit the .env file and run:"
    echo "   docker-compose down && docker-compose up -d"
    echo ""
    echo "📖 Check README.md for more information and troubleshooting."
    
else
    echo "❌ Failed to start containers!"
    echo ""
    echo "🔍 Troubleshooting:"
    echo "   1. Check if ports 3000 and 5000 are available"
    echo "   2. Ensure Docker has enough memory (4GB recommended)"
    echo "   3. View logs: docker-compose logs"
    echo "   4. Try: docker-compose down && docker-compose up -d --build"
    exit 1
fi