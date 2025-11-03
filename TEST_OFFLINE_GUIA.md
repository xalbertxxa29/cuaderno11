# Guía de Prueba - Sistema Offline

## Objetivo
Verificar que el sistema guarda datos offline y los sincroniza cuando vuelve la conexión.

## Pasos para Probar

### 1. **Con Conexión de Internet - Cargar datos en cache**

1. Abre `menu.html`
2. Inicia sesión con un usuario válido
3. Selecciona:
   - Cliente
   - Unidad
   - Puesto
4. Abre la consola (F12) y observa los logs:
   - `✓ Datos de usuario guardados offline`
   - `✓ Dato global guardado: selected-cliente`
   - `✓ Dato global guardado: selected-unidad`
   - `✓ Dato global guardado: selected-puesto`

### 2. **Desactivar Internet - Verifica Carga Offline**

1. **Abre DevTools** (F12)
2. Ve a la pestaña **Network**
3. Busca el selector que dice "No throttling"
4. Selecciona **"Offline"**
   - Esto simula que NO hay internet

### 3. **Con Internet Desactivada - Prueba Ronda Offline**

1. Abre `ronda.html`
2. Deberías ver:
   - En la consola: `✓ Nombre del usuario cargado desde cache offline:`
   - El nombre del usuario cargado en el formulario
   - El badge rojo "📡" en la esquina superior (indicador offline)

3. Escanea un QR (o prueba manualmente):
   - Selecciona "Sin Novedad" o "Con Novedad"
   - Completa el formulario
   - Haz clic en "Guardar"

4. El modal debe:
   - Mostrar "Guardando..."
   - **Cerrarse INMEDIATAMENTE** (sin esperar indefinidamente)
   - Mostrar: "Guardado offline. Se sincronizará al volver la red."

5. En la consola deberías ver:
   - `✓ Registro guardado en IndexedDB: [docId]`
   - `Guardando en Firestore (será reintentado en sync)...`

### 4. **Reactivar Internet - Prueba Sincronización**

1. **En DevTools Network**:
   - Cambia de "Offline" a "No throttling"
   - O presiona F5 para recargar

2. **Automáticamente debería sincronizar**:
   - El indicador azul "⏳" aparecerá (sincronizando)
   - En la consola verás:
     ```
     🌐 Conexión recuperada - Iniciando sincronización...
     🔄 Sincronizando X registros offline...
     📤 Enviando registro 1/X: [docId]
     ✓ Registro enviado exitosamente: [docId]
     ✅ Sincronización completada: X/X registros
     ```

3. **Verifica en Firebase Console**:
   - Ve a `Firestore Database` → Colección `RONDAS`
   - Deberías ver el registro con `synced: true`

## Valores Esperados en Firebase

Cuando sincroniza, el documento debería tener:
```
{
  punto: "1",
  referenciaQR: "1761055082506",
  nombreAgente: "[tu nombre]",
  usuarioId: "[tu email sin @]",
  observacion: "[lo que escribiste]",
  tipo: "SIN NOVEDAD" o "CON NOVEDAD",
  preguntas: {...},
  timerElapsedSeconds: 45,
  evidenciaUrl: "",
  fechaHoraISO: "2025-11-02T...",
  createdAt: Timestamp,
  meta: {...},
  pendingUpload: false,
  synced: true,
  syncedAt: "2025-11-02T..."
}
```

## Troubleshooting

### El nombre no carga offline
- Verifica que primero cargaste con internet
- Abre DevTools → Application → IndexedDB → ronda-app-data → user-profile
- Deberías ver un registro con key: "current-user"

### Los registros no sincronizan
- Abre la consola y busca errores
- Verifica que Firestore tiene reglas de lectura/escritura permitidas
- Prueba recargar la página

### Indicadores no aparecen
- Verifica que ronda.html carga `offline-storage.js`
- Verifica que ronda.html tiene los divs con id: `offline-indicator` y `sync-indicator`
