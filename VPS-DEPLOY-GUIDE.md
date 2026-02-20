# Guía Universal - Deploy FastAPI a VPS

Guía paso a paso para desplegar **cualquier proyecto FastAPI** a un VPS con Ubuntu/Debian.

---

## 📋 Pre-requisitos

- VPS con Ubuntu 20.04+ o Debian 10+
- Acceso SSH con usuario root
- Dominio o subdominio apuntando al VPS
- Git instalado en el VPS
- Python 3.8+ instalado en el VPS

---

## 🚀 Paso 1: Preparar el Proyecto (Local)

### 1.1 Crear archivo `.env.example`

```env
# Base de datos
DB_SERVER=tu_servidor_aqui
DB_USERNAME=tu_usuario
DB_PASSWORD=tu_password

# API
API_HOST=0.0.0.0
API_PORT=8000

# CORS
CORS_ORIGINS=https://tu-dominio.com,http://localhost:3000
```

### 1.2 Crear `.gitignore`

```gitignore
# Environment
.env
*.env
!.env.example

# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
*.egg-info/
dist/
build/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db
```

### 1.3 Crear `requirements.txt`

```bash
cd tu-proyecto/backend
pip freeze > requirements.txt
```

### 1.4 Push a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/tu-repo.git
git push -u origin master
```

---

## 🖥️ Paso 2: Conectar al VPS

```bash
ssh root@TU_IP_VPS
```

---

## 📦 Paso 3: Instalar Dependencias en VPS

### 3.1 Actualizar sistema

```bash
apt update && apt upgrade -y
```

### 3.2 Instalar Python y herramientas

```bash
apt install -y python3 python3-pip python3-venv git nginx certbot python3-certbot-nginx
```

### 3.3 Verificar versión

```bash
python3 --version
# Debe ser 3.8 o superior
```

---

## 📥 Paso 4: Clonar Proyecto en VPS

### 4.1 Ir a directorio de trabajo

```bash
cd /root
```

### 4.2 Clonar repositorio

```bash
git clone https://github.com/tu-usuario/tu-repo.git
cd tu-repo
```

### 4.3 Crear archivo `.env` (con datos reales)

```bash
nano .env
```

Pega tu configuración real:

```env
DB_SERVER=190.187.176.69
DB_USERNAME=usuario_real
DB_PASSWORD=password_real
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=https://tu-dominio.com,capacitor://localhost
```

Guardar: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## 🐍 Paso 5: Instalar Dependencias Python

### 5.1 Ir al directorio del backend

```bash
cd backend  # O donde esté tu main.py
```

### 5.2 Instalar dependencias

```bash
pip3 install -r requirements.txt
```

### 5.3 Probar que funciona

```bash
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Presiona `Ctrl+C` para detener. Si funcionó, continúa.

---

## ⚙️ Paso 6: Crear Servicio Systemd

### 6.1 Crear archivo de servicio

```bash
nano /etc/systemd/system/tu-proyecto.service
```

### 6.2 Contenido del servicio (TEMPLATE)

```ini
[Unit]
Description=Tu Proyecto FastAPI
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/tu-repo/backend
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Reemplaza:**
- `tu-proyecto` → nombre descriptivo
- `tu-repo` → nombre de tu repositorio
- `backend` → ruta donde está `main.py`
- `8000` → puerto que uses (8000, 8001, etc.)

Guardar: `Ctrl+O`, `Enter`, `Ctrl+X`

### 6.3 Habilitar e iniciar servicio

```bash
systemctl daemon-reload
systemctl enable tu-proyecto
systemctl start tu-proyecto
```

### 6.4 Verificar estado

```bash
systemctl status tu-proyecto
```

Debe decir **"active (running)"** en verde.

### 6.5 Ver logs si hay error

```bash
journalctl -u tu-proyecto -n 50 --no-pager
```

---

## 🌐 Paso 7: Configurar Nginx

### 7.1 Crear configuración de sitio

```bash
nano /etc/nginx/sites-available/tu-proyecto
```

### 7.2 Contenido (TEMPLATE)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts para operaciones largas
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
    }
}
```

**Reemplaza:**
- `tu-dominio.com` → tu dominio real
- `8000` → puerto de tu servicio

Guardar: `Ctrl+O`, `Enter`, `Ctrl+X`

### 7.3 Habilitar sitio

```bash
ln -s /etc/nginx/sites-available/tu-proyecto /etc/nginx/sites-enabled/
```

### 7.4 Probar configuración

```bash
nginx -t
```

Debe decir **"syntax is ok"** y **"test is successful"**.

### 7.5 Recargar Nginx

```bash
systemctl reload nginx
```

---

## 🔒 Paso 8: Configurar SSL (HTTPS)

### 8.1 Ejecutar Certbot

```bash
certbot --nginx -d tu-dominio.com --non-interactive --agree-tos --email tu@email.com --redirect
```

**Reemplaza:**
- `tu-dominio.com` → tu dominio real
- `tu@email.com` → tu email real

### 8.2 Verificar certificado

El comando anterior:
- Obtiene certificado SSL de Let's Encrypt
- Configura Nginx automáticamente
- Redirige HTTP → HTTPS

Tu sitio ahora debe estar en **https://tu-dominio.com**

---

## ✅ Paso 9: Verificar Deployment

### 9.1 Probar en navegador

Abre: **https://tu-dominio.com**

### 9.2 Probar API

```bash
curl https://tu-dominio.com/docs
```

Debe mostrar la documentación Swagger.

---

## 🔄 Paso 10: Actualizar Proyecto

### En tu PC (Local)

```bash
cd tu-proyecto
# Hacer cambios en el código...
git add -A
git commit -m "Descripción de cambios"
git push origin master
```

### En el VPS

```bash
ssh root@TU_IP_VPS
cd /root/tu-repo
git pull origin master
systemctl restart tu-proyecto
```

### Verificar logs

```bash
journalctl -u tu-proyecto -f
```

Presiona `Ctrl+C` para salir.

---

## 🛠️ Comandos Útiles

### Ver estado del servicio

```bash
systemctl status tu-proyecto
```

### Ver logs en tiempo real

```bash
journalctl -u tu-proyecto -f
```

### Ver últimos 100 logs

```bash
journalctl -u tu-proyecto -n 100 --no-pager
```

### Reiniciar servicio

```bash
systemctl restart tu-proyecto
```

### Detener servicio

```bash
systemctl stop tu-proyecto
```

### Iniciar servicio

```bash
systemctl start tu-proyecto
```

### Recargar Nginx (sin downtime)

```bash
systemctl reload nginx
```

### Reiniciar Nginx

```bash
systemctl restart nginx
```

### Ver logs de Nginx

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## 🔍 Troubleshooting

### Problema: Servicio no inicia

```bash
# Ver logs de error
journalctl -u tu-proyecto -n 50 --no-pager

# Ver si el puerto está ocupado
netstat -tlnp | grep 8000

# Probar manualmente
cd /root/tu-repo/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Problema: Nginx da error 502 Bad Gateway

```bash
# Verificar que el servicio FastAPI esté corriendo
systemctl status tu-proyecto

# Verificar logs de Nginx
tail -20 /var/log/nginx/error.log

# Reiniciar todo
systemctl restart tu-proyecto
systemctl restart nginx
```

### Problema: SSL no funciona

```bash
# Verificar certificado
certbot certificates

# Renovar certificado manualmente
certbot renew

# Ver logs de Certbot
tail -50 /var/log/letsencrypt/letsencrypt.log
```

### Problema: No puedo hacer git pull

```bash
# Ver qué cambió localmente
git status

# Guardar cambios locales
git stash

# Hacer pull
git pull origin master

# Restaurar cambios si es necesario
git stash pop
```

---

## 📦 Proyectos con Base de Datos

### Si usas PostgreSQL

```bash
# Instalar PostgreSQL
apt install postgresql postgresql-contrib

# Crear usuario y base de datos
sudo -u postgres psql
CREATE DATABASE tu_db;
CREATE USER tu_user WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE tu_db TO tu_user;
\q
```

### Si usas MySQL

```bash
# Instalar MySQL
apt install mysql-server

# Configurar
mysql_secure_installation

# Crear base de datos
mysql -u root -p
CREATE DATABASE tu_db;
CREATE USER 'tu_user'@'localhost' IDENTIFIED BY 'tu_password';
GRANT ALL PRIVILEGES ON tu_db.* TO 'tu_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 🔐 Seguridad Adicional (Recomendado)

### Configurar Firewall

```bash
# Instalar UFW
apt install ufw

# Permitir SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Habilitar firewall
ufw enable

# Ver estado
ufw status
```

### Crear usuario no-root (Opcional pero recomendado)

```bash
# Crear usuario
adduser tu_usuario

# Agregar a sudo
usermod -aG sudo tu_usuario

# Cambiar servicio a este usuario
nano /etc/systemd/system/tu-proyecto.service
# Cambiar: User=root → User=tu_usuario
# Cambiar: WorkingDirectory=/root/... → WorkingDirectory=/home/tu_usuario/...

systemctl daemon-reload
systemctl restart tu-proyecto
```

---

## 📊 Monitoreo

### Ver uso de recursos

```bash
# CPU y RAM en tiempo real
htop

# Espacio en disco
df -h

# Procesos Python
ps aux | grep python
```

### Ver puertos abiertos

```bash
netstat -tlnp
```

---

## 🎯 Checklist de Deployment

- [ ] Proyecto funciona en local
- [ ] `.env.example` creado
- [ ] `.gitignore` configurado
- [ ] `requirements.txt` actualizado
- [ ] Código pusheado a GitHub
- [ ] VPS accesible por SSH
- [ ] Dependencias instaladas en VPS
- [ ] Proyecto clonado en VPS
- [ ] `.env` creado con datos reales
- [ ] Dependencias Python instaladas
- [ ] Servicio systemd creado y funcionando
- [ ] Nginx configurado
- [ ] SSL configurado con Certbot
- [ ] Dominio apuntando al VPS (DNS)
- [ ] Sitio accesible por HTTPS
- [ ] API docs funcionando (/docs)

---

## 📝 Notas Importantes

1. **Puertos comunes:**
   - 8000: Primera app FastAPI
   - 8001: Segunda app FastAPI
   - 80: HTTP (Nginx)
   - 443: HTTPS (Nginx)

2. **Dominios:**
   - Debe estar configurado en tu proveedor DNS (Cloudflare, GoDaddy, etc.)
   - Tipo A Record apuntando a la IP del VPS
   - Esperar 5-30 minutos para propagación DNS

3. **Certificados SSL:**
   - Let's Encrypt expira cada 90 días
   - Certbot renueva automáticamente (tiene un timer systemd)
   - Verificar: `systemctl status certbot.timer`

4. **Backups:**
   - Código: GitHub
   - Base de datos: Hacer backups periódicos
   - Configuraciones: Documentar en README

---

## 🆘 Comandos de Emergencia

### Si algo se rompe completamente

```bash
# Detener todo
systemctl stop tu-proyecto
systemctl stop nginx

# Ver procesos en el puerto
kill -9 $(lsof -t -i:8000)

# Reiniciar todo
systemctl start tu-proyecto
systemctl start nginx

# Ver logs
journalctl -u tu-proyecto -n 100 --no-pager
tail -50 /var/log/nginx/error.log
```

### Restaurar versión anterior

```bash
cd /root/tu-repo
git log --oneline  # Ver commits
git reset --hard COMMIT_HASH  # Volver a un commit específico
systemctl restart tu-proyecto
```

---

## 📚 Recursos Adicionales

- **FastAPI Docs:** https://fastapi.tiangolo.com/deployment/
- **Nginx Docs:** https://nginx.org/en/docs/
- **Let's Encrypt:** https://letsencrypt.org/
- **Systemd:** https://www.freedesktop.org/wiki/Software/systemd/

---

**Creado:** 2026-02-20
**Última actualización:** 2026-02-20
**Autor:** Claude Code Assistant
