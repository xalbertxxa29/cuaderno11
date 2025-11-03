# 🚀 GUÍA DE FUNCIONAMIENTO OFFLINE - Rondas de Seguridad

## Estado: ✅ LISTO PARA PRODUCCIÓN

Tu aplicación de rondas **ahora funciona completamente offline** con sincronización automática de fotos cuando vuelve la conexión.

---

## 📱 ¿Cómo Funciona?

### Flujo Normal (CON INTERNET)
1. Escaneas QR → Se inicia cronómetro
2. Rellenas formulario → Captura opcional de foto
3. Haces clic "Aceptar y Guardar" → Datos + foto se suben inmediatamente a Firebase
4. ✅ Registro completado

**Indicadores:**
- Sin iconos especiales = Todo funciona normalmente
- Cronómetro muestra tiempo transcurrido

### Flujo Offline (SIN INTERNET)
1. Escaneas QR → Se inicia cronómetro (funciona sin internet)
2. Rellenas formulario → Captura opcional de foto
3. Haces clic "Aceptar y Guardar" → 
   - ✅ Registro se guarda **LOCALMENTE** (IndexedDB)
   - 📷 Foto se agrega a **COLA OFFLINE** (para subir después)
   - 📡 Aparece badge rojo **"Sin conexión"** en pantalla

**Indicadores:**
- 📡 Badge rojo = Sin conexión a internet
- Cronómetro funciona normalemente

### Flujo Reconexión (VOLVIO LA INTERNET)
1. Conexión detectada automáticamente
2. 📡 Badge desaparece
3. ⏳ Aparece spinner azul "Sincronizando fotos..."
4. ✅ Fotos se suben automáticamente a Firebase Storage
5. 📝 Documentos se actualizan con URLs de fotos
6. ⏳ Desaparece spinner

---

## 🧪 Cómo Probar Offline

### En Chrome/Edge Desktop

1. **Abrir DevTools:** F12
2. **Ir a Network Tab**
3. **Buscar selector "Offline"** (arriba a la izquierda dice "No throttling")
4. **Cambiar a "Offline"**
5. **Ejecutar tu formulario**
   - ✅ Debe guardar sin errores
   - ✅ Debe ver badge "Sin conexión"
6. **Cambiar back a "Online"**
   - ✅ Debe sincronizar automáticamente
   - ✅ Fotos deben subirse a Firebase

### En WebView Android (Aplicación)

1. **Desactivar WiFi y datos móviles**
2. **Ejecutar formulario**
   - ✅ Debe guardar sin errores
   - ✅ Debe ver badge "Sin conexión"
3. **Activar WiFi o datos**
   - ✅ Debe sincronizar automáticamente

### En localhost (Testing Local)

```bash
# Terminal 1 - Servidor Python local
python -m http.server 5200

# Terminal 2 - Abrir en navegador
http://localhost:5200/ronda.html

# DevTools → Network → Offline → Probar formulario
```

---

## 📊 Flujo de Datos Detallado

```
┌─────────────────────────────────────────────────────────────┐
│                    USUARIO LLENA FORMULARIO                  │
└────────┬────────────────────────────────────────────────────┘
         │
         ├─ CON INTERNET
         │  ├─ Guardar en Firestore ✅
         │  ├─ Foto sube a Storage ✅
         │  └─ Mostrar "Registro guardado" ✅
         │
         └─ SIN INTERNET  
            ├─ Guardar en IndexedDB (local) ✅
            ├─ Foto sube a Cola Offline (local) ✅
            ├─ Mostrar badge "📡 Sin conexión" ✅
            └─ ESPERAR CONEXIÓN...
               │
               └─ CONEXIÓN VUELVE
                  ├─ Sincronizar IndexedDB → Firestore (auto) ✅
                  ├─ Sincronizar Cola → Storage (auto) ✅
                  ├─ Actualizar URLs en documentos ✅
                  └─ Mostrar "Sincronización completada" ✅
```

---

## 💾 Dónde Se Guardan Los Datos

### LOCAL (Navegador)
- **IndexedDB:** Registros guardados
  - Nombre: `ronda-photo-queue`
  - Tienda: `pending-photos`
  - Contiene: Fotos en cola para sincronizar

- **Firestore Local Cache:** Documentos + timestamps
  - Automático (no necesita config)
  - Se sincroniza cuando vuelve internet

### REMOTO (Firebase Cloud)
- **Firestore:** Registros de rondas con:
  - Punto escaneado
  - Usuario
  - Tiempo transcurrido
  - Observaciones
  - Preguntas respondidas

- **Storage:** Fotos evidencia:
  - Ruta: `/evidencias/{puntoQR}/{timestamp}_{usuario}.jpg`
  - Formato: JPEG comprimido
  - Acceso: URL descargable

---

## 🔄 Sincronización Automática

### Cuándo Se Sincroniza (automático)

1. ✅ Cuando vuelve internet (`window.addEventListener('online')`)
2. ✅ Cada 30 segundos si hay conexión (retry automático)
3. ✅ Cuando el usuario cierra/abre la app (Service Worker)

### Qué Se Sincroniza

- ✅ Registros de rondas (Firestore)
- ✅ Fotos en cola (Firebase Storage)
- ✅ URLs de fotos (actualiza Firestore)

### Si Hay Error

- ⚠️ Reintenta hasta 5 veces
- ⚠️ Espera progresivamente más tiempo
- ⚠️ Guarda log de errores en console (F12)
- ⚠️ NO pierde datos (quedan en cola)

---

## 🚨 Troubleshooting

### "La foto no sube después de volver a internet"

**Solución:**
1. Abre la consola (F12)
2. Busca mensajes que digan "📷 Foto agregada a cola" o "Sincronizando"
3. Si dice error de permisos: Verificar reglas de Firebase Storage (ver FIREBASE_STORAGE_RULES.txt)

### "Dice 'Sin conexión' pero tengo internet"

**Solución:**
1. Recarga la página (Ctrl+R o F5)
2. Verifica que WiFi esté activado
3. Abre DevTools (F12) → Network → busca que no diga "Offline"

### "No veo el badge 'Sin conexión'"

**Solución:**
1. Esto es normal si está en `Offline` en DevTools pero en línea en realidad
2. El badge aparece cuando `navigator.onLine` detecta desconexión real
3. Prueba desactivando WiFi completamente

### "Las fotos antiguas no sincronizadas"

**Solución:**
1. Abre consola (F12) y ejecuta:
   ```javascript
   if (photoQueue) photoQueue.syncQueue();
   ```
2. O simplemente recarga la página y espera 3 segundos

---

## 🔐 Seguridad & Privacidad

### Datos Locales
- ✅ Solo en tu navegador (IndexedDB)
- ✅ No sale de tu equipo hasta que hayas decidido guardar
- ✅ Se borra automáticamente después de sincronizar

### Firebase
- ✅ Usa autenticación por email
- ✅ Fotos solo visible para usuarios autenticados
- ✅ Datos cifrados en tránsito (HTTPS)
- ✅ Documentos almacenados según reglas Firestore

---

## 📈 Casos de Uso Offline

### ✅ Ronda en área sin cobertura
- Escaneas QRs en sótano/zona sin wifi
- Todo se guarda offline
- Al salir a zona con wifi → sync automático
- ✅ **Funcionará perfectamente**

### ✅ Cambio de WiFi de empresa
- Cambias de acceso point (wifi A → wifi B)
- Puede causar "lag" de 2-3 segundos
- Los datos siguen guardándose localmente
- ✅ **Funcionará bien**

### ✅ Pérdida temporal de internet
- Se va la luz
- App continúa funcionando offline
- Vuelve la luz → Sincronización automática
- ✅ **Funcionará correctamente**

### ⚠️ Borrar datos del navegador
- Si borras "Datos del sitio" en Chrome
- Se pierden registros offline no sincronizados
- **Recomendación:** Sincronizar antes de borrar datos

---

## 📊 Monitoreo

### Ver Cola de Fotos Pendientes

En la consola (F12):
```javascript
// Ver cantidad de fotos en cola
await photoQueue.getQueueSize();  // Retorna número

// Ver detalles de la cola
await photoQueue.getAllFromIndexedDB();  // Retorna array de objetos
```

### Ver Logs de Sincronización

En la consola (F12):
```
// Búscar por estos mensajes
"✅ Foto sincronizada"  → Foto subió ok
"❌ Foto descartada"    → Foto fallida (>5 intentos)
"⏳ Sincronizando"     → En proceso
```

---

## 🎯 Resumen de Mejoras

| Característica | Antes | Ahora |
|---|---|---|
| Funciona offline | ❌ | ✅ |
| Guarda registros sin internet | ❌ | ✅ |
| Guarda fotos sin internet | ❌ | ✅ |
| Sincronización automática | ⚠️ Parcial | ✅ Completa |
| Badge offline | ❌ | ✅ |
| Manejo de errores | ❌ | ✅ (5 reintentos) |
| Cache de páginas | ✅ | ✅ (Mejorado) |
| Timer offline | ✅ | ✅ |

---

## 📞 Soporte

Si tienes problemas:

1. **Abre DevTools (F12)**
2. **Console Tab → Busca errores**
3. **Copia el error completo**
4. **Contacta con soporte** incluyendo:
   - El error exacto
   - Si es online u offline
   - Qué navegador usas
   - Qué formulario afecta

---

**Última actualización:** 2 de noviembre, 2025  
**Versión:** 2.0 - Offline Completo  
**Estado:** ✅ Producción
