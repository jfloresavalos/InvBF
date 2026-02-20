# Inventario Pro - Arquitectura

## Vista General

```
+-------------------+     +-------------------+     +-------------------+
|  Laptop/Browser   |     |  PDA Lectora 1    |     |  PDA Lectora 2    |
|  (Panel Admin)    |     |  (App Android)    |     |  (App Android)    |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                          |
         | GET /admin              | POST /api/sync           | POST /api/sync
         | GET /api/*              | GET /api/inventario/*    | GET /api/inventario/*
         |                         |                          |
+--------+-------------------------+-------------------------+----------+
|                     Backend FastAPI (puerto 8001)                      |
|                     Host: 192.168.1.80                                |
+--------+----------------------------+---------------------------------+
         |                            |
         | pyodbc (ODBC 17)           | pyodbc (ODBC 17)
         |                            |
+--------+----------+     +-----------+---------+
|    DBFERRINI      |     |   RetailDataSHOE    |
|  (lectura/escrit) |     |   (solo lectura)    |
|  192.168.1.113    |     |   192.168.1.113     |
+-------------------+     +---------------------+
```

## Componentes

### 1. Backend (FastAPI)

**Archivos:** `backend/main.py`, `backend/database.py`

```
main.py
  |-- Startup: init_tables() + load_maestra_from_db()
  |-- Middleware: GZipMiddleware (min 1000 bytes)
  |-- CORS: allow all origins
  |
  |-- Auth
  |     POST /api/login -> EMPLOYEE table (EmployeeCode + PIN + JobPosition)
  |
  |-- Catalogo
  |     GET /api/tiendas -> STORE table
  |     GET /api/maestra -> Cache en memoria (~81K productos)
  |     GET /api/maestra/version -> Hash MD5 + count (lightweight)
  |     POST /api/maestra/refresh -> Reload desde DB
  |
  |-- Inventario CRUD
  |     GET  /api/inventarios -> Lista todos
  |     GET  /api/inventario/activo -> Inventario con estado='activo'
  |     POST /api/inventario -> Crear + cargar stock desde PRODUCT_STORE
  |     DEL  /api/inventario/{id} -> Eliminar inventario completo
  |
  |-- Stock Teorico
  |     GET  /api/inventario/{id}/stock -> Lista stock
  |     DEL  /api/inventario/{id}/stock/{stockId} -> Eliminar 1
  |     POST /api/inventario/{id}/stock/eliminar-lote -> Eliminar varios
  |
  |-- Operaciones
  |     PUT  /api/inventario/{id}/iniciar -> Estado = 'activo'
  |     PUT  /api/inventario/{id}/cerrar -> Estado = 'cerrado'
  |
  |-- Lecturas (PDAs)
  |     POST /api/inventario/{id}/sync -> DELETE + INSERT por dispositivo
  |     GET  /api/inventario/{id}/lecturas -> Filtrable por dispositivo
  |     DEL  /api/inventario/{id}/lecturas/{id} -> Eliminar 1
  |
  |-- Reportes
  |     GET /api/inventario/{id}/reporte -> Stock vs conteo + precios
  |     GET /api/inventario/{id}/progreso -> Resumen + por dispositivo
  |
  |-- Static
        GET /admin -> Sirve admin.html
        GET /download -> Pagina descarga APK
        GET /download/apk -> Descarga directa APK
```

**Cache de Maestra:**
```
maestra_cache = {
    "data": [...],          # Array de ~81K productos
    "hash": "abc123...",    # MD5 hash (12 chars) para versionado
    "timestamp": datetime   # Fecha de ultima carga
}
```
- Se carga al iniciar el servidor
- PDA verifica hash antes de descargar (GET /api/maestra/version)
- Admin puede forzar refresh (POST /api/maestra/refresh)

### 2. Panel Admin (admin.html)

**Archivo unico:** `backend/admin.html` (HTML + CSS + JS inline)

```
Navegacion:
  Header fijo con 2 niveles:
    Top: Titulo + Logout
    Nav: [Inventarios] [Maestra]  <- tabs con iconos SVG

Secciones (show/hide pattern):
  section-inventarios  -> Lista de inventarios + crear/eliminar
  section-maestra      -> Vista maestra (81K productos + filtros)
  section-detail       -> Detalle inventario (stock | monitor | reporte)
    - Breadcrumb: "Inventarios > #ID - NombreTienda"
    - Sub-tabs: Stock Teorico | Monitor | Reporte

Stock vs Conteo (inventario activo/cerrado):
  loadStock() -> fetch stock + fetch lecturas -> cruce por SKU
  Columnas extra: Conteo (sum lecturas), Diferencia (conteo - stock)
  Summary cards: Stock Teorico, Conteo Total, Diferencia, Progreso %
  Boton "Actualizar Conteo": recarga lecturas del servidor y actualiza tabla
  Monitor: columna Origen con badge "Manual" o "Scanner"

Patron JS:
  const A = {
    invId, invNombre, invEstado, currentSection,
    stockData[], maestraData[],
    monitorTimer, maestraBadge
  }
  navigate(section) -> controla visibilidad de todas las secciones
```

### 3. App PDA (www/)

**Archivos:** `www/index.html`, `www/app.js`, `www/style.css`

```
Vistas (show/hide):
  view-login        -> Servidor IP + nombre dispositivo
  view-no-inventory -> Sin inventario activo (polling)
  view-scanner      -> Escaneo principal
  view-inventario   -> Monitor en vivo (stock vs conteo)
  view-productos    -> Maestra en cache

Estado global (app.js):
  const State = {
    serverUrl, deviceName,
    inventarioId, tiendaNombre,
    maestraBySKU: Map,      # Key: String(SKU) -> producto
    maestraByALU: Map,      # Key: String(ALU) -> producto
    maestraArray: [],        # Array completo
    lecturas: [],            # Lecturas locales (cada una con .origen)
    currentProduct: null,    # Incluye .origen: 'scanner'|'manual'
    modoBarrido: false,
    pendingSync: true,       # true si hay cambios sin subir
    activityLog: [],         # Log de actividad (syncs, deletes, errores)
    monitorTimer             # Solo para vista progreso (polling 15s)
  }
```

**Flujo de escaneo:**
```
Scanner Honeywell -> barcodeScanned event
  -> handleHardwareScan(barcode)
    -> Si hay producto pendiente sin guardar: auto-registrar
    -> inputProducto.value = barcode
    -> lookupAndFill(barcode)
      -> code = String(code).trim()
      -> codeNoZeros = code.replace(/^0+/, '')  // Fix leading zero
      -> Buscar en: maestraByALU(code) || maestraBySKU(code)
         || maestraByALU(codeNoZeros) || maestraBySKU(codeNoZeros)
      -> Si modo barrido: registrar() automaticamente (origen='scanner')
      -> Si modo normal: mostrar info, esperar ENVIAR (origen='scanner')

Busqueda manual -> selectSearch() -> origen='manual'
  -> registrar() guarda lectura con origen='manual'
  -> Badge "M" amarillo en lista de lecturas
```

**Sync (manual - boton SUBIR CONTEO):**
```
Operario presiona "SUBIR CONTEO"
  -> POST /api/inventario/{id}/sync
  -> Body: { dispositivo, lecturas: [{ sku, alu, descripcion, cantidad, ubicacion, origen }] }
  -> Backend: DELETE todas las lecturas del dispositivo, INSERT nuevas (con Origen)
  -> OK: pendingSync=false, addLog('sync', ...)
  -> Error: addLog('error', ...), datos siguen en localStorage

No hay auto-sync. El operario controla cuando sube datos.
Datos siempre seguros en localStorage hasta sync exitoso.
```

**Log de Actividad:**
```
Eventos registrados:
  - sync: "SUBIDO: X unidades, Y items - Lectora 1"
  - delete: "Eliminada: ZAPATO NEGRO (2 uds) - Ubic: A1 - Lectora 1"
  - error: "ERROR sync: Error 500 ..." / "Sin conexion al sincronizar"
  - info: "Conexion WiFi restaurada" / "Logout con X lecturas pendientes"

Persistido en localStorage (max 200 entradas)
Vista accesible desde icono en header del scanner
```

## Base de Datos

### Esquema DBFERRINI

```sql
INV_CABECERA
  Id INT IDENTITY PK
  CodTienda VARCHAR(10)
  NombreTienda VARCHAR(100)
  FechaCreacion DATETIME DEFAULT GETDATE()
  Estado VARCHAR(20) DEFAULT 'preparacion'  -- preparacion|activo|cerrado

INV_STOCK_TEORICO
  Id INT IDENTITY PK
  IdInventario INT FK -> INV_CABECERA(Id)
  SKU VARCHAR(50)
  ALU VARCHAR(50)
  Descripcion VARCHAR(200)
  Departamento VARCHAR(100)
  Modelo VARCHAR(100)
  Proveedor VARCHAR(100)
  Temporada VARCHAR(100)
  StockTeorico INT

INV_LECTURAS
  Id INT IDENTITY PK
  IdInventario INT FK -> INV_CABECERA(Id)
  SKU VARCHAR(50)
  ALU VARCHAR(50)
  Descripcion VARCHAR(200)
  Cantidad INT
  Ubicacion VARCHAR(10)
  Dispositivo VARCHAR(50)
  Origen VARCHAR(10) DEFAULT 'scanner'  -- scanner|manual
  FechaHora DATETIME DEFAULT GETDATE()
```

### Consultas RetailDataSHOE

```sql
-- Maestra de productos
SELECT p.SKU, p.ALU,
    t.Desc1+' '+c.ColorLongName+' '+p.SizeCode as descripcion,
    t.desc1 as modelo, t.desc2 as proveedor, t.Desc3 as temporada,
    p.ProductReference as codcaja
FROM PRODUCT p
INNER JOIN PRODUCT_STYLE t ON p.StyleCode=t.StyleCode
INNER JOIN COLOR c ON p.ColorCode=c.ColorCode
WHERE isnull(p.ALU,'-1')<>'-1' AND LEN(p.ALU)=17

-- Stock por tienda
SELECT SKU, OnHandQty FROM PRODUCT_STORE WHERE StoreCode=:cod AND OnHandQty>0

-- Tiendas activas
SELECT StoreCode, StoreName FROM STORE WHERE Active=1
```

## Red y Deploy

```
Red Local: 192.168.1.x
  Server DB:   192.168.1.113 (SQL Server)
  Server App:  192.168.1.80  (FastAPI :8001)
  PDAs:        DHCP (red WiFi local)

Deploy APK:
  deploy-apk.bat
    -> npx cap sync android
    -> gradlew assembleDebug
    -> copy APK a backend/downloads/
    -> PDAs descargan desde http://192.168.1.80:8001/download
```

## Decisiones de Diseno

| Decision | Razon |
|----------|-------|
| Vanilla JS (sin framework) | PDAs con recursos limitados, menos overhead |
| admin.html inline (HTML+CSS+JS) | Un solo archivo, facil de servir desde FastAPI |
| Sync por reemplazo total | Evita conflictos de concurrencia, simple y robusto |
| Map keys como String() | SQL Server devuelve SKU como int, JS Map usa === |
| localStorage para maestra | 81K productos cached offline en PDA |
| Hash MD5 para versionado | PDA solo descarga maestra si cambio el hash |
| GZip middleware | Maestra de 81K productos se comprime significativamente |
| Polling (no WebSocket) | Mas simple, funciona bien para admin (10s) y monitor PDA (15s) |
| Material Design 3 Dark | Reduce brillo en almacen, ahorra bateria en OLED |
| Campo Origen en lecturas | Distingue scanner vs manual para trazabilidad |
| Stock vs Conteo en admin | Cruce en frontend (stock + lecturas) sin endpoint extra |
| LecturaItem con Any types | Backend tolera numeros/strings del frontend, convierte internamente |
| Sync manual (no auto) | Operario controla cuando sube datos, evita duplicados en WiFi inestable |
| Log de actividad | Trazabilidad completa: syncs, eliminaciones, errores, por dispositivo |
| Alerta logout pendiente | Previene perdida accidental de datos no sincronizados |
