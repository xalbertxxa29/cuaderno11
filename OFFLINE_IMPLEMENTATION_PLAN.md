# Plan de Implementación - Funcionalidad OFFLINE Completa

## Estado Actual (2 de noviembre, 2025)

### ✅ YA IMPLEMENTADO

**ronda.js (Verificación de QR - EXCELENTE OFFLINE)**
- ✅ Firestore persistence habilitada (offline-first)
- ✅ Los registros se guardan en IndexedDB cuando no hay conexión
- ✅ Las fotos se suben online, se guardan offline sin foto
- ✅ Sincronización automática cuando vuelve conexión
- ✅ Timer funciona offline (tiempo se guarda localmente)
- ✅ Service Worker precarga (sw.js v62)
- Estado: **LISTO PARA PRODUCCIÓN** ✅

**Service Worker (sw.js v62)**
- ✅ Precarga de páginas HTML principales
- ✅ Estrategia network-first para HTML
- ✅ stale-while-revalidate para JS/CSS
- ✅ cache-first para imágenes/fonts
- ✅ Ignora requests POST/terceros (Firebase)
- Estado: **FUNCIONAL** ✅

**Firebase Firestore Persistence**
- ✅ Habilitado en ronda.js (enablePersistence)
- ✅ DocumentSnapshot cache local (IndexedDB)
- ✅ Sincronización automática de escrituras
- ✅ synchronizeTabs: false para evitar conflictos
- Estado: **ACTIVO** ✅

---

### 🟡 PARCIALMENTE IMPLEMENTADO

**registrar_incidente.js**
- ✅ Firebase persistence habilitada
- ✅ Foto comprimida y preview local
- ✅ safeUploadOrEmbed() intenta subir, fallback a base64
- ⚠️ NO tiene sincronización automática al reconectar
- ⚠️ NO tiene cola persistente para fotos offline
- **Acción necesaria:** Agregar listeners online/offline

**consigna_temporal.js**
- ✅ Foto comprimida
- ✅ Firma capturada
- ✅ uploadTo() con fallback offline (fotoEmbedded, firmaEmbedded)
- ⚠️ NO sincroniza fotos cuando vuelve internet
- ⚠️ Guarda embedded base64 en Firestore (no escalable)
- **Acción necesaria:** Implementar cola de Storage

**consigna_permanente.js**
- ⚠️ No revisado completamente
- **Acción necesaria:** Auditar completamente

**peatonal.js, salida.js, ingresar_informacion.js**
- ⚠️ No revisados
- **Acción necesaria:** Auditar y mejorar offline

---

### ❌ NO IMPLEMENTADO

**Sistema de Cola de Fotos Global**
- ❌ Actualmente: Las fotos offline se guardan como base64 en Firestore
- ❌ Problema: Base64 hace documentos muy grandes
- **Solución necesaria:** IndexedDB para cola, sync al reconectar

**Sincronización automática de fotos**
- ❌ Las fotos en base64 NO se sincronizan a Storage
- ❌ Las fotos quedan en Firestore como embedded, no como URLs

**Indicadores visuales de sincronización**
- ❌ Usuario no ve si datos están offline o sincronizados
- **Solución:** Agregar UI indicators

---

## Plan de Implementación (FASE 1)

### Paso 1: Crear módulo de sincronización global (sync.js mejorado)

```javascript
// sync-manager.js
class OfflinePhotoSync {
  constructor(db, storage) {
    this.db = db;
    this.storage = storage;
    this.queue = [];
    this.syncing = false;
  }

  // Agregar foto a cola
  async queuePhoto(metadata, blob) {
    const item = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2),
      metadata, // {docId, path, collectionName}
      blob: await this.blobToArrayBuffer(blob),
      blobType: blob.type,
      queuedAt: new Date().toISOString(),
      attempts: 0
    };
    await this.saveToIndexedDB(item);
    this.queue.push(item);
    this.syncIfOnline(); // Intenta sync inmediatamente si hay conexión
  }

  // Sincronizar cola
  async sync() {
    if (this.syncing || !navigator.onLine) return;
    this.syncing = true;
    
    for (const item of this.queue) {
      try {
        const blob = this.arrayBufferToBlob(item.blob, item.blobType);
        const url = await this.uploadToStorage(item.metadata.path, blob);
        
        // Actualizar documento en Firestore
        await this.db.collection(item.metadata.collectionName)
          .doc(item.metadata.docId)
          .update({ [item.metadata.urlField]: url });
        
        await this.removeFromQueue(item.id);
      } catch (err) {
        item.attempts++;
        if (item.attempts > 3) {
          await this.removeFromQueue(item.id);
        }
      }
    }
    
    this.syncing = false;
  }

  syncIfOnline() {
    if (navigator.onLine) this.sync();
  }
}
```

### Paso 2: Actualizar cada formulario

**Patrón para todos los formularios:**
```javascript
// En cada archivo: registrar_incidente.js, consigna_temporal.js, etc.

// 1. Cargar el sync manager
const photoSync = new OfflinePhotoSync(db, storage);

// 2. Cuando el usuario selecciona foto
fotoInput.addEventListener('change', async (e) => {
  const blob = await compressImage(e.target.files[0]);
  await photoSync.queuePhoto({
    docId: 'mi-documento-id',
    path: 'evidencias/incidente/foto.jpg',
    collectionName: 'INCIDENCIAS',
    urlField: 'fotoURL'
  }, blob);
});

// 3. Listeners para sincronización automática
window.addEventListener('online', () => photoSync.sync());
window.addEventListener('offline', () => showMessage('Offline: fotos se guardarán cuando vuelva conexión'));
```

### Paso 3: Mejorar indicadores UI

Agregar badge/indicator en cada página:
```html
<div id="offline-indicator" style="display:none; position:fixed; bottom:10px; right:10px; background:red; color:white; padding:10px; border-radius:5px;">
  📡 Trabajando Offline
</div>

<div id="sync-indicator" style="display:none; position:fixed; bottom:10px; left:10px;">
  ⏳ Sincronizando...
</div>
```

```javascript
window.addEventListener('offline', () => {
  document.getElementById('offline-indicator').style.display = 'block';
});
window.addEventListener('online', () => {
  document.getElementById('offline-indicator').style.display = 'none';
});
```

---

## Matriz de Cumplimiento - Archivos por Revisar

| Archivo | Firestore | Fotos Offline | Sincronización | Storage Cloud | Estado |
|---------|-----------|---------------|----------------|---------------|--------|
| ronda.js | ✅ | ✅ | ✅ | ✅ | LISTO |
| registrar_incidente.js | ✅ | ⚠️ Embedded | ❌ | ❌ | MEJORAR |
| consigna_temporal.js | ✅ | ⚠️ Embedded | ❌ | ❌ | MEJORAR |
| consigna_permanente.js | ✅ | ? | ❌ | ? | AUDITAR |
| peatonal.js | ? | ? | ? | ? | AUDITAR |
| salida.js | ? | ? | ? | ? | AUDITAR |
| ingresar_informacion.js | ? | ? | ? | ? | AUDITAR |
| registros.js | ✅ READ | - | - | - | LISTO (solo lectura) |

---

## Testing Offline - Checklist

### Cómo Probar Offline

**Chrome DevTools:**
1. F12 → Network tab
2. Buscar "Offline" dropdown (normalmente dice "No throttling")
3. Cambiar a "Offline"
4. Ejecutar formulario:
   - ✅ Debe guardar localmente
   - ✅ Debe mostrar mensaje "sin conexión"
   - ✅ No debe lanzar errores

**Activar Conexión:**
1. Cambiar "Offline" a "Online"
2. Esperar 2-3 segundos
3. Verificar que fotos se suben a Firebase Storage

### Casos de Prueba

- [ ] Ronda: Escanear QR offline → Guardar → Volver online → Registros aparecen en Firebase ✅
- [ ] Ronda: Foto offline → "sin conexión" message → Volver online → Foto sube
- [ ] Incidente: Form offline → Guardar → Volver online → Documento en Firestore
- [ ] Consigna Temporal: Foto + Firma offline → Guardar → Volver online → Assets en Storage
- [ ] Service Worker: Desactivar internet → Navegar entre páginas → Deben cargar desde caché

---

## Recomendaciones Prioritarias

### ALTA PRIORIDAD (Implementar Ahora)

1. ✅ **Ronda.js está bien** - Dejar como está
2. 🔴 **Implementar OfflinePhotoSync** - Sistema global para fotos
3. 🔴 **Agregar listeners online/offline** - A todos los formularios
4. 🔴 **Mejorar consigna_temporal.js** - Cambiar embedded a Storage URL

### MEDIA PRIORIDAD (Próxima Semana)

5. 🟡 **Auditar registrar_incidente.js** - Mejorar cola
6. 🟡 **Auditar todos los .js** - Buscar llamadas directas a storage
7. 🟡 **Agregar indicadores UI** - Offline badge

### BAJA PRIORIDAD (Futuro)

8. 💡 **Dashboard de sincronización** - Panel de items offline
9. 💡 **Retry inteligente** - Exponential backoff para retries
10. 💡 **Analytics offline** - Estadísticas de sincronización

---

## Notas Técnicas

**Por qué base64 embedded es malo:**
- 1 MB de foto = ~1.3 MB de base64
- Firestore tiene límite de 1MB por documento
- Documentos grandes = más consumo de datos
- No se pueden cachear en Storage

**Mejor solución:**
- Guardar foto en IndexedDB (local)
- Enviar a Storage cuando hay conexión
- Guardar URL en Firestore (pequeño)

**Firebase Firestore Persistence:**
- Automático con `enablePersistence()`
- No necesita código adicional
- Solo funciona con modo `synchronizeTabs: false`

**Service Worker precaching:**
- Ya funciona (sw.js v62)
- Páginas cargan instantáneamente offline
- No es necesario cambiar

---

## Recursos Útiles

- Firebase Offline Guide: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- MDN Service Workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
