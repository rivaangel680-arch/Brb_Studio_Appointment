<?php
require 'config.php';

function back($type, $msg, $form = 'login') {
    header("Location: index.html?" . http_build_query([$type => $msg, 'form' => $form]));
    exit;
}

// ======================================
// LOGIN
// ======================================
if ($_SERVER["REQUEST_METHOD"] === "POST" && isset($_POST['login'])) {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    if ($username === '' || $password === '') {
        back('error', 'Please fill in all fields.');
    }

    $stmt = $conn->prepare("SELECT * FROM users WHERE username = ? OR email = ?");
    $stmt->execute([$username, $username]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password'])) {
        if (($user['status'] ?? 'Active') !== 'Active') {
            back('error', 'Account is deactivated.');
        }
        if (!$user['verified']) {
            back('error', 'Please verify your email first.');
        }

        session_regenerate_id(true);
        $_SESSION['user_id']     = $user['id'];
        $_SESSION['first_name']  = $user['first_name'];
        $_SESSION['last_name']   = $user['last_name'];
        $_SESSION['name']        = $user['first_name'] . ' ' . $user['last_name'];
        $_SESSION['username']    = $user['username'];
        $_SESSION['role']        = $user['role'];
        $_SESSION['profile_pic'] = $user['profile_pic'] ?? 'uploads/profile_default.png';
        $_SESSION['email']       = $user['email'];
        redirectByRole();
    }
    back('error', 'Incorrect username or password.');
}

// ======================================
// REGISTER
// ======================================
if ($_SERVER["REQUEST_METHOD"] === "POST" && isset($_POST['register'])) {
    $first_name = trim($_POST['first_name'] ?? '');
    $last_name  = trim($_POST['last_name'] ?? '');
    $email      = trim($_POST['email'] ?? '');
    $username   = trim($_POST['username'] ?? '');
    $password   = $_POST['password'] ?? '';
    $confirm    = $_POST['confirm_password'] ?? '';

    if ($first_name === '' || $last_name === '' || $email === '' || $username === '' || $password === '') {
        back('error', 'Please fill in all fields.', 'register');
    }
    if ($password !== $confirm) {
        back('error', 'Passwords do not match.', 'register');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        back('error', 'Invalid email format.', 'register');
    }
    if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/', $password)) {
        back('error', 'Password must be at least 8 characters with uppercase, lowercase, and a number.', 'register');
    }

    $check = $conn->prepare("SELECT id FROM users WHERE email = ? OR username = ?");
    $check->execute([$email, $username]);
    if ($check->fetch()) {
        back('error', 'Email or Username already taken.', 'register');
    }

    $token    = bin2hex(random_bytes(32));
    $hash     = password_hash($password, PASSWORD_DEFAULT);
    $verified = defined('REQUIRE_EMAIL_VERIFICATION') && REQUIRE_EMAIL_VERIFICATION ? 0 : 1;

    $stmt = $conn->prepare("INSERT INTO users (first_name, last_name, username, email, password, verify_token, role, verified, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Client', ?, 'Active')");
    $stmt->execute([$first_name, $last_name, $username, $email, $hash, $token, $verified]);

    if (defined('REQUIRE_EMAIL_VERIFICATION') && constant('REQUIRE_EMAIL_VERIFICATION')) {
        $baseUrl = defined('BASE_URL')
            ? rtrim((string) constant('BASE_URL'), '/')
            : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')
                . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/'));
        $verifyLink = $baseUrl . "/verify_email.php?token=" . rawurlencode($token);
        $full_name  = htmlspecialchars($first_name . ' ' . $last_name);
        $body = "
        <div style='text-align:center; font-family:Arial,sans-serif; max-width:500px; margin:0 auto;'>
            <h2>Welcome to BRB Studio, $full_name!</h2>
            <p>Click below to verify your email address:</p>
            <a href='$verifyLink' style='background:black; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;'>Verify My Account</a>
        </div>";
        sendEmailNotification($email, "Verify Your BRB Studio Account", $body);
        back('success', 'Account created successfully. Please check your email to verify your account.');
    }
    back('success', 'Account created successfully. You can now sign in.');
}

header("Location: index.html");
exit;