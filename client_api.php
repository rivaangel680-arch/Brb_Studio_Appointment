<?php
/* ============================================================
   BRB Studio — Client JSON API (used by client/*.html + client.js)
   Uses ../config.php (PDO $conn, session, isLoggedIn()).
   All booking rules are checked HERE on the server; the browser
   only displays them.
   ============================================================ */
require __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

function out($d, $c = 200) { http_response_code($c); echo json_encode($d); exit; }
function fail($m, $c = 400) { out(['error' => $m], $c); }

if (!isLoggedIn()) fail('Not logged in.', 401);
if (($_SESSION['role'] ?? '') !== 'Client') fail('Access denied.', 403);

$uid    = (int) $_SESSION['user_id'];
$action = $_GET['action'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') fail('Bad request.', 400);
$in = json_decode(file_get_contents('php://input'), true) ?: [];

/* ---------- Booking rules (same as the old client_appointment.php / client_confirm.php) ---------- */
const SOLO_TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
function rules(array $s): array {
    $n = $s['name'];
    $model = stripos($n, 'model') !== false;
    $photo = stripos($n, 'photo') !== false;
    $make  = (bool) preg_match('/make[\s-]?up/i', $n);
    return ['isModeling' => $model, 'isTimed' => $photo || $make, 'max' => $model ? 7 : 4, 'duration' => $photo ? 2 : 3];
}
function toMin(string $t): int { [$h, $m] = array_map('intval', explode(':', substr($t, 0, 5))); return $h * 60 + $m; }
function overlaps(string $time, array $taken, int $hours): bool {
    $d = $hours * 60; $t = toMin($time);
    foreach ($taken as $s) { $ss = toMin($s); if ($t < $ss + $d && $t + $d > $ss) return true; }
    return false;
}
/** Pending/Approved bookings of one service, grouped by date: total, solo, group, solo_times */
function bookedData(PDO $c, int $sid, ?string $date = null): array {
    $sql = "SELECT appointment_date, booking_type, appointment_time, COUNT(*) AS cnt FROM appointments
            WHERE service_id = ? AND status IN ('Pending','Approved')" . ($date ? " AND appointment_date = ?" : "") . "
            GROUP BY appointment_date, booking_type, appointment_time";
    $s = $c->prepare($sql); $s->execute($date ? [$sid, $date] : [$sid]);
    $b = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $d = $r['appointment_date'];
        $b[$d] ??= ['total' => 0, 'solo' => 0, 'group' => 0, 'solo_times' => []];
        $n = (int) $r['cnt']; $b[$d]['total'] += $n;
        if ($r['booking_type'] === 'Solo') { $b[$d]['solo'] += $n; if (!empty($r['appointment_time'])) $b[$d]['solo_times'][] = substr($r['appointment_time'], 0, 5); }
        else $b[$d]['group'] += $n;
    }
    return $b;
}
/** Service id for a booking request; for a reschedule it comes from the (still Rescheduled) appointment */
function serviceFor(PDO $c, int $uid, int $sid, int $rid): array {
    if ($rid) {
        $s = $c->prepare("SELECT service_id FROM appointments WHERE id = ? AND user_id = ? AND status = 'Rescheduled'");
        $s->execute([$rid, $uid]); $sid = (int) $s->fetchColumn();
        if (!$sid) fail('This reschedule request is no longer available. Please check your Schedule page.', 404);
    }
    $s = $c->prepare("SELECT * FROM services WHERE id = ? AND status = 'Active'"); $s->execute([$sid]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: fail('Service not found.', 404);
}

try {
switch ($action) {

case 'me':
    $s = $conn->prepare("SELECT id, username, first_name, last_name, email, birthday, age, gender, contact_number, address, profile_pic FROM users WHERE id = ?");
    $s->execute([$uid]); out($s->fetch(PDO::FETCH_ASSOC));

case 'services':
    out($conn->query("SELECT id, name, description, price, duration_minutes, category, image FROM services WHERE status = 'Active' ORDER BY category, name")->fetchAll(PDO::FETCH_ASSOC));

/* ---------- Booking ---------- */
case 'booking_info':
    $svc = serviceFor($conn, $uid, (int) ($_GET['service_id'] ?? 0), (int) ($_GET['reschedule_id'] ?? 0));
    out(['service' => $svc, 'rules' => rules($svc), 'solo_times' => SOLO_TIMES,
         'unavailable' => $conn->query("SELECT date FROM unavailable_dates")->fetchAll(PDO::FETCH_COLUMN),
         'booked' => (object) bookedData($conn, (int) $svc['id'])]);

case 'book':
    $rid = (int) ($in['reschedule_id'] ?? 0);
    $svc = serviceFor($conn, $uid, (int) ($in['service_id'] ?? 0), $rid);
    $sid = (int) $svc['id']; $R = rules($svc);
    $date = trim($in['date'] ?? ''); $type = $in['booking_type'] ?? ''; $time = substr(trim($in['time'] ?? ''), 0, 5);
    if (!$R['isModeling']) $type = 'Solo';                       // only Modeling offers Solo / Group
    $needsTime = $R['isTimed'] || ($R['isModeling'] && $type === 'Solo');
    $un = $conn->prepare("SELECT COUNT(*) FROM unavailable_dates WHERE date = ?"); $un->execute([$date]);
    if (!in_array($type, ['Solo', 'Group'], true) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date < date('Y-m-d') || $un->fetchColumn() > 0)
        fail('Sorry, that date or booking type is no longer available. Please choose again.');

    $conn->beginTransaction();
    // lock this service/date so two clients cannot take the last slot at the same time
    $lock = $conn->prepare("SELECT id FROM appointments WHERE service_id = ? AND appointment_date = ? AND status IN ('Pending','Approved') FOR UPDATE");
    $lock->execute([$sid, $date]);
    $info = bookedData($conn, $sid, $date)[$date] ?? null;
    if ($needsTime) $ok = in_array($time, SOLO_TIMES, true) && !overlaps($time, $info['solo_times'] ?? [], $R['duration']);
    elseif ($R['isModeling']) $ok = $R['max'] - ($info['group'] ?? 0) > 0;
    else $ok = $R['max'] - ($info['total'] ?? 0) > 0;
    if (!$ok) { $conn->rollBack(); fail('Sorry, that time (or part of it) was just taken by someone else. Please go back and choose again.', 409); }

    $t = $needsTime ? $time . ':00' : null;                      // Modeling Group: BRB sets the time later
    if ($rid) {   // client disagreed with BRB's proposal: same appointment goes back to Pending
        $conn->prepare("UPDATE appointments SET appointment_date = ?, appointment_time = ?, booking_type = ?, status = 'Pending' WHERE id = ? AND user_id = ? AND status = 'Rescheduled'")
             ->execute([$date, $t, $type, $rid, $uid]);
    } else {
        $conn->prepare("INSERT INTO appointments (user_id, service_id, booking_type, appointment_date, appointment_time, status) VALUES (?,?,?,?,?, 'Pending')")
             ->execute([$uid, $sid, $type, $date, $t]);
    }
    $conn->commit();
    out(['ok' => true, 'rescheduled' => (bool) $rid]);

/* ---------- My schedule ---------- */
case 'appointments':
    $s = $conn->prepare("SELECT a.id, a.appointment_date, a.appointment_time, a.status, a.notes, a.booking_type, s.name AS service_name, s.price, s.duration_minutes
                         FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.user_id = ? ORDER BY a.appointment_date DESC, a.created_at DESC");
    $s->execute([$uid]); out($s->fetchAll(PDO::FETCH_ASSOC));

case 'cancel':
    $conn->prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ? AND user_id = ? AND status = 'Pending'")->execute([(int) ($in['id'] ?? 0), $uid]);
    out(['ok' => true]);

case 'agree':   // client accepts BRB's proposed schedule
    $conn->prepare("UPDATE appointments SET status = 'Approved' WHERE id = ? AND user_id = ? AND status = 'Rescheduled'")->execute([(int) ($in['id'] ?? 0), $uid]);
    out(['ok' => true]);

/* ---------- Calendar (no other clients' names are sent) ---------- */
case 'calendar':
    out(['events' => $conn->query("SELECT a.appointment_date AS d, a.appointment_time AS t, s.name AS service FROM appointments a
                                   JOIN services s ON a.service_id = s.id WHERE a.status = 'Approved' ORDER BY a.appointment_date, a.appointment_time")->fetchAll(PDO::FETCH_ASSOC),
         'unavailable' => $conn->query("SELECT date FROM unavailable_dates")->fetchAll(PDO::FETCH_COLUMN)]);

/* ---------- Profile history ---------- */
case 'history':
    $q = trim($_GET['q'] ?? ''); $p = [$uid];
    $sql = "SELECT a.appointment_date, s.name AS service_name FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.user_id = ? AND a.status = 'Completed'";
    if ($q !== '') { $sql .= " AND (s.name LIKE ? OR a.appointment_date LIKE ?)"; $p[] = "%$q%"; $p[] = "%$q%"; }
    $s = $conn->prepare($sql . " ORDER BY a.appointment_date DESC"); $s->execute($p); out($s->fetchAll(PDO::FETCH_ASSOC));

/* ---------- Contact & feedback ---------- */
case 'contact':
    $n = trim($in['name'] ?? ''); $e = trim($in['email'] ?? ''); $sub = trim($in['subject'] ?? ''); $m = trim($in['message'] ?? '');
    if ($n === '' || $e === '' || $sub === '' || $m === '') fail('Please fill in every field.');
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
    $conn->prepare("INSERT INTO contact_messages (user_id, name, email, subject, message) VALUES (?,?,?,?,?)")->execute([$uid, $n, $e, $sub, $m]);
    out(['ok' => true]);

case 'feedback':
    $r = (int) ($in['rating'] ?? 0); $c = trim($in['comment'] ?? '');
    if ($r < 1 || $r > 5) fail('Please select a star rating before submitting.');
    if ($c === '') fail('Please write your feedback.');
    $conn->prepare("INSERT INTO feedback (user_id, rating, comment) VALUES (?,?,?)")->execute([$uid, $r, $c]);
    out(['ok' => true]);

/* ---------- Edit profile (multipart form: fields + optional picture) ---------- */
case 'profile_save':
    $cur = $conn->prepare("SELECT username, profile_pic FROM users WHERE id = ?"); $cur->execute([$uid]); $cur = $cur->fetch(PDO::FETCH_ASSOC);
    $first = trim($_POST['first_name'] ?? ''); $last = trim($_POST['last_name'] ?? ''); $user = trim($_POST['username'] ?? '');
    $bday = ($_POST['birthday'] ?? '') !== '' ? $_POST['birthday'] : null;
    $age  = ($_POST['age'] ?? '') !== '' ? (int) $_POST['age'] : null;
    $gender = in_array($_POST['gender'] ?? '', ['Male', 'Female', 'Other'], true) ? $_POST['gender'] : null;   // '' would break the ENUM
    $phone = trim($_POST['contact_number'] ?? ''); $addr = trim($_POST['address'] ?? '');
    $pw = $_POST['new_password'] ?? ''; $pw2 = $_POST['confirm_password'] ?? ''; $err = [];

    if ($user === '') $err[] = 'Username cannot be empty.';
    elseif ($user !== $cur['username']) { $c = $conn->prepare("SELECT id FROM users WHERE username = ? AND id != ?"); $c->execute([$user, $uid]); if ($c->fetch()) $err[] = 'Username is already taken.'; }
    if ($bday !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $bday)) $err[] = 'Enter a valid birthday.';
    if ($age !== null && ($age < 0 || $age > 120)) $err[] = 'Enter a valid age.';
    if (strlen($phone) > 20) $err[] = 'Contact number is too long (max 20 characters).';
    if ($pw !== '') { if ($pw !== $pw2) $err[] = 'Passwords do not match.'; elseif (strlen($pw) < 8) $err[] = 'Password must be at least 8 characters.'; }

    $pic = $cur['profile_pic'];
    $f = $_FILES['profile_pic'] ?? null;
    if ($f && $f['error'] !== UPLOAD_ERR_NO_FILE) {
        $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
        $info = $f['error'] === UPLOAD_ERR_OK ? @getimagesize($f['tmp_name']) : false;
        if ($f['error'] !== UPLOAD_ERR_OK) $err[] = 'Upload failed (the file may be larger than the server allows).';
        elseif ($info === false || !isset($types[$info[2]])) $err[] = 'Please choose a valid photo (JPG, PNG, GIF or WEBP).';
        elseif ($f['size'] > 10 * 1024 * 1024) $err[] = 'The picture must be 10 MB or smaller.';
        elseif (!$err) {
            $dir = __DIR__ . '/../uploads/'; if (!is_dir($dir)) mkdir($dir, 0755, true);
            $name = 'profile_' . $uid . '_' . time() . '.' . $types[$info[2]];
            if (move_uploaded_file($f['tmp_name'], $dir . $name)) $pic = 'uploads/' . $name; else $err[] = 'Could not save the picture. Check that the uploads folder is writable.';
        }
    }
    if ($err) out(['errors' => $err], 422);

    $conn->prepare("UPDATE users SET first_name=?, last_name=?, username=?, birthday=?, age=?, gender=?, contact_number=?, address=?, profile_pic=? WHERE id=?")
         ->execute([$first, $last, $user, $bday, $age, $gender, $phone ?: null, $addr ?: null, $pic, $uid]);
    if ($pw !== '') $conn->prepare("UPDATE users SET password = ? WHERE id = ?")->execute([password_hash($pw, PASSWORD_DEFAULT), $uid]);
    $_SESSION['username'] = $user; $_SESSION['profile_pic'] = $pic;
    out(['ok' => true]);

default: fail('Unknown action.', 404);
}
} catch (PDOException $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log($e->getMessage());
    fail('Database error.', 500);
}