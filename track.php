<?php
// --- 1. Zugangsdaten zur Datenbank ---
$host = "rdbms.strato.de";        // Hostname von Strato (ggf. anpassen)
$db   = "dbs14117989";            // Dein Datenbankname
$user = "dbu5509740";             // Dein Benutzername
$pass = "qufFig-jofsa8-subcek"; // Dein Passwort (bitte sicher speichern)

// --- 2. Verbindung zur Datenbank ---
try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo "❌ DB-Verbindung fehlgeschlagen: " . $e->getMessage();
    exit;
}

// --- 3. Entscheide GET (PageView) oder POST (Event) ---
if ($_SERVER["REQUEST_METHOD"] === "GET" && isset($_GET["page"])) {
    // --- Seitenaufruf speichern ---
    $page = $_GET["page"];
    $userAgent = $_SERVER["HTTP_USER_AGENT"] ?? 'unknown';

    $stmt = $pdo->prepare("INSERT INTO page_views (page, user_agent) VALUES (?, ?)");
    $stmt->execute([$page, $userAgent]);

    echo "✅ PageView erfasst";
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    // --- Event speichern ---
    $body = json_decode(file_get_contents("php://input"), true);
    if (!isset($body["event"])) {
        http_response_code(400);
        echo "❌ 'event' fehlt im Body";
        exit;
    }

    $event = $body["event"];
    $data = json_encode($body["data"] ?? []);
    $userAgent = $_SERVER["HTTP_USER_AGENT"] ?? 'unknown';

    $stmt = $pdo->prepare("INSERT INTO event_logs (event, data, user_agent) VALUES (?, ?, ?)");
    $stmt->execute([$event, $data, $userAgent]);

    echo "✅ Event erfasst";
    exit;
}

// --- 4. Wenn nichts davon zutrifft ---
http_response_code(400);
echo "❌ Ungültige Anfrage";