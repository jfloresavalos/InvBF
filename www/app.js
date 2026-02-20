/**
 * Inventario Pro - PDA Scanner App
 * Material Design 3 + Optimized for Honeywell PDAs
 *
 * Features:
 * - Offline-first with localStorage caching
 * - Auto-sync every 30 seconds
 * - Honeywell hardware scanner integration
 * - Real-time product lookup
 */

const $ = id => document.getElementById(id);

const CONFIG = {
    SERVER_KEY: 'inv_server',
    DEVICE_KEY: 'inv_device',
    MAESTRA_KEY: 'inv_maestra',
    MAESTRA_HASH_KEY: 'inv_maestra_hash',
    LECTURAS_KEY: 'inv_lecturas',
    UBICACION_KEY: 'inv_ubicacion',
    INV_KEY: 'inv_activo',
    DEFAULT_SERVER: 'https://inv.brunoferrini.pe',
    FETCH_TIMEOUT: 120000,  // 2 minutes for large downloads
    MODO_BARRIDO_KEY: 'inv_modo_barrido',
    LOG_KEY: 'inv_log',
    MAX_LOG_ENTRIES: 200,
    DEVICE_LOCKED_KEY: 'inv_device_locked',
    STOCK_CACHE_KEY: 'inv_stock_cache'
};

const State = {
    apiUrl: '',
    deviceName: '',
    inventarioId: null,
    inventarioNombre: '',
    maestraBySKU: new Map(),
    maestraByALU: new Map(),
    maestraArray: [],
    lecturas: [],
    currentProduct: null,
    isOnline: true,
    lastSync: null,
    pendingSync: true,
    modoBarrido: false,
    activityLog: []
};

// SVG Icons as template literals for dynamic rendering
const Icons = {
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`
};

const app = {
    init() {
        // Restore saved values
        $('inputServer').value = localStorage.getItem(CONFIG.SERVER_KEY) || CONFIG.DEFAULT_SERVER;
        $('inputDevice').value = localStorage.getItem(CONFIG.DEVICE_KEY) || 'Lectora 1';
        $('inputUbicacion').value = localStorage.getItem(CONFIG.UBICACION_KEY) || '';

        // Lock device name only on PDA (Capacitor), not in desktop browser
        if (window.Capacitor && localStorage.getItem(CONFIG.DEVICE_LOCKED_KEY)) {
            const inp = $('inputDevice');
            inp.disabled = true;
            inp.style.opacity = '0.6';
            inp.style.cursor = 'not-allowed';
            const hint = $('deviceLockHint');
            if (hint) hint.style.display = 'flex';
        }

        // Restore barrido mode preference
        State.modoBarrido = localStorage.getItem(CONFIG.MODO_BARRIDO_KEY) === 'true';

        this.setupKeyboard();
        this.setupScanner();
        this.setupNetworkListener();
    },

    // --- Views ---
    showView(name) {
        document.querySelectorAll('.view').forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('active');
        });
        const el = $('view-' + name);
        if (el) {
            el.classList.remove('hidden');
            el.classList.add('active');
        }
    },

    // --- Network Status Listener ---
    setupNetworkListener() {
        window.addEventListener('online', () => {
            State.isOnline = true;
            this.updateDot('online');
            this.toast('Conexion restaurada', 'success');
            this.addLog('info', 'Conexion WiFi restaurada');
        });
        window.addEventListener('offline', () => {
            State.isOnline = false;
            this.addLog('error', 'Conexion WiFi perdida');
            this.updateDot('offline');
        });
    },

    // --- Login ---
    async enterScanner() {
        const server = $('inputServer').value.trim().replace(/\/$/, '');
        const device = $('inputDevice').value.trim();

        if (!server) {
            $('loginMsg').textContent = 'Ingrese la URL del servidor';
            return;
        }
        if (!device) {
            $('loginMsg').textContent = 'Ingrese nombre del dispositivo';
            return;
        }

        State.apiUrl = server;
        State.deviceName = device;
        localStorage.setItem(CONFIG.SERVER_KEY, server);
        localStorage.setItem(CONFIG.DEVICE_KEY, device);

        $('btnOffline').classList.add('hidden');
        $('loginMsg').textContent = 'Conectando...';
        await this.checkInventario();
    },

    async checkInventario() {
        try {
            // Short timeout so offline mode kicks in quickly (8s)
            const r = await this.fetchWithTimeout(State.apiUrl + '/api/inventario/activo', 8000);
            const d = await r.json();

            if (d.activo) {
                State.inventarioId = d.inventario.Id;
                State.inventarioNombre = d.inventario.NombreTienda;
                localStorage.setItem(CONFIG.INV_KEY, JSON.stringify({
                    id: d.inventario.Id,
                    nombre: d.inventario.NombreTienda
                }));
                // Cache stock teorico in background (small dataset, always fits in localStorage)
                this.cacheStockForOffline(d.inventario.Id);
                await this.loadMaestra();
            } else {
                this.showView('noinv');
            }
        } catch (e) {
            // Server unreachable — try cached data
            this.tryOfflineMode();
        }
    },

    async cacheStockForOffline(invId) {
        try {
            const r = await this.fetchWithTimeout(`${State.apiUrl}/api/inventario/${invId}/stock`, 15000);
            const data = await r.json();
            localStorage.setItem(CONFIG.STOCK_CACHE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Could not cache stock for offline:', e);
        }
    },

    loadStockCache() {
        const saved = localStorage.getItem(CONFIG.STOCK_CACHE_KEY);
        if (!saved) return false;
        try {
            const data = JSON.parse(saved);
            if (!data.length) return false;
            // Convert stock teorico format to maestra format
            const maestraFormat = data.map(s => ({
                SKU: s.SKU,
                ALU: s.ALU,
                descripcion: s.Descripcion || '',
                modelo: s.Modelo || '',
                proveedor: s.Proveedor || '',
                temporada: s.Temporada || ''
            }));
            this.processMaestra(maestraFormat);
            return true;
        } catch { return false; }
    },

    tryOfflineMode() {
        // Ensure State has device name (in case called directly from button)
        if (!State.deviceName) {
            State.deviceName = $('inputDevice').value.trim() || localStorage.getItem(CONFIG.DEVICE_KEY) || 'PDA';
        }
        if (!State.apiUrl) {
            State.apiUrl = $('inputServer').value.trim() || localStorage.getItem(CONFIG.SERVER_KEY) || CONFIG.DEFAULT_SERVER;
        }

        const saved = localStorage.getItem(CONFIG.INV_KEY);
        const maestraOk = State.maestraBySKU.size > 0
            || this.loadCachedMaestra()
            || this.loadStockCache();  // fallback: use stock teorico (small, always fits localStorage)

        if (saved && maestraOk) {
            const inv = JSON.parse(saved);
            State.inventarioId = inv.id;
            State.inventarioNombre = inv.nombre;
            this.restoreLecturas();
            this.enterScanView();
            this.toast('Modo OFFLINE — datos en cache', 'warning');
            this.addLog('info', 'Iniciado en modo offline (sin conexion al servidor)');
        } else {
            $('loginMsg').textContent = 'Sin conexion al servidor';
            const hasData = !!localStorage.getItem(CONFIG.MAESTRA_KEY)
                         || !!localStorage.getItem(CONFIG.STOCK_CACHE_KEY);
            if (saved && hasData) {
                $('btnOffline').classList.remove('hidden');
            }
        }
    },

    async loadMaestra() {
        this.showView('download');
        $('downloadMsg').textContent = 'Verificando catalogo de productos...';
        this.updateProgress(10);

        // Check if we have cached maestra
        const hasCached = this.loadCachedMaestra();
        const cachedHash = localStorage.getItem(CONFIG.MAESTRA_HASH_KEY);

        if (hasCached) {
            $('downloadMsg').textContent = `Maestra en cache: ${State.maestraBySKU.size.toLocaleString()} productos`;
            this.updateProgress(30);

            // Check if server has newer version
            try {
                const vr = await this.fetchWithTimeout(State.apiUrl + '/api/maestra/version', 10000);
                const version = await vr.json();

                if (version.hash === cachedHash) {
                    // No changes, use cache
                    $('downloadMsg').textContent = `Maestra actualizada: ${State.maestraBySKU.size.toLocaleString()} productos`;
                    this.updateProgress(100);
                    this.restoreLecturas();
                    setTimeout(() => this.enterScanView(), 500);
                    return;
                } else {
                    // Server has newer version, download in background
                    $('downloadMsg').textContent = `Actualizando maestra (${version.count.toLocaleString()} productos)...`;
                    this.updateProgress(50);
                    await this.downloadMaestra();
                }
            } catch (e) {
                // Can't check version, use cache anyway
                $('downloadMsg').textContent = `Usando cache: ${State.maestraBySKU.size.toLocaleString()} productos`;
                this.updateProgress(100);
                this.restoreLecturas();
                setTimeout(() => this.enterScanView(), 500);
                return;
            }
        } else {
            // No cache, must download
            $('downloadMsg').textContent = 'Descargando catalogo de productos...';
            this.updateProgress(20);
            await this.downloadMaestra();
        }

        this.restoreLecturas();
        setTimeout(() => this.enterScanView(), 500);
    },

    async downloadMaestra() {
        try {
            this.updateProgress(40);
            const r = await this.fetchWithTimeout(State.apiUrl + '/api/maestra', CONFIG.FETCH_TIMEOUT);

            if (!r.ok) throw new Error('Server error: ' + r.status);

            this.updateProgress(60);
            const data = await r.json();
            this.updateProgress(80);

            this.processMaestra(data);

            // Save to localStorage compressed with lz-string (~12MB -> ~2-3MB)
            try {
                const compressed = LZString.compressToUTF16(JSON.stringify(data));
                localStorage.setItem(CONFIG.MAESTRA_KEY, compressed);

                // Get and save hash
                const vr = await this.fetchWithTimeout(State.apiUrl + '/api/maestra/version', 10000);
                const version = await vr.json();
                localStorage.setItem(CONFIG.MAESTRA_HASH_KEY, version.hash);
                console.log(`Maestra cached: ${data.length} products, compressed to ~${Math.round(compressed.length/1024)}KB`);
            } catch (storageError) {
                console.warn('Could not cache maestra even compressed:', storageError);
                this.toast('No se pudo guardar cache local', 'warning');
            }

            $('downloadMsg').textContent = `${data.length.toLocaleString()} productos descargados`;
            this.updateProgress(100);
        } catch (e) {
            console.error('Error downloading maestra:', e);
            if (State.maestraBySKU.size > 0) {
                // We have cached data, use it
                $('downloadMsg').textContent = `Error actualizando. Usando cache: ${State.maestraBySKU.size.toLocaleString()} productos`;
                this.updateProgress(100);
            } else {
                $('downloadMsg').textContent = 'Error descargando maestra. Reintentando en 5s...';
                await new Promise(resolve => setTimeout(resolve, 5000));
                return this.downloadMaestra();
            }
        }
    },

    fetchWithTimeout(url, timeout = 30000) {
        return Promise.race([
            fetch(url),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeout)
            )
        ]);
    },

    updateProgress(percent) {
        $('progressFill').style.width = percent + '%';
        $('progressText').textContent = percent + '%';
    },

    loadCachedMaestra() {
        const saved = localStorage.getItem(CONFIG.MAESTRA_KEY);
        if (!saved) return false;

        try {
            // Try decompressing first (new format), fallback to plain JSON (old format)
            let raw = saved;
            if (!saved.startsWith('[')) {
                raw = LZString.decompressFromUTF16(saved);
            }
            const data = JSON.parse(raw);
            if (!data || data.length === 0) return false;
            this.processMaestra(data);
            return true;
        } catch {
            return false;
        }
    },

    processMaestra(data) {
        State.maestraBySKU.clear();
        State.maestraByALU.clear();
        State.maestraArray = data;

        // Build lookup maps for O(1) access
        for (const p of data) {
            const item = {
                sku: String(p.SKU || ''),
                alu: String(p.ALU || ''),
                descripcion: String(p.descripcion || ''),
                modelo: String(p.modelo || '')
            };
            if (p.SKU) State.maestraBySKU.set(String(p.SKU), item);
            if (p.ALU) State.maestraByALU.set(String(p.ALU), item);
        }
    },

    
    restoreLecturas() {
        const key = CONFIG.LECTURAS_KEY + '_' + State.inventarioId;
        const saved = localStorage.getItem(key);

        if (saved) {
            try {
                State.lecturas = JSON.parse(saved);
            } catch {
                State.lecturas = [];
            }
        } else {
            State.lecturas = [];
            this.restoreFromServer();
        }
    },

    async restoreFromServer() {
        try {
            const url = `${State.apiUrl}/api/inventario/${State.inventarioId}/lecturas?dispositivo=${encodeURIComponent(State.deviceName)}`;
            const r = await fetch(url);
            const data = await r.json();

            if (data.length > 0) {
                State.lecturas = data.map(r => ({
                    sku: String(r.SKU || ''),
                    alu: String(r.ALU || ''),
                    descripcion: String(r.Descripcion || ''),
                    cantidad: r.Cantidad || 1,
                    ubicacion: String(r.Ubicacion || ''),
                    origen: r.Origen || 'scanner'
                }));
                State.pendingSync = false;
                this.saveLecturas();
                this.renderLecturas();
                this.updateSyncStatus();
                this.toast('Lecturas restauradas del servidor');
                this.addLog('info', `Restauradas ${data.length} lecturas del servidor - ${State.deviceName}`);
            }
        } catch {
            // Silent fail
        }
    },

    enterScanView() {
        $('headerDevice').textContent = State.deviceName;
        $('headerInv').textContent = State.inventarioNombre;
        this.showView('scanner');
        this.renderLecturas();
        this.updateOnlineStatus();
        this.applyBarridoUI();
        this.updateSyncStatus();
        this.loadLog();

        $('inputProducto').focus();
    },

    // --- Modo Barrido ---
    toggleBarrido() {
        State.modoBarrido = $('chkBarrido').checked;
        localStorage.setItem(CONFIG.MODO_BARRIDO_KEY, State.modoBarrido);
        this.applyBarridoUI();
        this.toast(State.modoBarrido ? 'Modo Barrido activado (cant=1)' : 'Modo Barrido desactivado', State.modoBarrido ? 'success' : 'warning');
    },

    applyBarridoUI() {
        const chk = $('chkBarrido');
        const qtyCard = $('qtyCard');
        const barridoCard = $('barridoCard');

        if (chk) chk.checked = State.modoBarrido;
        if (qtyCard) {
            if (State.modoBarrido) {
                qtyCard.classList.add('hidden');
            } else {
                qtyCard.classList.remove('hidden');
            }
        }
        if (barridoCard) {
            if (State.modoBarrido) {
                barridoCard.classList.add('active');
            } else {
                barridoCard.classList.remove('active');
            }
        }

        // In barrido mode, always reset quantity to 1
        if (State.modoBarrido) {
            $('inputCantidad').value = '1';
        }
    },

    // --- Keyboard Handler ---
    setupKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const active = document.activeElement;

                if (active.id === 'inputProducto') {
                    e.preventDefault();
                    this.lookupAndFill(active.value.trim());
                } else if (active.id === 'inputCantidad') {
                    e.preventDefault();
                    this.registrar();
                } else if (active.id === 'inputUbicacion') {
                    e.preventDefault();
                    $('inputProducto').focus();
                }
            }
        });
    },

    // --- Honeywell Scanner Integration ---
    setupScanner() {
        try {
            if (!window.Capacitor) return;
            const plugins = window.Capacitor.Plugins;
            if (!plugins || !plugins.HoneywellScanner) return;

            const { HoneywellScanner } = plugins;

            HoneywellScanner.addListener('barcodeScanned', data => {
                if (State.inventarioId) {
                    this.handleHardwareScan(data.barcode);
                }
            });

            HoneywellScanner.startScan();
        } catch {
            // Scanner not available
        }
    },

    handleHardwareScan(barcode) {
        barcode = barcode.trim();
        if (!barcode) return;

        // In barrido mode, no need to auto-submit previous (already auto-registered)
        if (!State.modoBarrido) {
            const current = $('inputProducto').value.trim();
            // Auto-submit previous product if different
            if (State.currentProduct && current &&
                State.currentProduct.sku !== barcode &&
                State.currentProduct.alu !== barcode) {
                this.registrar();
            }
        }

        $('inputProducto').value = barcode;
        this.lookupAndFill(barcode);
    },

    // --- Product Lookup ---
    lookupAndFill(code) {
        if (!code) return;
        code = String(code).trim();

        $('productInfo').classList.add('hidden');
        $('productNotFound').classList.add('hidden');

        // Lookup by ALU first, then by SKU
        // Also try without leading zeros (scanner may add leading 0)
        const codeNoZeros = code.replace(/^0+/, '');
        const product = State.maestraByALU.get(code) || State.maestraBySKU.get(code) ||
            (codeNoZeros !== code ? (State.maestraByALU.get(codeNoZeros) || State.maestraBySKU.get(codeNoZeros)) : null);

        if (product) {
            State.currentProduct = { ...product, origen: 'scanner' };
            $('productDesc').textContent = product.descripcion || product.modelo || 'Sin descripcion';
            $('productSKU').textContent = `SKU: ${product.sku}`;
            $('productInfo').classList.remove('hidden');

            // Barrido mode: auto-register with quantity 1
            if (State.modoBarrido) {
                $('inputCantidad').value = '1';
                this.registrar();
                return;
            }

            $('inputCantidad').focus();
            $('inputCantidad').select();
        } else {
            State.currentProduct = {
                sku: code,
                alu: code,
                descripcion: 'NO ENCONTRADO',
                modelo: '',
                origen: 'scanner'
            };
            $('productNotFound').classList.remove('hidden');
            if (!State.modoBarrido) {
                $('inputCantidad').focus();
            }
        }
    },

    // --- Quantity Controls ---
    incrementQty() {
        const input = $('inputCantidad');
        const current = parseInt(input.value) || 1;
        input.value = current + 1;
    },

    decrementQty() {
        const input = $('inputCantidad');
        const current = parseInt(input.value) || 1;
        if (current > 1) {
            input.value = current - 1;
        }
    },

    // --- Register Reading ---
    registrar() {
        if (!State.currentProduct) {
            this.toast('Primero escanee un producto', 'warning');
            return;
        }

        const ubicacion = $('inputUbicacion').value.trim();
        const cantidad = parseInt($('inputCantidad').value) || 1;
        const p = State.currentProduct;

        // Check if same SKU at same location exists
        const existing = State.lecturas.find(l =>
            l.sku === p.sku && l.ubicacion === ubicacion
        );

        if (existing) {
            existing.cantidad += cantidad;
        } else {
            State.lecturas.unshift({
                sku: p.sku,
                alu: p.alu,
                descripcion: p.descripcion,
                cantidad: cantidad,
                ubicacion: ubicacion,
                origen: p.origen || 'scanner'
            });
        }

        this.saveLecturas();
        this.renderLecturas();
        this.toast(`+${cantidad} ${p.descripcion}`);
        State.pendingSync = true;
        this.updateSyncStatus();

        // Reset form
        $('inputProducto').value = '';
        $('inputCantidad').value = '1';
        State.currentProduct = null;
        $('productInfo').classList.add('hidden');
        $('productNotFound').classList.add('hidden');
        $('inputProducto').focus();
    },

    // --- Lecturas Management ---
    saveLecturas() {
        const key = CONFIG.LECTURAS_KEY + '_' + State.inventarioId;
        localStorage.setItem(key, JSON.stringify(State.lecturas));
    },

    renderLecturas() {
        const total = State.lecturas.reduce((s, l) => s + l.cantidad, 0);
        const manualCount = State.lecturas.filter(l => l.origen === 'manual').length;
        $('lecturasCount').textContent = total;
        $('badgeCount').textContent = total;
        if ($('manualBadge')) $('manualBadge').textContent = manualCount;

        const list = $('lecturasList');
        const empty = $('lecturasEmpty');

        if (State.lecturas.length === 0) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        list.innerHTML = State.lecturas.map((l, i) => `
            <div class="lectura-item${l.origen === 'manual' ? ' lectura-manual' : ''}">
                <div class="lectura-info">
                    <div class="lectura-desc">${this.escapeHtml(l.descripcion)}${l.origen === 'manual' ? ' <span class="badge-manual">M</span>' : ''}</div>
                    <div class="lectura-detail">SKU: ${l.sku} | Ubic: ${l.ubicacion || '-'} | Cant: <b>${l.cantidad}</b></div>
                </div>
                <div class="lectura-qty">${l.cantidad}</div>
                <button class="btn-delete" onclick="app.deleteLectura(${i})" aria-label="Eliminar">
                    ${Icons.trash}
                </button>
            </div>
        `).join('');
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    },

    deleteLectura(index) {
        const l = State.lecturas[index];
        if (!l) return;

        if (l.cantidad > 1) {
            const input = prompt(
                `"${l.descripcion}"\nCantidad actual: ${l.cantidad} uds\n\n¿Cuántas unidades eliminar?`,
                '1'
            );
            if (input === null) return; // cancelled
            const n = parseInt(input);
            if (isNaN(n) || n <= 0) return;
            if (n >= l.cantidad) {
                State.lecturas.splice(index, 1); // delete all
            } else {
                l.cantidad -= n; // reduce quantity
            }
        } else {
            if (!confirm(`Eliminar "${l.descripcion}"?`)) return;
            State.lecturas.splice(index, 1);
        }

        this.saveLecturas();
        this.renderLecturas();
        this.toast('Lectura actualizada', 'warning');
        State.pendingSync = true;
        this.updateSyncStatus();
        this.addLog('delete', `Eliminada: ${l.descripcion} (${l.cantidad} uds) - Ubic: ${l.ubicacion || '-'} - ${State.deviceName}`);
    },

    // --- Search ---
    buscar(query) {
        const results = $('searchResults');

        if (!query || query.length < 2) {
            results.classList.add('hidden');
            return;
        }

        const q = query.toLowerCase();
        const matches = State.maestraArray.filter(p =>
            String(p.descripcion || '').toLowerCase().includes(q) ||
            String(p.modelo || '').toLowerCase().includes(q) ||
            String(p.ALU || '').toLowerCase().includes(q) ||
            String(p.SKU || '').toLowerCase().includes(q)
        ).slice(0, 10);

        if (matches.length === 0) {
            results.innerHTML = '<div class="search-item"><div class="search-desc">Sin resultados</div></div>';
        } else {
            results.innerHTML = matches.map(p => {
                const sku = String(p.SKU || '');
                const alu = String(p.ALU || '');
                const desc = this.escapeHtml(String(p.descripcion || p.modelo || ''));
                return `
                <div class="search-item" onclick="app.selectSearch('${sku}','${alu}','${desc.replace(/'/g, "\\'")}')">
                    <div class="search-desc">${desc}</div>
                    <div class="search-sku">SKU: ${sku} | ALU: ${alu}</div>
                </div>`;
            }).join('');
        }
        results.classList.remove('hidden');
    },

    selectSearch(sku, alu, desc) {
        State.currentProduct = { sku, alu, descripcion: desc, modelo: '', origen: 'manual' };
        $('inputProducto').value = alu || sku;
        $('productDesc').textContent = desc;
        $('productSKU').textContent = `SKU: ${sku}`;
        $('productInfo').classList.remove('hidden');
        $('productNotFound').classList.add('hidden');
        $('searchResults').classList.add('hidden');
        $('inputBuscar').value = '';
        $('inputCantidad').focus();
        $('inputCantidad').select();
    },

    // --- Monitor Inventario en Vivo ---
    showMonitor() {
        if (!State.inventarioId) {
            this.toast('No hay inventario activo', 'warning');
            return;
        }
        this.showView('inventario');
        this.loadProgreso();
        // Start polling every 15 seconds
        if (this._monitorTimer) clearInterval(this._monitorTimer);
        this._monitorTimer = setInterval(() => this.loadProgreso(), 15000);
    },

    hideMonitor() {
        if (this._monitorTimer) {
            clearInterval(this._monitorTimer);
            this._monitorTimer = null;
        }
        this.showView('scanner');
    },

    async loadProgreso() {
        try {
            const r = await this.fetchWithTimeout(
                `${State.apiUrl}/api/inventario/${State.inventarioId}/progreso`, 15000
            );
            const data = await r.json();
            this._progresoData = data;

            // Update summary cards
            const res = data.resumen;
            $('mcStock').textContent = res.totalStock.toLocaleString();
            $('mcConteo').textContent = res.totalConteo.toLocaleString();
            const diff = res.totalConteo - res.totalStock;
            $('mcDiff').textContent = diff;
            $('mcDiff').className = 'monitor-card-value ' + (diff < 0 ? 'error' : diff > 0 ? 'success' : '');
            $('mcProds').textContent = `${res.productosContados}/${res.totalProductos}`;

            // Progress bar
            $('monitorPct').textContent = res.porcentaje + '%';
            $('monitorProgressFill').style.width = Math.min(res.porcentaje, 100) + '%';

            // Device cards
            const devices = data.porDispositivo;
            const devKeys = Object.keys(devices);
            if (devKeys.length > 0) {
                $('deviceCards').innerHTML = devKeys.map(dev => `
                    <div class="device-card">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
                            <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
                            <path d="M12 18h.01"/>
                        </svg>
                        <span class="device-card-name">${this.escapeHtml(dev)}</span>
                        <span class="device-card-count">${devices[dev].toLocaleString()}</span>
                    </div>
                `).join('');
            } else {
                $('deviceCards').innerHTML = '<div style="color:var(--md-on-surface-variant);font-size:.85rem;padding:8px">Sin lecturas aun</div>';
            }

            // Build department filter dropdown
            const deptos = [...new Set(data.productos.map(p => p.Departamento || '').filter(Boolean))].sort();
            const currentDepto = $('monitorFilterDepto').value;
            $('monitorFilterDepto').innerHTML = '<option value="">Todo Depto</option>' +
                deptos.map(d => `<option value="${d}" ${d === currentDepto ? 'selected' : ''}>${d}</option>`).join('');

            // Render table
            this.filterInventario();
        } catch (e) {
            console.error('Error loading progreso:', e);
        }
    },

    filterInventario() {
        if (!this._progresoData) return;
        const q = ($('monitorFilterText').value || '').toLowerCase();
        const depto = $('monitorFilterDepto').value;

        const filtered = this._progresoData.productos.filter(p => {
            if (q && !((p.SKU || '').toLowerCase().includes(q) || (p.ALU || '').toLowerCase().includes(q) ||
                (p.Descripcion || '').toLowerCase().includes(q))) return false;
            if (depto && (p.Departamento || '') !== depto) return false;
            return true;
        });

        const showing = Math.min(filtered.length, 200);
        $('monitorTableCount').textContent = `Mostrando ${showing} de ${filtered.length} productos`;

        $('monitorTable').innerHTML = filtered.slice(0, 200).map(p => {
            const dc = p.Diferencia < 0 ? 'error' : p.Diferencia > 0 ? 'success' : '';
            const sobranteBadge = p.Sobrante ? ' <span style="background:#f59e0b;color:#000;font-size:.65rem;font-weight:700;padding:1px 4px;border-radius:3px">+</span>' : '';
            const rowBg = p.Sobrante ? 'background:rgba(245,158,11,.08);' : '';
            return `<div class="monitor-row" style="${rowBg}">
                <div class="monitor-row-main">
                    <span class="monitor-row-desc">${this.escapeHtml(p.Descripcion || '')}${sobranteBadge}</span>
                    <span class="monitor-row-sku">SKU: ${p.SKU}${p.Sobrante ? ' | SOBRANTE' : ' | ' + (p.Departamento || '')}</span>
                </div>
                <div class="monitor-row-nums">
                    <span class="monitor-row-stock">${p.StockTeorico}</span>
                    <span class="monitor-row-conteo">${p.Conteo}</span>
                    <span class="monitor-row-diff ${dc}">${p.Diferencia > 0 ? '+' : ''}${p.Diferencia}</span>
                </div>
            </div>`;
        }).join('');
    },

    // --- Vista Productos en Cache ---
    showProductos() {
        this.showView('productos');
        $('cacheTotal').textContent = State.maestraArray.length.toLocaleString();
        const hash = localStorage.getItem(CONFIG.MAESTRA_HASH_KEY) || '-';
        $('cacheHash').textContent = hash;
        this.filterMaestraApp();
    },

    hideProductos() {
        this.showView('scanner');
    },

    filterMaestraApp() {
        const q = ($('cacheSearch').value || '').toLowerCase();
        let results;

        if (q.length < 2) {
            results = State.maestraArray.slice(0, 100);
            $('cacheShowCount').textContent = `Mostrando primeros 100 de ${State.maestraArray.length.toLocaleString()} productos`;
        } else {
            const filtered = State.maestraArray.filter(p =>
                (p.SKU || '').toLowerCase().includes(q) ||
                (p.ALU || '').toLowerCase().includes(q) ||
                (p.descripcion || '').toLowerCase().includes(q) ||
                (p.modelo || '').toLowerCase().includes(q)
            );
            results = filtered.slice(0, 100);
            $('cacheShowCount').textContent = `Mostrando ${results.length} de ${filtered.length} resultados`;
        }

        $('cacheList').innerHTML = results.map(p => `
            <div class="cache-item">
                <div class="cache-item-main">
                    <span class="cache-item-desc">${this.escapeHtml(p.descripcion || p.modelo || '')}</span>
                    <span class="cache-item-detail">SKU: ${p.SKU} | ALU: ${p.ALU || '-'}</span>
                </div>
            </div>
        `).join('');
    },

    // --- Modulo Manual ---
    showManual() {
        this.showView('manual');
        this._manualCurrentProduct = null;
        $('manualSearch').value = '';
        $('manualResults').classList.add('hidden');
        $('manualProductCard').classList.add('hidden');
        $('manualCantidad').value = 1;

        // Populate filter dropdowns from maestra
        const proveedores = [...new Set(State.maestraArray.map(p => p.proveedor || '').filter(Boolean))].sort();
        const temporadas = [...new Set(State.maestraArray.map(p => p.temporada || '').filter(Boolean))].sort();
        const fill = (id, items, label) => {
            const sel = $(id);
            const cur = sel.value;
            sel.innerHTML = `<option value="">-- ${label} --</option>` +
                items.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v}</option>`).join('');
        };
        fill('manualFilterProv', proveedores, 'Proveedor');
        fill('manualFilterTemp', temporadas, 'Temporada');
        this.renderManualLecturas();
    },

    hideManual() {
        this._manualCurrentProduct = null;
        this.showView('scanner');
    },

    clearManualFilters() {
        $('manualSearch').value = '';
        $('manualFilterProv').value = '';
        $('manualFilterTemp').value = '';
        $('manualResults').classList.add('hidden');
        $('manualProductCard').classList.add('hidden');
        this._manualCurrentProduct = null;
    },

    buscarManualLive(val) {
        // Live search: trigger automatically after 2 chars (with debounce)
        clearTimeout(this._manualSearchTimer);
        if ((val || '').trim().length < 2) {
            if ((val || '').trim().length === 0) $('manualResults').classList.add('hidden');
            return;
        }
        this._manualSearchTimer = setTimeout(() => this.buscarManual(), 300);
    },

    buscarManual() {
        const q = ($('manualSearch').value || '').toLowerCase().trim();
        const prov = $('manualFilterProv').value;
        const temp = $('manualFilterTemp').value;
        const results = $('manualResults');

        if (!q && !prov && !temp) {
            results.classList.add('hidden');
            return;
        }

        const matches = State.maestraArray.filter(p => {
            if (q && !(
                String(p.descripcion || '').toLowerCase().includes(q) ||
                String(p.modelo || '').toLowerCase().includes(q) ||
                String(p.ALU || '').toLowerCase().includes(q) ||
                String(p.SKU || '').toLowerCase().includes(q)
            )) return false;
            if (prov && (p.proveedor || '') !== prov) return false;
            if (temp && (p.temporada || '') !== temp) return false;
            return true;
        }).slice(0, 15);

        if (matches.length === 0) {
            results.innerHTML = '<div class="search-item"><div class="search-desc">Sin resultados</div></div>';
        } else {
            results.innerHTML = matches.map(p => {
                const sku = String(p.SKU || '');
                const alu = String(p.ALU || '');
                const desc = this.escapeHtml(String(p.descripcion || p.modelo || ''));
                const info = [p.proveedor, p.temporada].filter(Boolean).join(' | ');
                return `<div class="search-item" onclick="app.selectManualProduct('${sku}','${alu}','${desc.replace(/'/g, "\\'")}')">
                    <div class="search-desc">${desc}</div>
                    <div class="search-sku">SKU: ${sku} | ALU: ${alu}${info ? ' | ' + this.escapeHtml(info) : ''}</div>
                </div>`;
            }).join('');
        }
        results.classList.remove('hidden');
    },

    selectManualProduct(sku, alu, desc) {
        this._manualCurrentProduct = { sku, alu, descripcion: desc, origen: 'manual' };
        $('manualDesc').textContent = desc;
        $('manualSKU').textContent = `SKU: ${sku} | ALU: ${alu}`;
        $('manualProductCard').classList.remove('hidden');
        $('manualResults').classList.add('hidden');
        $('manualSearch').value = '';
        $('manualCantidad').value = 1;
        $('manualCantidad').focus();
    },

    manualInc() {
        const el = $('manualCantidad');
        el.value = Math.max(1, parseInt(el.value || 1) + 1);
    },

    manualDec() {
        const el = $('manualCantidad');
        el.value = Math.max(1, parseInt(el.value || 1) - 1);
    },

    registrarManual() {
        const prod = this._manualCurrentProduct;
        if (!prod) { this.toast('Selecciona un producto primero', 'warning'); return; }
        const cantidad = Math.max(1, parseInt($('manualCantidad').value) || 1);
        const ubicacion = localStorage.getItem(CONFIG.UBICACION_KEY) || '';

        // Check if already exists → accumulate
        const existing = State.lecturas.find(l =>
            String(l.sku) === String(prod.sku) && l.origen === 'manual'
        );
        if (existing) {
            existing.cantidad += cantidad;
        } else {
            State.lecturas.push({
                sku: prod.sku,
                alu: prod.alu,
                descripcion: prod.descripcion,
                cantidad,
                ubicacion,
                origen: 'manual'
            });
        }

        this.saveLecturas();
        State.pendingSync = true;
        this.updateSyncStatus();
        this.addLog('info', `Manual: ${prod.descripcion} x${cantidad} - ${State.deviceName}`);
        this.renderLecturas();       // update main badge (badgeCount) immediately
        this.renderManualLecturas();
        $('manualProductCard').classList.add('hidden');
        this._manualCurrentProduct = null;
        this.toast(`Agregado: ${prod.descripcion} x${cantidad}`, 'success');
    },

    renderManualLecturas() {
        const manual = State.lecturas.filter(l => l.origen === 'manual');
        $('manualCount').textContent = manual.length;
        $('manualBadge').textContent = manual.length;
        if (manual.length === 0) {
            $('manualList').innerHTML = '';
            $('manualEmpty').style.display = '';
            return;
        }
        $('manualEmpty').style.display = 'none';
        $('manualList').innerHTML = manual.map((l) => {
            // Find actual index in State.lecturas
            const realIdx = State.lecturas.indexOf(l);
            return `<div class="lectura-item">
                <div class="lectura-info">
                    <span class="lectura-desc">${this.escapeHtml(l.descripcion || '')}</span>
                    <span class="lectura-sku">SKU: ${l.sku} | x${l.cantidad}</span>
                </div>
                <div class="lectura-actions">
                    <span class="lectura-cant">${l.cantidad}</span>
                    <button class="lectura-del" onclick="app.deleteLectura(${realIdx}); app.renderLecturas(); app.renderManualLecturas();" title="Eliminar">
                        ${Icons.trash}
                    </button>
                </div>
            </div>`;
        }).join('');
    },

    // --- Sync (Manual Only) ---
    async sync() {
        const btnSync = $('btnSync');
        btnSync.classList.add('syncing');
        btnSync.disabled = true;

        const totalLecturas = State.lecturas.reduce((s, l) => s + l.cantidad, 0);
        const totalItems = State.lecturas.length;

        try {
            this.updateDot('syncing');

            const r = await fetch(`${State.apiUrl}/api/inventario/${State.inventarioId}/sync`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    dispositivo: State.deviceName,
                    lecturas: State.lecturas.map(l => ({
                        sku: String(l.sku || ''),
                        alu: String(l.alu || ''),
                        descripcion: String(l.descripcion || ''),
                        cantidad: parseInt(l.cantidad) || 1,
                        ubicacion: String(l.ubicacion || ''),
                        origen: l.origen || 'scanner'
                    })),
                    logs: State.activityLog.slice(0, 100)  // Enviar max 100 entradas al admin
                })
            });

            if (r.ok) {
                State.lastSync = new Date();
                State.isOnline = true;
                State.pendingSync = false;
                this.updateDot('online');
                this.updateSyncStatus();
                if (totalItems === 0) {
                    this.toast('Conteo limpio sincronizado (0 items)', 'success');
                    this.addLog('sync', `Conteo limpio - ${State.deviceName}`);
                } else {
                    this.toast(`Subido: ${totalLecturas} unidades (${totalItems} items)`, 'success');
                    this.addLog('sync', `SUBIDO: ${totalLecturas} unidades, ${totalItems} items - ${State.deviceName}`);
                }
                // Lock device name after first successful sync (PDA only, not desktop browser)
                if (window.Capacitor) localStorage.setItem(CONFIG.DEVICE_LOCKED_KEY, '1');
            } else {
                State.isOnline = false;
                this.updateDot('offline');
                let errMsg = `Error ${r.status} al sincronizar`;
                try {
                    const errData = await r.json();
                    if (errData.detail) errMsg += `: ${errData.detail}`;
                } catch {}
                console.error('Sync error:', errMsg);
                this.toast(errMsg, 'error');
                this.addLog('error', `ERROR sync: ${errMsg} - ${State.deviceName}`);
            }
        } catch (e) {
            State.isOnline = false;
            this.updateDot('offline');
            this.toast('Sin conexion - datos guardados localmente', 'warning');
            this.addLog('error', `Sin conexion al sincronizar - ${State.deviceName}`);
        } finally {
            btnSync.classList.remove('syncing');
            btnSync.disabled = false;
        }
    },

    // --- Sync Status ---
    updateSyncStatus() {
        const pending = $('syncPending');
        const last = $('syncLast');
        if (!pending || !last) return;

        const total = State.lecturas.reduce((s, l) => s + l.cantidad, 0);

        if (State.pendingSync && total > 0) {
            pending.textContent = `${total} lecturas pendientes de subir`;
            pending.classList.remove('synced');
        } else if (total > 0) {
            pending.textContent = `${total} lecturas sincronizadas`;
            pending.classList.add('synced');
        } else {
            pending.textContent = 'Sin lecturas';
            pending.classList.add('synced');
        }

        if (State.lastSync) {
            const h = State.lastSync.getHours().toString().padStart(2, '0');
            const m = State.lastSync.getMinutes().toString().padStart(2, '0');
            last.textContent = `Ultimo sync: ${h}:${m}`;
        } else {
            last.textContent = 'Sin sincronizar';
        }
    },

    // --- Activity Log ---
    addLog(type, message) {
        const now = new Date();
        const entry = {
            time: now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            date: now.toLocaleDateString('es'),
            type: type, // sync, delete, error, info
            msg: message,
            device: State.deviceName
        };
        State.activityLog.unshift(entry);
        if (State.activityLog.length > CONFIG.MAX_LOG_ENTRIES) {
            State.activityLog = State.activityLog.slice(0, CONFIG.MAX_LOG_ENTRIES);
        }
        this.saveLog();
    },

    saveLog() {
        localStorage.setItem(CONFIG.LOG_KEY, JSON.stringify(State.activityLog));
    },

    loadLog() {
        try {
            const saved = localStorage.getItem(CONFIG.LOG_KEY);
            if (saved) State.activityLog = JSON.parse(saved);
        } catch { State.activityLog = []; }
    },

    showLog() {
        this.showView('log');
        $('logDevice').textContent = `Dispositivo: ${State.deviceName}`;
        $('logCount').textContent = `${State.activityLog.length} entradas`;
        const list = $('logList');
        if (State.activityLog.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:var(--md-on-surface-variant);padding:2rem">Sin actividad registrada</div>';
            return;
        }
        list.innerHTML = State.activityLog.map(e => `
            <div class="log-entry log-${e.type}">
                <span class="log-time">${e.time}</span>
                <span class="log-msg">${this.escapeHtml(e.msg)}</span>
            </div>
        `).join('');
    },

    hideLog() {
        this.showView('scanner');
    },

    clearLog() {
        if (!confirm('Limpiar todo el log de actividad?')) return;
        State.activityLog = [];
        this.saveLog();
        this.showLog();
        this.toast('Log limpiado');
    },

    // --- Utilities ---
    saveUbicacion() {
        localStorage.setItem(CONFIG.UBICACION_KEY, $('inputUbicacion').value);
    },

    updateOnlineStatus() {
        this.updateDot(navigator.onLine ? 'online' : 'offline');
    },

    updateDot(status) {
        const indicator = $('dotStatus');
        indicator.className = 'status-indicator';

        if (status === 'online') {
            indicator.classList.add('online');
        } else if (status === 'offline') {
            indicator.classList.add('offline');
        } else if (status === 'syncing') {
            indicator.classList.add('syncing');
        }
    },

    logout() {
        if (State.pendingSync && State.lecturas.length > 0) {
            if (!confirm('Tienes lecturas sin subir. Salir de todas formas?\n\n(Los datos se mantienen guardados localmente)')) return;
            this.addLog('info', `Logout con ${State.lecturas.length} lecturas pendientes - ${State.deviceName}`);
        }
        State.inventarioId = null;
        State.currentProduct = null;
        this.showView('login');
        $('loginMsg').textContent = '';
    },

    toast(msg, type = 'success') {
        const t = $('toast');
        const icon = $('toastIcon');
        const msgEl = $('toastMsg');

        // Set icon based on type
        icon.className = 'toast-icon';
        if (type === 'error') {
            icon.classList.add('error');
            icon.innerHTML = Icons.x;
        } else if (type === 'warning') {
            icon.classList.add('warning');
            icon.innerHTML = Icons.warning;
        } else {
            icon.innerHTML = Icons.check;
        }

        msgEl.textContent = msg;
        t.classList.remove('hidden');

        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
    }
};

// Initialize app when DOM is ready
app.init();
