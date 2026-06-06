$SERVER  = "root@161.35.94.213"
$SSH_KEY = "$env:USERPROFILE\.ssh\do_itsnotes"
$REMOTE  = "/root/itsnotes"
$LOCAL   = "/mnt/d/TEMP/keep"
$DOMAIN  = "try.itsnotes.app"

Set-Content -Path ".\Caddyfile" -Value "$DOMAIN {`n    reverse_proxy itsnotes-client:80`n}"

Write-Host "Building images locally..." -ForegroundColor Cyan
docker build -t itsnotes-itsnotes-client ./client
if ($LASTEXITCODE -ne 0) { Write-Host "Client build failed" -ForegroundColor Red; exit 1 }
docker build -t itsnotes-itsnotes-server ./server
if ($LASTEXITCODE -ne 0) { Write-Host "Server build failed" -ForegroundColor Red; exit 1 }

Write-Host "Syncing files..." -ForegroundColor Cyan
wsl rsync -az --delete `
    --exclude='.git' --exclude='node_modules' --exclude='.claude' `
    --include='demo-data/seed.zip' --exclude='*.zip' --exclude='*.sql' --exclude='deploy*.ps1' --exclude='docker-compose.override.yml' `
    --exclude='deploy*.py' --exclude='check*.py' --exclude='client-image.tar' `
    --exclude='server/uploads' `
    -e "ssh -i ~/.ssh/do_itsnotes -o StrictHostKeyChecking=no" `
    ${LOCAL}/ ${SERVER}:${REMOTE}/
if ($LASTEXITCODE -ne 0) { Write-Host "rsync failed" -ForegroundColor Red; exit 1 }

Write-Host "Pushing images..." -ForegroundColor Cyan
docker save itsnotes-itsnotes-client itsnotes-itsnotes-server | ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "docker load"
if ($LASTEXITCODE -ne 0) { Write-Host "Image push failed" -ForegroundColor Red; exit 1 }

Write-Host "Restarting containers..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "cd $REMOTE && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.demo.yml up -d"
if ($LASTEXITCODE -ne 0) { Write-Host "Deploy failed" -ForegroundColor Red; exit 1 }

Write-Host "Done. https://$DOMAIN" -ForegroundColor Green
