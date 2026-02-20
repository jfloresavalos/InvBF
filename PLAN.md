# Inventario Pro - Plan de Implementacion

## Flujo del Sistema

```
1. Admin crea inventario (selecciona tienda)
2. Sistema carga stock teorico desde RetailDataSHOE
3. Admin depura stock (elimina SKUs que no aplican)
4. Admin inicia inventario (estado -> activo)
5. PDAs detectan inventario activo
6. PDAs descargan maestra de productos
7. Operarios escanean productos con ubicacion (scanner o manual)
8. PDAs sincronizan lecturas al servidor cada 30s
9. Admin monitorea lecturas en tiempo real (ve stock vs conteo + origen)
10. Admin cierra inventario
11. Admin genera reporte (stock vs conteo + costos)
12. Admin exporta reporte a Excel
```

---

## Implementacion Completada

### Backend
- [x] Conexion a DBFERRINI (persistencia) y RetailDataSHOE (solo lectura)
- [x] Tablas INV_CABECERA, INV_STOCK_TEORICO, INV_LECTURAS (con campo Origen)
- [x] Todos los endpoints API (login, tiendas, maestra, inventario CRUD, sync, reporte, progreso)
- [x] GZip compression + cache de maestra en servidor + versionado MD5
- [x] Endpoint /download para APK
- [x] Sync acepta tipos flexibles (Any) y convierte a str/int antes de INSERT
- [x] Campo Origen en INV_LECTURAS (scanner/manual) + migracion automatica

### Panel Admin
- [x] Login, lista inventarios, crear/eliminar inventario
- [x] Depurar stock con filtros avanzados (depto, modelo, proveedor, temporada)
- [x] Seleccion multiple + eliminar lote
- [x] Iniciar/cerrar inventario
- [x] Monitor en vivo (polling 10s) con badge de origen (Manual/Scanner)
- [x] Reporte final con exportar Excel
- [x] Vista Maestra (81K productos, filtros, max 500 resultados)
- [x] Navegacion por secciones (Inventarios | Maestra) con breadcrumb
- [x] Stock vs Conteo: columnas Conteo y Diferencia en tabla de stock (activo/cerrado)
- [x] Summary cards con Stock Teorico, Conteo Total, Diferencia, Progreso %

### App PDA
- [x] Login, deteccion inventario activo, descarga/cache maestra
- [x] Escaneo Honeywell + busqueda manual + lista lecturas
- [x] Sync manual con boton "SUBIR CONTEO" (sin auto-sync) + offline-first
- [x] UI/UX Material Design 3 + SVG Icons + accesibilidad
- [x] Modo Barrido (escaneo rapido cantidad=1)
- [x] Vista Inventario en Vivo (stock vs conteo + progreso)
- [x] Vista Productos en Cache
- [x] Origen de lecturas: scanner vs manual con badge "M" en lista
- [x] Log de actividad: syncs, eliminaciones, conexion/desconexion con dispositivo
- [x] Alerta al salir con lecturas pendientes
- [x] Fix leading zero scanner + type mismatch (String() en Map keys y sync payload)

### Build & Deploy
- [x] Script deploy-apk.bat
- [x] Compilar APK con Capacitor

---

## Pendiente: Pruebas en Lectoras Fisicas

- [ ] Instalar APK en Lectora 1 (http://192.168.1.80:8001/download)
- [ ] Instalar APK en Lectora 2
- [ ] Probar flujo completo (ver checklist abajo)

---

## Checklist de Pruebas

### 1. Crear inventario
- [ ] Login admin -> crear inventario -> seleccionar tienda -> stock carga OK

### 2. Depurar stock
- [ ] Filtrar por departamento/modelo/proveedor/temporada
- [ ] Seleccion multiple + eliminar lote + eliminar individual

### 3. Iniciar inventario
- [ ] Estado cambia a "activo", monitor se activa
- [ ] Columnas Conteo y Diferencia aparecen en tabla de stock

### 4. Escaneo PDA
- [ ] Configurar servidor + nombre dispositivo -> detecta inventario
- [ ] Maestra se descarga/cache
- [ ] Escanear producto -> info aparece -> ENVIAR -> lectura registrada
- [ ] Mismo producto -> cantidad incrementa
- [ ] Producto no encontrado -> advertencia
- [ ] Busqueda manual -> lectura marcada con badge "M"
- [ ] Eliminar lectura + SYNC exitoso

### 5. Dos lectoras simultaneas
- [ ] Ambas escaneando -> admin ve lecturas de ambas -> separadas por dispositivo

### 6. Monitor en vivo
- [ ] Lecturas se actualizan cada 10s, cantidad por dispositivo
- [ ] Columna Origen muestra badge "Manual" o texto "Scanner"

### 7. Modo Barrido
- [ ] Toggle on -> escanear = cantidad 1 automatico
- [ ] Mismo SKU+ubicacion = suma +1
- [ ] Producto no encontrado = warning sin registro
- [ ] Preferencia persiste al reabrir

### 8. Vista Maestra (Admin)
- [ ] Tab Maestra -> total ~81K, hash, filtros, max 500 resultados

### 9. Inventario en Vivo (PDA)
- [ ] Cards totales, cards por dispositivo, barra progreso, tabla con filtros
- [ ] Auto-refresh 15s, volver detiene polling

### 10. Productos en Cache (PDA)
- [ ] Total maestra, hash, busqueda por SKU/ALU/descripcion

### 11. Cerrar y Reporte
- [ ] Cerrar inventario -> reporte stock vs conteo
- [ ] Diferencias, costos, sobrantes, totales correctos
- [ ] Exportar Excel

### 12. Navegacion Admin
- [ ] Tabs Inventarios/Maestra funcionan
- [ ] Breadcrumb en detalle inventario
- [ ] Navegacion fluida entre secciones

### 13. Stock vs Conteo (Admin)
- [ ] Inventario activo: columnas Conteo y Dif visibles con datos reales
- [ ] Summary cards muestran Stock Teorico, Conteo, Diferencia, Progreso %
- [ ] Diferencias negativas en rojo, positivas en naranja, cero en verde
- [ ] Inventario en preparacion: Conteo=0, sin cards de progreso
- [ ] Boton "Actualizar Conteo" recarga lecturas y actualiza tabla/cards

### 14. Sync Manual y Log (PDA)
- [ ] No hay auto-sync (no sube datos solo)
- [ ] Boton "SUBIR CONTEO" grande y visible debajo de lecturas
- [ ] Indicador "X lecturas pendientes de subir" visible
- [ ] Despues de subir: indicador cambia a "X lecturas sincronizadas"
- [ ] Ultimo sync muestra hora
- [ ] Boton Log en header -> muestra historial de actividad
- [ ] Log registra: syncs exitosos, errores, eliminaciones, conexion/desconexion
- [ ] Cada entrada del log muestra dispositivo y timestamp
- [ ] Al salir con lecturas pendientes: confirmacion obligatoria

---

## Mejoras Futuras

- [ ] Reconteo: re-escanear productos con diferencia
- [ ] Historial: inventarios pasados con sus reportes
- [ ] Dashboard con graficas (diferencias por departamento)
- [ ] Notificaciones push cuando admin inicia/cierra inventario
- [ ] Fotos de productos problematicos
- [ ] Firma digital al cerrar inventario
- [ ] Multi-tienda simultaneo
- [ ] Exportar PDF del reporte
- [ ] Backup automatico de datos
