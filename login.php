<?php
session_start();
include_once 'conex.php'; // Incluir conexión

// --- Redirigir si ya está logueado ---
if (isset($_SESSION['Username'])) {
    header("Location: index.php");
    exit(); // ¡IMPORTANTE!
}

$error_message = null; // Para mostrar errores en el formulario
$Username_value = ''; // Para repoblar el campo de usuario en caso de error

// --- Procesar el formulario de login ---
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['login'])) {

    // Obtener los datos *crudos* del POST para la validación inicial
    $raw_username = $_POST['Username'] ?? null; // Usar ?? null para evitar errores si no existe
    $raw_pass = $_POST['Pass'] ?? null;

    // Guardar el valor enviado por el usuario para repoblar el campo
    $Username_value = $raw_username ?? '';

    // --- *** NUEVA VALIDACIÓN *** ---
    // 1. Verificar que ambos campos fueron enviados (no son null)
    // 2. Verificar que el username, después de quitar espacios, no sea una cadena vacía ""
    // 3. Verificar que la contraseña no sea una cadena vacía "" (puedes quitar esto si permites PIN vacío, ¡pero no es recomendable!)
    $trimmed_username = is_string($raw_username) ? trim($raw_username) : '';
    $trimmed_pass = is_string($raw_pass) ? trim($raw_pass) : '';

    if ($raw_username === null || $raw_pass === null || $trimmed_username === '' || $trimmed_pass === '') {
         $error_message = "Usuario y PIN son requeridos.";
    } else {
        // --- Validación pasada ---
        // Ahora SÍ sanitizamos el username para mostrarlo o loguearlo de forma segura si es necesario
        $Username = htmlspecialchars($trimmed_username, ENT_QUOTES, 'UTF-8');
        // Usamos la contraseña cruda (sin trim o sanitización) para la comparación
        $Pass = $raw_pass;

        // --- Consulta Preparada (SOLO para EmployeeCode) ---
        // Usamos el $trimmed_username (original sin htmlspecialchars) para la consulta
        $sql = "SELECT EmployeeCode, PIN FROM RetailDataSHOE.dbo.EMPLOYEE WHERE EmployeeCode = ? AND jobposition = 'admin'";

        if ($conn) { // Verificar si la conexión existe
            try {
                $stmt = $conn->prepare($sql);
                // Enlazar el username TRIMMED para la búsqueda en BD
                $stmt->bindParam(1, $trimmed_username, PDO::PARAM_STR);
                $stmt->execute();
                $user = $stmt->fetch(PDO::FETCH_ASSOC);

                // --- Verificación de Contraseña (PIN - ¡INSEGURO!) ---
                // Compara directamente el PIN de la BD con la contraseña cruda introducida.
                if ($user && isset($user['PIN']) && $Pass === $user['PIN']) {

                    // ¡PIN Correcto! Iniciar sesión
                    session_regenerate_id(true);
                    $_SESSION['Username'] = $user['EmployeeCode'];
                    header("Location: index.php");
                    exit();

                } else {
                    // Usuario no encontrado o PIN incorrecto
                    $error_message = "Usuario o PIN inválidos.";
                }

            } catch (PDOException $e) {
                error_log("Error en consulta de login para usuario '$trimmed_username': " . $e->getMessage()); // Loguear el trimmed
                $error_message = "Ocurrió un error al intentar iniciar sesión. Intente más tarde.";
            }
        } else {
             error_log("Error Crítico: Intento de login sin conexión a BD.");
             $error_message = "Error interno del servidor. No se pudo procesar el login.";
        }
         // $conn = null; // Opcional
    } // Fin del else (validación pasada)
} // Fin procesamiento POST

// Título de la página
$page_title = "Login - Bruno Ferrini";

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title><?php echo $page_title; ?></title>
    <?php // Incluye tus CSS aquí ?>
    <link rel="stylesheet" href="vendors/feather/feather.css">
    <link rel="stylesheet" href="vendors/ti-icons/css/themify-icons.css">
    <link rel="stylesheet" href="vendors/css/vendor.bundle.base.css">
    <link rel="stylesheet" href="css/vertical-layout-light/style.css">
    <link rel="shortcut icon" href="images/favicon.png" />
</head>
<body>
    <div class="container-scroller">
        <div class="container-fluid page-body-wrapper full-page-wrapper">
            <div class="content-wrapper d-flex align-items-center auth px-0">
                <div class="row w-100 mx-0">
                    <div class="col-lg-4 mx-auto">
                        <div class="auth-form-light text-left py-5 px-4 px-sm-5">
                            <div class="brand-logo">
                                <img src="images/logoxx.svg" alt="logo">
                            </div>
                            <h4>Iniciar Sesión</h4>

                            <?php
                            // Mostrar mensaje de error si existe
                            if (isset($error_message)) {
                                echo '<div class="alert alert-danger mt-2">' . htmlspecialchars($error_message, ENT_QUOTES, 'UTF-8') . '</div>';
                            }
                            // Mostrar mensaje de éxito de logout
                            if (isset($_GET['logged_out'])) {
                                 echo '<div class="alert alert-success mt-2">Has cerrado sesión correctamente.</div>';
                            }
                            ?>

                            <form action="login.php" method="POST" class="pt-3">
                                <div class="form-group">
                                    <?php // Usamos $Username_value para repoblar el campo ?>
                                    <input type="text" class="form-control form-control-lg" id="Username" placeholder="Usuario" name="Username" required value="<?php echo htmlspecialchars($Username_value, ENT_QUOTES, 'UTF-8'); ?>">
                                </div>
                                <div class="form-group">
                                    <input type="password" class="form-control form-control-lg" id="Pass" placeholder="PIN" name="Pass" required>
                                </div>
                                <div class="mt-3">
                                    <input type="submit" class="btn btn-block btn-primary btn-lg font-weight-medium auth-form-btn" name="login" value="INGRESAR">
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
            <?php // content-wrapper ends ?>
        </div>
        <?php // page-body-wrapper ends ?>
    </div>
    <?php // container-scroller ?>
    <?php // Incluye tus JS aquí ?>
    <script src="vendors/js/vendor.bundle.base.js"></script>
    <script src="js/off-canvas.js"></script>
    <script src="js/hoverable-collapse.js"></script>
    <script src="js/template.js"></script>
    <script src="js/settings.js"></script>
    <script src="js/todolist.js"></script>
</body>
</html>