/**
 * Inventario Pro - App Logic
 * Arquitectura: Singleton Pattern + Role-Based UI
 * Best Practices adapted for Vanilla JS:
 * - O(1) Lookups for Master Data (Map)
 * - Event Delegation where possible
 * - Clean Separation of Concerns (View vs Data)
 */

const AppState = {
    role: null, // 'admin' | 'scanner'
    deviceName: localStorage.getItem('inv_device') || 'Lectora 1',
    isOnline: true,

    // Data Stores
    masterData: new Map(), // Usamos Map para mejor performance en lookups masivos
    batchData: [],

    // Runtime
    scannerObj: null,
    isCameraOpen: false
};

// --- CORE UTILS ---
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

// --- APP CONTROLLER ---
const app = {
    init: function () {
        this.loadPersistedData();
        this.checkSession();
        this.setupGlobalListeners();
        console.log("🚀 App Initialized");
    },

    loadPersistedData: function () {
        // Cargar Maestra (optimizada en Map)
        const savedMaster = localStorage.getItem('inv_master');
        if (savedMaster) {
            try {
                // Convertir Objeto a Map para O(1)
                const parsed = JSON.parse(savedMaster);
                AppState.masterData = new Map(Object.entries(parsed));
                console.log(`📦 Maestra cargada: ${AppState.masterData.size} productos`);
            } catch (e) {
                console.error("Error cargando maestra", e);
            }
        }

        // Cargar BatchOffline
        const savedBatch = localStorage.getItem('inv_batch');
        if (savedBatch) AppState.batchData = JSON.parse(savedBatch);
    },

    checkSession: function () {
        // Simple session check
        const role = sessionStorage.getItem('inv_role');
        if (role) this.login(role);
        else this.switchView('login');
    },

    login: async function (role) {
        // Lógica de Login Híbrida (API Real + Fallback Demo)
        // Para "scanner", entra directo (en producción podría pedir PIN también)

        if (role === 'admin') {
            const user = prompt("Usuario (RetailUser):", "admin");
            const pass = prompt("PIN/Contraseña:", "9999");

            if (!user || !pass) return;

            // 1. Intentar Backend Real
            try {
                this.toast("Conectando al servidor...");
                const response = await fetch('http://localhost:8001/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user, password: pass })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        this.completeLogin('admin');
                        this.toast(data.message);
                        return;
                    } else {
                        alert("❌ " + data.message);
                        return;
                    }
                }
            } catch (err) {
                console.warn("Backend offline, entrando modo Demo", err);
            }

            // 2. Fallback Demo (Si el backend falla o no existe)
            if (user === 'admin' && pass === '9999') {
                alert("⚠️ Modo Offline / Demo activado (No conectado al servidor)");
                this.completeLogin('admin');
            } else {
                alert("❌ Usuario incorrecto (y no hay servidor para validar). Intenta: admin / 9999");
            }

        } else {
            // Operario: Login directo
            this.completeLogin('scanner');
        }
    },

    completeLogin: function (role) {
        AppState.role = role;
        sessionStorage.setItem('inv_role', role);

        if (role === 'admin') {
            this.switchView('admin');
            this.renderAdminTable();
        } else {
            this.switchView('scanner');
            $('mobileDeviceName').textContent = AppState.deviceName;
            $('scannerInput').focus();
        }
    },

    logout: function () {
        sessionStorage.removeItem('inv_role');
        AppState.role = null;
        this.switchView('login');
    },

    switchView: function (viewName) {
        // Hide all others
        document.querySelectorAll('.view-container').forEach(el => {
            if (el.id !== `view-${viewName}`) {
                el.classList.remove('active');
                setTimeout(() => el.classList.add('hidden'), 300);
            }
        });

        // Show target
        const target = $(`view-${viewName}`);
        target.classList.remove('hidden');
        // Force reflow
        void target.offsetWidth;
        target.classList.add('active');
    },

    setupGlobalListeners: function () {
        // Global Keyboard Handler for Scanners (Best Practice to dedup listeners)
        document.addEventListener('keydown', (e) => {
            // Solo procesar si estamos en vista scanner y presionan Enter
            if (AppState.role === 'scanner' && e.key === 'Enter') {
                const activeEl = document.activeElement;
                if (activeEl.id === 'scannerInput') {
                    this.handleScan(activeEl.value);
                    activeEl.value = '';
                } else if (activeEl.tagName !== 'INPUT') {
                    // Si el foco no está en un input, pero hubo un input de hardware global
                    $('scannerInput').focus();
                }
            }
        });

        // File Inputs (Admin)
        $('fileMaster').addEventListener('change', (e) => this.handleImport(e, 'master'));
        $('fileStock').addEventListener('change', (e) => this.handleImport(e, 'stock'));

        // Sync Button (Mobile)
        $('btnSyncMobile').addEventListener('click', () => this.syncData());
    },

    // --- LOGIC: SYNC ---
    syncData: async function () {
        if (AppState.batchData.length === 0) {
            this.toast("Nada para sincronizar");
            return;
        }

        if (!confirm(`¿Enviar ${AppState.batchData.length} registros al servidor?`)) return;

        try {
            this.toast("Enviando datos...");
            const response = await fetch('http://localhost:8001/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(AppState.batchData)
            });

            if (response.ok) {
                const data = await response.json();
                alert("✅ Servidor dice: " + data.message);

                // Limpiar cola local
                AppState.batchData = [];
                localStorage.removeItem('inv_batch');
                this.updateRecentList();
            } else {
                alert("❌ Error del servidor");
            }
        } catch (err) {
            alert("⚠️ No hay conexión con el servidor (Offline)");
            console.error(err);
        }
    },

    // --- LOGIC: SCANNING ---
    handleScan: function (code) {
        code = code.trim();
        if (!code) return;

        // 1. Lookup O(1)
        const product = AppState.masterData.get(code);

        if (!product) {
            // Missing Master Logic
            this.promptNewProduct(code);
            return;
        }

        this.registerScan(code, product.name);
    },

    registerScan: function (code, name) {
        const record = {
            code,
            name,
            qty: 1,
            ts: new Date().toLocaleTimeString(),
            dev: AppState.deviceName
        };

        // Add to batch
        AppState.batchData.unshift(record);
        localStorage.setItem('inv_batch', JSON.stringify(AppState.batchData));

        // UI Feedback
        this.showFeedback(name, code);
        this.updateRecentList();
    },

    showFeedback: function (name, code) {
        // Mobile UI update
        const card = $('lastScanCard');
        $('lastScanName').textContent = name;
        $('lastScanCode').textContent = code;
        card.classList.remove('hidden');

        // Auto-hide after 3s (UX Rule: Clear feedback)
        clearTimeout(this.feedbackTimer);
        this.feedbackTimer = setTimeout(() => card.classList.add('hidden'), 4000);

        // Toast
        this.toast(`✅ Escaneado: ${name}`);
    },

    updateRecentList: function () {
        const list = AppState.batchData.slice(0, 5); // Show last 5
        $('mobileList').innerHTML = list.map(item => `
            <li class="glass-panel" style="padding:10px; margin-bottom:5px; list-style:none; display:flex; justify-content:space-between;">
                <span>${item.name}</span>
                <span style="color:var(--text-muted)">${item.code}</span>
            </li>
        `).join('');
    },

    // --- LOGIC: ADMIN & DATA ---
    handleImport: async function (e, type) {
        const file = e.target.files[0];
        if (!file) return;

        $('adminStatus').textContent = "⏳ Procesando...";

        try {
            const data = await this.readExcel(file);
            let count = 0;

            // Smart Column Detect
            const header = data[0];
            const keys = Object.keys(header);
            const keyId = keys.find(k => /cod|isbn|ean|sku/i.test(k));
            const keyName = keys.find(k => /desc|nomb|prod/i.test(k));

            if (!keyId) throw new Error("No se encontró columna Código en el Excel");

            // Bulk Update Map (Best Practice: Batch operations)
            data.forEach(row => {
                const code = String(row[keyId] || '').trim();
                const name = keyName ? (row[keyName] || 'Sin Nombre') : 'Sin Nombre';
                if (code) {
                    AppState.masterData.set(code, { name, stock: 0 });
                    count++;
                }
            });

            // Persist Map as Obj
            const mapObj = Object.fromEntries(AppState.masterData);
            localStorage.setItem('inv_master', JSON.stringify(mapObj));

            $('adminStatus').textContent = `✅ Importación éxitosa: ${count} productos.`;
            this.toast(`Maestra actualizada: ${count} items`);

        } catch (err) {
            console.error(err);
            $('adminStatus').textContent = `❌ Error: ${err.message}`;
        }
    },

    readExcel: function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                resolve(json);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    renderAdminTable: function () {
        // En un sistema real esto vendría del server. Aquí simulamos con lo local.
        const tb = $('adminTableBody');
        const data = AppState.batchData; // Show local batch for demo
        tb.innerHTML = data.map(r => `
            <tr>
                <td>${r.code}</td>
                <td>${r.name}</td>
                <td>${r.qty}</td>
                <td>${r.dev}</td>
                <td>${r.ts}</td>
            </tr>
        `).join('');
    },

    clearData: function () {
        if (confirm("¿Limpiar todo el monitoreo?")) {
            AppState.batchData = [];
            localStorage.removeItem('inv_batch');
            this.renderAdminTable();
        }
    },

    // --- LOGIC: NEW PRODUCT ---
    promptNewProduct: function (code) {
        this.pendingNewCode = code;
        $('newCodeDisplay').textContent = code;
        $('modalNew').classList.remove('hidden');
        $('newNameInput').focus();

        // Sound feedback (UX)
        // navigator.vibrate(200); 
    },

    saveNewProduct: function () {
        const name = $('newNameInput').value.trim() || "Item Nuevo";
        const code = this.pendingNewCode;

        AppState.masterData.set(code, { name, stock: 0 });

        // Update storage
        const mapObj = Object.fromEntries(AppState.masterData);
        localStorage.setItem('inv_master', JSON.stringify(mapObj));

        this.closeModal();
        this.registerScan(code, name);
    },

    closeModal: function () {
        $('modalNew').classList.add('hidden');
        $('newNameInput').value = '';
        $('scannerInput').focus();
    },

    // --- UX HELPERS ---
    toast: function (msg) {
        const t = $('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 3000);
    },

    toggleCamera: function () {
        if (AppState.isCameraOpen) {
            AppState.scannerObj.stop();
            hide('camera-wrapper');
            AppState.isCameraOpen = false;
        } else {
            show('camera-wrapper');
            AppState.scannerObj = new Html5Qrcode("reader");
            AppState.scannerObj.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 250 },
                (decodedText) => {
                    this.handleScan(decodedText);
                    // UX: Pause briefly to avoid double-scan
                    AppState.scannerObj.pause();
                    setTimeout(() => AppState.scannerObj.resume(), 1500);
                }
            );
            AppState.isCameraOpen = true;
        }
    }
};

// Start App
app.init();
