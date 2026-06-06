# Google Keep Clone - Docker Setup Script (PowerShell)
# This script sets up and starts the application with Docker on Windows

param(
    [switch]$Build = $false,
    [switch]$Down = $false,
    [switch]$Logs = $false
)

Write-Host "🚀 Google Keep Clone - Docker Setup" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# Check if Docker is installed and running
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed or not running. Please install Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is available
try {
    $composeVersion = docker-compose --version
    Write-Host "✅ Docker Compose found: $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not available. Please make sure Docker Desktop is properly installed." -ForegroundColor Red
    exit 1
}

# Handle command line options
if ($Down) {
    Write-Host "🛑 Stopping containers..." -ForegroundColor Yellow
    docker-compose down
    Write-Host "✅ Containers stopped." -ForegroundColor Green
    exit 0
}

if ($Logs) {
    Write-Host "📋 Showing logs..." -ForegroundColor Yellow
    docker-compose logs -f
    exit 0
}

# Create .env file if it doesn't exist
if (!(Test-Path ".env")) {
    Write-Host "📄 Creating .env file from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env file. You can customize it if needed." -ForegroundColor Green
} else {
    Write-Host "📄 Using existing .env file." -ForegroundColor Green
}

# Stop any existing containers
Write-Host "🛑 Stopping any existing containers..." -ForegroundColor Yellow
docker-compose down

# Build and start the application
if ($Build) {
    Write-Host "🔨 Building and starting containers..." -ForegroundColor Yellow
    docker-compose up -d --build
} else {
    Write-Host "🚀 Starting containers..." -ForegroundColor Yellow
    docker-compose up -d
}

# Wait for services to be ready
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service status
Write-Host "📊 Checking service status..." -ForegroundColor Yellow
docker-compose ps

# Display access information
Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Application is available at:" -ForegroundColor Cyan
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "   API: http://localhost:3000/api" -ForegroundColor White
Write-Host ""
Write-Host "📝 Useful commands:" -ForegroundColor Cyan
Write-Host "   .\docker-setup.ps1 -Logs    # View logs" -ForegroundColor White
Write-Host "   .\docker-setup.ps1 -Down    # Stop app" -ForegroundColor White
Write-Host "   .\docker-setup.ps1 -Build   # Rebuild and start" -ForegroundColor White
Write-Host "   docker-compose restart      # Restart services" -ForegroundColor White
Write-Host ""
Write-Host "🔧 To customize configuration, edit the .env file and restart." -ForegroundColor Yellow
