# Verificación: Guardado OFFLINE con Cliente, Unidad y Puesto

## Objetivo
Verificar que cuando se guarda un registro OFFLINE (sin internet), se guarden también:
- ✅ Cliente
- ✅ Unidad  
- ✅ Puesto

Y que se sincronicen correctamente cuando vuelva la conexión.

---

## PASO 1: Preparar datos en menu.html

1. Abre http://localhost:5200/menu.html
2. Abre DevTools (F12 → Consola)
3. Verifica que veas:
   ```
   ✓ Datos de organización guardados automáticamente: { cliente: "BARCINO", unidad: "LOS OLIVOS", puesto: "INGRESO" }
   ```

---

## PASO 2: Simular modo OFFLINE

1. En DevTools → Network → Throttling
2. Selecciona **"Offline"** (o puedes hacer Ctrl+Shift+N para abrir DevTools en offline)
3. Verifica que en la página se vea el indicador de SIN CONEXIÓN

---

## PASO 3: Guardar registro OFFLINE

1. Abre http://localhost:5200/ronda.html (mientras estés OFFLINE)
2. Haz clic en "PLAY" para iniciar escaneo
3. Escanea un QR (o si no tienes, ve directamente al paso siguiente)
4. Si no puedes escanear, abre DevTools → Console y ejecuta:
   ```javascript
   currentScannedData = { referencia: "1761055082506", puntoMarcacion: "1" };
   showUI('sin-novedad');
   ```
5. Haz clic en "Aceptar y Guardar"
6. En la consola deberías ver:
   ```
   🔍 Intentando obtener datos de offlineStorage...
   ✓ Cliente obtenido: BARCINO
   ✓ Unidad obtenida: LOS OLIVOS
   ✓ Puesto obtenido: INGRESO
   ✅ Datos de organización cargados: { cliente: "BARCINO", unidad: "LOS OLIVOS", puesto: "INGRESO" }
   📦 Payload construido con: { cliente: "BARCINO", unidad: "LOS OLIVOS", puesto: "INGRESO" }
   ✓ Registro guardado en IndexedDB: 1761055082506_...
   ```

---

## PASO 4: Verificar que se guardó OFFLINE

1. Abre DevTools → Application → IndexedDB → ronda-offline-db → pending-records
2. Deberías ver el registro que acabas de guardar
3. Expande el registro y verifica que tenga:
   - `cliente: "BARCINO"`
   - `unidad: "LOS OLIVOS"`
   - `puesto: "INGRESO"`
   - `synced: false`

---

## PASO 5: Volver a CONECTAR

1. En DevTools → Network → Throttling
2. Selecciona una velocidad normal (o "No throttling")
3. O presiona F5 para recargar la página
4. En la consola deberías ver:
   ```
   🌐 Cambio detectado: Pasó de OFFLINE a ONLINE
   🔄 Sincronizando X registros offline...
   📤 Enviando registro 1/X: 1761055082506_...
   ✓ Registro enviado exitosamente: 1761055082506_...
   ✅ Registro marcado como sincronizado: 1761055082506_...
   ✅ Sincronización completada: 1/1 registros
   ```

---

## PASO 6: Verificar en Firebase

1. Abre https://console.firebase.google.com
2. Proyectos → INCIDENCIAS → Firestore Database
3. Colección RONDAS
4. Busca el documento que acabas de guardar (debería estar marcado con timestamp más reciente)
5. **VERIFICA que contenga:**
   - ✅ `cliente: "BARCINO"`
   - ✅ `unidad: "LOS OLIVOS"`
   - ✅ `puesto: "INGRESO"`
   - ✅ `synced: true`
   - ✅ `syncedAt: [timestamp]`

---

## PASO 7: Verificar IndexedDB después de sincronizar

1. De vuelta en DevTools → Application → IndexedDB → ronda-offline-db → pending-records
2. El registro debería ahora mostrar:
   - `synced: true`
   - `syncedAt: [timestamp]`

---

## Resultado esperado

✅ El registro se guardó OFFLINE con cliente, unidad y puesto
✅ El registro se sincronizó automáticamente cuando volvió la conexión
✅ Firebase contiene los datos correctos
✅ IndexedDB marca el registro como sincronizado

---

## Si algo falla

**No se guardó offline:**
- Verifica que `offlineStorage.setGlobalData()` se haya ejecutado en menu.html
- Revisa que `saveToOfflineDB()` no tenga errores en consola

**No se sincronizó:**
- Verifica que `syncOfflineRecords()` se haya disparado cuando volvió la conexión
- Revisa que el polling de 2 segundos esté funcionando

**Firebase no tiene los datos:**
- Verifica que `sendToFirebase()` incluya cliente, unidad, puesto en `baseDoc`
- Verifica que la permisología de Firestore lo permita

