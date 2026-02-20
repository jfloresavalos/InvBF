from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import urllib.parse
import os
from dotenv import load_dotenv

# Load .env file if exists (for local development)
load_dotenv()

# VPS Configuration (use environment variables for security)
# For local dev: keep defaults | For production: set via .env or system env
SERVER = os.getenv("DB_SERVER", "190.187.176.69")
USERNAME = os.getenv("DB_USERNAME", "retailuser")
PASSWORD = os.getenv("DB_PASSWORD", "retail")

# --- DBFERRINI (inventory persistence) ---
params_ferrini = urllib.parse.quote_plus(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER};DATABASE=DBFERRINI;"
    f"UID={USERNAME};PWD={PASSWORD};"
    "TrustServerCertificate=yes;"
)
engine_ferrini = create_engine(
    f"mssql+pyodbc:///?odbc_connect={params_ferrini}",
    pool_size=3,        # max 3 persistent connections (enough for concurrent PDA syncs)
    max_overflow=5,     # up to 5 extra temporary connections under load
    pool_recycle=1800,  # recycle connections every 30min (avoids stale/dropped connections)
    pool_pre_ping=True, # test connection health before using (no silent failures)
)
SessionFerrini = sessionmaker(autocommit=False, autoflush=False, bind=engine_ferrini)

# --- RetailDataSHOE (read-only product/store data) ---
params_retail = urllib.parse.quote_plus(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER};DATABASE=RetailDataSHOE;"
    f"UID={USERNAME};PWD={PASSWORD};"
    "TrustServerCertificate=yes;"
)
engine_retail = create_engine(
    f"mssql+pyodbc:///?odbc_connect={params_retail}",
    pool_size=2,        # maestra is cached in memory — very few queries hit this DB
    max_overflow=3,
    pool_recycle=1800,
    pool_pre_ping=True,
)
SessionRetail = sessionmaker(autocommit=False, autoflush=False, bind=engine_retail)


def get_db():
    db = SessionFerrini()
    try:
        yield db
    finally:
        db.close()


def get_retail_db():
    db = SessionRetail()
    try:
        yield db
    finally:
        db.close()


def init_tables():
    with engine_ferrini.connect() as conn:
        conn.execute(text("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='INV_CABECERA' AND xtype='U')
            CREATE TABLE INV_CABECERA (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                CodTienda VARCHAR(10),
                NombreTienda VARCHAR(100),
                FechaCreacion DATETIME DEFAULT GETDATE(),
                Estado VARCHAR(20) DEFAULT 'preparacion'
            )
        """))
        conn.execute(text("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='INV_STOCK_TEORICO' AND xtype='U')
            CREATE TABLE INV_STOCK_TEORICO (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                IdInventario INT FOREIGN KEY REFERENCES INV_CABECERA(Id),
                SKU VARCHAR(50),
                ALU VARCHAR(50),
                Descripcion VARCHAR(200),
                Departamento VARCHAR(100),
                Modelo VARCHAR(100),
                Proveedor VARCHAR(100),
                Temporada VARCHAR(100),
                StockTeorico INT
            )
        """))
        conn.execute(text("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='INV_LECTURAS' AND xtype='U')
            CREATE TABLE INV_LECTURAS (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                IdInventario INT FOREIGN KEY REFERENCES INV_CABECERA(Id),
                SKU VARCHAR(50),
                ALU VARCHAR(50),
                Descripcion VARCHAR(200),
                Cantidad INT,
                Ubicacion VARCHAR(10),
                Dispositivo VARCHAR(50),
                Origen VARCHAR(10) DEFAULT 'scanner',
                FechaHora DATETIME DEFAULT GETDATE()
            )
        """))
        # Migration: add Origen column if missing
        conn.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('INV_LECTURAS') AND name = 'Origen')
            ALTER TABLE INV_LECTURAS ADD Origen VARCHAR(10) DEFAULT 'scanner'
        """))
        conn.commit()
        print("Inventory tables initialized OK")


def test_connection():
    ok = True
    try:
        with engine_ferrini.connect() as c:
            c.execute(text("SELECT 1"))
        print("DBFERRINI: OK")
    except Exception as e:
        print(f"DBFERRINI ERROR: {e}")
        ok = False
    try:
        with engine_retail.connect() as c:
            c.execute(text("SELECT 1"))
        print("RetailDataSHOE: OK")
    except Exception as e:
        print(f"RetailDataSHOE ERROR: {e}")
        ok = False
    return ok


if __name__ == "__main__":
    test_connection()
    init_tables()
