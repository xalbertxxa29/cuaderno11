// consigna_temporal.js (v52) — robusto y a prueba de ids distintos
// ✅ OFFLINE SUPPORT: saveToOfflineDB, syncOfflineRecords, polling

// ===================== FUNCIONES OFFLINE =====================
function saveToOfflineDB(payload, docId, collectionName = 'consignas') {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('consignas-temporal-offline-db', 1);
      
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
          console.log('✓ Consigna temporal guardada en IndexedDB:', docId);
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
      const dbRequest = indexedDB.open('consignas-temporal-offline-db', 1);
      
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
          console.log(`🔄 Sincronizando ${records.length} consignas temporales offline...`);
          
          if (records.length === 0) {
            console.log('✓ No hay consignas temporales para sincronizar');
            resolve();
            return;
          }
          
          let syncedCount = 0;
          
          for (const record of records) {
            if (!record.synced) {
              try {
                console.log(`📤 Enviando consigna temporal ${syncedCount + 1}/${records.length}: ${record.docId}`);
                
                // Enviar a Firestore
                await new Promise((promiseResolve, promiseReject) => {
                  db.collection('CONSIGNAS_TEMPORAL').doc(record.docId).set(record.payload)
                    .then(() => {
                      console.log(`✓ Consigna temporal enviada exitosamente: ${record.docId}`);
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
          
          console.log(`✅ Sincronización completada: ${syncedCount}/${records.length} consignas temporales`);
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
  // ---------- Firebase ----------
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth    = firebase.auth();
  const db      = firebase.firestore();
  const storage = firebase.storage();

  // ---------- UI helpers ----------
  const UX = {
    show: (m) => (window.UI && UI.showOverlay) ? UI.showOverlay(m) : void 0,
    hide: () => (window.UI && UI.hideOverlay) ? UI.hideOverlay() : void 0,
    alert: (t, m, cb) => (window.UI && UI.alert) ? UI.alert(t, m, cb) : (alert(`${t||'Aviso'}\n\n${m||''}`), cb && cb()),
  };

  // ---------- DOM safe getters ----------
  const $ = (sel) => document.querySelector(sel);
  const byId = (...ids) => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  };

  // Intenta múltiples ids comunes para cada campo
  const form            = byId('consigna-temporal-form','consigna_form','consignaTemporalForm') || $('form');
  const tituloEl        = byId('titulo','titulo-temporal','titulo_input');
  const descripcionEl   = byId('descripcion','descripcion-temporal','descripcion_input','comentario');
  const inicioEl        = byId('inicio','fecha-inicio','fechaInicio','inicio_input');
  const finEl           = byId('fin','fecha-fin','fechaFin','fin_input');
  const fotoInput       = byId('foto-input','foto','foto_temporal','fotoInput');
  const fotoPreview     = byId('foto-preview','preview','preview-img');
  const canvas          = byId('firma-canvas','canvas-firma','firma');
  const clearBtn        = byId('clear-firma','limpiar-firma','btnClearFirma');

  // Validación de elementos críticos
  function need(el, name) {
    if (!el) throw new Error(`Falta el campo/elemento: ${name}. Verifica el id en consigna_temporal.html`);
    return el;
  }
  need(form,'formulario');
  need(tituloEl,'Título');
  need(descripcionEl,'Descripción');
  need(inicioEl,'Fecha de inicio');
  need(finEl,'Fecha de fin');
  need(canvas,'Canvas de firma');

  // ---------- Firma ----------
  const sigPad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });

  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const cssH = parseFloat(getComputedStyle(canvas).height) || 200;
    const cssW = canvas.clientWidth || canvas.offsetWidth || 300;
    canvas.width  = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);
    canvas.getContext('2d').scale(ratio, ratio);
    sigPad.clear();
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 60);
  clearBtn && clearBtn.addEventListener('click', () => sigPad.clear());

  // ---------- Foto opcional ----------
  let pendingPhoto = null;
  fotoInput && fotoInput.addEventListener('change', async () => {
    const f = fotoInput.files && fotoInput.files[0];
    if (!f) { pendingPhoto=null; if (fotoPreview){ fotoPreview.hidden=true; fotoPreview.src=''; } return; }
    try{
      UX.show('Procesando imagen…');
      const opt = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/jpeg' };
      pendingPhoto = await imageCompression(f, opt);
      if (fotoPreview){ fotoPreview.src = URL.createObjectURL(pendingPhoto); fotoPreview.hidden = false; }
    } catch(e){
      console.error(e);
      pendingPhoto = null;
      if (fotoPreview){ fotoPreview.hidden=true; fotoPreview.src=''; }
      UX.alert('Aviso', 'No se pudo procesar la imagen seleccionada.');
    } finally { UX.hide(); }
  });

  // ---------- Utils ----------
  function dataURLtoBlob(u){
    const a=u.split(','),m=a[0].match(/:(.*?);/)[1];
    const b=atob(a[1]);let n=b.length;const x=new Uint8Array(n);
    while(n--)x[n]=b.charCodeAt(n);
    return new Blob([x],{type:m});
  }
  function blobToDataURL(blob){
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  async function uploadTo(p, blob){
    const ref = storage.ref().child(p);
    await ref.put(blob);
    return await ref.getDownloadURL();
  }

  // dd/mm/yyyy o yyyy-mm-dd -> Date a las 00:00
  function parseDateInput(val){
    const s = String(val || '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
    const d = new Date(s);
    return isNaN(d) ? null : new Date(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00`);
  }

  // ---------- Sesión ----------
  let profile = null;
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    const userId = user.email.split('@')[0];
    const doc = await db.collection('USUARIOS').doc(userId).get().catch(()=>null);
    if (!doc || !doc.exists) { UX.alert('Error','No se encontró tu perfil.', () => window.location.href='menu.html'); return; }
    profile = doc.data();
  });

  // ---------- Guardar ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titulo = (tituloEl.value || '').trim();
    const descripcion = (descripcionEl.value || '').trim();
    const ini = parseDateInput(inicioEl.value);
    const fin = parseDateInput(finEl.value);

    if (!titulo) return UX.alert('Aviso','Ingresa el título.');
    if (!descripcion) return UX.alert('Aviso','Ingresa la descripción.');
    if (!ini || !fin) return UX.alert('Aviso','Revisa las fechas de inicio y fin.');
    if (fin < ini)  return UX.alert('Aviso','La fecha de fin no puede ser menor a la de inicio.');

    if (!profile) return UX.alert('Error','Tu perfil no está cargado todavía. Intenta de nuevo.');

    UX.show('Guardando consigna temporal…');

    try {
      const { CLIENTE, UNIDAD, PUESTO, NOMBRES, APELLIDOS } = profile || {};
      const registradoPor = `${NOMBRES || ''} ${APELLIDOS || ''}`.trim() || null;
      const stamp = Date.now();
      const docId = `consigna_temporal_${stamp}`;

      // Foto
      let fotoURL = null, fotoEmbedded = null;
      if (pendingPhoto) {
        try {
          if (!navigator.onLine) throw new Error('offline');
          fotoURL = await uploadTo(`consignas/temporal/${CLIENTE}/${UNIDAD}/${stamp}_foto.jpg`, pendingPhoto);
        } catch {
          fotoEmbedded = await blobToDataURL(pendingPhoto);
        }
      }

      // Firma
      let firmaURL = null, firmaEmbedded = null;
      if (!sigPad.isEmpty()) {
        const firmaBlob = dataURLtoBlob(sigPad.toDataURL('image/png'));
        try {
          if (!navigator.onLine) throw new Error('offline');
          firmaURL = await uploadTo(`consignas/temporal/${CLIENTE}/${UNIDAD}/${stamp}_firma.png`, firmaBlob);
        } catch {
          firmaEmbedded = await blobToDataURL(firmaBlob);
        }
      }

      // 📦 Construir payload
      const payload = {
        cliente: CLIENTE,
        unidad: UNIDAD,
        puesto: PUESTO || null,
        registradoPor,
        titulo,
        descripcion,
        inicio: ini,
        fin: fin,
        timestamp: new Date().toISOString(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(fotoURL ? { fotoURL } : {}),
        ...(firmaURL ? { firmaURL } : {}),
        ...(fotoEmbedded ? { fotoEmbedded } : {}),
        ...(firmaEmbedded ? { firmaEmbedded } : {}),
      };

      // 💾 Guardar OFFLINE primero
      await saveToOfflineDB(payload, docId, 'CONSIGNA_TEMPORAL');

      // 🌐 Intentar guardar a Firebase (sin esperar si está offline)
      if (navigator.onLine) {
        try {
          await db.collection('CONSIGNA_TEMPORAL').doc(docId).set(payload);
          console.log('✓ Consigna temporal enviada a Firebase:', docId);
        } catch (firebaseErr) {
          console.warn('⚠️ Error enviando a Firebase, guardado solo offline:', firebaseErr?.message);
        }
      } else {
        console.log('🔌 Offline detectado, consigna temporal guardada offline. Se sincronizará cuando vuelva la conexión.');
      }

      UX.hide();
      UX.alert('Éxito', navigator.onLine 
        ? 'Consigna temporal guardada.' 
        : 'Consigna guardada offline. Se sincronizará cuando vuelva la conexión.', 
        () => window.location.href='menu.html'
      );
    } catch (err) {
      console.error(err);
      UX.hide();
      UX.alert('Error', err.message || 'No fue posible guardar la consigna temporal.');
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
          console.log('Sincronizando consignas temporales offline...');
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
      console.log('Sincronizando consignas temporales offline...');
      await syncOfflineRecords();
      console.log('✅ Sincronización completada');
    } catch (e) {
      console.error('Error durante sincronización:', e);
    }
  });
});

