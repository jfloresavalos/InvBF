# Manual Completo - Inventario Pro

Guía paso a paso para desarrollar, actualizar y mantener el proyecto.

---

## 📁 Estructura del Proyecto

```
C:\Dev\Lectora\                      # Tu PC (Windows)
├── backend/
│   ├── main.py                      # API FastAPI
│   ├── database.py                  # Conexión SQL Server
│   ├── admin.html                   # Panel administrativo
│   └── downloads/
│       └── inventario-pro.apk       # APK compilado (NO en Git)
├── www/
│   ├── index.html                   # App móvil (web)
│   ├── app.js                       # Lógica de la app
│   └── style.css                    # Estilos
├── android/                         # Proyecto Android/Capacitor
├── .env                             # Config local (NO en Git)
├── .gitignore                       # Archivos ignorados por Git
└── deploy-apk.bat                   # Script para compilar APK
```

**En el VPS (190.119.16.211):**
```
/root/inventario-pro/                # Mismo código que en tu PC
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── admin.html
│   └── downloads/
│       └── inventario-pro.apk       # Subido con SCP
├── www/
├── .env                             # Config producción
└── openssl_legacy.cnf               # Config SSL (solo VPS)
```

---

## 🔄 Flujo de Trabajo Completo

### Escenario 1: Modificar el Backend (Python/HTML/CSS)

**Ejemplo:** Cambiar el admin panel, agregar un endpoint, fix un bug

#### En tu PC:

```bash
cd C:\Dev\Lectora

# 1. Hacer cambios en el código (backend/main.py, admin.html, etc.)

# 2. Guardar cambios en Git
git add -A
git commit -m "Fix: corrección en admin panel"
git push origin master
```

#### En el VPS:

```bash
# 3. Conectar al VPS
ssh root@190.119.16.211

# 4. Actualizar código
cd /root/inventario-pro
git pull origin master

# 5. Reiniciar servicio
systemctl restart inventario-pro

# 6. Verificar que funciona
systemctl status inventario-pro

# 7. Ver logs (opcional)
journalctl -u inventario-pro -f
# Presionar Ctrl+C para salir
```

#### Verificar en navegador:

- Ir a: https://inv.brunoferrini.pe/admin
- Verificar que los cambios estén aplicados

---

### Escenario 2: Modificar la App Móvil (JS/HTML/CSS)

**Ejemplo:** Cambiar el diseño de la app, agregar funcionalidad

#### En tu PC:

```bash
cd C:\Dev\Lectora

# 1. Hacer cambios en www/app.js, www/index.html, www/style.css

# 2. Guardar en Git (igual que Escenario 1)
git add -A
git commit -m "Update: mejoras en app móvil"
git push origin master

# 3. Compilar nuevo APK
deploy-apk.bat
# Esperar a que compile...

# 4. Subir APK al VPS
scp backend/downloads/inventario-pro.apk root@190.119.16.211:/root/inventario-pro/backend/downloads/
```

#### En el VPS:

```bash
# 5. Conectar y actualizar código
ssh root@190.119.16.211
cd /root/inventario-pro
git pull origin master
systemctl restart inventario-pro
```

#### Actualizar en las PDAs:

1. Ir a: https://inv.brunoferrini.pe/download
2. Descargar nuevo APK
3. Instalar en cada PDA (reemplaza la versión anterior)

---

### Escenario 3: Solo Cambiar el APK (sin cambios de backend)

**Ejemplo:** Solo modificaste www/app.js y NO tocaste backend/

#### En tu PC:

```bash
cd C:\Dev\Lectora

# 1. Hacer cambios en www/

# 2. Compilar APK
deploy-apk.bat

# 3. Subir APK al VPS (SIN git)
scp backend/downloads/inventario-pro.apk root@190.119.16.211:/root/inventario-pro/backend/downloads/

# Opcionalmente, guardar cambios en Git (por backup)
git add -A
git commit -m "Update app móvil"
git push origin master
```

**NO necesitas** hacer `git pull` ni `systemctl restart` en el VPS (el backend no cambió).

---

### Escenario 4: Solo Cambiar Backend (sin APK)

**Ejemplo:** Agregaste un endpoint nuevo pero la app móvil no cambia

#### En tu PC:

```bash
cd C:\Dev\Lectora

# 1. Hacer cambios en backend/main.py

# 2. Guardar en Git
git add -A
git commit -m "Add: nuevo endpoint /api/reporte"
git push origin master
```

#### En el VPS:

```bash
ssh root@190.119.16.211
cd /root/inventario-pro
git pull origin master
systemctl restart inventario-pro
```

**NO necesitas** compilar ni subir APK nuevo.

---

## 📊 Tabla Resumen: ¿Qué Usar?

| Cambié esto... | Git Push | Git Pull + Restart | Compilar APK | Subir APK con SCP |
|----------------|----------|-------------------|--------------|-------------------|
| `backend/main.py` | ✅ | ✅ | ❌ | ❌ |
| `backend/admin.html` | ✅ | ✅ | ❌ | ❌ |
| `backend/database.py` | ✅ | ✅ | ❌ | ❌ |
| `www/app.js` | ✅ (opcional) | ✅ (si hiciste push) | ✅ | ✅ |
| `www/index.html` | ✅ (opcional) | ✅ (si hiciste push) | ✅ | ✅ |
| `www/style.css` | ✅ (opcional) | ✅ (si hiciste push) | ✅ | ✅ |
| `.env` | ❌ NUNCA | ❌ | ❌ | ❌ |

---

## 🔧 Comandos Importantes

### En tu PC (Windows)

```bash
# Ver estado de Git
git status

# Guardar cambios
git add -A
git commit -m "Descripción"
git push origin master

# Compilar APK
deploy-apk.bat

# Subir APK al VPS
scp backend/downloads/inventario-pro.apk root@190.119.16.211:/root/inventario-pro/backend/downloads/

# Conectar al VPS
ssh root@190.119.16.211
```

### En el VPS

```bash
# Actualizar código
cd /root/inventario-pro
git pull origin master

# Reiniciar backend
systemctl restart inventario-pro

# Ver estado del servicio
systemctl status inventario-pro

# Ver logs en tiempo real
journalctl -u inventario-pro -f

# Ver últimos 50 logs
journalctl -u inventario-pro -n 50 --no-pager

# Detener servicio
systemctl stop inventario-pro

# Iniciar servicio
systemctl start inventario-pro

# Ver puertos abiertos
netstat -tlnp | grep 8001
```

---

## 🌍 URLs Importantes

| Qué | URL | Descripción |
|-----|-----|-------------|
| **Panel Admin** | https://inv.brunoferrini.pe/admin | Administrar inventarios desde web |
| **API Docs** | https://inv.brunoferrini.pe/docs | Documentación Swagger |
| **Descargar APK** | https://inv.brunoferrini.pe/download | Descargar app para Android |
| **GitHub** | https://github.com/jfloresavalos/InvBF | Repositorio del código |

---

## 📝 Archivos Importantes

### Archivos que SÍ van a Git

✅ `backend/main.py` - API principal
✅ `backend/database.py` - Conexión BD
✅ `backend/admin.html` - Panel admin
✅ `www/app.js` - Lógica app móvil
✅ `www/index.html` - HTML app móvil
✅ `www/style.css` - Estilos
✅ `CLAUDE.md` - Documentación del proyecto
✅ `VPS-DEPLOY-GUIDE.md` - Guía de deployment
✅ `.env.example` - Ejemplo de configuración
✅ `.gitignore` - Lista de archivos ignorados

### Archivos que NO van a Git

❌ `.env` - Contraseñas reales
❌ `backend/downloads/*.apk` - APK compilado (se sube con SCP)
❌ `__pycache__/` - Archivos temporales Python
❌ `node_modules/` - Dependencias Node
❌ `android/app/build/` - Build de Android

---

## 🚨 Errores Comunes

### Error 1: "Backend no responde después de git pull"

**Causa:** No reiniciaste el servicio

**Solución:**
```bash
ssh root@190.119.16.211
systemctl restart inventario-pro
systemctl status inventario-pro
```

### Error 2: "APK sigue siendo la versión antigua"

**Causa:** No subiste el APK nuevo al VPS

**Solución:**
```bash
# En tu PC
scp backend/downloads/inventario-pro.apk root@190.119.16.211:/root/inventario-pro/backend/downloads/
```

### Error 3: "Cambié código pero no se refleja en producción"

**Checklist:**
1. ✅ ¿Hiciste `git push` en tu PC?
2. ✅ ¿Hiciste `git pull` en el VPS?
3. ✅ ¿Reiniciaste el servicio? (`systemctl restart`)
4. ✅ ¿Limpiaste caché del navegador? (Ctrl+Shift+R)

### Error 4: "Internal Server Error en la API"

**Ver logs:**
```bash
ssh root@190.119.16.211
journalctl -u inventario-pro -n 50 --no-pager
```

Buscar la línea con `ERROR` o `Traceback`.

### Error 5: "git pull dice 'conflict'"

**Solución:**
```bash
# Guardar cambios locales del VPS
git stash

# Actualizar
git pull origin master

# Ver qué guardaste (opcional)
git stash list
```

---

## 🔐 Seguridad

### Archivo .env

**NUNCA** subir a Git. Solo editarlo directamente en el VPS:

```bash
ssh root@190.119.16.211
nano /root/inventario-pro/.env
```

Guardar: `Ctrl+O`, `Enter`, `Ctrl+X`

Reiniciar: `systemctl restart inventario-pro`

### Contraseñas

- SQL Server: `retail` (usuario: retailuser)
- VPS SSH: Tu contraseña de root
- GitHub: Token personal o SSH key

---

## 🎯 Casos de Uso Frecuentes

### 1. "Quiero agregar un botón al admin panel"

```bash
# PC
cd C:\Dev\Lectora
# Editar: backend/admin.html
git add backend/admin.html
git commit -m "Add: botón exportar"
git push origin master

# VPS
ssh root@190.119.16.211
cd /root/inventario-pro
git pull origin master
systemctl restart inventario-pro
```

### 2. "Quiero cambiar el color de la app móvil"

```bash
# PC
cd C:\Dev\Lectora
# Editar: www/style.css
deploy-apk.bat
scp backend/downloads/inventario-pro.apk root@190.119.16.211:/root/inventario-pro/backend/downloads/

# Opcional: guardar en Git
git add www/style.css
git commit -m "Update: cambio de colores"
git push origin master
```

### 3. "Quiero crear un nuevo endpoint /api/ventas"

```bash
# PC
cd C:\Dev\Lectora
# Editar: backend/main.py (agregar @app.get("/api/ventas"))
git add backend/main.py
git commit -m "Add: endpoint /api/ventas"
git push origin master

# VPS
ssh root@190.119.16.211
cd /root/inventario-pro
git pull origin master
systemctl restart inventario-pro

# Probar
curl https://inv.brunoferrini.pe/api/ventas
```

### 4. "Quiero cambiar la conexión a la base de datos"

```bash
# VPS (directamente, NO por Git)
ssh root@190.119.16.211
nano /root/inventario-pro/.env
# Cambiar: DB_SERVER, DB_USERNAME, DB_PASSWORD
# Guardar: Ctrl+O, Enter, Ctrl+X

systemctl restart inventario-pro
journalctl -u inventario-pro -n 20 --no-pager
```

---

## 📊 Monitoreo

### Ver si el servicio está corriendo

```bash
ssh root@190.119.16.211
systemctl status inventario-pro
```

Debe decir: **"active (running)"** en verde.

### Ver logs de errores

```bash
journalctl -u inventario-pro -n 100 --no-pager | grep -i error
```

### Ver cuánta RAM/CPU usa

```bash
ssh root@190.119.16.211
htop
# Presionar 'q' para salir
```

### Ver espacio en disco

```bash
ssh root@190.119.16.211
df -h
```

---

## 🔄 Flujo Completo Paso a Paso

### Día a Día (Desarrollo Normal)

**Mañana:**
```bash
# 1. En tu PC
cd C:\Dev\Lectora
code .  # Abrir VSCode

# 2. Hacer cambios en el código...

# 3. Guardar y subir
git add -A
git commit -m "Fix: corrección en reporte"
git push origin master

# 4. En VPS
ssh root@190.119.16.211
cd /root/inventario-pro
git pull origin master
systemctl restart inventario-pro

# 5. Verificar
curl https://inv.brunoferrini.pe/api/tiendas
# Debe devolver JSON con tiendas
```

**Si también cambias la app móvil:**
```bash
# 6. Compilar APK
deploy-apk.bat

# 7. Subir al VPS
scp backend/downloads/inventario-pro.apk root@190.119.16.211:/root/inventario-pro/backend/downloads/

# 8. Descargar en PDAs
# Ir a https://inv.brunoferrini.pe/download desde cada PDA
# Instalar nuevo APK
```

---

## 🎓 Conceptos Clave

### Git vs SCP

| Herramienta | Para qué | Ejemplo |
|-------------|----------|---------|
| **Git** | Código fuente (Python, HTML, JS) | `git push` → `git pull` |
| **SCP** | Archivos compilados (APK) | `scp archivo.apk servidor:/ruta/` |

### Backend vs Frontend

| Parte | Archivos | Dónde corre | Cómo actualizar |
|-------|----------|-------------|-----------------|
| **Backend** | `backend/main.py`, `database.py` | VPS (servidor) | Git pull + restart |
| **Frontend Web** | `backend/admin.html` | VPS (servidor) | Git pull + restart |
| **Frontend Móvil** | `www/app.js`, `index.html` | PDA (Android) | Compilar APK + SCP + reinstalar |

### Producción vs Local

| Entorno | Dónde | IP/URL | Base de Datos |
|---------|-------|--------|---------------|
| **Local** | Tu PC (Windows) | localhost:8001 | 190.187.176.69 |
| **Producción** | VPS | https://inv.brunoferrini.pe | 190.187.176.69 |

**Mismo SQL Server** para ambos (190.187.176.69).

---

## ✅ Checklist Pre-Producción

Antes de subir cambios a producción:

- [ ] Probé el código en local (localhost:8001)
- [ ] No hay errores en consola
- [ ] Hice commit con mensaje descriptivo
- [ ] Hice push a GitHub
- [ ] Hice pull en VPS
- [ ] Reinicié el servicio
- [ ] Verifiqué logs (sin errores)
- [ ] Probé en navegador (https://inv.brunoferrini.pe)
- [ ] Si cambié app: compilé APK y subí con SCP

---

## 📞 Contacto

**Desarrollador:** Jose Flores Avalos
**Email:** josefloresavalos@gmail.com
**GitHub:** https://github.com/jfloresavalos/InvBF
**VPS:** 190.119.16.211
**Dominio:** https://inv.brunoferrini.pe

---

**Última actualización:** 2026-02-20
**Versión:** 1.0
