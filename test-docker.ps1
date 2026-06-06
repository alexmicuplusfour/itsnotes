# itsnotes - Docker Test Script (PowerShell)
# This script tests if the Docker deployment is working correctly

Write-Host "🧪 Testing Docker Deployment" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# Check if containers are running
Write-Host "📊 Checking container status..." -ForegroundColor Yellow
$containerStatus = docker-compose ps
if ($containerStatus -notmatch "Up") {
    Write-Host "❌ Containers are not running. Please run .\docker-setup.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Containers are running" -ForegroundColor Green

# Test database connection
Write-Host "🗄️ Testing database connection..." -ForegroundColor Yellow
try {
    $dbTest = docker-compose exec -T postgres pg_isready -U itsnotesuser -d itsnotes 2>$null
    Write-Host "✅ Database is ready" -ForegroundColor Green
} catch {
    Write-Host "❌ Database connection failed" -ForegroundColor Red
    exit 1
}

# Test server health
Write-Host "🔧 Testing server health..." -ForegroundColor Yellow
Start-Sleep -Seconds 5  # Give server time to start

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/notes" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Host "✅ Server API is responding" -ForegroundColor Green
} catch {
    Write-Host "❌ Server API is not responding" -ForegroundColor Red
    Write-Host "   Try waiting a few more seconds and run the test again" -ForegroundColor Yellow
    exit 1
}

# Test client
Write-Host "🌐 Testing client..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Host "✅ Client is serving" -ForegroundColor Green
} catch {
    Write-Host "❌ Client is not responding" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 All tests passed!" -ForegroundColor Green
Write-Host "Your itsnotes is ready to use at http://localhost:3000" -ForegroundColor Cyan
