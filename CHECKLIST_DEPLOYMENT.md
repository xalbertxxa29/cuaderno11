# ✅ CHECKLIST - Verificación de Funcionalidad Offline

## PRE-DEPLOYMENT - Completar antes de enviar a producción

### 🔧 Configuración Firebase

- [ ] **Storage Rules** están configuradas en Firebase Console
  - [ ] Usuarios autenticados pueden escribir en `/evidencias/`
  - [ ] Cualquiera puede leer fotos
  - [ ] Copié exactamente desde FIREBASE_STORAGE_RULES.txt
  - [ ] Hice click en "PUBLICAR"

- [ ] **Firestore Persistence** está habilitada
  - [ ] En ronda.js aparece `enablePersistence()`
  - [ ] Ver console.log "Persistencia ya habilitada o error"

- [ ] **Credenciales Firebase** en firebase-config.js
  - [ ] projectId está correcto
  - [ ] apiKey está correcto
  - [ ] No hay caracteres especiales rotos

### 📱 Archivos Locales

- [ ] **offline-sync.js** existe en carpeta
  - [ ] 110+ líneas
  - [ ] Cargado en ronda.html ANTES de ronda.js

- [ ] **ronda.js** tiene las mejoras
  - [ ] Línea ~80: `new OfflinePhotoQueue(db, storage)`
  - [ ] Línea ~560: `window.addEventListener('online', ...)`
  - [ ] Línea ~500: Check para `if (photoQueue && !navigator.onLine)`

- [ ] **ronda.html** tiene los indicadores
  - [ ] `<div id="offline-indicator">` existe
  - [ ] `<div id="sync-indicator">` existe
  - [ ] `<script src="offline-sync.js">` antes de ronda.js

- [ ] **sw.js** está actualizado
  - [ ] Contiene precarga de ronda.html, ronda.js, ronda.css
  - [ ] Versión es v62+

### 🧪 Testing Offline - Checklist Funcional

#### Test 1: Escaneo Offline Básico
- [ ] Abrir ronda.html
- [ ] DevTools (F12) → Network → Cambiar a "Offline"
- [ ] Intentar escanear QR (o mock)
- [ ] ✅ Debe mostrar punto escaneado (offline)

#### Test 2: Formulario Offline
- [ ] Llenar formulario "Sin Novedad" offline
- [ ] NO capturar foto (testing básico)
- [ ] Hacer clic "Guardar Registro"
- [ ] ✅ NO debe lanzar error
- [ ] ✅ Debe mostrar "Guardado offline"
- [ ] ✅ Badge rojo 📡 debe estar visible

#### Test 3: Foto Offline
- [ ] Llenar formulario "Con Novedad" offline
- [ ] Capturar foto con cámara
- [ ] Hacer clic "Aceptar y Guardar"
- [ ] ✅ Debe guardar sin error
- [ ] ✅ Consola debe mostrar "📷 Foto agregada a cola"
- [ ] ✅ Badge 📡 debe visible

#### Test 4: Reconexión Online
- [ ] Con datos offline guardados (del test anterior)
- [ ] DevTools → Network → Cambiar a "Online"
- [ ] Esperar 2-3 segundos
- [ ] ✅ Badge 📡 debe desaparecer
- [ ] ✅ Spinner ⏳ debe aparecer (2-5 segundos)
- [ ] ✅ Consola mostrar "✅ Foto sincronizada"
- [ ] ✅ Firebase console → Storage: foto debe estar visible
- [ ] ✅ Firebase console → Firestore: documento debe tener URL

#### Test 5: Multiple Registros Offline
- [ ] Generar 3+ registros con fotos offline
- [ ] DevTools → Offline
- [ ] Guardar 3+ registros (cada uno con foto)
- [ ] ✅ Todos deben guardar sin error
- [ ] Consola: Debe mostrar "📷 Foto agregada a cola" x3
- [ ] Cambiar a Online
- [ ] ✅ Todas las fotos deben sincronizar

#### Test 6: Error Handling
- [ ] Intentar guardar foto offline
- [ ] Antes de sincronizar, cambiar a Online
- [ ] Luego cambiar a Offline nuevamente
- [ ] ✅ NO debe duplicar, NO debe perder foto

#### Test 7: Timer Offline
- [ ] Escanear QR offline
- [ ] Timer debe empezar a contar
- [ ] Rellenar formulario offline
- [ ] ✅ Timer debe contar todo el tiempo
- [ ] Guardar
- [ ] ✅ Firestore debe tener timerElapsedSeconds

#### Test 8: Service Worker Caché
- [ ] Cambiar a Offline
- [ ] Navegar a otra página (menu.html)
- [ ] ✅ Debe cargar desde caché
- [ ] Navegar de vuelta a ronda.html
- [ ] ✅ Debe cargar desde caché

#### Test 9: Recarga en Offline
- [ ] Estar en Offline con datos guardados
- [ ] Hacer F5 (recarga)
- [ ] ✅ Página debe cargar
- [ ] ✅ Datos offline deben estar disponibles

#### Test 10: App Real (Mobile)
- [ ] Instalar en Android/iOS
- [ ] Desactivar WiFi y datos
- [ ] Ejecutar prueba 1-9
- [ ] ✅ Todos deben funcionar en dispositivo real

### 🔍 Verificación de Console

Abre DevTools (F12) y busca estos mensajes (algunos pueden no aparecer si no hay fotos):

**✅ Esperados:**
```
✅ Sistema de sincronización offline activado
🔌 Sin conexión - Foto agregada a cola offline  
📷 Foto agregada a cola: [ID]
Sincronizando [N] fotos...
✅ Foto sincronizada: [ID]
```

**⚠️ Warnings aceptables:**
```
Múltiples tabs/WebViews abiertos - persistencia deshabilitada
Persistencia ya habilitada o error
```

**❌ ERRORES (no deben aparecer):**
```
Error al subir foto: permission-denied
Error al agregar foto a cola
Failed to fetch
Network error
```

Si hay ❌ errores:
1. Verifica Firebase Storage Rules
2. Verifica credenciales en firebase-config.js
3. Verifica que usuario esté autenticado

### 📊 Verificación en Firebase Console

#### Firestore
- [ ] Ir a Firebase Console → Firestore Database
- [ ] Colección "RONDAS" existe
- [ ] Documento tiene campos:
  - [ ] punto
  - [ ] referenciaQR
  - [ ] nombreAgente
  - [ ] timerElapsedSeconds
  - [ ] evidenciaUrl (vacío si sin foto, con URL si sincronizado)

#### Storage
- [ ] Ir a Firebase Console → Storage
- [ ] Carpeta "evidencias" existe
- [ ] Subcarpetas por punto QR (ej: evidencias/1/, evidencias/2/)
- [ ] Archivos con nombres como: `[timestamp]_[usuario].jpg`
- [ ] Puedo clickear y ver vista previa

### 🎯 Performance Checks

- [ ] Página carga en <2 segundos (primero uso)
- [ ] Página carga en <500ms (offline, caché)
- [ ] Guardar registro toma <1 segundo
- [ ] Sincronizar foto toma <5 segundos (conexión buena)
- [ ] NO hay memory leaks (DevTools → Memory → heap size no crece indefinidamente)

### 🔐 Security Checks

- [ ] Usuario no puede acceder a fotos de otros (autenticación requerida)
- [ ] URLs de Storage tienen tokens firmados (no son públicas)
- [ ] Datos en IndexedDB no se pueden modificar fácilmente desde console
- [ ] No hay credenciales Firebase expuestas en source code

### 📱 Browser Compatibility

- [ ] Funciona en Chrome/Edge
- [ ] Funciona en Firefox
- [ ] Funciona en Safari
- [ ] Funciona en Samsung Internet (Android)

### 📚 Documentación

- [ ] GUIA_OFFLINE.md existe y está completo
- [ ] OFFLINE_IMPLEMENTATION_PLAN.md existe y está completo
- [ ] FIREBASE_STORAGE_RULES.txt existe y está claro
- [ ] RESUMEN_IMPLEMENTACION.md existe

### 🚀 Deployment Readiness

- [ ] Código sin errores en console
- [ ] Código sin warnings en console (excepto los aceptables)
- [ ] Service Worker registrado correctamente
- [ ] Manifest.json válido
- [ ] Cache versioning correcto (v=60+ en assets)

---

## ✅ SIGN-OFF

Cuando hayas completado todos los checks:

```javascript
// En console (F12), ejecutar:
navigator.serviceWorker.getRegistrations().then(rs => console.log('SW registrado:', rs.length > 0));
// Debe mostrar: SW registrado: true

// Ver tamaño de IndexedDB
if (photoQueue) await photoQueue.getQueueSize().then(s => console.log('Fotos en cola:', s));
// Debe mostrar: Fotos en cola: [número]
```

---

## 🎉 Checklist Completado

Si marcaste todo como ✅:

**¡Tu aplicación está lista para producción!** 🚀

### Final Verification
- [ ] He leído esta checklist completamente
- [ ] He realizado todos los tests
- [ ] He verificado Firebase Console
- [ ] He revisado console para errores
- [ ] Autorizo envío a producción

**Fecha de Verificación:** ___________  
**Persona Responsable:** ___________  
**Firma/Aprobación:** ___________

---

## 🔄 Testing Recurrente

**Después del deployment, verificar regularmente:**

- [ ] Cada semana: 1 test offline completo
- [ ] Cada mes: Todos los tests (1-10)
- [ ] Cada trimestre: Testing en dispositivo real
- [ ] Monitorear Firebase console para fotos huérfanas

---

**Última actualización:** 2 de Noviembre, 2025  
**Versión:** 2.0 - Offline Complete
