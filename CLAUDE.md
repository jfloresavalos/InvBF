# Inventario Pro

Sistema de inventario fisico para tiendas Bruno Ferrini.

## Stack

- **Backend**: FastAPI + SQLAlchemy + pyodbc (ODBC Driver 17 for SQL Server)
- **Admin Panel**: HTML + CSS + JS vanilla (inline en `backend/admin.html`)
- **App PDA**: Capacitor 8 + vanilla JS + plugin HoneywellScanner
- **Excel**: SheetJS (XLSX) desde CDN
- **DB**: SQL Server (DBFERRINI para persistencia, RetailDataSHOE solo lectura)

## Estructura del Proyecto

```
C:\Dev\Lectora\
  backend/
    database.py       # Conexiones a DBFERRINI y RetailDataSHOE, init tablas
    main.py           # Endpoints FastAPI + sirve admin.html
    admin.html        # Panel admin completo (HTML+CSS+JS inline)
    downloads/        # APK compilado para descargar
  www/
    index.html        # Interfaz PDA (Material Design 3 Dark Theme) + view-manual
    app.js            # Logica PDA: scanner, maestra, sync, lecturas, modulo manual
    style.css         # Estilos MD3 Dark Theme
  android/            # Proyecto Android (Capacitor)
  capacitor.config.json
  deploy-apk.bat      # Script para compilar y desplegar APK
```

## Ejecutar

```bash
# Backend
cd C:\Dev\Lectora\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8001

# Admin Panel -> http://localhost:8001/admin
# Descargar APK -> http://192.168.1.80:8001/download

# Compilar APK
cd C:\Dev\Lectora
deploy-apk.bat
```

## Base de Datos

### DBFERRINI (lectura/escritura)
| Tabla | Uso |
|-------|-----|
| `INV_CABECERA` | Cabecera de inventarios (Id, CodTienda, NombreTienda, Estado) |
| `INV_STOCK_TEORICO` | Stock esperado por tienda (SKU, ALU, Descripcion, Depto, StockTeorico) |
| `INV_LECTURAS` | Escaneos de las PDAs (SKU, ALU, Cantidad, Ubicacion, Dispositivo, Origen) |

**Estados:** `preparacion` -> `activo` -> `cerrado`

**Origen de lecturas:** `scanner` (escaneado con pistola) | `manual` (busqueda por nombre)

### RetailDataSHOE (solo lectura)
- `PRODUCT` + `PRODUCT_STYLE` + `COLOR` -> Maestra (~81,705 productos)
- `STORE` -> Tiendas activas
- `PRODUCT_STORE` -> Stock por tienda (OnHandQty)
- `EMPLOYEE` -> Login (EmployeeCode + PIN + JobPosition)
- `DEPARTMENT` -> Nombres de departamentos

## API Endpoints

| Metodo | Ruta | Funcion |
|--------|------|---------|
| POST | `/api/login` | Login con EmployeeCode + PIN |
| GET | `/api/tiendas` | Lista tiendas activas |
| GET | `/api/maestra` | Catalogo completo (81K productos) |
| GET | `/api/maestra/version` | Hash + conteo (lightweight check) |
| POST | `/api/maestra/refresh` | Forzar actualizacion desde DB |
| GET | `/api/inventarios` | Lista todos los inventarios |
| GET | `/api/inventario/activo` | Inventario activo (para PDAs) |
| POST | `/api/inventario` | Crear inventario + cargar stock teorico |
| GET | `/api/inventario/{id}/stock` | Ver stock teorico |
| DELETE | `/api/inventario/{id}/stock/{stockId}` | Eliminar 1 producto del stock |
| POST | `/api/inventario/{id}/stock/eliminar-lote` | Eliminar varios productos |
| PUT | `/api/inventario/{id}/iniciar` | Cambiar estado a 'activo' |
| POST | `/api/inventario/{id}/sync` | PDA envia lecturas con origen (reemplazo total por dispositivo) |
| GET | `/api/inventario/{id}/lecturas` | Ver lecturas con origen (filtrable por dispositivo) |
| DELETE | `/api/inventario/{id}/lecturas/{id}` | Eliminar una lectura |
| GET | `/api/inventario/{id}/reporte` | Reporte: stock vs conteo + precios |
| GET | `/api/inventario/{id}/progreso` | Progreso: stock vs conteo + dispositivos |
| PUT | `/api/inventario/{id}/cerrar` | Cerrar inventario |
| DELETE | `/api/inventario/{id}` | Eliminar inventario completo |
| GET | `/api/log` | Log de actividad del sistema (in-memory, max 500, newest first) |
| GET | `/admin` | Sirve panel admin HTML |
| GET | `/download` | Pagina descarga APK |
| GET | `/download/apk` | Descarga directa APK |

## Patrones Clave

- **Sync PDA manual**: Boton "SUBIR CONTEO" (sin auto-sync). Reemplazo total por dispositivo (DELETE + INSERT). Incluye campo `origen`
- **Offline-first**: Lecturas se guardan en localStorage inmediatamente. Se suben al servidor manualmente con SUBIR CONTEO
- **Modo offline PDA**: `checkInventario()` usa timeout 8s. Si falla → `tryOfflineMode()`. Intenta cargar maestra en orden: memoria > `loadCachedMaestra()` (LZString) > `loadStockCache()` (stock teorico). Boton `#btnOffline` aparece solo si hay INV_KEY pero falla todo lo anterior. Primera carga SIEMPRE requiere internet
- **Maestra cache PDA**: Comprimida con `LZString.compressToUTF16` (~12MB → ~2-3MB, cabe en localStorage). Guardada en `MAESTRA_KEY`. Al cargar: detecta si es JSON plano (empieza con `[`) o comprimido. Libreria: CDN `lz-string@1.5.0` en index.html
- **Stock cache offline**: `STOCK_CACHE_KEY` = stock teorico del inventario activo. Se cachea en background al conectar online via `cacheStockForOffline(invId)`. Usado como fallback si maestra no cabe. Formato mapeado a estructura maestra (lowercase fields)
- **Device name lock**: Tras primer sync exitoso se guarda `DEVICE_LOCKED_KEY='1'` en localStorage. En `init()` si existe: deshabilita `#inputDevice` + muestra hint con candado. Para cambiar: borrar `inv_device_locked` del localStorage del PDA
- **Log de actividad**: Registra cada sync, eliminacion, conexion/desconexion con timestamp y dispositivo. Persistido en localStorage
- **Moneda**: Soles peruanos `S/` en todo el proyecto (NO dolares). Timezone: `America/Lima`
- **Admin nav**: Secciones independientes (inventarios/maestra/log/detail) con show/hide pattern
- **Admin stock view**: Muestra columnas Conteo y Diferencia (stock vs lecturas) cuando inventario esta activo/cerrado. Boton "Actualizar Conteo" para refrescar datos
- **Admin reporte sobrante**: Sobrantes (SKU en lecturas pero no en stock teorico) NO llevan "SOBRANTE" en Departamento. Se hace lookup a RetailDataSHOE para obtener Departamento y Proveedor reales. El campo `Sobrante: True` controla el badge amarillo "SOBRANTE" en la columna Descripcion. Columna Proveedor agregada al reporte
- **Scanner**: Lookup por ALU primero, luego SKU. Keys en Map siempre como `String()` para evitar type mismatch
- **Origen de lecturas**: `scanner` = escaneado con pistola, `manual` = seleccionado via busqueda por nombre
- **GZip**: Middleware para comprimir respuestas grandes (maestra ~81K)
- **Monitor admin**: Polling cada 10s. Cards separadas: Total Unidades, Registros, Pistola (verde), Manuales (amarillo), + por dispositivo
- **Admin Log**: In-memory deque(500) en main.py. Tipos: login, inventario, sync, delete, maestra. Solo lectura (sin borrar). Tambien recibe logs de cada PDA al hacer sync (tipos pda-sync, pda-info, pda-error, pda-delete). Max 100 entradas de PDA por sync
- **App movil manual**: Vista `view-manual` separada. Busqueda en tiempo real (`buscarManualLive` con debounce 300ms, min 2 chars) + boton BUSCAR + Enter. `#manualResults` usa `position:static` (NO `search-results` absoluta). Filtros proveedor/temporada opcionales e independientes. Muestra solo lecturas con `origen='manual'`. Acumula si mismo SKU ya existe
- **Sobrantes en progreso PDA**: `get_progreso()` incluye sobrantes (SKU en lecturas pero no en stock teorico) con campo `Sobrante: True`. Se muestran en tabla con fondo ambar y badge "+". Departamento vacio en sobrantes = no aparecen en filtro por depto
- **App movil log**: Sin boton de limpiar log en la PDA (solo lectura)

## Bugs Conocidos y Fixes

- **Leading zero en scanner**: Honeywell agrega "0" al inicio del barcode. Fix: `code.replace(/^0+/, '')` en lookupAndFill + Map keys como `String(p.SKU)`
- **Type mismatch Map keys**: SQL Server devuelve SKU como int. Siempre usar `String()` al construir Maps para que `Map.get("1129597")` encuentre la key
- **Sync type error**: Pydantic rechazaba SKU numerico. Fix: modelo `LecturaItem` acepta `Any`, backend convierte a `str()` antes de INSERT. Frontend tambien fuerza `String()` en payload
- **manualResults position bug**: `.search-results` tiene `position:absolute` (para dropdown de scanner). En view-manual los resultados aparecian fuera de pantalla. Fix: `style="position:static;margin-top:0"` en el div `#manualResults`
- **Maestra localStorage overflow**: 81K productos ~12MB supera limite. Fix: LZString compression antes de guardar

## Hardware

- 2 lectoras Honeywell PDA con Android
- Plugin Capacitor: `HoneywellScanner`
- Evento: `barcodeScanned` con propiedad `barcode`
- Server: 192.168.1.80 (red local)
