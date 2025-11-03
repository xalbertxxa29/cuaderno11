// ====== MAPA DE REFERENCIAS (QR → Punto de Marcación) ======
const REFERENCIA_MAP = {
  "1761055082506": "1",
  "1761055097257": "2",
  "1761055105341": "3",
  "1761055598535": "4",
  "1761055619574": "5",
  "1761055731912": "6",
  "1761055748808": "7",
  "1761055758075": "8",
  "1761055765742": "9",
  "1761056924033": "10",
  "1761056935227": "11",
  "1761056952702": "12",
  "1761056960727": "13",
  "1761056968594": "14",
  "1761056974553": "15",
  "1761058333445": "16",
  "1761058340305": "17",
  "1761058346339": "18",
  "1761058353137": "19",
  "1761058359372": "20",
  "1761058367017": "21",
  "1761058388859": "22",
  "1761058395655": "23",
  "1761058402461": "24",
  "1761058423101": "25",
  "1761058429185": "27",
  "1761058447734": "28",
  "1761058454312": "29",
  "1761058460400": "30",
  "1760037324942": "MARCACION QR"
};

// ============================
//  Firebase (compat) — inicialización segura
// ============================
const fb = window.firebase || self.firebase;
if (fb && !fb.apps.length) {
  if (!firebaseConfig || !firebaseConfig.projectId) {
    console.error('Falta firebaseConfig o projectId');
    alert('No se encontró la configuración de Firebase. Verifica que "firebase-config.js" cargue antes que "ronda.js".');
    throw new Error('Firebase config ausente');
  }
  fb.initializeApp(firebaseConfig);
  console.log('Firebase listo →', fb.app().options.projectId);
}
const db = fb?.firestore?.();
const storage = fb?.storage?.();
const auth = fb?.auth?.();

// Habilita persistencia ANTES de cualquier operación (si el WebView lo permite)
// Solo intenta habilitar si no está ya habilitada
let persistenceEnabled = false;
if (db?.enablePersistence) {
  db.enablePersistence({ synchronizeTabs: false }).catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Múltiples tabs/WebViews abiertos - persistencia deshabilitada');
    } else if (err.code === 'unimplemented') {
      console.warn('Persistencia no soportada en este navegador');
    } else {
      console.warn('Error de persistencia:', err.message);
    }
  });
  persistenceEnabled = true;
}

// Variable para almacenar el usuario logueado
let usuarioLogueado = null;

// ===== Colección destino en Firestore =====
const FIRE_COLLECTION = 'RONDAS';

// ===== Sistema de sincronización de fotos offline =====
let photoQueue = null;
if (db && storage && typeof OfflinePhotoQueue !== 'undefined') {
  photoQueue = new OfflinePhotoQueue(db, storage);
  console.log('✅ Sistema de sincronización offline activado');
}

// =============================
// ELEMENTOS DE UI
// =============================
const scannerContainer = document.getElementById('scanner-container');
const optionsContainer = document.getElementById('options-container');
const formSinNovedadContainer = document.getElementById('form-sin-novedad-container');
const formConNovedadContainer = document.getElementById('form-con-novedad-container');

const video = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvas = canvasElement.getContext('2d', { willReadFrequently: true });

const scannedPointName = document.getElementById('scanned-point-name');
const btnSinNovedad = document.getElementById('btn-sin-novedad');
const btnConNovedad = document.getElementById('btn-con-novedad');
const btnCancelScan = document.getElementById('btn-cancel-scan');

const formSinNovedad = document.getElementById('form-sin-novedad');
const formConNovedad = document.getElementById('form-con-novedad');

const statusToast = document.getElementById('status-toast');
const pointNameSin = document.getElementById('point-name-sin-novedad');
const pointNameCon = document.getElementById('point-name-con-novedad');

const savingOverlay = document.getElementById('saving-overlay');
const savingMsg = document.getElementById('saving-msg');

// Evidencia
const evidencePreview = document.getElementById('evidence-preview');
const evidenceWrap = document.getElementById('evidence-preview-wrap');
const evidenceBtn = document.getElementById('btn-evidencia');
const evidenceRemove = document.getElementById('evidence-remove');

// === Elementos de cámara para evidencia ===
const cameraModalEvidencia = document.getElementById('camera-modal-evidencia');
const videoEvidencia = document.getElementById('video-evidencia');
const canvasEvidencia = document.getElementById('canvas-evidencia');
const btnCapturePhoto = document.getElementById('btn-capture-photo');
const btnCancelCamera = document.getElementById('btn-cancel-camera');
let streamEvidencia = null;

// === Sheet evidencia (Cámara / Galería) ===
const sheetEvid = document.getElementById('sheet-evidencia');
const optCam = document.getElementById('opt-cam');
const optGal = document.getElementById('opt-gal');
const optCancelar = document.getElementById('opt-cancelar');
const evidenceInputGallery = document.getElementById('evidence-input-gallery');

function openSheet()  { sheetEvid?.classList.remove('hidden'); }
function closeSheet() { sheetEvid?.classList.add('hidden'); }
optCancelar?.addEventListener('click', closeSheet);
sheetEvid?.addEventListener('click', (e)=>{ if(e.target === sheetEvid) closeSheet(); });
evidenceBtn?.addEventListener('click', (e)=>{ e.preventDefault(); openSheet(); });

// Al hacer clic en "Abrir cámara": abrir modal de cámara
optCam?.addEventListener('click', () => {
  closeSheet();
  openCameraModal();
});

// Al hacer clic en "Adjuntar desde galería": abrir selector de archivos
optGal?.addEventListener('click', () => {
  closeSheet();
  evidenceInputGallery?.click();
});

// =============================
// CÁMARA PARA EVIDENCIA
// =============================
async function openCameraModal() {
  cameraModalEvidencia.style.display = 'flex';
  try {
    streamEvidencia = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    videoEvidencia.srcObject = streamEvidencia;
    await videoEvidencia.play();
  } catch (err) {
    console.error('Error de cámara:', err);
    showToast('No se pudo acceder a la cámara.', 'error');
    closeCameraModal();
  }
}

function closeCameraModal() {
  cameraModalEvidencia.style.display = 'none';
  if (streamEvidencia) {
    streamEvidencia.getTracks().forEach(t => t.stop());
    streamEvidencia = null;
  }
  videoEvidencia.srcObject = null;
}

function capturePhotoFromVideo() {
  const ctx = canvasEvidencia.getContext('2d', { willReadFrequently: true });
  canvasEvidencia.width = videoEvidencia.videoWidth;
  canvasEvidencia.height = videoEvidencia.videoHeight;
  ctx.drawImage(videoEvidencia, 0, 0);
  return canvasEvidencia.toDataURL('image/jpeg', 0.82);
}

// Botones del modal de cámara
btnCapturePhoto?.addEventListener('click', async () => {
  try {
    const photoDataUrl = capturePhotoFromVideo();
    closeCameraModal();
    // Convertir a blob y procesar como archivo
    const blob = dataURLtoBlob(photoDataUrl);
    await processEvidenceFile(blob);
  } catch (err) {
    console.error('Error capturando foto:', err);
    showToast('No se pudo capturar la foto.', 'error');
  }
});

btnCancelCamera?.addEventListener('click', closeCameraModal);

// === Pregunta 6 ===
const q6Radios = document.querySelectorAll('input[name="q6"]');
const q6Comment = document.getElementById('q6-comment');

// Modal de permisos de cámara
const cameraMsg = document.getElementById('camera-permission-msg');
const startScanCta = document.getElementById('start-scan-cta');
const btnCancelRondas = document.getElementById('btn-cancel-rondas');

// =============================
// ESTADO
// =============================
let stream = null;
let currentScannedData = null;
let evidenceDataUrl = '';
let userInteracted = false;
window.addEventListener('pointerdown', () => (userInteracted = true), { once: true });

// Cronómetro
let timerInterval = null;
let timerStartTime = null;
let timerElapsedSeconds = 0;

// =============================
// SERVICE WORKER (idempotente)
// =============================
if ('serviceWorker' in navigator) {
  // Si ya está registrado, esto no rompe nada.
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

// =============================
// INICIALIZAR IndexedDB PARA REGISTROS OFFLINE
// =============================
function initOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ronda-offline-db', 1);
    
    request.onerror = () => {
      console.error('Error abriendo IndexedDB');
      reject(request.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending-records')) {
        db.createObjectStore('pending-records', { keyPath: 'docId' });
        console.log('✓ Object store "pending-records" creado');
      }
    };
    
    request.onsuccess = () => {
      console.log('✓ IndexedDB inicializado para registros offline');
      resolve(request.result);
    };
  });
}

// Inicializar al cargar la página
initOfflineDB().catch(e => console.warn('No se pudo inicializar IndexedDB:', e));

// =============================
// OVERLAY DE GUARDADO
// =============================
function showSaving(msg = 'Guardando…') {
  savingOverlay?.classList.add('active');
  if (savingMsg) savingMsg.textContent = msg;
}
function showSaved(msg = 'Guardado') {
  savingOverlay?.classList.add('success');
  if (savingMsg) savingMsg.textContent = msg;
  setTimeout(hideSaving, 900);
}
function hideSaving() {
  savingOverlay?.classList.remove('active', 'success');
}

// =============================
// ESCÁNER QR
// =============================
function startScanner() {
  currentScannedData = null;
  cameraMsg?.classList.remove('active');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => {
      stream = s;
      video.srcObject = stream;
      return video.play();
    })
    .then(() => requestAnimationFrame(tick))
    .catch(err => {
      console.error('Error de cámara:', err.name, err.message);
      cameraMsg?.classList.add('active');
      if (startScanCta) { startScanCta.disabled = false; startScanCta.style.opacity = '1'; }
    });
}

function stopScanner() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function drawPath(loc) {
  const p = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
  canvas.beginPath();
  canvas.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) canvas.lineTo(p[i].x, p[i].y);
  canvas.closePath();
  canvas.lineWidth = 4;
  canvas.strokeStyle = 'rgba(0,200,0,0.9)';
  canvas.stroke();
}

function tick() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.height = video.videoHeight || 480;
    canvasElement.width  = video.videoWidth  || 640;
    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

    const imgData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const code = (typeof jsQR === 'function') ? jsQR(imgData.data, imgData.width, imgData.height) : null;

    if (code && code.data) {
      if (code.location) drawPath(code.location);
      const normalized = String(code.data).trim().replace(/\s+/g, '');
      const punto = REFERENCIA_MAP[normalized];

      if (punto) {
        stopScanner();
        currentScannedData = { referencia: normalized, puntoMarcacion: punto };
        if (scannedPointName) scannedPointName.textContent = punto;
        scannerContainer.style.display = 'none';
        optionsContainer.style.display = 'flex';
        resetTimer();  // Reinicia el cronómetro
        startTimer();  // Inicia el cronómetro cuando se detecta QR válido
        if (userInteracted && navigator.vibrate) { try { navigator.vibrate(150); } catch {} }
        return;
      } else {
        showToast(`QR no reconocido: ${normalized}`, 'error');
      }
    }
  }
  requestAnimationFrame(tick);
}

// =============================
// CRONÓMETRO
// =============================
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerStartTime = Date.now();
  timerElapsedSeconds = 0;
  
  timerInterval = setInterval(() => {
    timerElapsedSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
    const timeStr = formatTime(timerElapsedSeconds);
    
    // Obtener referencias dinámicamente por si el DOM cambió
    const timerSinNovedad = document.getElementById('timer-sin-novedad');
    const timerConNovedad = document.getElementById('timer-con-novedad');
    
    // Actualizar ambos displays
    if (timerSinNovedad) timerSinNovedad.textContent = timeStr;
    if (timerConNovedad) timerConNovedad.textContent = timeStr;
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  stopTimer();
  timerElapsedSeconds = 0;
  timerStartTime = null;
  const timerSinNovedad = document.getElementById('timer-sin-novedad');
  const timerConNovedad = document.getElementById('timer-con-novedad');
  if (timerSinNovedad) timerSinNovedad.textContent = '00:00';
  if (timerConNovedad) timerConNovedad.textContent = '00:00';
}

// =============================
// UI STATES
// =============================
function showUI(state) {
  [scannerContainer, optionsContainer, formSinNovedadContainer, formConNovedadContainer]
    .forEach(el => (el.style.display = 'none'));

  const point = currentScannedData?.puntoMarcacion || '';
  if (pointNameSin) pointNameSin.textContent = point;
  if (pointNameCon) pointNameCon.textContent = point;

  if (state === 'scanner') {
    scannerContainer.style.display = 'block';
  } else if (state === 'options') {
    optionsContainer.style.display = 'flex';
  } else if (state === 'sin-novedad') {
    formSinNovedadContainer.style.display = 'block';
  } else if (state === 'con-novedad') {
    formConNovedadContainer.style.display = 'block';
  }
}

// =============================
// BOTONES PRINCIPALES
// =============================
btnCancelScan?.addEventListener('click', () => {
  stopScanner();
  resetEvidence(); resetQuestions();
  showUI('scanner');
  cameraMsg?.classList.add('active'); // volver a PLAY
});
btnSinNovedad?.addEventListener('click', () => showUI('sin-novedad'));
btnConNovedad?.addEventListener('click', () => showUI('con-novedad'));
document.querySelectorAll('.form-cancel').forEach(b => b.addEventListener('click', () => {
  resetEvidence(); resetQuestions(); showUI('options');
}));
startScanCta?.addEventListener('click', () => {
  startScanCta.disabled = true; startScanCta.style.opacity = '.7';
  showUI('scanner'); startScanner();
});

// Botón Cancelar - volver a menú
if (btnCancelRondas) {
  btnCancelRondas.addEventListener('click', (e) => {
    console.log('Botón cancelar clickeado');
    e.preventDefault();
    window.location.href = 'menu.html';
  });
  console.log('Listener del botón cancelar agregado');
} else {
  console.warn('No se encontró el botón btnCancelRondas');
}

// =============================
// EVIDENCIA (imagen)
// =============================
function fileToOptimizedDataURL(file, max = 1280, q = 0.82) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > max) { height *= max / width; width = max; }
        else if (height > width && height > max) { width *= max / height; height = max; }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = reject; img.src = r.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}

function dataURLtoBlob(dataURL) {
  const [head, body] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(body); const len = bin.length; const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function resetEvidence() {
  evidenceDataUrl = '';
  if (evidenceInputGallery) evidenceInputGallery.value = '';
  if (streamEvidencia) closeCameraModal();
  evidenceWrap.style.display = 'none';
  evidencePreview.src = '';
}

// único pipeline para ambos inputs
async function processEvidenceFile(file){
  if(!file) return;
  showSaving('Procesando evidencia…');
  try{
    evidenceDataUrl = await fileToOptimizedDataURL(file);
    evidencePreview.src = evidenceDataUrl;
    evidenceWrap.style.display = 'flex';
    hideSaving(); showToast('Evidencia lista.', 'success');
  }catch(err){
    console.error(err); hideSaving();
    resetEvidence();
    showToast('No se pudo procesar la evidencia.', 'error');
  }
}

// listeners (solo una vez; sin duplicados)
evidenceInputGallery?.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  await processEvidenceFile(file);
});
evidenceRemove?.addEventListener('click', resetEvidence);

// =============================
// PREGUNTAS
// =============================
function resetQuestions() {
  ['q1','q2','q3','q4','q5','q6'].forEach(n =>
    document.querySelectorAll(`input[name="${n}"]`).forEach(r => (r.checked = false))
  );
  if (q6Comment) {
    q6Comment.value = '';
    q6Comment.closest('.q6-comment-wrap')?.classList.add('hidden');
  }
}
q6Radios.forEach(r => r.addEventListener('change', () => {
  const wrap = q6Comment?.closest('.q6-comment-wrap');
  const isYes = document.querySelector('input[name="q6"][value="SI"]')?.checked;
  if (isYes) { wrap?.classList.remove('hidden'); if (q6Comment) q6Comment.required = true; }
  else { wrap?.classList.add('hidden'); if (q6Comment) { q6Comment.required = false; q6Comment.value = ''; } }
}));

// =============================
// FUNCIONES AUXILIARES
// =============================
const isOnline = () => navigator.onLine;

// =============================
// ENVÍO → FIREBASE (OFFLINE-FIRST)
// =============================
function makeDocId(payload){
  const rnd = Math.random().toString(36).slice(2,8);
  return `${payload.referenciaQR}_${Date.now()}_${rnd}`;
}

async function uploadAndPatch(docId, path, blob){
  try {
    console.log('Iniciando subida de foto...');
    console.log('  docId:', docId);
    console.log('  path:', path);
    console.log('  blob size:', blob.size, 'bytes');
    console.log('  blob type:', blob.type);
    
    // Si hay sistema de cola offline y NO hay conexión, agregar a cola
    if (photoQueue && !navigator.onLine) {
      console.log('🔌 Sin conexión - Foto agregada a cola offline');
      await photoQueue.addPhoto({
        docId: docId,
        path: path,
        collectionName: FIRE_COLLECTION,
        urlField: 'evidenciaUrl'
      }, blob);
      return; // Completar sin error, la foto se sincronizará después
    }
    
    // Si hay conexión, subir directamente
    const ref = storage.ref().child(path);
    console.log('  ref creado:', ref.fullPath);
    
    console.log('Subiendo blob a Storage...');
    await ref.put(blob, { contentType: blob.type });
    console.log('✓ Blob subido exitosamente');
    
    console.log('Obteniendo URL de descarga...');
    const url = await ref.getDownloadURL();
    console.log('✓ URL obtenida:', url);
    
    console.log('Actualizando documento en Firestore...');
    await db.collection(FIRE_COLLECTION).doc(docId).update({
      evidenciaUrl: url,
      pendingUpload: false,
      reconnectedAt: new Date().toISOString()
    });
    console.log('✓ Documento actualizado');
  } catch (e) {
    console.error('❌ Error al subir foto:');
    console.error('  Code:', e?.code);
    console.error('  Message:', e?.message);
    console.error('  Error completo:', e);
    throw e;
  }
}

async function queueUpload(docId, path, blob){
  // Simplificado: solo subo si hay conexión. Si no, guardo sin foto.
  showToast('Foto no se pudo subir sin conexión. Registro guardado sin evidencia.', 'offline');
}

// Disparadores de sincronización y indicadores UI
const offlineIndicator = document.getElementById('offline-indicator');
const syncIndicator = document.getElementById('sync-indicator');

window.addEventListener('online', async () => {
  console.log('🌐 Conexión recuperada - Iniciando sincronización...');
  if (offlineIndicator) offlineIndicator.style.display = 'none';
  
  if (syncIndicator) syncIndicator.style.display = 'block';
  showToast('Conexión recuperada. Sincronizando...', 'success');
  
  try {
    // Primero sincronizar registros
    console.log('Paso 1: Sincronizando registros offline...');
    await syncOfflineRecords();
    console.log('Paso 1 completado');
    
    // Luego sincronizar fotos
    if (photoQueue) {
      console.log('Paso 2: Sincronizando fotos...');
      await photoQueue.syncQueue();
      console.log('Paso 2 completado');
    }
    
    if (syncIndicator) syncIndicator.style.display = 'none';
    showToast('✅ Sincronización completada.', 'success');
    console.log('✅ Toda la sincronización completada');
  } catch (e) {
    console.error('Error durante sincronización:', e);
    if (syncIndicator) syncIndicator.style.display = 'none';
    showToast('Error en sincronización. Reintentando...', 'error');
  }
});

// Sincronizar todos los registros guardados offline
async function syncOfflineRecords() {
  return new Promise((resolve) => {
    try {
      const dbRequest = indexedDB.open('ronda-offline-db', 1);
      
      dbRequest.onerror = () => {
        console.error('❌ Error abriendo IndexedDB en syncOfflineRecords');
        resolve();
      };
      
      dbRequest.onsuccess = (event) => {
        const db_offline = event.target.result;
        const tx = db_offline.transaction(['pending-records'], 'readonly');
        const store = tx.objectStore('pending-records');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = async () => {
          const records = getAllRequest.result;
          console.log(`🔄 Sincronizando ${records.length} registros offline...`);
          
          if (records.length === 0) {
            console.log('✓ No hay registros para sincronizar');
            resolve();
            return;
          }
          
          let syncedCount = 0;
          let errorCount = 0;
          
          for (const record of records) {
            if (!record.synced) {
              try {
                console.log(`📤 Enviando registro ${syncedCount + 1}/${records.length}: ${record.docId}`);
                
                const baseDoc = {
                  punto: record.payload.puntoMarcacion,
                  referenciaQR: record.payload.referenciaQR,
                  nombreAgente: record.payload.nombreAgente,
                  usuarioId: record.payload.usuarioId || usuarioLogueado,
                  observacion: record.payload.observacion,
                  tipo: record.payload.tipo,
                  preguntas: record.payload.preguntas || {},
                  timerElapsedSeconds: record.payload.timerElapsedSeconds,
                  evidenciaUrl: '',
                  fechaHoraISO: record.payload.fechaHoraISO,
                  createdAt: fb.firestore.FieldValue.serverTimestamp(),
                  meta: record.payload.meta || {},
                  pendingUpload: !!record.payload.fotoDataUrl,
                  synced: true,
                  syncedAt: new Date().toISOString()
                };
                
                // IMPORTANTE: Esperar a que se complete
                await new Promise((promiseResolve, promiseReject) => {
                  db.collection(FIRE_COLLECTION).doc(record.docId).set(baseDoc)
                    .then(() => {
                      console.log(`✓ Registro enviado exitosamente: ${record.docId}`);
                      promiseResolve();
                    })
                    .catch(err => {
                      console.error(`❌ Error enviando ${record.docId}:`, err?.message);
                      promiseReject(err);
                    });
                });
                
                // Marcar como sincronizado en IndexedDB
                const updateTx = db_offline.transaction(['pending-records'], 'readwrite');
                const updateStore = updateTx.objectStore('pending-records');
                record.synced = true;
                
                await new Promise((promiseResolve, promiseReject) => {
                  const putReq = updateStore.put(record);
                  putReq.onsuccess = promiseResolve;
                  putReq.onerror = promiseReject;
                });
                
                syncedCount++;
                console.log(`✅ Registro marcado como sincronizado: ${record.docId}`);
              } catch (e) {
                errorCount++;
                console.error(`❌ Error sincronizando ${record.docId}:`, e?.message);
              }
            }
          }
          
          console.log(`✅ Sincronización completada: ${syncedCount}/${records.length} registros`);
          if (errorCount > 0) {
            console.warn(`⚠️ ${errorCount} registros tuvieron errores - se reintentarán más tarde`);
          }
          resolve();
        };
        
        getAllRequest.onerror = () => {
          console.error('❌ Error leyendo registros de IndexedDB');
          resolve();
        };
      };
    } catch (e) {
      console.error('❌ Error en syncOfflineRecords:', e?.message);
      resolve();
    }
  });
}

window.addEventListener('offline', () => {
  if (offlineIndicator) offlineIndicator.style.display = 'block';
  showToast('Sin conexión. Trabajando offline.', 'offline');
});

formSinNovedad?.addEventListener('submit', async e => {
  e.preventDefault();
  stopTimer();  // Detiene el cronómetro al enviar el formulario
  if (!currentScannedData) return showToast('Primero escanea un punto.', 'error');
  if (!usuarioLogueado) return showToast('Usuario no autenticado.', 'error');

  const payload = buildPayload({
    nombreAgente: usuarioLogueado, 
    observacion: '', 
    tipo: 'SIN NOVEDAD', 
    fotoDataUrl: '', 
    preguntas: {}
  });

  showSaving('Guardando…');
  try {
    await sendToFirebase(payload);
    hideSaving();
    if (isOnline()) {
      showToast('Registro guardado. Foto sincronizando...', 'success');
    } else {
      showToast('Guardado offline. Se sincronizará al volver la red.', 'offline');
    }
    formSinNovedad.reset();
    showUI('scanner'); 
    cameraMsg?.classList.add('active');
  } catch (err) {
    console.error('Error guardando:', err);
    hideSaving();
    showToast('Error al guardar. Intenta nuevamente.', 'error');
  }
});

formConNovedad?.addEventListener('submit', async e => {
  e.preventDefault();
  stopTimer();  // Detiene el cronómetro al enviar el formulario
  if (!currentScannedData) return showToast('Primero escanea un punto.', 'error');
  if (!usuarioLogueado) return showToast('Usuario no autenticado.', 'error');
  
  // Usar el nombre que ya está precargado (no editable)
  const nombreCompleto = document.getElementById('agent-name-con-novedad').value.trim();
  if (!nombreCompleto) return showToast('No se pudo cargar el nombre del usuario.', 'error');
  
  const obs = document.getElementById('observation-text').value.trim();

  const getVal = n => document.querySelector(`input[name="${n}"]:checked`)?.value || '';
  const [p1,p2,p3,p4,p5,p6] = ['q1','q2','q3','q4','q5','q6'].map(getVal);
  if (![p1,p2,p3,p4,p5,p6].every(v => v === 'SI' || v === 'NO'))
    return showToast('Responde todas las preguntas (1–6).', 'error');
  const p6Comentario = (p6 === 'SI') ? q6Comment?.value.trim() : '';

  const payload = buildPayload({
    nombreAgente: nombreCompleto,
    usuarioId: usuarioLogueado,
    observacion: obs,
    tipo: 'CON NOVEDAD',
    fotoDataUrl: evidenceDataUrl,
    preguntas: { p1,p2,p3,p4,p5,p6,p6Comentario }
  });

  showSaving('Guardando…');
  try {
    await sendToFirebase(payload);
    hideSaving();
    if (isOnline()) {
      showToast('Registro guardado. Foto sincronizando...', 'success');
    } else {
      showToast('Guardado offline. Se sincronizará al volver la red.', 'offline');
    }
    formConNovedad.reset(); 
    resetEvidence(); 
    resetQuestions();
    showUI('scanner'); 
    cameraMsg?.classList.add('active');
  } catch (err) {
    console.error('Error guardando:', err);
    hideSaving();
    showToast('Error al guardar. Intenta nuevamente.', 'error');
  }
});

function buildPayload({ nombreAgente, usuarioId, observacion, tipo, fotoDataUrl, preguntas }) {
  return {
    puntoMarcacion: currentScannedData.puntoMarcacion,
    referenciaQR: currentScannedData.referencia,
    fechaHoraISO: new Date().toISOString(),
    nombreAgente, 
    usuarioId: usuarioId || usuarioLogueado,
    observacion, 
    tipo, 
    fotoDataUrl, 
    preguntas,
    timerElapsedSeconds: timerElapsedSeconds,  // Agregar tiempo transcurrido
    meta: {
      ua: navigator.userAgent || '',
      platform: navigator.platform || '',
      lang: navigator.language || 'es',
    }
  };
}

// Guardar registro en IndexedDB como respaldo offline
async function saveToOfflineDB(payload, docId) {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('ronda-offline-db', 1);
      
      request.onerror = () => {
        console.warn('Error abriendo IndexedDB en saveToOfflineDB');
        reject(request.error);
      };
      
      request.onsuccess = (event) => {
        const db_offline = event.target.result;
        const tx = db_offline.transaction(['pending-records'], 'readwrite');
        const store = tx.objectStore('pending-records');
        
        const addRequest = store.add({
          docId: docId,
          payload: payload,
          timestamp: Date.now(),
          synced: false
        });
        
        addRequest.onsuccess = () => {
          console.log('✓ Registro guardado en IndexedDB:', docId);
          resolve();
        };
        
        addRequest.onerror = () => {
          console.warn('Error agregando a IndexedDB:', addRequest.error?.message);
          resolve(); // No rechazar, seguir adelante
        };
      };
    } catch (e) {
      console.warn('Error en saveToOfflineDB:', e?.message);
      reject(e);
    }
  });
}

function sendToFirebase(payload) {
  // RETORNA INMEDIATAMENTE - NO ESPERA
  // Genera docId
  const docId = makeDocId(payload);
  
  // 1) Guardar en IndexedDB como respaldo
  saveToOfflineDB(payload, docId).catch(e => console.error('Fallo IndexedDB:', e));
  
  // 2) Intentar guardar en Firestore SIN ESPERAR
  if (db) {
    const baseDoc = {
      punto: payload.puntoMarcacion,
      referenciaQR: payload.referenciaQR,
      nombreAgente: payload.nombreAgente,
      usuarioId: payload.usuarioId || usuarioLogueado,
      observacion: payload.observacion,
      tipo: payload.tipo,
      preguntas: payload.preguntas || {},
      timerElapsedSeconds: payload.timerElapsedSeconds,
      evidenciaUrl: '',
      fechaHoraISO: payload.fechaHoraISO,
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
      meta: payload.meta || {},
      pendingUpload: !!payload.fotoDataUrl,
      fotoOffline: (!payload.fotoDataUrl) ? false : !isOnline()
    };
    
    // FIRE AND FORGET - No esperamos
    db.collection(FIRE_COLLECTION).doc(docId).set(baseDoc)
      .catch(e => console.warn('Error al guardar en Firestore (será reintentado en sync):', e?.message));
  }

  // 3) Manejo de evidencia EN BACKGROUND
  if (payload.fotoDataUrl && storage) {
    const stamp = Date.now();
    const safeName = (payload.nombreAgente || 'anon').replace(/[^\w.-]+/g, '_');
    const storagePath = `evidencias/${payload.referenciaQR}/${stamp}_${safeName}.jpg`;
    const blob = dataURLtoBlob(payload.fotoDataUrl);

    if (!isOnline()) {
      // Sin conexión: agregar a cola
      if (photoQueue) {
        photoQueue.addPhoto({
          docId: docId,
          path: storagePath,
          collectionName: FIRE_COLLECTION,
          urlField: 'evidenciaUrl'
        }, blob).catch(e => console.error('Error en cola offline:', e));
      }
    } else {
      // Con conexión: subir en background
      uploadAndPatch(docId, storagePath, blob)
        .catch(e => {
          console.error('Error subida foto:', e?.message);
          if (photoQueue) {
            photoQueue.addPhoto({
              docId: docId,
              path: storagePath,
              collectionName: FIRE_COLLECTION,
              urlField: 'evidenciaUrl'
            }, blob).catch(e2 => console.error('Fallback failed:', e2));
          }
        });
    }
  }
  
  // RETORNA INMEDIATAMENTE - La promesa se resuelve al instante
  return Promise.resolve();
}

// Versión no-await de upload y patch
async function uploadAndPatchBackground(docId, storagePath, blob) {
  try {
    const ref = storage.ref().child(storagePath);
    await ref.put(blob, { contentType: blob.type });
    const url = await ref.getDownloadURL();
    await db.collection(FIRE_COLLECTION).doc(docId).update({
      evidenciaUrl: url,
      pendingUpload: false,
      reconectadoEn: new Date().toISOString()
    });
    console.log('✓ Foto sincronizada en background:', docId);
  } catch (e) {
    console.error('Error background:', e?.message);
  }
}

// =============================
// TOAST
// =============================
function showToast(msg, type = 'info') {
  if (!statusToast) return alert(msg);
  statusToast.textContent = msg;
  statusToast.className = `show ${type}`;
  setTimeout(() => (statusToast.className = statusToast.className.replace('show', '')), 3000);
}

// =============================
// AUTENTICACIÓN
// =============================
if (auth) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // Si no hay usuario logueado, redirigir al login
      window.location.href = 'index.html';
      return;
    }
    // Guardar el email del usuario logueado (sin @liderman.com.pe)
    usuarioLogueado = user.email ? user.email.split('@')[0] : user.uid;
    console.log('Usuario logueado:', usuarioLogueado);
    
    // Cargar el nombre completo desde Firestore
    try {
      const userDoc = await db.collection('USUARIOS').doc(usuarioLogueado).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const nombreCompleto = `${userData.NOMBRES || ''} ${userData.APELLIDOS || ''}`.trim();
        // Mostrar el nombre en el formulario
        const nombreField = document.getElementById('agent-name-con-novedad');
        if (nombreField) {
          nombreField.value = nombreCompleto;
          nombreField.disabled = true; // No editable
        }
        console.log('Nombre del usuario:', nombreCompleto);
      } else {
        console.warn('Documento de usuario no existe:', usuarioLogueado);
        // Usar el email del usuario como fallback
        const nombreField = document.getElementById('agent-name-con-novedad');
        if (nombreField) {
          nombreField.value = usuarioLogueado;
          nombreField.disabled = true;
        }
      }
    } catch (e) {
      console.warn('No se pudo cargar el nombre del usuario desde Firestore:', e?.message);
      // FALLBACK: Usar el email del usuario cuando está offline o falla Firestore
      const nombreField = document.getElementById('agent-name-con-novedad');
      if (nombreField) {
        nombreField.value = usuarioLogueado;
        nombreField.disabled = true;
      }
    }
    
    // Iniciar la UI solo después de autenticar
    showUI('scanner');
    cameraMsg?.classList.add('active');  // Mostrar "INICIAR RONDAS"
  });
} else {
  console.error('Auth no está disponible');
}
