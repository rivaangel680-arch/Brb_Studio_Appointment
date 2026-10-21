<?php
// ============================================================================
//  EMAIL SETTINGS for BRB Studios  (used by mailer.php)
//  KEEP THIS FILE PRIVATE — it holds your email password.
//  Do NOT upload it to GitHub (add "mail_config.php" to .gitignore).
// ============================================================================

// true  = send through an SMTP account (Gmail etc.)  -> recommended, needs PHPMailer
// false = use PHP's built-in mail()                   -> usually does NOT work on XAMPP
define('MAIL_USE_SMTP', true);

// Gmail example. Use an "App Password" (Google Account > Security > 2-Step Verification > App passwords),
// NOT your normal Gmail password.
define('MAIL_HOST',     'smtp.gmail.com');
define('MAIL_PORT',     587);                       // 587 = TLS
define('MAIL_USERNAME', 'yourgmail@gmail.com');     // <-- change this
define('MAIL_PASSWORD', 'xxxx xxxx xxxx xxxx');     // <-- change this (16-character app password)

// Who the email appears to come from
define('MAIL_FROM',      'yourgmail@gmail.com');    // <-- same as MAIL_USERNAME for Gmail
define('MAIL_FROM_NAME', 'BRB Studios');

// Website address used for the "View My Schedule" button in the email.
// Leave '' to build it automatically. Example when online: 'https://brbstudio.infinityfreeapp.com'
define('SITE_URL', '');