<?php
/**
 * mailer.php — sends email notifications to clients.
 * Put this file in the project root (same folder as config.php) and
 * fill in your settings in mail_config.php.
 *
 * Needs PHPMailer for SMTP (recommended). Install ONE of these ways:
 *   1) Composer:  composer require phpmailer/phpmailer     (creates /vendor)
 *   2) Manual:    download PHPMailer from github.com/PHPMailer/PHPMailer, then copy its
 *                 "src" folder to  <project root>/PHPMailer/src/
 * If PHPMailer is not found, it falls back to PHP's mail().
 */

if (file_exists(__DIR__ . '/mail_config.php')) {
    require_once __DIR__ . '/mail_config.php';
}
$__mailDefaults = [
    'MAIL_USE_SMTP' => false,
    'MAIL_HOST'     => 'smtp.gmail.com',
    'MAIL_PORT'     => 587,
    'MAIL_USERNAME' => '',
    'MAIL_PASSWORD' => '',
    'MAIL_FROM'     => 'no-reply@brbstudio.com',
    'MAIL_FROM_NAME'=> 'BRB Studios',
    'SITE_URL'      => '',
];
foreach ($__mailDefaults as $k => $v) {
    if (!defined($k)) define($k, $v);
}
unset($__mailDefaults, $k, $v);

/** Load PHPMailer from Composer or from /PHPMailer/src. Returns true if available. */
function brbLoadPHPMailer() {
    if (class_exists('\PHPMailer\PHPMailer\PHPMailer')) return true;
    if (file_exists(__DIR__ . '/vendor/autoload.php')) {
        require_once __DIR__ . '/vendor/autoload.php';
        if (class_exists('\PHPMailer\PHPMailer\PHPMailer')) return true;
    }
    $dir = __DIR__ . '/PHPMailer/src/';
    if (file_exists($dir . 'PHPMailer.php')) {
        require_once $dir . 'Exception.php';
        require_once $dir . 'PHPMailer.php';
        require_once $dir . 'SMTP.php';
        return class_exists('\PHPMailer\PHPMailer\PHPMailer');
    }
    return false;
}

/** Send one HTML email. Returns true on success, false on failure (never throws). */
function brbSendEmail($to, $toName, $subject, $htmlBody) {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $plain = trim(html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '</p>', '</tr>'], "\n", $htmlBody))));

    try {
        if (MAIL_USE_SMTP && brbLoadPHPMailer()) {
            // The library is loaded dynamically, so keep the class name dynamic
            // as well to avoid static analyzers flagging an optional dependency.
            $mailerClass = 'PHPMailer\\PHPMailer\\PHPMailer';
            $m = new $mailerClass(true);
            $m->isSMTP();
            $m->Host       = MAIL_HOST;
            $m->SMTPAuth   = true;
            $m->Username   = MAIL_USERNAME;
            $m->Password   = MAIL_PASSWORD;
            $m->SMTPSecure = (MAIL_PORT == 465) ? 'ssl' : 'tls';
            $m->Port       = (int)MAIL_PORT;
            $m->CharSet    = 'UTF-8';
            $m->setFrom(MAIL_FROM, MAIL_FROM_NAME);
            $m->addAddress($to, $toName);
            $m->isHTML(true);
            $m->Subject = $subject;
            $m->Body    = $htmlBody;
            $m->AltBody = $plain;
            return $m->send();
        }

        // Fallback: PHP's built-in mail()
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= 'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM . ">\r\n";
        return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $htmlBody, $headers);
    } catch (\Throwable $e) {
        error_log('BRB email error: ' . $e->getMessage());
        return false;
    }
}

/** Link to the client's schedule page (used for the button in the email). */
function brbScheduleUrl() {
    if (SITE_URL !== '') {
        return rtrim(SITE_URL, '/') . '/client/client_schedule.php';
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $root   = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    return $scheme . '://' . $host . $root . '/client/client_schedule.php';
}

/** The look of the email (simple black & white to match BRB Studios). */
function brbEmailLayout($heading, $intro, array $rows, $closing, $buttonUrl = '', $buttonText = '') {
    $e = function ($t) { return htmlspecialchars((string)$t, ENT_QUOTES, 'UTF-8'); };
    $rowsHtml = '';
    foreach ($rows as $label => $value) {
        $rowsHtml .= '<tr><td style="padding:8px 12px;color:#666;width:120px;">' . $e($label) . '</td>'
                   . '<td style="padding:8px 12px;font-weight:bold;">' . $e($value) . '</td></tr>';
    }
    $button = '';
    if ($buttonUrl !== '') {
        $button = '<p style="text-align:center;margin:28px 0;"><a href="' . $e($buttonUrl) . '" '
                . 'style="background:#000;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">'
                . $e($buttonText) . '</a></p>';
    }
    return '<div style="font-family:Georgia,\'Times New Roman\',serif;background:#f3f3f3;padding:24px;">'
         . '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:12px;overflow:hidden;">'
         . '<div style="background:#000;color:#fff;padding:18px;text-align:center;font-size:26px;font-weight:bold;letter-spacing:6px;">BRB STUDIOS</div>'
         . '<div style="padding:24px;color:#222;font-size:16px;line-height:1.5;">'
         . '<h2 style="margin:0 0 12px;">' . $e($heading) . '</h2>'
         . '<p>' . $intro . '</p>'
         . '<table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #eee;margin:16px 0;">' . $rowsHtml . '</table>'
         . $button
         . '<p>' . $closing . '</p>'
         . '</div></div></div>';
}

/**
 * Email the client about their appointment.
 *   $type = 'approved'    -> "your appointment is approved"
 *   $type = 'rescheduled' -> "BRB proposed a new schedule, please Agree / Disagree"
 * Sent to the email saved in the client's account (users.email).
 * Returns true if the email was sent, false if not (the admin action still goes through).
 */
function notifyClientAppointment($conn, $appointmentId, $type, $reason = '') {
    try {
        $stmt = $conn->prepare("
            SELECT a.appointment_date, a.appointment_time,
                   s.name AS service_name,
                   u.first_name, u.last_name, u.username, u.email
            FROM appointments a
            JOIN services s ON a.service_id = s.id
            JOIN users u ON a.user_id = u.id
            WHERE a.id = ?
        ");
        $stmt->execute([(int)$appointmentId]);
        $a = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$a || empty($a['email'])) return false;

        $name = trim(($a['first_name'] ?? '') . ' ' . ($a['last_name'] ?? '')) ?: $a['username'];
        $e    = function ($t) { return htmlspecialchars((string)$t, ENT_QUOTES, 'UTF-8'); };
        $date = date('l, F j, Y', strtotime($a['appointment_date']));
        $time = !empty($a['appointment_time']) ? date('g:i A', strtotime($a['appointment_time'])) : 'BRB will confirm the time';

        $rows = ['Service' => $a['service_name'], 'Date' => $date, 'Time' => $time];

        if ($type === 'approved') {
            $subject = 'Your appointment is approved — BRB Studios';
            $html = brbEmailLayout(
                'Appointment Approved',
                'Hi ' . $e($name) . ', good news! Your appointment has been <strong>approved</strong>.',
                $rows,
                'We look forward to seeing you at BRB Studios.',
                brbScheduleUrl(), 'View My Schedule'
            );
        } elseif ($type === 'rescheduled') {
            $subject = 'New schedule proposed for your appointment — BRB Studios';
            $intro = 'Hi ' . $e($name) . ', BRB Studios would like to <strong>reschedule</strong> your appointment to the date and time below.';
            if (trim($reason) !== '') {
                $intro .= '<br><br><em>Reason: ' . $e($reason) . '</em>';
            }
            $html = brbEmailLayout(
                'New Schedule Proposed',
                $intro,
                $rows,
                'Please log in and open <strong>My Schedule</strong> to <strong>Agree</strong> or <strong>Disagree</strong>. '
                . 'If you disagree, you can choose another date and time.',
                brbScheduleUrl(), 'Open My Schedule'
            );
        } else {
            return false;
        }

        return brbSendEmail($a['email'], $name, $subject, $html);
    } catch (\Throwable $ex) {
        error_log('BRB notify error: ' . $ex->getMessage());
        return false;
    }
}