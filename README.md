# 📦 Inventario Pro

Sistema de inventario físico para tiendas Bruno Ferrini con app PDA móvil y panel de administración web.

## 🚀 Características

- ✅ **App PDA Móvil** - Escaneo con pistola Honeywell + entrada manual
- ✅ **Panel Admin Web** - Dashboard en tiempo real con monitor de dispositivos
- ✅ **Offline-First** - Funciona sin conexión, sincroniza cuando hay red
- ✅ **Multi-Dispositivo** - Múltiples PDAs trabajando en paralelo
- ✅ **Reportes Excel** - Exportación de conteo vs stock teórico

## 🏗️ Stack Tecnológico

**Backend:**
- FastAPI (Python 3.10+)
- SQLAlchemy + pyodbc
- SQL Server (ODBC Driver 17)

**Frontend:**
- HTML5 + CSS3 + Vanilla JavaScript
- Material Design 3 Dark Theme
- Capacitor 8 (para APK)

**Mobile:**
- Android APK con Capacitor
- Plugin HoneywellScanner para lectoras
- Offline-first con localStorage

## 📋 Requisitos Previos

- Python 3.10+
- SQL Server (DBFERRINI + RetailDataSHOE)
- ODBC Driver 17 for SQL Server
- Node.js 18+ (para compilar APK)
- Android Studio (para compilar APK)

## ⚙️ Instalación

### 1. Configurar Variables de Entorno

Copiar `.env.example` a `.env` y completar:

```bash
cp .env.example .env
```

```env
DB_SERVER=190.187.176.69
DB_USERNAME=tu_usuario
DB_PASSWORD=tu_contraseña
```

### 2. Instalar Dependencias Python

```bash
cd backend
pip install fastapi uvicorn sqlalchemy pyodbc python-multipart
```

### 3. Ejecutar Backend

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

### 4. Acceso

- **Panel Admin:** http://190.187.176.69:8001/admin
- **Web App:** http://190.187.176.69:8001/app
- **API Docs:** http://190.187.176.69:8001/docs
- **Descargar APK:** http://190.187.176.69:8001/download

## 📱 Compilar APK

```bash
# Ejecutar desde la raíz del proyecto
deploy-apk.bat
```

El APK se generará en `backend/downloads/inventario-pro.apk`

## 📊 Estructura del Proyecto

```
Lectora/
├── backend/
│   ├── main.py           # FastAPI server
│   ├── database.py       # Conexiones SQL Server
│   ├── admin.html        # Panel admin (inline)
│   └── downloads/        # APK compilado
├── www/
│   ├── index.html        # App PDA
│   ├── app.js            # Lógica del scanner
│   └── style.css         # MD3 Dark Theme
├── android/              # Proyecto Capacitor
└── .env.example          # Template de configuración
```

## 🗄️ Base de Datos

### DBFERRINI (R/W)
- `INV_CABECERA` - Inventarios
- `INV_STOCK_TEORICO` - Stock esperado
- `INV_LECTURAS` - Escaneos de PDAs

### RetailDataSHOE (R/O)
- `PRODUCT` + `PRODUCT_STYLE` + `COLOR` - Maestra de productos
- `STORE` - Tiendas
- `PRODUCT_STORE` - Stock por tienda
- `EMPLOYEE` - Login de usuarios

## 🔒 Seguridad

- ⚠️ **Nunca commitear el archivo `.env`** con credenciales reales
- ✅ CORS configurado para IPs específicas
- ✅ Variables de entorno para credenciales sensibles
- 🔜 HTTPS recomendado para producción

## 📝 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/login` | Login con EmployeeCode + PIN |
| GET | `/api/maestra` | Catálogo completo (81K productos) |
| GET | `/api/inventario/activo` | Inventario activo (PDAs) |
| POST | `/api/inventario/{id}/sync` | Sincronizar lecturas PDA |
| GET | `/api/inventario/{id}/reporte` | Reporte stock vs conteo |
| DELETE | `/api/inventario/{id}` | Eliminar inventario |

Ver documentación completa en `/docs` (Swagger UI)

## 🎨 Diseño

- **Theme:** Material Design 3 Dark Industrial
- **Paleta:** Blue (#60a5fa) + Dark Slate
- **Tipografía:** Inter (400-800)
- **Responsive:** Mobile-first + Desktop polish

## 📄 Licencia

Uso interno - Bruno Ferrini

## 👥 Autor

Sistema desarrollado para Bruno Ferrini

---

**Última actualización:** 2026-02-20
**Versión:** 2.0.0
