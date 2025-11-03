// registrar_incidente.js (v61)
// Botones "+" con modal centrado (sin prompt), foto offline, Nivel de Riego (sin firma)
// ✅ OFFLINE SUPPORT: saveToOfflineDB, syncOfflineRecords, polling

// ===================== FUNCIONES OFFLINE =====================
function saveToOfflineDB(payload, docId, collectionName = 'incidencias') {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('incidentes-offline-db', 1);
      
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
          console.log('✓ Incidente guardado en IndexedDB:', docId);
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
      const dbRequest = indexedDB.open('incidentes-offline-db', 1);
      
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
          console.log(`🔄 Sincronizando ${records.length} incidentes offline...`);
          
          if (records.length === 0) {
            console.log('✓ No hay incidentes para sincronizar');
            resolve();
            return;
          }
          
          let syncedCount = 0;
          
          for (const record of records) {
            if (!record.synced) {
              try {
                console.log(`📤 Enviando incidente ${syncedCount + 1}/${records.length}: ${record.docId}`);
                
                // Enviar a Firestore
                await new Promise((promiseResolve, promiseReject) => {
                  db.collection('INCIDENCIAS_REGISTRADAS').doc(record.docId).set(record.payload)
                    .then(() => {
                      console.log(`✓ Incidente enviado exitosamente: ${record.docId}`);
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
          
          console.log(`✅ Sincronización completada: ${syncedCount}/${records.length} incidentes`);
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
  // --- Firebase ---
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth    = firebase.auth();
  const db      = firebase.firestore();
  const storage = firebase.storage();

  // Sesión persistente
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});

  // --- Utilidades UI ---
  const UX = {
    show : (m) => (window.UI && UI.showOverlay) ? UI.showOverlay(m) : void 0,
    hide : ()   => (window.UI && UI.hideOverlay) ? UI.hideOverlay() : void 0,
    alert: (t, m, cb) => (window.UI && UI.alert) ? UI.alert(t, m, cb) : (alert(`${t}\n\n${m||''}`), cb && cb())
  };

  // --- DOM ---
  const form                   = document.getElementById('incidente-form');
  const tipoIncidenteSelect    = document.getElementById('tipo-incidente');
  const detalleIncidenteSelect = document.getElementById('detalle-incidente');
  const nivelRiesgoSelect      = document.getElementById('nivel-riesgo');
  const comentarioEl           = document.getElementById('comentario');
  const fotoInput              = document.getElementById('foto-input');
  const fotoPreview            = document.getElementById('foto-preview');
  const addTipoBtn             = document.getElementById('add-tipo-btn');
  const addDetalleBtn          = document.getElementById('add-detalle-btn');

  // --- Modal centrado reutilizable ---
  const modalOverlay = document.getElementById('custom-modal');
  const modalTitle   = document.getElementById('modal-title');
  const modalInput   = document.getElementById('modal-input');
  const modalSave    = document.getElementById('modal-save');
  const modalCancel  = document.getElementById('modal-cancel');
  let currentModalType = null; // "tipo" | "detalle"

  function openModal(title, placeholder, type) {
    if (!modalOverlay || !modalInput || !modalTitle) return false; // fallback si no existe
    currentModalType = type;
    modalTitle.textContent = title || 'Agregar';
    modalInput.placeholder = placeholder || 'Escribe aquí...';
    modalInput.value = '';
    modalOverlay.style.display = 'flex';
    // Truca el scroll del body tras abrir para iOS/Android webview
    setTimeout(() => modalInput.focus(), 50);
    return true;
  }
  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.style.display = 'none';
    currentModalType = null;
  }
  modalCancel?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  // Enter = Guardar, ESC = Cancelar
  modalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); modalSave?.click(); }
    if (e.key === 'Escape') closeModal();
  });

  // --- Imagen: compresión y vista previa ---
  let pendingPhoto = null;
  fotoInput?.addEventListener('change', async () => {
    const f = fotoInput.files && fotoInput.files[0];
    if (!f) { pendingPhoto = null; fotoPreview.hidden = true; fotoPreview.src = ''; return; }
    try {
      UX.show('Procesando imagen…');
      const opt = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/jpeg' };
      pendingPhoto = await imageCompression(f, opt);
      fotoPreview.src = URL.createObjectURL(pendingPhoto);
      fotoPreview.hidden = false;
    } catch (e) {
      console.error(e);
      UX.alert('Aviso', 'No se pudo procesar la imagen.');
      pendingPhoto = null; fotoPreview.hidden = true; fotoPreview.src = '';
    } finally { UX.hide(); }
  });

  // --- Subida segura / base64 fallback ---
  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
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
  const MAX_EMBED_LEN = 600 * 1024;

  // --- Perfil de usuario ---
  let currentUserProfile = null;
  auth.onAuthStateChanged(async (user) => {
    if (!user) { setTimeout(() => { if (!auth.currentUser) window.location.href = 'index.html'; }, 150); return; }
    try {
      UX.show('Cargando datos de usuario...');
      const userId = user.email.split('@')[0];
      const prof = await db.collection('USUARIOS').doc(userId).get();
      if (!prof.exists) throw new Error('No se encontró tu perfil.');
      currentUserProfile = prof.data();
      await cargarTiposIncidente();
    } catch (e) {
      console.error(e); UX.alert('Error', 'No se pudo cargar tu perfil.');
      window.location.href = 'menu.html';
    } finally { UX.hide(); }
  });

  // --- Catálogos: Tipos / Detalles ---
  async function cargarTiposIncidente() {
    if (!currentUserProfile) return;
    const tipoSeleccionado = tipoIncidenteSelect?.value;
    if (tipoIncidenteSelect) tipoIncidenteSelect.innerHTML = '<option value="" disabled selected>Cargando...</option>';
    try {
      const { CLIENTE, UNIDAD } = currentUserProfile;
      const path = `/TIPO_INCIDENCIAS/${CLIENTE}/UNIDADES/${UNIDAD}/TIPO`;
      const snapshot = await db.collection(path).get();

      if (snapshot.empty) {
        if (tipoIncidenteSelect) tipoIncidenteSelect.innerHTML = '<option value="" disabled>No hay tipos definidos</option>';
        if (detalleIncidenteSelect) {
          detalleIncidenteSelect.innerHTML = '<option value="" disabled>Seleccione un tipo primero</option>';
          detalleIncidenteSelect.disabled = true;
        }
        return;
      }

      if (tipoIncidenteSelect) {
        tipoIncidenteSelect.innerHTML = '<option value="" disabled selected>Seleccione un tipo</option>';
        snapshot.forEach(doc => {
          const op = document.createElement('option');
          op.value = doc.id; op.textContent = doc.id;
          if (doc.id === tipoSeleccionado) op.selected = true;
          tipoIncidenteSelect.appendChild(op);
        });
        tipoIncidenteSelect.disabled = false;
        if (tipoSeleccionado) tipoIncidenteSelect.dispatchEvent(new Event('change'));
      }
    } catch (e) {
      console.error('Error cargando tipos:', e);
      if (tipoIncidenteSelect) tipoIncidenteSelect.innerHTML = '<option value="">Error al cargar</option>';
    }
  }

  async function cargarDetallesIncidente(tipoId) {
    if (!tipoId || !currentUserProfile) return;
    if (detalleIncidenteSelect) {
      detalleIncidenteSelect.innerHTML = '<option value="">Cargando...</option>';
      detalleIncidenteSelect.disabled = true;
    }
    try {
      const { CLIENTE, UNIDAD } = currentUserProfile;
      const path = `/TIPO_INCIDENCIAS/${CLIENTE}/UNIDADES/${UNIDAD}/TIPO`;
      const doc = await db.collection(path).doc(tipoId).get();

      if (!doc.exists) {
        if (detalleIncidenteSelect) detalleIncidenteSelect.innerHTML = '<option value="" disabled>No hay detalles</option>';
        return;
      }

      const data = doc.data() || {};
      // Puede venir como array, objeto {DETALLES: [...]}, o llaves sueltas
      let detalles = [];
      if (Array.isArray(data.DETALLES)) detalles = data.DETALLES.slice();
      else if (Array.isArray(data.detalles)) detalles = data.detalles.slice();
      else if (data.DETALLES && typeof data.DETALLES === 'object') detalles = Object.values(data.DETALLES);
      else if (data && typeof data === 'object') {
        const vals = Object.values(data).filter(v => typeof v === 'string');
        if (vals.length) detalles = vals;
      }
      detalles = [...new Set(detalles)].sort();

      if (detalleIncidenteSelect) {
        detalleIncidenteSelect.innerHTML = detalles.length
          ? '<option value="" disabled selected>Seleccione un detalle</option>'
          : '<option value="" disabled>No hay detalles</option>';
        detalles.forEach(det => {
          const op = document.createElement('option');
          op.value = det; op.textContent = det;
          detalleIncidenteSelect.appendChild(op);
        });
        detalleIncidenteSelect.disabled = detalles.length === 0;
      }
    } catch (error) {
      console.error('Error cargando detalles:', error);
      if (detalleIncidenteSelect) detalleIncidenteSelect.innerHTML = '<option value="">Error</option>';
    }
  }
  tipoIncidenteSelect?.addEventListener('change', (e) => cargarDetallesIncidente(e.target.value));

  // --- Guardado desde el modal ---
  modalSave?.addEventListener('click', async () => {
    const val = (modalInput?.value || '').trim().toUpperCase();
    if (!val) return UX.alert('Aviso', 'Debe ingresar un texto.');

    try {
      UX.show('Guardando…');
      const { CLIENTE, UNIDAD } = currentUserProfile || {};
      if (!CLIENTE || !UNIDAD) throw new Error('Perfil no cargado.');

      const path = `/TIPO_INCIDENCIAS/${CLIENTE}/UNIDADES/${UNIDAD}/TIPO`;

      if (currentModalType === 'tipo') {
        await db.collection(path).doc(val).set(
          { DETALLES: [], actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        await cargarTiposIncidente();
        if (tipoIncidenteSelect) {
          tipoIncidenteSelect.value = val;
          tipoIncidenteSelect.dispatchEvent(new Event('change'));
        }
      }

      if (currentModalType === 'detalle') {
        const tipo = (tipoIncidenteSelect?.value || '').trim();
        if (!tipo) throw new Error('Selecciona un tipo primero.');
        await db.collection(path).doc(tipo).set(
          {
            DETALLES: firebase.firestore.FieldValue.arrayUnion(val),
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        await cargarDetallesIncidente(tipo);
        if (detalleIncidenteSelect) detalleIncidenteSelect.value = val;
      }

      closeModal();
    } catch (e) {
      console.error(e);
      UX.alert('Error', e.message || 'No fue posible guardar.');
    } finally { UX.hide(); }
  });

  // --- Botones “+” que abren el modal (con fallback) ---
  addTipoBtn?.addEventListener('click', () => {
    if (!openModal('Nuevo Tipo de Incidencia', 'Escribe el nombre del tipo…', 'tipo')) {
      // Fallback si el modal no existe
      const v = (prompt('Nuevo Tipo de Incidencia:') || '').trim().toUpperCase();
      if (!v) return;
      (async () => {
        try {
          UX.show('Guardando tipo…');
          const { CLIENTE, UNIDAD } = currentUserProfile;
          const path = `/TIPO_INCIDENCIAS/${CLIENTE}/UNIDADES/${UNIDAD}/TIPO`;
          await db.collection(path).doc(v).set(
            { DETALLES: [], actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
          await cargarTiposIncidente();
          if (tipoIncidenteSelect) {
            tipoIncidenteSelect.value = v;
            tipoIncidenteSelect.dispatchEvent(new Event('change'));
          }
        } catch (e) { console.error(e); UX.alert('Error','No fue posible crear el tipo.'); }
        finally { UX.hide(); }
      })();
    }
  });

  addDetalleBtn?.addEventListener('click', () => {
    const tipo = (tipoIncidenteSelect?.value || '').trim();
    if (!tipo) return UX.alert('Aviso', 'Primero seleccione un Tipo de Incidencia.');
    if (!openModal('Nuevo Detalle de Incidencia', 'Escribe el detalle…', 'detalle')) {
      const d = (prompt(`Nuevo detalle para "${tipo}":`) || '').trim().toUpperCase();
      if (!d) return;
      (async () => {
        try {
          UX.show('Guardando detalle…');
          const { CLIENTE, UNIDAD } = currentUserProfile;
          const path = `/TIPO_INCIDENCIAS/${CLIENTE}/UNIDADES/${UNIDAD}/TIPO`;
          await db.collection(path).doc(tipo).set(
            { DETALLES: firebase.firestore.FieldValue.arrayUnion(d),
              actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
          await cargarDetallesIncidente(tipo);
          if (detalleIncidenteSelect) detalleIncidenteSelect.value = d;
        } catch (e) { console.error(e); UX.alert('Error','No fue posible crear el detalle.'); }
        finally { UX.hide(); }
      })();
    }
  });

  // --- Guardar Incidencia ---
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipoIncidente    = (tipoIncidenteSelect?.value || '').trim();
    const detalleIncidente = (detalleIncidenteSelect?.value || '').trim();
    const nivelRiesgo      = (nivelRiesgoSelect?.value || '').trim();
    const comentario       = (comentarioEl?.value || '').trim();

    if (!tipoIncidente || !detalleIncidente || !nivelRiesgo || !comentario || comentario.length < 5) {
      UX.alert('Aviso', 'Complete todos los campos requeridos (comentario mínimo 5 caracteres).');
      return;
    }

    UX.show('Guardando incidente…');
    try {
      const { CLIENTE, UNIDAD, NOMBRES, APELLIDOS, PUESTO } = currentUserProfile;
      const stamp = Date.now();
      const docId = `incidente_${stamp}`;

      let fotoURL = null, fotoEmbedded = null;
      if (pendingPhoto) {
        const r = await safeUploadOrEmbed(`incidencias/${CLIENTE}/${UNIDAD}/${stamp}_foto.jpg`, pendingPhoto);
        fotoURL = r.url; fotoEmbedded = r.embedded;
      }
      if (fotoEmbedded && fotoEmbedded.length > MAX_EMBED_LEN) fotoEmbedded = null;

      // 📦 Construir payload
      const payload = {
        cliente: CLIENTE,
        unidad : UNIDAD,
        puesto : PUESTO || null,
        registradoPor: `${NOMBRES || ''} ${APELLIDOS || ''}`.trim(),
        tipoIncidente,
        detalleIncidente,
        Nivelderiesgo: nivelRiesgo,
        comentario,
        estado: 'Pendiente',
        timestamp: new Date().toISOString(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(fotoURL ? { fotoURL } : {}),
        ...(fotoEmbedded ? { fotoEmbedded } : {}),
      };

      // 💾 Guardar OFFLINE primero
      await saveToOfflineDB(payload, docId, 'INCIDENCIAS_REGISTRADAS');

      // 🌐 Intentar guardar a Firebase (sin esperar si está offline)
      if (navigator.onLine) {
        try {
          await db.collection('INCIDENCIAS_REGISTRADAS').doc(docId).set(payload);
          console.log('✓ Incidente enviado a Firebase:', docId);
        } catch (firebaseErr) {
          console.warn('⚠️ Error enviando a Firebase, guardado solo offline:', firebaseErr?.message);
        }
      } else {
        console.log('🔌 Offline detectado, incidente guardado offline. Se sincronizará cuando vuelva la conexión.');
      }

      UX.hide();
      UX.alert('Éxito', navigator.onLine 
        ? 'Incidente guardado correctamente.' 
        : 'Incidente guardado offline. Se sincronizará cuando vuelva la conexión.', 
        () => window.location.href = 'menu.html'
      );
    } catch (err) {
      console.error(err); UX.hide();
      UX.alert('Error', err.message || 'No fue posible guardar el incidente.');
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
          console.log('Sincronizando incidentes offline...');
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
      console.log('Sincronizando incidentes offline...');
      await syncOfflineRecords();
      console.log('✅ Sincronización completada');
    } catch (e) {
      console.error('Error durante sincronización:', e);
    }
  });
});

