@echo off
echo ========================================
echo   Inventario Pro - Deploy APK
echo ========================================
echo.

REM Configurar JAVA_HOME (Android Studio JBR)
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
echo JAVA_HOME=%JAVA_HOME%

REM Compilar APK
echo.
echo [1/3] Sincronizando Capacitor...
cd /d c:\Dev\Lectora
call npx cap sync android

echo.
echo [2/3] Compilando APK...
cd /d c:\Dev\Lectora\android
call gradlew.bat assembleDebug

echo.
echo [3/3] Copiando APK a servidor...
cd /d c:\Dev\Lectora
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "backend\downloads\inventario-pro.apk"

echo.
echo ========================================
echo   APK listo para descargar en:
echo   http://190.187.176.69:8001/download
echo ========================================
echo.
pause
