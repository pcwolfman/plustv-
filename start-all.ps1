# PlusTV ve TVGlobal API'yi birlikte başlat
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PlusTV ve TVGlobal API Başlatılıyor" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# TVGlobal API'yi başlat
$apiPath = "C:\Users\pcmy\Downloads\tvglobal"
if (Test-Path $apiPath) {
    Write-Host "[1/2] TVGlobal API başlatılıyor (Port 3000)..." -ForegroundColor Yellow
    $apiProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$apiPath'; node server.js" -PassThru -WindowStyle Minimized
    Start-Sleep -Seconds 3
    
    # API'nin çalıştığını kontrol et
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "✅ TVGlobal API başarıyla başlatıldı!" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  TVGlobal API başlatılamadı, devam ediliyor..." -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  TVGlobal API dizini bulunamadı: $apiPath" -ForegroundColor Red
}

Write-Host ""

# PlusTV'yi başlat
Write-Host "[2/2] PlusTV başlatılıyor (Port 8080)..." -ForegroundColor Yellow
Write-Host ""
Write-Host "✅ Servisler başlatıldı!" -ForegroundColor Green
Write-Host ""
Write-Host "📡 TVGlobal API: http://localhost:3000" -ForegroundColor Cyan
Write-Host "📺 PlusTV: http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tarayıcıda açılıyor..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Start-Process "http://localhost:8080"
Write-Host ""
Write-Host "⚠️  Bu pencereyi kapatmayın! (PlusTV çalışıyor)" -ForegroundColor Yellow
Write-Host "⚠️  API'yi durdurmak için 'TVGlobal API' penceresini kapatın." -ForegroundColor Yellow
Write-Host ""

# PlusTV'yi başlat (bağımlılıksız local server)
node static-server.js

