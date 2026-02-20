from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
from collections import deque
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db, get_retail_db, init_tables
import os
import hashlib
import json

app = FastAPI(title="Inventario API", version="2.0.0")

# GZip compression for large responses (like maestra)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://190.187.176.69:8001",
        "https://190.187.176.69:8001",
        "capacitor://localhost",
        "http://localhost:8001",  # for local dev
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

# Cache for maestra to avoid hitting DB every time
maestra_cache = {
    "data": None,
    "hash": None,
    "timestamp": None
}

# In-memory admin activity log (max 500 entries, newest first)
admin_log: deque = deque(maxlen=500)

def log_admin(tipo: str, mensaje: str, usuario: str = "sistema"):
    admin_log.appendleft({
        "tipo": tipo,
        "mensaje": mensaje,
        "usuario": usuario,
        "timestamp": datetime.now().isoformat()
    })


@app.on_event("startup")
def startup():
    init_tables()

# Serve PDA web app — accessible from any browser via VPS
# http://190.187.176.69:8001/app  (same as APK but in browser, no Honeywell scanner)
WWW_DIR = os.path.join(os.path.dirname(__file__), "..", "www")
if os.path.isdir(WWW_DIR):
    app.mount("/app", StaticFiles(directory=WWW_DIR, html=True), name="pda")


# --- Models ---
class LoginRequest(BaseModel):
    username: str
    password: str


class CrearInventarioRequest(BaseModel):
    cod_tienda: str
    nombre_tienda: str


from typing import Any

class LecturaItem(BaseModel):
    sku: Any = ""
    alu: Any = ""
    descripcion: Any = ""
    cantidad: Any = 1
    ubicacion: Any = ""
    origen: Any = "scanner"


class LogEntry(BaseModel):
    time: Any = ""
    date: Any = ""
    type: Any = "info"
    msg: Any = ""
    device: Any = ""

class SyncRequest(BaseModel):
    dispositivo: str
    lecturas: list[LecturaItem]
    logs: list[LogEntry] = []  # PDA activity log entries (optional)


# --- Admin Panel ---
@app.get("/admin", response_class=HTMLResponse)
def admin_panel():
    html_path = os.path.join(os.path.dirname(__file__), "admin.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return f.read()


# --- Auth ---
@app.post("/api/login")
def login(creds: LoginRequest, db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT EmployeeCode, PIN, HomeStoreNo, FirstName, JobPosition
            FROM RetailDataSHOE.dbo.EMPLOYEE
            WHERE EmployeeCode = :u AND PIN = :p
        """)
        result = db.execute(query, {"u": creds.username, "p": creds.password}).mappings().first()
        if result:
            role = "admin" if str(result.get("JobPosition", "")).lower() == "admin" else "scanner"
            log_admin("login", f"Login exitoso: {result['FirstName']} ({role})", creds.username)
            return {
                "success": True,
                "role": role,
                "user_id": str(result["EmployeeCode"]),
                "store_id": str(result["HomeStoreNo"]),
                "message": f"Bienvenido {result['FirstName']}"
            }
        else:
            return {"success": False, "role": "", "user_id": "", "store_id": "",
                    "message": "Usuario o PIN incorrecto"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Tiendas ---
@app.get("/api/tiendas")
def get_tiendas(retail_db: Session = Depends(get_retail_db)):
    query = text("""
        SELECT StoreNo, StoreName as tienda
        FROM STORE
        WHERE ActiveStatus='1' AND NOT StoreNo IN ('9999')
    """)
    rows = retail_db.execute(query).mappings().all()
    return [dict(r) for r in rows]


# --- Maestra ---
def load_maestra_from_db(retail_db: Session):
    """Load maestra from database and update cache"""
    query = text("""
        SELECT p.SKU, p.ALU,
            t.Desc1+' '+c.ColorLongName+' '+p.SizeCode as descripcion,
            t.desc1 as modelo, t.desc2 as proveedor, t.Desc3 as temporada,
            p.ProductReference as codcaja
        FROM PRODUCT p
        INNER JOIN PRODUCT_STYLE t ON p.StyleCode=t.StyleCode
        INNER JOIN COLOR c ON p.ColorCode=c.ColorCode
        WHERE isnull(p.ALU,'-1')<>'-1' AND LEN(p.ALU)=17
        ORDER BY 1
    """)
    rows = retail_db.execute(query).mappings().all()
    data = [dict(r) for r in rows]

    # Calculate hash for versioning
    data_str = json.dumps(data, sort_keys=True, default=str)
    data_hash = hashlib.md5(data_str.encode()).hexdigest()[:12]

    maestra_cache["data"] = data
    maestra_cache["hash"] = data_hash
    maestra_cache["timestamp"] = datetime.now()

    return data, data_hash


@app.get("/api/maestra/version")
def get_maestra_version(retail_db: Session = Depends(get_retail_db)):
    """Get maestra version hash and count - lightweight check"""
    if maestra_cache["hash"] is None:
        load_maestra_from_db(retail_db)

    return {
        "hash": maestra_cache["hash"],
        "count": len(maestra_cache["data"]) if maestra_cache["data"] else 0,
        "timestamp": maestra_cache["timestamp"].isoformat() if maestra_cache["timestamp"] else None
    }


@app.post("/api/maestra/refresh")
def refresh_maestra(retail_db: Session = Depends(get_retail_db)):
    """Force refresh maestra cache from database"""
    data, data_hash = load_maestra_from_db(retail_db)
    log_admin("maestra", f"Maestra actualizada: {len(data):,} productos (hash: {data_hash})")
    return {
        "success": True,
        "hash": data_hash,
        "count": len(data),
        "message": f"Maestra actualizada: {len(data):,} productos"
    }


@app.get("/api/maestra")
def get_maestra(retail_db: Session = Depends(get_retail_db)):
    """Get full maestra - uses cache if available"""
    if maestra_cache["data"] is None:
        load_maestra_from_db(retail_db)
    return maestra_cache["data"]


# --- Inventarios ---
@app.get("/api/inventarios")
def list_inventarios(db: Session = Depends(get_db)):
    query = text("""
        SELECT c.Id, c.CodTienda, c.NombreTienda, c.FechaCreacion, c.Estado,
            (SELECT COUNT(*) FROM INV_STOCK_TEORICO WHERE IdInventario=c.Id) as TotalStock,
            (SELECT ISNULL(SUM(Cantidad),0) FROM INV_LECTURAS WHERE IdInventario=c.Id) as TotalLecturas
        FROM INV_CABECERA c
        ORDER BY c.FechaCreacion DESC
    """)
    rows = db.execute(query).mappings().all()
    return [dict(r) for r in rows]


@app.get("/api/inventario/activo")
def get_inventario_activo(db: Session = Depends(get_db)):
    query = text("""
        SELECT TOP 1 Id, CodTienda, NombreTienda, FechaCreacion, Estado
        FROM INV_CABECERA WHERE Estado = 'activo'
        ORDER BY FechaCreacion DESC
    """)
    row = db.execute(query).mappings().first()
    if not row:
        return {"activo": False}
    return {"activo": True, "inventario": dict(row)}


@app.post("/api/inventario")
def crear_inventario(req: CrearInventarioRequest, db: Session = Depends(get_db),
                     retail_db: Session = Depends(get_retail_db)):
    insert_q = text("""
        INSERT INTO INV_CABECERA (CodTienda, NombreTienda)
        OUTPUT INSERTED.Id
        VALUES (:cod, :nombre)
    """)
    result = db.execute(insert_q, {"cod": req.cod_tienda, "nombre": req.nombre_tienda})
    inv_id = result.scalar()

    stock_q = text("""
        SELECT p.sku, p.ALU, s.OnHandQty as cantidad,
            (SELECT deptname FROM DEPARTMENT WHERE DeptCode=t.DeptCode) as departamento,
            t.Desc1 as modelo, t.Desc2 as proveedor, t.Desc3 as temporada,
            t.Desc1+' '+ISNULL(c.ColorLongName,'')+' '+ISNULL(p.SizeCode,'') as descripcion
        FROM PRODUCT_STORE s
        INNER JOIN PRODUCT p ON s.SKU=p.sku
        INNER JOIN PRODUCT_STYLE t ON p.StyleCode=t.StyleCode
        LEFT JOIN COLOR c ON p.ColorCode=c.ColorCode
        WHERE StoreNo=:tienda AND OnHandQty>0
        ORDER BY 4
    """)
    rows = retail_db.execute(stock_q, {"tienda": req.cod_tienda}).mappings().all()

    for r in rows:
        db.execute(text("""
            INSERT INTO INV_STOCK_TEORICO
                (IdInventario, SKU, ALU, Descripcion, Departamento, Modelo, Proveedor, Temporada, StockTeorico)
            VALUES (:inv_id, :sku, :alu, :desc, :dept, :modelo, :prov, :temp, :stock)
        """), {
            "inv_id": inv_id, "sku": r["sku"], "alu": r["ALU"],
            "desc": r["descripcion"], "dept": r["departamento"],
            "modelo": r["modelo"], "prov": r["proveedor"],
            "temp": r["temporada"], "stock": r["cantidad"]
        })

    db.commit()
    log_admin("inventario", f"Inventario #{inv_id} creado: {req.nombre_tienda} ({req.cod_tienda}), {len(rows)} productos cargados")
    return {"success": True, "inventario_id": inv_id, "productos_cargados": len(rows)}


@app.get("/api/inventario/{inv_id}/stock")
def get_stock(inv_id: int, db: Session = Depends(get_db)):
    query = text("""
        SELECT Id, SKU, ALU, Descripcion, Departamento, Modelo, Proveedor, Temporada, StockTeorico
        FROM INV_STOCK_TEORICO WHERE IdInventario = :inv_id
        ORDER BY Departamento, Modelo
    """)
    rows = db.execute(query, {"inv_id": inv_id}).mappings().all()
    return [dict(r) for r in rows]


@app.delete("/api/inventario/{inv_id}/stock/{stock_id}")
def delete_stock(inv_id: int, stock_id: int, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM INV_STOCK_TEORICO WHERE Id = :id AND IdInventario = :inv_id"),
               {"id": stock_id, "inv_id": inv_id})
    db.commit()
    return {"success": True}


@app.put("/api/inventario/{inv_id}/iniciar")
def iniciar_inventario(inv_id: int, db: Session = Depends(get_db)):
    db.execute(text("UPDATE INV_CABECERA SET Estado = 'cerrado' WHERE Estado = 'activo' AND Id != :id"),
               {"id": inv_id})
    db.execute(text("UPDATE INV_CABECERA SET Estado = 'activo' WHERE Id = :id"), {"id": inv_id})
    db.commit()
    log_admin("inventario", f"Inventario #{inv_id} iniciado (estado: activo)")
    return {"success": True}


@app.post("/api/inventario/{inv_id}/sync")
def sync_lecturas(inv_id: int, req: SyncRequest, db: Session = Depends(get_db)):
    try:
        db.execute(text("DELETE FROM INV_LECTURAS WHERE IdInventario = :inv AND Dispositivo = :dev"),
                   {"inv": inv_id, "dev": str(req.dispositivo)})

        for item in req.lecturas:
            db.execute(text("""
                INSERT INTO INV_LECTURAS (IdInventario, SKU, ALU, Descripcion, Cantidad, Ubicacion, Dispositivo, Origen)
                VALUES (:inv, :sku, :alu, :desc, :qty, :ubi, :dev, :origen)
            """), {
                "inv": inv_id,
                "sku": str(item.sku or ''),
                "alu": str(item.alu or ''),
                "desc": str(item.descripcion or '')[:200],
                "qty": int(item.cantidad or 1),
                "ubi": str(item.ubicacion or ''),
                "dev": str(req.dispositivo),
                "origen": str(item.origen or 'scanner')[:10]
            })

        db.commit()
        total_qty = sum(int(i.cantidad or 1) for i in req.lecturas)
        scanner_qty = sum(int(i.cantidad or 1) for i in req.lecturas if str(i.origen or 'scanner') != 'manual')
        manual_qty = sum(int(i.cantidad or 1) for i in req.lecturas if str(i.origen or '') == 'manual')
        log_admin("sync", f"Sync [{req.dispositivo}] inv #{inv_id}: {len(req.lecturas)} items, {total_qty} uds (pistola:{scanner_qty} manual:{manual_qty})")

        # Import PDA log entries into admin_log
        for entry in req.logs:
            tipo_map = {"sync": "pda-sync", "delete": "pda-delete", "error": "pda-error", "info": "pda-info"}
            tipo = tipo_map.get(str(entry.type or 'info'), "pda-info")
            admin_log.appendleft({
                "tipo": tipo,
                "mensaje": f"[{req.dispositivo}] {str(entry.msg or '')}",
                "usuario": str(entry.device or req.dispositivo),
                "timestamp": f"{str(entry.date or '')} {str(entry.time or '')}".strip()
            })

        return {"success": True, "registros": len(req.lecturas)}
    except Exception as e:
        db.rollback()
        print(f"[SYNC ERROR] inv={inv_id}, dev={req.dispositivo}, error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/inventario/{inv_id}/lecturas")
def get_lecturas(inv_id: int, dispositivo: str = Query(None), db: Session = Depends(get_db)):
    if dispositivo:
        query = text("""
            SELECT Id, SKU, ALU, Descripcion, Cantidad, Ubicacion, Dispositivo, ISNULL(Origen,'scanner') as Origen, FechaHora
            FROM INV_LECTURAS WHERE IdInventario = :inv AND Dispositivo = :dev
            ORDER BY FechaHora DESC
        """)
        rows = db.execute(query, {"inv": inv_id, "dev": dispositivo}).mappings().all()
    else:
        query = text("""
            SELECT Id, SKU, ALU, Descripcion, Cantidad, Ubicacion, Dispositivo, ISNULL(Origen,'scanner') as Origen, FechaHora
            FROM INV_LECTURAS WHERE IdInventario = :inv
            ORDER BY FechaHora DESC
        """)
        rows = db.execute(query, {"inv": inv_id}).mappings().all()
    return [dict(r) for r in rows]


@app.delete("/api/inventario/{inv_id}/lecturas/{lectura_id}")
def delete_lectura(inv_id: int, lectura_id: int, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM INV_LECTURAS WHERE Id = :id AND IdInventario = :inv"),
               {"id": lectura_id, "inv": inv_id})
    db.commit()
    return {"success": True}


@app.get("/api/inventario/{inv_id}/reporte")
def get_reporte(inv_id: int, db: Session = Depends(get_db),
                retail_db: Session = Depends(get_retail_db)):
    stock_rows = db.execute(text("""
        SELECT SKU, ALU, Descripcion, Departamento, Modelo, Proveedor, StockTeorico
        FROM INV_STOCK_TEORICO WHERE IdInventario = :inv
    """), {"inv": inv_id}).mappings().all()

    lecturas_rows = db.execute(text("""
        SELECT SKU, SUM(Cantidad) as Conteo
        FROM INV_LECTURAS WHERE IdInventario = :inv
        GROUP BY SKU
    """), {"inv": inv_id}).mappings().all()
    conteo_map = {r["SKU"]: r["Conteo"] for r in lecturas_rows}

    # Join PRODUCT_STYLE to get Proveedor (Desc2) — same source as Maestra, guaranteed correct
    precios_rows = retail_db.execute(text("""
        SELECT p.SKU,
            (CASE WHEN p.AvgCost = 0 THEN p.lastcost ELSE p.avgcost END) as Costo,
            p.RetailPrice as Precio,
            ISNULL(t.Desc2, '') as Proveedor
        FROM PRODUCT p
        LEFT JOIN PRODUCT_STYLE t ON p.StyleCode = t.StyleCode
    """)).mappings().all()
    # str() on SKU to avoid int/varchar type mismatch in dict lookup
    precios_map = {str(r["SKU"]): {
        "costo": float(r["Costo"] or 0),
        "precio": float(r["Precio"] or 0),
        "proveedor": str(r["Proveedor"] or "")
    } for r in precios_rows}

    reporte = []
    stock_skus = set()
    for s in stock_rows:
        sku = str(s["SKU"])
        stock_skus.add(sku)
        conteo = conteo_map.get(s["SKU"], 0) or conteo_map.get(sku, 0)
        diff = conteo - s["StockTeorico"]
        p = precios_map.get(sku, {"costo": 0, "precio": 0, "proveedor": ""})
        reporte.append({
            "SKU": sku, "ALU": s["ALU"], "Descripcion": s["Descripcion"],
            "Departamento": s["Departamento"], "Modelo": s["Modelo"],
            "Proveedor": p["proveedor"],  # from RetailDataSHOE (same source as Maestra)
            "StockTeorico": s["StockTeorico"], "Conteo": conteo,
            "Diferencia": diff, "Costo": p["costo"], "Precio": p["precio"],
            "DifCosto": round(diff * p["costo"], 2),
            "DifPrecio": round(diff * p["precio"], 2),
            "Sobrante": False
        })

    extras = db.execute(text("""
        SELECT SKU, ALU, Descripcion, SUM(Cantidad) as Conteo
        FROM INV_LECTURAS WHERE IdInventario = :inv
        GROUP BY SKU, ALU, Descripcion
    """), {"inv": inv_id}).mappings().all()

    # For sobrantes: look up real department and proveedor from RetailDataSHOE
    extra_skus = [l["SKU"] for l in extras if l["SKU"] not in stock_skus]
    extra_info = {}
    if extra_skus:
        placeholders = ",".join(f"'{sku}'" for sku in extra_skus)
        extra_rows = retail_db.execute(text(f"""
            SELECT p.SKU,
                (SELECT deptname FROM DEPARTMENT WHERE DeptCode=t.DeptCode) as Departamento,
                t.Desc2 as Proveedor
            FROM PRODUCT p
            INNER JOIN PRODUCT_STYLE t ON p.StyleCode=t.StyleCode
            WHERE p.SKU IN ({placeholders})
        """)).mappings().all()
        for er in extra_rows:
            extra_info[er["SKU"]] = {"Departamento": er["Departamento"] or "", "Proveedor": er["Proveedor"] or ""}

    for l in extras:
        if l["SKU"] not in stock_skus:
            p = precios_map.get(l["SKU"], {"costo": 0, "precio": 0})
            info = extra_info.get(l["SKU"], {"Departamento": "", "Proveedor": ""})
            reporte.append({
                "SKU": l["SKU"], "ALU": l["ALU"], "Descripcion": l["Descripcion"],
                "Departamento": info["Departamento"], "Modelo": "",
                "Proveedor": info["Proveedor"],
                "StockTeorico": 0, "Conteo": l["Conteo"],
                "Diferencia": l["Conteo"], "Costo": p["costo"], "Precio": p["precio"],
                "DifCosto": round(l["Conteo"] * p["costo"], 2),
                "DifPrecio": round(l["Conteo"] * p["precio"], 2),
                "Sobrante": True
            })

    return reporte


@app.get("/api/inventario/{inv_id}/progreso")
def get_progreso(inv_id: int, db: Session = Depends(get_db)):
    """Get inventory progress: stock vs count with device breakdown"""
    # 1. Stock teorico
    stock_rows = db.execute(text("""
        SELECT SKU, ALU, Descripcion, Departamento, Modelo, Proveedor, Temporada, StockTeorico
        FROM INV_STOCK_TEORICO WHERE IdInventario = :inv
        ORDER BY Departamento, Modelo
    """), {"inv": inv_id}).mappings().all()

    # 2. Conteo agrupado por SKU
    conteo_rows = db.execute(text("""
        SELECT SKU, SUM(Cantidad) as Conteo
        FROM INV_LECTURAS WHERE IdInventario = :inv
        GROUP BY SKU
    """), {"inv": inv_id}).mappings().all()
    conteo_map = {r["SKU"]: r["Conteo"] for r in conteo_rows}

    # 3. Totales por dispositivo
    device_rows = db.execute(text("""
        SELECT Dispositivo, SUM(Cantidad) as Total
        FROM INV_LECTURAS WHERE IdInventario = :inv
        GROUP BY Dispositivo
    """), {"inv": inv_id}).mappings().all()
    por_dispositivo = {r["Dispositivo"]: r["Total"] for r in device_rows}

    # 4. Build products list and calculate totals
    total_stock = 0
    total_conteo = 0
    productos_contados = 0
    productos = []
    stock_skus = set()

    for s in stock_rows:
        sku = s["SKU"]
        stock_skus.add(sku)
        conteo = conteo_map.get(sku, 0)
        diff = conteo - s["StockTeorico"]
        total_stock += s["StockTeorico"]
        total_conteo += conteo
        if conteo > 0:
            productos_contados += 1
        productos.append({
            "SKU": sku, "ALU": s["ALU"], "Descripcion": s["Descripcion"],
            "Departamento": s["Departamento"], "Modelo": s["Modelo"],
            "Proveedor": s["Proveedor"], "Temporada": s["Temporada"],
            "StockTeorico": s["StockTeorico"], "Conteo": conteo, "Diferencia": diff,
            "Sobrante": False
        })

    # 5. Add sobrantes (lecturas not in stock teorico)
    sobrantes_rows = db.execute(text("""
        SELECT SKU, ALU, Descripcion, SUM(Cantidad) as Conteo
        FROM INV_LECTURAS WHERE IdInventario = :inv
        GROUP BY SKU, ALU, Descripcion
    """), {"inv": inv_id}).mappings().all()

    for l in sobrantes_rows:
        if l["SKU"] not in stock_skus:
            conteo = l["Conteo"]
            total_conteo += conteo
            productos_contados += 1
            productos.append({
                "SKU": l["SKU"], "ALU": l["ALU"], "Descripcion": l["Descripcion"],
                "Departamento": "", "Modelo": "", "Proveedor": "", "Temporada": "",
                "StockTeorico": 0, "Conteo": conteo, "Diferencia": conteo,
                "Sobrante": True
            })

    porcentaje = round(total_conteo / total_stock * 100, 1) if total_stock > 0 else 0

    return {
        "resumen": {
            "totalStock": total_stock,
            "totalConteo": total_conteo,
            "porcentaje": porcentaje,
            "totalProductos": len(stock_rows),
            "productosContados": productos_contados
        },
        "porDispositivo": por_dispositivo,
        "productos": productos
    }


@app.put("/api/inventario/{inv_id}/cerrar")
def cerrar_inventario(inv_id: int, db: Session = Depends(get_db)):
    db.execute(text("UPDATE INV_CABECERA SET Estado = 'cerrado' WHERE Id = :id"), {"id": inv_id})
    db.commit()
    log_admin("inventario", f"Inventario #{inv_id} cerrado")
    return {"success": True}


@app.delete("/api/inventario/{inv_id}")
def eliminar_inventario(inv_id: int, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM INV_LECTURAS WHERE IdInventario = :id"), {"id": inv_id})
    db.execute(text("DELETE FROM INV_STOCK_TEORICO WHERE IdInventario = :id"), {"id": inv_id})
    db.execute(text("DELETE FROM INV_CABECERA WHERE Id = :id"), {"id": inv_id})
    db.commit()
    log_admin("delete", f"Inventario #{inv_id} eliminado (stock + lecturas borrados)")
    return {"success": True}


@app.post("/api/inventario/{inv_id}/stock/eliminar-lote")
def delete_stock_batch(inv_id: int, ids: list[int], db: Session = Depends(get_db)):
    if not ids:
        return {"success": True, "eliminados": 0}
    placeholders = ",".join(str(int(i)) for i in ids)
    db.execute(text(f"DELETE FROM INV_STOCK_TEORICO WHERE IdInventario = :inv AND Id IN ({placeholders})"),
               {"inv": inv_id})
    db.commit()
    return {"success": True, "eliminados": len(ids)}


# --- Admin Log ---
@app.get("/api/log")
def get_admin_log():
    """Get admin activity log (newest first, max 500 entries)"""
    return list(admin_log)


# --- Download APK ---
@app.get("/download", response_class=HTMLResponse)
def download_page():
    apk_path = os.path.join(os.path.dirname(__file__), "downloads", "inventario-pro.apk")
    apk_exists = os.path.exists(apk_path)
    apk_size = ""
    apk_date = ""

    if apk_exists:
        size_mb = os.path.getsize(apk_path) / (1024 * 1024)
        apk_size = f"{size_mb:.1f} MB"
        mod_time = datetime.fromtimestamp(os.path.getmtime(apk_path))
        apk_date = mod_time.strftime("%Y-%m-%d %H:%M")

    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Descargar Inventario Pro</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }}
            .card {{
                background: rgba(30, 41, 59, 0.8);
                backdrop-filter: blur(20px);
                border-radius: 24px;
                padding: 48px;
                text-align: center;
                max-width: 400px;
                width: 100%;
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            }}
            .logo {{
                width: 80px;
                height: 80px;
                margin: 0 auto 24px;
                background: linear-gradient(135deg, #3b82f6, #60a5fa);
                border-radius: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }}
            .logo svg {{ width: 48px; height: 48px; color: white; }}
            h1 {{ color: #f8fafc; font-size: 28px; margin-bottom: 8px; }}
            .subtitle {{ color: #94a3b8; margin-bottom: 32px; }}
            .info {{ color: #cbd5e1; font-size: 14px; margin-bottom: 24px; }}
            .info span {{ display: block; margin: 4px 0; }}
            .btn {{
                display: inline-flex;
                align-items: center;
                gap: 12px;
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white;
                text-decoration: none;
                padding: 16px 32px;
                border-radius: 12px;
                font-size: 18px;
                font-weight: 600;
                transition: transform 0.2s, box-shadow 0.2s;
            }}
            .btn:hover {{ transform: translateY(-2px); box-shadow: 0 10px 40px -10px rgba(59,130,246,0.5); }}
            .btn svg {{ width: 24px; height: 24px; }}
            .no-apk {{ color: #f87171; padding: 20px; background: rgba(248,113,113,0.1); border-radius: 12px; }}
            .instructions {{ margin-top: 32px; text-align: left; color: #94a3b8; font-size: 14px; }}
            .instructions h3 {{ color: #f8fafc; margin-bottom: 12px; }}
            .instructions ol {{ padding-left: 20px; }}
            .instructions li {{ margin: 8px 0; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                    <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
                </svg>
            </div>
            <h1>Inventario Pro</h1>
            <p class="subtitle">PDA Scanner App</p>

            {"<div class='info'><span>Version: " + apk_date + "</span><span>Tamaño: " + apk_size + "</span></div>" if apk_exists else ""}

            {"<a href='/download/apk' class='btn'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' x2='12' y1='15' y2='3'/></svg>Descargar APK</a>" if apk_exists else "<div class='no-apk'>APK no disponible.<br>El administrador debe compilar y subir el APK.</div>"}

            <div class="instructions">
                <h3>Instrucciones:</h3>
                <ol>
                    <li>Descarga el APK</li>
                    <li>Abre el archivo descargado</li>
                    <li>Permite instalar apps de fuentes desconocidas</li>
                    <li>Instala la aplicación</li>
                </ol>
            </div>
        </div>
    </body>
    </html>
    """


@app.get("/download/apk")
def download_apk():
    apk_path = os.path.join(os.path.dirname(__file__), "downloads", "inventario-pro.apk")
    if not os.path.exists(apk_path):
        raise HTTPException(status_code=404, detail="APK no encontrado")
    return FileResponse(
        apk_path,
        media_type="application/vnd.android.package-archive",
        filename="inventario-pro.apk"
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
