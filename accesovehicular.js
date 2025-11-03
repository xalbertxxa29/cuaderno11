// accesovehicular.js (v63)
// Acceso Vehicular - Guardado con soporte offline + cámara + compresión
// Requiere: Firebase compat (app/auth/firestore/storage) + browser-image-compression

let db, auth, storage;

/* ===================== OFFLINE HELPERS (IndexedDB) ===================== */
function saveToOfflineDB(payload, docId, collectionName = 'acceso-vehicular') {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('vehicular-offline-db', 1);

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
          docId,
          payload,
          timestamp: Date.now(),
          synced: false,
          collectionName
        });

        addRequest.onsuccess = () => {
          console.log('✓ Acceso vehicular guardado en IndexedDB:', docId);
          resolve();
        };
        addRequest.onerror = () => {
          console.warn('Error agregando a IndexedDB:', addRequest.error?.message);
          resolve(); // no bloqueamos el flujo
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
      const dbRequest = indexedDB.open('vehicular-offline-db', 1);

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
          const records = getAllRequest.result || [];
          console.log(`🔄 Sincronizando ${records.length} accesos vehiculares offline...`);
          if (!records.length) return resolve();

          let syncedCount = 0;
          for (const record of records) {
            if (record.synced) continue;
            try {
              await db.collection('ACCESO_VEHICULAR').doc(record.docId).set(record.payload);
              const uTx = db_offline.transaction(['pending-records'], 'readwrite');
              const uStore = uTx.objectStore('pending-records');
              record.synced = true;
              record.syncedAt = new Date().toISOString();
              await new Promise((res, rej) => {
                const putReq = uStore.put(record);
                putReq.onsuccess = res;
                putReq.onerror = rej;
              });
              syncedCount++;
            } catch (e) {
              console.error(`⚠️ No se pudo sincronizar ${record.docId}:`, e?.message);
            }
          }
          console.log(`✅ Sincronización completada: ${syncedCount}/${records.length}`);
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

/* ===================== INICIALIZAR FIREBASE ===================== */
async function inicializarFirebase() {
  return new Promise((resolve) => {
    let checks = 0;
    const chequear = () => {
      checks++;
      console.log(`[${checks}/100] Firebase: ${!!window.firebase}, Config: ${!!window.firebaseConfig}`);
      if (window.firebase && window.firebaseConfig) {
        try {
          if (!window.firebase.apps.length) window.firebase.initializeApp(window.firebaseConfig);
          db = window.firebase.firestore();
          auth = window.firebase.auth();
          storage = window.firebase.storage();
          console.log('✅ Firebase inicializado correctamente');
          resolve(true);
        } catch (e) {
          console.error('❌', e);
          alert('Error: ' + e.message);
          resolve(false);
        }
      } else if (checks < 100) {
        setTimeout(chequear, 100);
      } else {
        console.error('❌ Firebase o config no disponibles después de 10 segundos');
        alert('Error: Firebase no se cargó. Recarga la página.');
        resolve(false);
      }
    };
    chequear();
  });
}

/* ===================== UTILIDADES ===================== */
const UX = {
  show: (m) => (window.UI && UI.showOverlay) ? UI.showOverlay(m) : void 0,
  hide: () => (window.UI && UI.hideOverlay) ? UI.hideOverlay() : void 0,
  alert: (t, m, cb) => (window.UI && UI.alert) ? UI.alert(t, m, cb) : (alert(`${t}\n\n${m||''}`), cb && cb())
};

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function uploadTo(path, blob) {
  const ref = storage.ref().child(path);
  await ref.put(blob);
  return await ref.getDownloadURL();
}

async function safeUploadOrEmbed(path, blob) {
  try {
    if (!navigator.onLine) throw new Error('offline');
    return { url: await uploadTo(path, blob), embedded: null };
  } catch {
    return { url: null, embedded: await blobToDataURL(blob) };
  }
}

/* ===================== DOM & EVENTOS ===================== */
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await inicializarFirebase();
  if (!ok) return;

  // DOM
  const form               = document.getElementById('acceso-form');
  const placaInput         = document.getElementById('placa');
  const marcaInput         = document.getElementById('marca');
  const modeloInput        = document.getElementById('modelo');
  const dniInput           = document.getElementById('dni');
  const nombresInput       = document.getElementById('nombres');
  const observacionesInput = document.getElementById('observaciones');
  const fotoInput          = document.getElementById('foto-input');
  const fotoPreview        = document.getElementById('foto-preview');
  const btnCamera          = document.getElementById('btn-camera');

  // FOTO - compresión segura (fallback si no carga la librería)
  async function compressImage(fileOrBlob) {
    try {
      if (typeof imageCompression === 'function') {
        const opt = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/jpeg', initialQuality: 0.8 };
        return await imageCompression(fileOrBlob, opt);
      }
      console.warn('imageCompression no disponible: se usa la imagen sin comprimir.');
      return fileOrBlob;
    } catch (e) {
      console.warn('Fallo al comprimir, se usa original:', e?.message);
      return fileOrBlob;
    }
  }

  let pendingPhoto = null;

  fotoInput?.addEventListener('change', async () => {
    const f = fotoInput.files && fotoInput.files[0];
    if (!f) { pendingPhoto = null; fotoPreview.hidden = true; fotoPreview.src = ''; return; }
    UX.show('Procesando imagen…');
    try {
      pendingPhoto = await compressImage(f);
      // Limpia URL previa si existiera
      if (fotoPreview.src) { try { URL.revokeObjectURL(fotoPreview.src); } catch {} }
      fotoPreview.src = URL.createObjectURL(pendingPhoto);
      fotoPreview.hidden = false;
    } catch (e) {
      console.error(e);
      pendingPhoto = null; fotoPreview.hidden = true; fotoPreview.src = '';
      UX.alert('Aviso', 'No se pudo procesar la imagen.');
    } finally { UX.hide(); }
  });

  // Cámara
  btnCamera?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      video.srcObject = stream;
      video.playsInline = true;  // iOS
      video.muted = true;
      await video.play();

      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(0, 0, 0, .8);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        z-index: 10000; padding: 20px;
      `;

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex; gap:10px; margin-top:20px;';

      const btnCapture = document.createElement('button');
      btnCapture.textContent = '📸 Capturar';
      btnCapture.style.cssText = 'background:#007bff;color:#fff;border:0;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:bold;';

      const btnCancel = document.createElement('button');
      btnCancel.textContent = '✕ Cancelar';
      btnCancel.style.cssText = 'background:#6c757d;color:#fff;border:0;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:bold;';

      const cleanup = () => { try { stream.getTracks().forEach(t => t.stop()); } catch {} modal.remove(); };

      btnCapture.onclick = () => {
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          cleanup();
          UX.show('Procesando imagen…');
          try {
            pendingPhoto = await compressImage(blob);
            if (fotoPreview.src) { try { URL.revokeObjectURL(fotoPreview.src); } catch {} }
            fotoPreview.src = URL.createObjectURL(pendingPhoto);
            fotoPreview.hidden = false;
          } catch (e) {
            console.error(e);
            UX.alert('Aviso', 'No se pudo procesar la imagen.');
          } finally { UX.hide(); }
        }, 'image/jpeg', 0.9);
      };

      btnCancel.onclick = cleanup;

      modal.appendChild(video);
      btns.appendChild(btnCapture);
      btns.appendChild(btnCancel);
      modal.appendChild(btns);
      document.body.appendChild(modal);
    } catch (e) {
      console.error(e);
      UX.alert('Aviso', 'No se pudo acceder a la cámara.');
    }
  });

  // Perfil de usuario
  let currentUserProfile = null;
  auth.onAuthStateChanged(async (user) => {
    if (!user) { setTimeout(() => { if (!auth.currentUser) window.location.href = 'index.html'; }, 150); return; }
    try {
      UX.show('Cargando datos de usuario...');
      const userId = user.email.split('@')[0];
      const prof = await db.collection('USUARIOS').doc(userId).get();
      if (!prof.exists) throw new Error('No se encontró tu perfil.');
      currentUserProfile = prof.data();
    } catch (e) {
      console.error(e);
      UX.alert('Error', 'No se pudo cargar tu perfil.');
      window.location.href = 'menu.html';
    } finally {
      UX.hide();
    }
  });

  // Guardar
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const placa  = (placaInput?.value || '').trim().toUpperCase();
    const marca  = (marcaInput?.value || '').trim().toUpperCase();
    const modelo = (modeloInput?.value || '').trim().toUpperCase();
    const color  = (document.getElementById('color')?.value || '').trim().toUpperCase();
    const dni    = (dniInput?.value || '').trim();
    const nombres= (nombresInput?.value || '').trim().toUpperCase();
    const observaciones = (observacionesInput?.value || '').trim();

    if (!placa || !marca || !modelo || !color || !dni || !nombres) {
      UX.alert('Aviso', 'Complete todos los campos requeridos (placa, marca, modelo, color, DNI, nombres).'); return;
    }
    if (dni.length !== 8) { UX.alert('Aviso', 'El DNI debe tener exactamente 8 dígitos.'); return; }
    if (!currentUserProfile) { UX.alert('Error', 'Perfil no cargado.'); return; }

    UX.show('Guardando acceso vehicular…');
    try {
      const { CLIENTE, UNIDAD, NOMBRES: USER_NAMES, APELLIDOS, PUESTO } = currentUserProfile;
      const stamp = Date.now();
      const docId = `acceso_vehicular_${stamp}`;
      const fechaHora = new Date().toISOString();

      let fotoURL = null, fotoEmbedded = null;
      if (pendingPhoto) {
        const r = await safeUploadOrEmbed(`accesos_vehiculares/${CLIENTE}/${UNIDAD}/${stamp}_foto.jpg`, pendingPhoto);
        fotoURL = r.url; fotoEmbedded = r.embedded;
        if (fotoEmbedded && fotoEmbedded.length > 600 * 1024) fotoEmbedded = null; // cap dataURL
      }

      const payload = {
        placa, marca, modelo, color, dni,
        nombresPropietario: nombres,
        observacionesIngreso: observaciones,
        fechaHoraIngreso: fechaHora,
        cliente: CLIENTE, unidad: UNIDAD, puesto: PUESTO || null,
        registradoPor: `${USER_NAMES || ''} ${APELLIDOS || ''}`.trim(),
        estado: 'ingreso',
        timestamp: fechaHora,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(fotoURL ? { fotoURL } : {}),
        ...(fotoEmbedded ? { fotoEmbedded } : {}),
      };

      await saveToOfflineDB(payload, docId, 'ACCESO_VEHICULAR');

      if (navigator.onLine) {
        try {
          await db.collection('ACCESO_VEHICULAR').doc(docId).set(payload);
          console.log('✓ Acceso vehicular enviado a Firebase:', docId);
        } catch (err) {
          console.warn('⚠️ Error enviando a Firebase, guardado solo offline:', err?.message);
        }
      } else {
        console.log('🔌 Offline: guardado offline. Se sincronizará al volver la conexión.');
      }

      UX.hide();
      UX.alert('Éxito',
        navigator.onLine
          ? 'Acceso vehicular guardado correctamente.'
          : 'Acceso vehicular guardado offline. Se sincronizará cuando vuelva la conexión.',
        () => window.location.href = 'menu.html'
      );
    } catch (err) {
      console.error(err); UX.hide();
      UX.alert('Error', err.message || 'No fue posible guardar el acceso vehicular.');
    }
  });

  /* ===================== CONECTIVIDAD (polling + eventos) ===================== */
  let lastOnlineState = navigator.onLine;
  setInterval(async () => {
    const nowOnline = navigator.onLine;
    if (!lastOnlineState && nowOnline) {
      console.log('🌐 Cambio: OFFLINE → ONLINE. Sincronizando…');
      try { await syncOfflineRecords(); } catch (e) { console.error(e); }
    }
    lastOnlineState = nowOnline;
  }, 2000);

  window.addEventListener('online', async () => {
    console.log('🌐 Evento online: sincronizando…');
    try { await syncOfflineRecords(); } catch (e) { console.error(e); }
  });
});
