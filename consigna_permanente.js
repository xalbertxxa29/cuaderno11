// consigna_permanente.js (v52) — Guarda registradoPor y puesto. Offline-friendly.
// ✅ OFFLINE SUPPORT: saveToOfflineDB, syncOfflineRecords, polling

// ===================== FUNCIONES OFFLINE =====================
function saveToOfflineDB(payload, docId, collectionName = 'consignas') {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('consignas-offline-db', 1);
      
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
          console.log('✓ Consigna guardada en IndexedDB:', docId);
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
      const dbRequest = indexedDB.open('consignas-offline-db', 1);
      
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
          console.log(`🔄 Sincronizando ${records.length} consignas permanentes offline...`);
          
          if (records.length === 0) {
            console.log('✓ No hay consignas para sincronizar');
            resolve();
            return;
          }
          
          let syncedCount = 0;
          
          for (const record of records) {
            if (!record.synced) {
              try {
                console.log(`📤 Enviando consigna ${syncedCount + 1}/${records.length}: ${record.docId}`);
                
                // Enviar a Firestore
                await new Promise((promiseResolve, promiseReject) => {
                  db.collection('CONSIGNAS_PERMANENTES').doc(record.docId).set(record.payload)
                    .then(() => {
                      console.log(`✓ Consigna enviada exitosamente: ${record.docId}`);
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
          
          console.log(`✅ Sincronización completada: ${syncedCount}/${records.length} consignas`);
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
  const auth    = firebase.auth();
  const db      = firebase.firestore();
  const storage = firebase.storage();

  const UX = {
    show: (m) => (window.UI && UI.showOverlay) ? UI.showOverlay(m) : void 0,
    hide: () => (window.UI && UI.hideOverlay) ? UI.hideOverlay() : void 0,
    alert: (t, m, cb) => (window.UI && UI.alert) ? UI.alert(t, m, cb) : (alert(`${t}\n\n${m||''}`), cb && cb())
  };

  // DOM
  const form        = document.getElementById('consigna-permanente-form');
  const tituloEl    = document.getElementById('titulo');
  const descripcionEl = document.getElementById('descripcion');
  const fotoInput   = document.getElementById('foto-input');
  const fotoPreview = document.getElementById('foto-preview');
  const canvas      = document.getElementById('firma-canvas');
  const clearBtn    = document.getElementById('clear-firma');

  // Firma
  const sigPad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
  function resizeCanvas() {
    const r = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * r;
    canvas.height = canvas.offsetHeight * r;
    canvas.getContext('2d').scale(r, r);
    sigPad.clear();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  clearBtn?.addEventListener('click', () => sigPad.clear());

  // Imagen
  let pendingPhoto = null;
  fotoInput?.addEventListener('change', async () => {
    const f = fotoInput.files && fotoInput.files[0];
    if (!f) { pendingPhoto=null; fotoPreview.hidden=true; fotoPreview.src=''; return; }
    try {
      UX.show('Procesando imagen…');
      const opt = { maxSizeMB:0.5, maxWidthOrHeight:1280, useWebWorker:true, fileType:'image/jpeg' };
      pendingPhoto = await imageCompression(f, opt);
      fotoPreview.src = URL.createObjectURL(pendingPhoto);
      fotoPreview.hidden = false;
    } catch (e) {
      console.error(e);
      UX.alert('Aviso','No se pudo procesar la imagen.');
      pendingPhoto = null; fotoPreview.hidden = true; fotoPreview.src = '';
    } finally { UX.hide(); }
  });

  // Utils
  function dataURLtoBlob(u){
    const a=u.split(','),m=a[0].match(/:(.*?);/)[1];
    const b=atob(a[1]);let n=b.length;const x=new Uint8Array(n);
    while(n--)x[n]=b.charCodeAt(n);
    return new Blob([x],{type:m});
  }
  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(blob);
  });
  async function uploadTo(p,blob){
    const ref=storage.ref().child(p);
    await ref.put(blob);
    return await ref.getDownloadURL();
  }

  // Perfil
  let profile = null;
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href='index.html'; return; }
    const userId = user.email.split('@')[0];
    const doc = await db.collection('USUARIOS').doc(userId).get().catch(()=>null);
    if (!doc || !doc.exists) { UX.alert('Error','No se encontró tu perfil.'); window.location.href='menu.html'; return; }
    profile = doc.data(); // { CLIENTE, UNIDAD, PUESTO, NOMBRES, APELLIDOS, ... }
  });

  // Guardar
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = (tituloEl.value||'').trim();
    const descripcion = (descripcionEl.value||'').trim();
    if (!titulo || !descripcion) { UX.alert('Aviso','Completa título y descripción.'); return; }
    if (!profile) { UX.alert('Error','Perfil no cargado.'); return; }

    UX.show('Guardando consigna…');
    try {
      const { CLIENTE, UNIDAD, PUESTO, NOMBRES, APELLIDOS } = profile;
      const stamp = Date.now();
      const docId = `consigna_permanente_${stamp}`;

      let fotoURL=null, fotoEmbedded=null;
      if (pendingPhoto) {
        try {
          if (!navigator.onLine) throw new Error('offline');
          fotoURL = await uploadTo(`consignas/permanente/${CLIENTE}/${UNIDAD}/${stamp}_foto.jpg`, pendingPhoto);
        } catch {
          fotoEmbedded = await blobToDataURL(pendingPhoto);
        }
      }

      let firmaURL=null, firmaEmbedded=null;
      if (!sigPad.isEmpty()) {
        const firmaBlob = dataURLtoBlob(sigPad.toDataURL('image/png'));
        try {
          if (!navigator.onLine) throw new Error('offline');
          firmaURL = await uploadTo(`consignas/permanente/${CLIENTE}/${UNIDAD}/${stamp}_firma.png`, firmaBlob);
        } catch {
          firmaEmbedded = await blobToDataURL(firmaBlob);
        }
      }

      // 📦 Construir payload
      const payload = {
        cliente: CLIENTE,
        unidad: UNIDAD,
        puesto: PUESTO || null,
        registradoPor: `${NOMBRES||''} ${APELLIDOS||''}`.trim(),
        titulo,
        descripcion,
        timestamp: new Date().toISOString(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(fotoURL ? { fotoURL } : {}),
        ...(firmaURL ? { firmaURL } : {}),
        ...(fotoEmbedded ? { fotoEmbedded } : {}),
        ...(firmaEmbedded ? { firmaEmbedded } : {}),
      };

      // 💾 Guardar OFFLINE primero
      await saveToOfflineDB(payload, docId, 'CONSIGNA_PERMANENTE');

      // 🌐 Intentar guardar a Firebase (sin esperar si está offline)
      if (navigator.onLine) {
        try {
          await db.collection('CONSIGNA_PERMANENTE').doc(docId).set(payload);
          console.log('✓ Consigna enviada a Firebase:', docId);
        } catch (firebaseErr) {
          console.warn('⚠️ Error enviando a Firebase, guardado solo offline:', firebaseErr?.message);
        }
      } else {
        console.log('🔌 Offline detectado, consigna guardada offline. Se sincronizará cuando vuelva la conexión.');
      }

      UX.hide();
      UX.alert('Éxito', navigator.onLine 
        ? 'Consigna permanente guardada.' 
        : 'Consigna guardada offline. Se sincronizará cuando vuelva la conexión.', 
        () => window.location.href='menu.html'
      );
    } catch (err) {
      console.error(err);
      UX.hide();
      UX.alert('Error', err.message || 'No se pudo guardar la consigna.');
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
          console.log('Sincronizando consignas permanentes offline...');
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
      console.log('Sincronizando consignas permanentes offline...');
      await syncOfflineRecords();
      console.log('✅ Sincronización completada');
    } catch (e) {
      console.error('Error durante sincronización:', e);
    }
  });
});

