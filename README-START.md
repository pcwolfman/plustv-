# PlusTV Başlatma Kılavuzu

## Hızlı Başlatma

### Yöntem 1: Otomatik Başlatma (Önerilen)
Her iki servisi birlikte başlatmak için:

**Windows:**
```bash
# Batch dosyası ile
start-all.bat

# Veya PowerShell ile
npm run start:all
```

### Yöntem 2: Manuel Başlatma

**1. TVGlobal API'yi başlat:**
```bash
cd C:\Users\pcmy\Downloads\tvglobal
node server.js
```

**2. PlusTV'yi başlat (yeni terminal):**
```bash
cd C:\Users\pcmy\Downloads\plustvm3u
npm start
```

## Servisler

- **TVGlobal API**: `http://localhost:3000`
  - Ülke listesi ve kanallar için gerekli
  - Arka planda çalışmalı
  
- **PlusTV**: `http://localhost:8080`
  - Ana uygulama
  - Tarayıcıda otomatik açılır

## Önemli Notlar

⚠️ **TVGlobal API çalışmazsa:**
- Ülke seçimi özelliği çalışmaz
- Fallback ülke listesi kullanılır (sınırlı)
- Kanallar yüklenemez

✅ **Her ikisi de çalışmalı:**
- Ülke seçimi tam çalışır
- Tüm ülkeler ve kanallar yüklenir
- En iyi deneyim

## Durdurma

- PlusTV'yi durdurmak: Terminal'de `Ctrl+C`
- TVGlobal API'yi durdurmak: API penceresinde `Ctrl+C` veya pencereyi kapat

