<?php
define('APP_ROOT', dirname(__DIR__));
define('BASE_URL', '/');

function e($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}
