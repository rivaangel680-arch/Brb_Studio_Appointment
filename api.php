<?php
/* ============================================================
   BRB Studio — Admin JSON API
   Used by the admin/*.html pages (app.js). Uses ../config.php
   (PDO $conn, session, isLoggedIn()) and the brb_studio_db tables.
   ============================================================ */
require __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

function out($data, $code = 200) { http_response_code($code); echo json_encode($data); exit; }
function fail($msg, $code = 400) { out(['error' => $msg], $code); }

// Only a logged-in Admin may use this API (JSON errors instead of config.php's redirects)
if (!isLoggedIn()) fail('Not logged in.', 401);
if (($_SESSION['role'] ?? '') !== 'Admin') fail('Access denied.', 403);

$action = $_GET['action'] ?? '';
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
// POSTs must come from our own JS (custom header blocks cross-site form posts)
if ($isPost && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') fail('Bad request.', 400);
$in  = json_decode(file_get_contents('php://input'), true) ?: [];
$uid = (int) $_SESSION['user_id'];

// Remove a service photo from disk (only files inside uploads/services/)
function deleteServiceImage($path) {
    if (is_string($path) && strpos($path, 'uploads/services/') === 0 && basename($path) === substr($path, 17)) {
        $f = __DIR__ . '/../' . $path; if (is_file($f)) @unlink($f);
    }
}

try {
switch ($action) {

/* ---------- Sidebar info ---------- */
case 'me':
    $u = $conn->prepare("SELECT username, profile_pic FROM users WHERE id = ?"); $u->execute([$uid]);
    $row = $u->fetch(PDO::FETCH_ASSOC) ?: [];
    $row['unread'] = (int) $conn->query("SELECT COUNT(*) FROM contact_messages WHERE is_read = 0")->fetchColumn();
    out($row);

/* ---------- Clients ---------- */
case 'clients':
    $q = trim($_GET['q'] ?? ''); $p = [];
    $sql = "SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.contact_number, u.profile_pic, u.status, u.created_at,
                   (SELECT COUNT(*) FROM appointments a WHERE a.user_id = u.id) AS total_appointments
            FROM users u WHERE u.role = 'Client'";
    if ($q !== '') { $sql .= " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.contact_number LIKE ?)"; $p = array_fill(0, 5, "%$q%"); }
    $s = $conn->prepare($sql . " ORDER BY u.created_at DESC"); $s->execute($p);
    out($s->fetchAll(PDO::FETCH_ASSOC));

case 'client_toggle':
    $s = $conn->prepare("UPDATE users SET status = IF(status = 'Active', 'Inactive', 'Active') WHERE id = ? AND role = 'Client'");
    $s->execute([(int) ($in['id'] ?? 0)]);
    $s->rowCount() ? out(['ok' => true]) : fail('Client not found.', 404);

/* ---------- Services ---------- */
case 'services':
    out($conn->query("SELECT s.*, (SELECT COUNT(*) FROM appointments a WHERE a.service_id = s.id) AS bookings
                      FROM services s ORDER BY s.category, s.name")->fetchAll(PDO::FETCH_ASSOC));

case 'service_save':   // multipart/form-data: fields + optional photo
    if (empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) fail('The upload is larger than the server allows. Choose a smaller photo.');
    $id = (int) ($_POST['id'] ?? 0); $name = trim($_POST['name'] ?? ''); $desc = trim($_POST['description'] ?? '');
    $price = $_POST['price'] ?? ''; $dur = (int) ($_POST['duration_minutes'] ?? 0);
    $cat = ($_POST['category'] ?? '') === 'Package' ? 'Package' : 'Solo';
    $stat = ($_POST['status'] ?? '') === 'Inactive' ? 'Inactive' : 'Active';
    if ($name === '') fail('Service name is required.');
    if (!is_numeric($price) || $price < 0) fail('Enter a valid price.');
    if ($dur < 1) fail('Duration must be at least 1 minute.');

    $old = null;
    if ($id) { $o = $conn->prepare("SELECT image FROM services WHERE id = ?"); $o->execute([$id]); $old = $o->fetchColumn(); if ($old === false) fail('Service not found.', 404); }

    $image = null;   // path of a newly uploaded photo
    $f = $_FILES['image'] ?? null;
    if ($f && $f['error'] !== UPLOAD_ERR_NO_FILE) {
        $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
        if ($f['error'] !== UPLOAD_ERR_OK) fail('Upload failed (the file may be larger than the server allows).');
        $info = @getimagesize($f['tmp_name']);
        if ($info === false || !isset($types[$info[2]])) fail('Please choose a valid photo (JPG, PNG, GIF or WEBP).');
        if ($f['size'] > 10 * 1024 * 1024) fail('The picture must be 10 MB or smaller.');
        $dir = __DIR__ . '/../uploads/services/'; if (!is_dir($dir)) mkdir($dir, 0755, true);
        $file = 'service_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $types[$info[2]];
        if (!move_uploaded_file($f['tmp_name'], $dir . $file)) fail('Could not save the picture. Check that the uploads folder is writable.', 500);
        $image = 'uploads/services/' . $file;
    }
    if ($id) {
        $conn->prepare("UPDATE services SET name=?, description=?, price=?, duration_minutes=?, category=?, status=?, image=? WHERE id=?")
             ->execute([$name, $desc ?: null, $price, $dur, $cat, $stat, $image ?? $old, $id]);
        if ($image && $old) deleteServiceImage($old);   // replaced: remove the previous photo
    } else {
        $conn->prepare("INSERT INTO services (name, description, price, duration_minutes, category, status, image) VALUES (?,?,?,?,?,?,?)")
             ->execute([$name, $desc ?: null, $price, $dur, $cat, $stat, $image]);
    }
    out(['ok' => true]);

case 'service_delete':
    // appointments.service_id is ON DELETE CASCADE: deleting a booked service would erase its appointment history
    $id = (int) ($in['id'] ?? 0);
    $n = $conn->prepare("SELECT COUNT(*) FROM appointments WHERE service_id = ?"); $n->execute([$id]);
    if ($n->fetchColumn() > 0) fail('This service has appointments. Set it to Inactive instead of deleting it.');
    $o = $conn->prepare("SELECT image FROM services WHERE id = ?"); $o->execute([$id]); $old = $o->fetchColumn();
    $conn->prepare("DELETE FROM services WHERE id = ?")->execute([$id]);
    deleteServiceImage($old);
    out(['ok' => true]);

/* ---------- Appointments ---------- */
case 'appointments_pending':
    out($conn->query("SELECT a.id, a.appointment_date, a.appointment_time, a.notes, a.booking_type, s.name AS service_name,
                             u.first_name, u.last_name, u.username, u.email
                      FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_id = u.id
                      WHERE a.status = 'Pending' ORDER BY a.appointment_date, a.appointment_time")->fetchAll(PDO::FETCH_ASSOC));

case 'appt_approve':
    $conn->prepare("UPDATE appointments SET status = 'Approved' WHERE id = ? AND status = 'Pending'")->execute([(int) ($in['id'] ?? 0)]);
    out(['ok' => true]);

case 'appt_cancel':
    $conn->prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ? AND status = 'Pending'")->execute([(int) ($in['id'] ?? 0)]);
    out(['ok' => true]);

case 'appt_reschedule':
    $date = trim($in['date'] ?? ''); $time = trim($in['time'] ?? ''); $reason = trim($in['reason'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date < date('Y-m-d') || !preg_match('/^\d{2}:\d{2}$/', $time))
        fail('Invalid new date or time. Choose today or a future date and a valid time.');
    // Becomes "Rescheduled": the client must Agree (-> Approved) or pick another date
    $conn->prepare("UPDATE appointments SET status='Rescheduled', appointment_date=?, appointment_time=?,
                    notes = CONCAT(IFNULL(notes,''), IF(? = '', '', CONCAT('\nRescheduled: ', ?))) WHERE id=? AND status='Pending'")
         ->execute([$date, $time, $reason, $reason, (int) ($in['id'] ?? 0)]);
    out(['ok' => true]);

/* ---------- Calendar ---------- */
case 'calendar':
    $m = max(1, min(12, (int) ($_GET['month'] ?? date('n')))); $y = max(2000, min(2100, (int) ($_GET['year'] ?? date('Y'))));
    $start = sprintf('%04d-%02d-01', $y, $m); $end = date('Y-m-t', strtotime($start));
    $s = $conn->prepare("SELECT a.appointment_date AS d, a.appointment_time AS t, s.name AS service, u.first_name, u.last_name, u.username
                         FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_id = u.id
                         WHERE a.appointment_date BETWEEN ? AND ? AND a.status IN ('Approved','Rescheduled') ORDER BY a.appointment_date, a.appointment_time");
    $s->execute([$start, $end]);
    $events = [];
    foreach ($s as $r) $events[$r['d']][] = ['t' => $r['t'], 's' => $r['service'], 'c' => trim($r['first_name'] . ' ' . $r['last_name']) ?: $r['username']];
    $off = [];
    foreach ($conn->query("SELECT date, reason FROM unavailable_dates") as $r) $off[$r['date']] = $r['reason'];
    out(['events' => $events, 'off' => $off]);

case 'off_add':
    $d = $in['date'] ?? '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) fail('Choose a valid date.');
    $r = trim($in['reason'] ?? '') ?: 'Unavailable';
    $conn->prepare("INSERT INTO unavailable_dates (date, reason, created_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE reason = ?")->execute([$d, $r, $uid, $r]);
    out(['ok' => true]);

case 'off_remove':
    $conn->prepare("DELETE FROM unavailable_dates WHERE date = ?")->execute([$in['date'] ?? '']);
    out(['ok' => true]);

/* ---------- Records / Attendance / Feedback / Messages ---------- */
case 'records':
    $q = trim($_GET['q'] ?? ''); $p = []; $w = "WHERE a.status IN ('Completed','Cancelled')";
    if ($q !== '') { $w .= " AND (s.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR a.appointment_date LIKE ?)"; $p = array_fill(0, 4, "%$q%"); }
    $s = $conn->prepare("SELECT a.appointment_date, a.appointment_time, a.status, s.name AS service_name, u.first_name, u.last_name, u.username, u.email
                         FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_id = u.id
                         $w ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 50");
    $s->execute($p); out($s->fetchAll(PDO::FETCH_ASSOC));

case 'attendance':
    $q = trim($_GET['q'] ?? ''); $d = $_GET['date'] ?? ''; $p = []; $w = 'WHERE 1=1';
    if ($q !== '') { $w .= " AND (a.client_name LIKE ? OR a.email LIKE ? OR a.service_name LIKE ?)"; $p = array_fill(0, 3, "%$q%"); }
    if ($d !== '') { $w .= " AND DATE(a.attendance_date) = ?"; $p[] = $d; }
    $s = $conn->prepare("SELECT a.client_name, a.email, a.service_name, a.attendance_date, m.username AS marked_by_name
                         FROM attendance a LEFT JOIN users m ON a.marked_by = m.id $w ORDER BY a.attendance_date DESC");
    $s->execute($p); out($s->fetchAll(PDO::FETCH_ASSOC));

case 'feedback':
    out($conn->query("SELECT f.rating, f.comment, f.created_at, u.first_name, u.last_name, u.username
                      FROM feedback f JOIN users u ON f.user_id = u.id ORDER BY f.created_at DESC")->fetchAll(PDO::FETCH_ASSOC));

case 'messages':
    out($conn->query("SELECT m.id, m.name, m.email, m.subject, m.message, m.is_read, m.created_at, u.username
                      FROM contact_messages m JOIN users u ON m.user_id = u.id ORDER BY m.is_read ASC, m.created_at DESC")->fetchAll(PDO::FETCH_ASSOC));

case 'msg_read':
    $conn->prepare("UPDATE contact_messages SET is_read = 1 WHERE id = ?")->execute([(int) ($in['id'] ?? 0)]); out(['ok' => true]);

case 'msg_delete':
    $conn->prepare("DELETE FROM contact_messages WHERE id = ?")->execute([(int) ($in['id'] ?? 0)]); out(['ok' => true]);

/* ---------- Charts (last 12 months, Approved + Completed) ---------- */
case 'charts':
    $m = $conn->query("SELECT DATE_FORMAT(appointment_date, '%Y-%m') AS ym, COUNT(*) AS total FROM appointments
                       WHERE status IN ('Approved','Completed') AND appointment_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m-01')
                       GROUP BY ym")->fetchAll(PDO::FETCH_KEY_PAIR);
    $sv = $conn->query("SELECT s.name, COUNT(*) AS count FROM appointments a JOIN services s ON a.service_id = s.id
                        WHERE a.status IN ('Approved','Completed') GROUP BY a.service_id, s.name ORDER BY count DESC")->fetchAll(PDO::FETCH_ASSOC);
    out(['monthly' => $m, 'services' => $sv]);

/* ---------- Profile ---------- */
case 'profile_save':
    $name = trim($in['username'] ?? ''); $pw = $in['password'] ?? ''; $pw2 = $in['password2'] ?? ''; $err = [];
    if ($name === '') $err[] = 'Username cannot be empty.';
    else { $c = $conn->prepare("SELECT id FROM users WHERE username = ? AND id != ?"); $c->execute([$name, $uid]); if ($c->fetch()) $err[] = 'Username is already taken.'; }
    if ($pw !== '' || $pw2 !== '') {
        if ($pw !== $pw2) $err[] = 'Passwords do not match.';
        elseif (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/', $pw)) $err[] = 'Password must be at least 8 characters with uppercase, lowercase, and a number.';
    }
    if ($err) out(['errors' => $err], 422);
    if ($pw !== '') $conn->prepare("UPDATE users SET username=?, password=? WHERE id=?")->execute([$name, password_hash($pw, PASSWORD_DEFAULT), $uid]);
    else $conn->prepare("UPDATE users SET username=? WHERE id=?")->execute([$name, $uid]);
    $_SESSION['username'] = $name; out(['ok' => true]);

case 'profile_pic':
    $f = $_FILES['profile_pic'] ?? null;
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp', IMAGETYPE_BMP => 'bmp'];
    if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) fail('Please choose a picture first.');
    if ($f['error'] !== UPLOAD_ERR_OK) fail('Upload failed (file may be larger than the server allows).');
    $info = @getimagesize($f['tmp_name']);
    if ($info === false || !isset($types[$info[2]])) fail('Please choose a valid photo (JPG, PNG, GIF, WEBP, BMP).');
    if ($f['size'] > 10 * 1024 * 1024) fail('The picture must be 10 MB or smaller.');
    $dir = __DIR__ . '/../uploads/'; if (!is_dir($dir)) mkdir($dir, 0755, true);
    $file = 'profile_' . $uid . '_' . time() . '.' . $types[$info[2]];
    if (!move_uploaded_file($f['tmp_name'], $dir . $file)) fail('Could not save the picture. Check that the uploads folder is writable.', 500);
    $conn->prepare("UPDATE users SET profile_pic = ? WHERE id = ?")->execute(['uploads/' . $file, $uid]);
    $_SESSION['profile_pic'] = 'uploads/' . $file; out(['ok' => true]);

default: fail('Unknown action.', 404);
}
} catch (PDOException $e) {
    error_log($e->getMessage());
    fail('Database error.', 500);
}