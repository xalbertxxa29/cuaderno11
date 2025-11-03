// salidavehicular.js (v60)
// Salida Vehicular - Listado de accesos en estado ingreso y registro de salida
// Filtra por cliente y unidad del usuario logueado

// Variables globales que se inicializarán en DOMContentLoaded
let db, auth;

// ===================== INICIALIZAR FIREBASE =====================
async function inicializarFirebase() {
  return new Promise((resolve) => {
    let checks = 0;
    
    const chequear = () => {
      checks++;
      
      // Ver el estado actual
      console.log(`[${checks}/100] Firebase: ${!!window.firebase}, Config: ${!!window.firebaseConfig}`);
      
      if (window.firebase && window.firebaseConfig) {
        console.log('✅ Firebase y config detectados');
        try {
          if (!window.firebase.apps.length) {
            window.firebase.initializeApp(window.firebaseConfig);
          }
          db = window.firebase.firestore();
          auth = window.firebase.auth();
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

document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar Firebase
  const firebaseOk = await inicializarFirebase();
  if (!firebaseOk) {
    console.error('No se pudo inicializar Firebase');
    return;
  }

  const UX = {
    show: (m) => (window.UI && UI.showOverlay) ? UI.showOverlay(m) : void 0,
    hide: () => (window.UI && UI.hideOverlay) ? UI.hideOverlay() : void 0,
    alert: (t, m, cb) => (window.UI && UI.alert) ? UI.alert(t, m, cb) : (alert(`${t}\n\n${m||''}`), cb && cb())
  };

  const vehiculosList = document.getElementById('vehiculos-list');
  let userProfile = null;
  let currentVehiculo = null;

  // Cargar perfil del usuario
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    
    try {
      UX.show('Cargando datos...');
      const userId = user.email.split('@')[0];
      const snap = await db.collection('USUARIOS').doc(userId).get();
      
      if (!snap.exists) throw new Error('Perfil no encontrado');
      userProfile = snap.data();
      
      // Cargar vehículos con estado "ingreso"
      await cargarVehiculos();
    } catch (e) {
      console.error(e);
      UX.alert('Error', 'No se pudo cargar tu perfil.');
      window.location.href = 'menu.html';
    } finally {
      UX.hide();
    }
  });

  // Cargar vehículos en estado "ingreso" para el cliente y unidad del usuario
  async function cargarVehiculos() {
    try {
      const { CLIENTE, UNIDAD } = userProfile;
      
      if (!CLIENTE || !UNIDAD) {
        vehiculosList.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>No se encontraron datos de Cliente y Unidad</p>
          </div>
        `;
        return;
      }

      // Consultar registros con estado "ingreso"
      const query = db.collection('ACCESO_VEHICULAR')
        .where('cliente', '==', CLIENTE)
        .where('unidad', '==', UNIDAD)
        .where('estado', '==', 'ingreso')
        .orderBy('fechaHoraIngreso', 'desc');
      
      const snapshot = await query.get();

      if (snapshot.empty) {
        vehiculosList.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-circle-check"></i>
            <p>No hay vehículos en acceso actualmente</p>
          </div>
        `;
        return;
      }

      // Mostrar vehículos
      vehiculosList.innerHTML = '';
      snapshot.forEach(doc => {
        const data = doc.data();
        const card = crearCardVehiculo(doc.id, data);
        vehiculosList.appendChild(card);
      });
    } catch (e) {
      console.error(e);
      vehiculosList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-exclamation-circle"></i>
          <p>Error al cargar vehículos: ${e.message}</p>
        </div>
      `;
    }
  }

  // Crear tarjeta de vehículo
  function crearCardVehiculo(docId, data) {
    const card = document.createElement('div');
    card.className = 'vehiculo-card';
    
    // Formatear fecha
    const fechaIngreso = new Date(data.fechaHoraIngreso).toLocaleString('es-ES');
    
    card.innerHTML = `
      <h3><i class="fa-solid fa-car"></i> ${data.placa}</h3>
      <div class="vehiculo-info">
        <p><strong>Marca:</strong> ${data.marca}</p>
        <p><strong>Modelo:</strong> ${data.modelo}</p>
        <p><strong>Propietario:</strong> ${data.nombresPropietario}</p>
        <p><strong>DNI:</strong> ${data.dni}</p>
        <p><strong>Ingreso:</strong> ${fechaIngreso}</p>
        ${data.observacionesIngreso ? `<p><strong>Observaciones:</strong> ${data.observacionesIngreso}</p>` : ''}
      </div>
      <button class="btn-salida" onclick="abrirModalSalida('${docId}')">
        <i class="fa-solid fa-arrow-right-from-bracket"></i> Registrar Salida
      </button>
    `;
    
    return card;
  }

  // Variables globales para el modal
  window.abrirModalSalida = async function(docId) {
    try {
      UX.show('Cargando...');
      const doc = await db.collection('ACCESO_VEHICULAR').doc(docId).get();
      
      if (!doc.exists) throw new Error('Registro no encontrado');
      
      currentVehiculo = { docId, data: doc.data() };
      
      // Llenar modal con información
      const infoDiv = document.getElementById('modal-info-vehiculo');
      const fechaIngreso = new Date(currentVehiculo.data.fechaHoraIngreso).toLocaleString('es-ES');
      
      infoDiv.innerHTML = `
        <p><strong>Placa:</strong> ${currentVehiculo.data.placa}</p>
        <p><strong>Marca:</strong> ${currentVehiculo.data.marca} - ${currentVehiculo.data.modelo}</p>
        <p><strong>Propietario:</strong> ${currentVehiculo.data.nombresPropietario} (DNI: ${currentVehiculo.data.dni})</p>
        <p><strong>Ingreso:</strong> ${fechaIngreso}</p>
      `;
      
      // Limpiar campo de observaciones
      document.getElementById('observaciones-salida').value = '';
      
      // Mostrar modal
      document.getElementById('modal-salida').classList.add('active');
      UX.hide();
    } catch (e) {
      console.error(e);
      UX.hide();
      UX.alert('Error', 'No se pudo cargar el registro del vehículo.');
    }
  };

  window.cerrarModalSalida = function() {
    document.getElementById('modal-salida').classList.remove('active');
    currentVehiculo = null;
  };

  window.confirmarSalida = async function() {
    if (!currentVehiculo) return;

    const observacionesSalida = (document.getElementById('observaciones-salida')?.value || '').trim();
    
    UX.show('Registrando salida...');
    try {
      const now = new Date();
      const fechaHoraSalida = now.toISOString();
      
      // Actualizar documento con estado "salida"
      await db.collection('ACCESO_VEHICULAR').doc(currentVehiculo.docId).update({
        estado: 'salida',
        fechaHoraSalida: fechaHoraSalida,
        observacionesSalida: observacionesSalida,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      UX.hide();
      cerrarModalSalida();
      
      UX.alert('Éxito', 'Salida registrada correctamente.', async () => {
        // Recargar lista de vehículos
        await cargarVehiculos();
      });
    } catch (err) {
      console.error(err);
      UX.hide();
      UX.alert('Error', 'No se pudo registrar la salida: ' + err.message);
    }
  };

  // Cerrar modal al hacer click fuera del contenido
  document.getElementById('modal-salida')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-salida') {
      cerrarModalSalida();
    }
  });
});
