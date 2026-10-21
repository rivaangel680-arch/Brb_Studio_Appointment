<?php
/* ============================================================
   BRB Studio — Staff JSON API (used by staff/*.html + staff.js)
   Uses ../config.php (PDO $conn, session, isLoggedIn()).
   ============================================================ */
require __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

function out($d, $c = 200) { http_response_code($c); echo json_encode($d); exit; }
function fail($m, $c = 400) { out(['error' => $m], $c); }

if (!isLoggedIn()) fail('Not logged in.', 401);
if (($_SESSION['role'] ?? '') !== 'Staff') fail('Access denied.', 403);

$uid    = (int) $_SESSION['user_id'];
$action = $_GET['action'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') fail('Bad request.', 400);
$in = json_decode(file_get_contents('php://input'), true) ?: [];

const APPT_COLS = "a.id, a.appointment_date, a.appointment_time, a.status, a.notes, s.name AS service_name, u.first_name, u.last_name, u.username, u.email";
const APPT_JOIN = "FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_id = u.id";

try {
switch ($action) {

case 'me':
    $s = $conn->prepare("SELECT id, username, first_name, last_name, email, profile_pic FROM users WHERE id = ?");
    $s->execute([$uid]); out($s->fetch(PDO::FETCH_ASSOC));

/* ---------- Client Management: current + history ---------- */
case 'clients':
    $q = trim($_GET['q'] ?? ''); $p = []; $f = '';
    if ($q !== '') { $f = " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR s.name LIKE ?)"; $p = array_fill(0, 3, "%$q%"); }
    $cur = $conn->prepare("SELECT " . APPT_COLS . " " . APPT_JOIN . " WHERE a.status = 'Approved' AND a.appointment_date >= CURDATE() $f ORDER BY a.appointment_date, a.appointment_time");
    $cur->execute($p);
    // parentheses matter: the search must apply to BOTH parts of the OR
    $his = $conn->prepare("SELECT " . APPT_COLS . " " . APPT_JOIN . " WHERE (a.status IN ('Completed','Cancelled') OR (a.status = 'Approved' AND a.appointment_date < CURDATE())) $f ORDER BY a.appointment_date DESC, a.appointment_time DESC");
    $his->execute($p);
    out(['current' => $cur->fetchAll(PDO::FETCH_ASSOC), 'history' => $his->fetchAll(PDO::FETCH_ASSOC)]);

/* ---------- Calendar (read-only) ---------- */
case 'calendar':
    $m = max(1, min(12, (int) ($_GET['month'] ?? date('n')))); $y = max(2000, min(2100, (int) ($_GET['year'] ?? date('Y'))));
    $start = sprintf('%04d-%02d-01', $y, $m); $end = date('Y-m-t', strtotime($start));
    $s = $conn->prepare("SELECT a.appointment_date AS d, a.appointment_time AS t, s.name AS service, u.first_name, u.last_name, u.username
                         FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_id = u.id
                         WHERE a.appointment_date BETWEEN ? AND ? AND a.status IN ('Approved','Rescheduled') ORDER BY a.appointment_date, a.appointment_time");
    $s->execute([$start, $end]); $events = [];
    foreach ($s as $r) $events[$r['d']][] = ['t' => $r['t'], 's' => $r['service'], 'c' => trim($r['first_name'] . ' ' . $r['last_name']) ?: $r['username']];
    out(['events' => $events, 'off' => $conn->query("SELECT date FROM unavailable_dates")->fetchAll(PDO::FETCH_COLUMN)]);

/* ---------- Approved appointments (past ones are marked Completed, as before) ---------- */
case 'appointments':
    $conn->exec("UPDATE appointments SET status = 'Completed' WHERE status = 'Approved' AND appointment_date < CURDATE()");
    out($conn->query("SELECT " . APPT_COLS . " " . APPT_JOIN . " WHERE a.status = 'Approved' ORDER BY a.appointment_date, a.appointment_time")->fetchAll(PDO::FETCH_ASSOC));

/* ---------- Attendance ---------- */
case 'attendance_today':   // approved appointments on one date, waiting to be marked present
    $d = $_GET['date'] ?? '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) out([]);
    $s = $conn->prepare("SELECT a.id, a.appointment_time, s.name AS service_name, u.first_name, u.last_name, u.username, u.email, u.age
                         FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_id = u.id
                         WHERE a.appointment_date = ? AND a.status = 'Approved' ORDER BY a.appointment_time");
    $s->execute([$d]); out($s->fetchAll(PDO::FETCH_ASSOC));

case 'attendance':
    $q = trim($_GET['q'] ?? ''); $d = $_GET['date'] ?? ''; $p = []; $w = 'WHERE 1=1';
    if ($q !== '') { $w .= " AND client_name LIKE ?"; $p[] = "%$q%"; }
    if ($d !== '') { $w .= " AND DATE(attendance_date) = ?"; $p[] = $d; }
    $s = $conn->prepare("SELECT client_name, email, service_name, attendance_date FROM attendance $w ORDER BY attendance_date DESC");
    $s->execute($p); out($s->fetchAll(PDO::FETCH_ASSOC));

case 'mark_present':
    $id = (int) ($in['id'] ?? 0);
    $conn->beginTransaction();
    $s = $conn->prepare("SELECT a.user_id, a.status, s.name AS service_name, u.first_name, u.last_name, u.email
                         FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_id = u.id WHERE a.id = ? FOR UPDATE");
    $s->execute([$id]); $a = $s->fetch(PDO::FETCH_ASSOC);
    if (!$a || $a['status'] !== 'Approved') { $conn->rollBack(); fail('Only approved appointments can be marked present.', 409); }
    $c = $conn->prepare("SELECT id FROM attendance WHERE appointment_id = ?"); $c->execute([$id]);
    if (!$c->fetch()) {
        $conn->prepare("INSERT INTO attendance (appointment_id, user_id, client_name, email, service_name, attendance_date, marked_by) VALUES (?,?,?,?,?,NOW(),?)")
             ->execute([$id, $a['user_id'], trim($a['first_name'] . ' ' . $a['last_name']), $a['email'], $a['service_name'], $uid]);
        $conn->prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?")->execute([$id]);
    }
    $conn->commit(); out(['ok' => true]);

/* ---------- Report ---------- */
case 'feedback':
    out($conn->query("SELECT f.rating, f.comment, f.created_at, u.first_name, u.last_name, u.username
                      FROM feedback f JOIN users u ON f.user_id = u.id ORDER BY f.created_at DESC")->fetchAll(PDO::FETCH_ASSOC));

/* ---------- Profile ---------- */
case 'profile_update':
    $first = trim($in['first_name'] ?? ''); $last = trim($in['last_name'] ?? ''); $user = trim($in['username'] ?? ''); $email = trim($in['email'] ?? '');
    if ($user === '' || $email === '') fail('Username and email are required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email address.');
    $c = $conn->prepare("SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ?"); $c->execute([$user, $email, $uid]);
    if ($c->fetch()) fail('Username or email is already in use.');
    $conn->prepare("UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ? WHERE id = ?")->execute([$first, $last, $user, $email, $uid]);
    $_SESSION['username'] = $user; $_SESSION['email'] = $email; out(['ok' => true]);

case 'password_change':
    $cur = $in['current_password'] ?? ''; $new = $in['new_password'] ?? ''; $conf = $in['confirm_password'] ?? '';
    $s = $conn->prepare("SELECT password FROM users WHERE id = ?"); $s->execute([$uid]);
    if (!password_verify($cur, (string) $s->fetchColumn())) fail('Current password is incorrect.');
    if ($new !== $conf) fail('New passwords do not match.');
    if (strlen($new) < 8) fail('Password must be at least 8 characters.');
    $conn->prepare("UPDATE users SET password = ? WHERE id = ?")->execute([password_hash($new, PASSWORD_DEFAULT), $uid]);
    out(['ok' => true]);

case 'picture':
    $f = $_FILES['profile_pic'] ?? null;
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
    if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) fail('Please choose a picture first.');
    if ($f['error'] !== UPLOAD_ERR_OK) fail('Upload failed (the file may be larger than the server allows).');
    $info = @getimagesize($f['tmp_name']);
    if ($info === false || !isset($types[$info[2]])) fail('Please choose a valid photo (JPG, PNG, GIF or WEBP).');
    if ($f['size'] > 10 * 1024 * 1024) fail('The picture must be 10 MB or smaller.');
    $dir = __DIR__ . '/../uploads/'; if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = 'staff_' . $uid . '_' . time() . '.' . $types[$info[2]];
    if (!move_uploaded_file($f['tmp_name'], $dir . $name)) fail('Could not save the picture. Check that the uploads folder is writable.', 500);
    $conn->prepare("UPDATE users SET profile_pic = ? WHERE id = ?")->execute(['uploads/' . $name, $uid]);
    $_SESSION['profile_pic'] = 'uploads/' . $name; out(['ok' => true]);

default: fail('Unknown action.', 404);
}
} catch (PDOException $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log($e->getMessage());
    fail('Database error.', 500);
}