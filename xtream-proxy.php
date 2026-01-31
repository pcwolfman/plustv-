<?php
// Xtream Codes API Proxy
// Mobil cihazlarda CORS sorunlarını çözmek için sunucu tarafı proxy

// Hataları göster (geliştirme için)
error_reporting(E_ALL);
ini_set('display_errors', 0); // Production'da 0 yapın

// CORS Headers - Mobil cihazlar için gerekli
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// OPTIONS isteği için hemen cevap ver
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Sadece GET isteklerini kabul et
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Sadece GET istekleri desteklenir']);
    exit;
}

// Parametreleri al
$serverUrl = isset($_GET['server']) ? trim($_GET['server']) : '';
$username = isset($_GET['username']) ? trim($_GET['username']) : '';
$password = isset($_GET['password']) ? trim($_GET['password']) : '';
$action = isset($_GET['action']) ? trim($_GET['action']) : '';
$endpoint = isset($_GET['endpoint']) ? trim($_GET['endpoint']) : 'player_api.php';

// Validasyon
if (empty($serverUrl) || empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'Server URL, kullanıcı adı ve şifre gereklidir']);
    exit;
}

// Server URL'i normalize et
$serverUrl = rtrim($serverUrl, '/');
if (!preg_match('/^https?:\/\//', $serverUrl)) {
    $serverUrl = 'http://' . $serverUrl;
}

// Endpoint'i oluştur
$apiUrl = $serverUrl . '/' . $endpoint;

// Query parametrelerini oluştur
$queryParams = [
    'username' => $username,
    'password' => $password
];

// Action varsa ekle
if (!empty($action)) {
    $queryParams['action'] = $action;
}

// URL'i oluştur
$fullUrl = $apiUrl . '?' . http_build_query($queryParams);

// cURL ile istek yap
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $fullUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

// İsteği çalıştır
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Hata kontrolü
if ($response === false || !empty($curlError)) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Bağlantı hatası',
        'message' => $curlError ?: 'Bilinmeyen hata'
    ]);
    exit;
}

// HTTP kodu kontrolü
if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo json_encode([
        'error' => 'API hatası',
        'http_code' => $httpCode,
        'response' => $response
    ]);
    exit;
}

// JSON kontrolü
$jsonData = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    // JSON değilse, hata mesajı olabilir
    http_response_code(500);
    echo json_encode([
        'error' => 'Geçersiz JSON yanıtı',
        'response' => substr($response, 0, 500)
    ]);
    exit;
}

// Başarılı yanıt
http_response_code(200);
echo $response;
?>

