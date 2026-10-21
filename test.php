<?php
echo "<h2>PHP is working! Version: " . phpversion() . "</h2>";

try {
    require 'config.php';
    echo "<p style='color:green'>Database connection OK (brb_studio_db).</p>";
    $count = $conn->query("SELECT COUNT(*) FROM users")->fetchColumn();
    echo "<p style='color:green'>users table OK. Rows: $count</p>";
} catch (Throwable $e) {
    echo "<p style='color:red'>Problem: " . htmlspecialchars($e->getMessage()) . "</p>";
}