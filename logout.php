<?php
session_start(); // Iniciar sesión para poder manipularla

// 1. Limpiar todas las variables de sesión
$_SESSION = array();

// 2. Borrar la cookie de sesión si se usan cookies
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, // Tiempo en el pasado
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

// 3. Destruir la sesión
if (session_destroy()) {
    // Redirigir a la página de login con un mensaje opcional
    header("location: login.php?logged_out=1");
    exit(); // ¡IMPORTANTE!
} else {
    // En caso MUY raro de que falle la destrucción
    error_log("Error al intentar destruir la sesión.");
    // Redirigir igualmente a login, pero quizás sin mensaje de éxito
    header("location: login.php");
    exit(); // ¡IMPORTANTE!
}
// No es necesario el ?> al final si el archivo solo contiene PHP