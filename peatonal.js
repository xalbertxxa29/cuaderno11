// peatonal.js v52 — Acceso Peatonal (offline OK)
// ✅ OFFLINE SUPPORT: saveToOfflineDB, syncOfflineRecords, polling

// ===================== FUNCIONES OFFLINE =====================
function saveToOfflineDB(payload, docId, collectionName = 'acceso-peatonal') {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('peatonal-offline-db', 1);
      
      request.onerror = () => {
        console.warn('❌ Error abriendo IndexedDB en saveToOfflineDB');
        reject(request.error);
      };
      
      request.onupgradeneeded = (event) => {
        const db_offline = event.target.result;
        if (!db_offline.objectStoreNames.contains('pending-records')) {
          db_offline.createObjectStore('pending-records', { keyPath: 'id', autoIncrement: true });
        }
      };
      
      request.onsuccess = (event) => {
        const db_offline = event.target.result;
        const tx = db_offline.transaction(['pending-records'], 'readwrite');
        const store = tx.objectStore('pending-records');
        
        const addRequest = store.add({
          docId: docId,
          payload: payload,
          timestamp: Date.now(),
          synced: false,
          collectionName: collectionName
        });
        
        addRequest.onsuccess = () => {
          console.log('✓ Acceso peatonal guardado en IndexedDB:', docId);
          resolve();
        };
        
        addRequest.onerror = () => {
          console.warn('Error agregando a IndexedDB:', addRequest.error?.message);
          resolve();
        };
      };
    } catch (e) {
      console.warn('Error en saveToOfflineDB:', e?.message);
      reject(e);
    }
  });
}

async function syncOfflineRecords() {
  return new Promise((resolve) => {
    try {
      const dbRequest = indexedDB.open('peatonal-offline-db', 1);
      
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
          console.log(`🔄 Sincronizando ${records.length} accesos peatonales offline...`);
          
          if (records.length === 0) {
            console.log('✓ No hay accesos para sincronizar');
            resolve();
            return;
          }
          
          let syncedCount = 0;
          
          for (const record of records) {
            if (!record.synced) {
              try {
                console.log(`📤 Enviando acceso peatonal ${syncedCount + 1}/${records.length}: ${record.docId}`);
                
                // Enviar a Firestore
                await new Promise((promiseResolve, promiseReject) => {
                  db.collection('ACCESO_PEATONAL').doc(record.docId).set(record.payload)
                    .then(() => {
                      console.log(`✓ Acceso peatonal enviado exitosamente: ${record.docId}`);
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
                record.syncedAt = new Date().toISOString();
                
                await new Promise((promiseResolve, promiseReject) => {
                  const putReq = updateStore.put(record);
                  putReq.onsuccess = promiseResolve;
                  putReq.onerror = promiseReject;
                });
                
                syncedCount++;
              } catch (e) {
                console.error(`⚠️ No se pudo sincronizar ${record.docId}:`, e?.message);
              }
            }
          }
          
          console.log(`✅ Sincronización completada: ${syncedCount}/${records.length} accesos`);
          resolve();
        };
        
        getAllRequest.onerror = () => {
          console.error('Error leyendo pending-records:', getAllRequest.error);
          resolve();
        };
      };
    } catch (e) {
      console.error('Error en syncOfflineRecords:', e);
      resolve();
    }
  });
}

// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  const $ = s => document.querySelector(s);
  const form = $('#peatonal-form');
  const tipoAcceso = $('#tipoAcceso');
  const empresa = $('#empresa');
  const tipoDocumento = $('#tipoDocumento');
  const numeroDocumento = $('#numeroDocumento');
  const nombres = $('#nombres');
  const motivo = $('#motivo');
  const area = $('#area');
  const docHelp = $('#docHelp');

  // Estado de sesión → para tomar CLIENTE/UNIDAD/USUARIO
  let userCtx = { id: '', cliente: '', unidad: '' };

  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    try {
      const id = user.email.split('@')[0];
      const snap = await db.collection('USUARIOS').doc(id).get();
      if (snap.exists) {
        const d = snap.data();
        userCtx = { id, cliente: d.CLIENTE || '', unidad: d.UNIDAD || '' };
      } else {
        userCtx = { id, cliente: '', unidad: '' };
      }
    } catch (e) { console.error(e); }
  });

  // Reglas del documento según tipo
  function applyDocRules() {
    if (tipoDocumento.value === 'DNI') {
      numeroDocumento.value = numeroDocumento.value.replace(/\D/g, '').slice(0, 8);
      numeroDocumento.setAttribute('maxlength','8');
      numeroDocumento.setAttribute('minlength','8');
      numeroDocumento.setAttribute('inputmode','numeric');
      numeroDocumento.setAttribute('pattern','^[0-9]{8}$');
      docHelp.textContent = 'DNI: exactamente 8 dígitos.';
    } else if (tipoDocumento.value === 'PASAPORTE') {
      numeroDocumento.value = numeroDocumento.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
      numeroDocumento.setAttribute('maxlength','9');
      numeroDocumento.setAttribute('minlength','9');
      numeroDocumento.setAttribute('inputmode','text');
      numeroDocumento.setAttribute('pattern','^[A-Z0-9]{9}$');
      docHelp.textContent = 'PASAPORTE: exactamente 9 caracteres alfanuméricos.';
    } else {
      numeroDocumento.removeAttribute('maxlength');
      numeroDocumento.removeAttribute('minlength');
      numeroDocumento.removeAttribute('pattern');
      docHelp.textContent = 'Para DNI: 8 dígitos. Para PASAPORTE: 9 alfanuméricos.';
    }
  }

  tipoDocumento.addEventListener('change', applyDocRules);
  numeroDocumento.addEventListener('input', applyDocRules);

  // Uppercase helpers (solo letras)
  const toUpperIfText = v => (v ?? '').toString().toUpperCase().trim();

  // Enviar
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validaciones básicas
    if (!tipoAcceso.value || !empresa.value || !tipoDocumento.value || !numeroDocumento.value ||
        !nombres.value || !motivo.value || !area.value) {
      UI.alert('Campos incompletos', 'Todos los campos son obligatorios.'); return;
    }
    // Reglas de documento
    applyDocRules();
    const pat = new RegExp(numeroDocumento.getAttribute('pattern') || '.*');
    if (!pat.test(numeroDocumento.value)) {
      UI.alert('N° Documento inválido', docHelp.textContent); return;
    }

    // Fecha/hora local (requerido)
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const fechaIngreso = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const horaIngreso  = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const docId = `acceso_peatonal_${Date.now()}`;

    const payload = {
      TIPO_ACCESO: toUpperIfText(tipoAcceso.value),
      EMPRESA: toUpperIfText(empresa.value),
      TIPO_DOCUMENTO: toUpperIfText(tipoDocumento.value),
      NUMERO_DOCUMENTO: tipoDocumento.value === 'DNI'
        ? numeroDocumento.value // 8 dígitos
        : numeroDocumento.value.toUpperCase(), // 9 alfanum
      NOMBRES_COMPLETOS: toUpperIfText(nombres.value),
      MOTIVO: toUpperIfText(motivo.value),
      AREA: toUpperIfText(area.value),

      ESTADO: 'ABIERTO',
      FECHA_INGRESO: fechaIngreso,
      HORA_INGRESO: horaIngreso,
      FECHA_SALIDA: '',
      HORA_FIN: '',
      ESTADIA: '',

      CLIENTE: toUpperIfText(userCtx.cliente),
      UNIDAD: toUpperIfText(userCtx.unidad),
      USUARIO_ID: toUpperIfText(userCtx.id),

      timestamp: new Date().toISOString(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    UI.showOverlay('Guardando…');
    try {
      // 💾 Guardar OFFLINE primero
      await saveToOfflineDB(payload, docId, 'ACCESO_PEATONAL');

      // 🌐 Intentar guardar a Firebase (sin esperar si está offline)
      if (navigator.onLine) {
        try {
          await db.collection('ACCESO_PEATONAL').doc(docId).set(payload);
          console.log('✓ Acceso peatonal enviado a Firebase:', docId);
        } catch (firebaseErr) {
          console.warn('⚠️ Error enviando a Firebase, guardado solo offline:', firebaseErr?.message);
        }
      } else {
        console.log('🔌 Offline detectado, acceso guardado offline. Se sincronizará cuando vuelva la conexión.');
      }

      UI.hideOverlay();
      UI.alert('Éxito', navigator.onLine 
        ? 'Registro guardado correctamente.' 
        : 'Registro guardado offline. Se sincronizará cuando vuelva la conexión.', 
        () => {
          window.location.href = 'menu.html';
        }
      );
    } catch (err) {
      console.error(err);
      UI.hideOverlay();
      UI.alert('Error', 'No se pudo guardar. Intente nuevamente.');
    }
  });

  // ===================== POLLING PARA DETECTAR CONEXIÓN =====================
  let lastOnlineState = navigator.onLine;
  setInterval(() => {
    const currentOnlineState = navigator.onLine;
    
    // Detectar cambio de offline a online
    if (!lastOnlineState && currentOnlineState) {
      console.log('🌐 Cambio detectado: Pasó de OFFLINE a ONLINE');
      lastOnlineState = true;
      
      (async () => {
        try {
          console.log('Sincronizando accesos peatonales offline...');
          await syncOfflineRecords();
          console.log('✅ Sincronización completada');
        } catch (e) {
          console.error('Error durante sincronización:', e);
        }
      })();
    } 
    // Detectar cambio de online a offline
    else if (lastOnlineState && !currentOnlineState) {
      console.log('🔌 Cambio detectado: Pasó de ONLINE a OFFLINE');
      lastOnlineState = false;
    }
  }, 2000); // Verificar cada 2 segundos

  // También escuchar eventos nativos (para navegadores de escritorio)
  window.addEventListener('online', async () => {
    console.log('🌐 Evento "online" detectado (navegador)');
    lastOnlineState = true;
    
    try {
      console.log('Sincronizando accesos peatonales offline...');
      await syncOfflineRecords();
      console.log('✅ Sincronización completada');
    } catch (e) {
      console.error('Error durante sincronización:', e);
    }
  });
});

