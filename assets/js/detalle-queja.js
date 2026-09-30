// ZX · Procesos — página de detalle de una queja (antes era un pop up, ver detalle.js).
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { establecerRolActual, obtenerDatosQueja, construirContenidoDetalle, activarAdjuntos } from './detalle.js';

// Cualquier rol con sesión puede ver el detalle de cualquier queja — mismo criterio que ya
// tenía el pop up (es de solo lectura; lo que cambia según el rol son las fechas de proceso,
// ver detalle.js / establecerRolActual).
const TODOS_LOS_ROLES = ['comercial', 'calidad', 'cedis', 'admin'];

const sesion = await exigirSesion(TODOS_LOS_ROLES);
if (sesion) {
  establecerRolActual(sesion.perfil.rol);
  pintarEncabezado(sesion.perfil, 'Detalle de queja');

  // "Volver" usa el historial del navegador: como siempre se llega aquí navegando desde una
  // bandeja (nunca abriendo esta página en una pestaña nueva), history.back() regresa
  // exactamente a la pantalla y el scroll de donde se dio clic en "Ver detalles".
  document.getElementById('zx-btn-volver').addEventListener('click', (evento) => {
    evento.preventDefault();
    history.back();
  });

  await cargarDetalle();
}

async function cargarDetalle() {
  const contenedor = document.getElementById('zx-detalle-contenido');
  const id = new URLSearchParams(location.search).get('id');

  if (!id) {
    contenedor.innerHTML = '<p class="zx-vacio">No se indicó qué queja mostrar.</p>';
    return;
  }

  const datos = await obtenerDatosQueja(id);
  if (datos.error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(datos.error)}</p>`;
    return;
  }

  contenedor.innerHTML = construirContenidoDetalle(datos);
  document.title = `Quejas de Clientes — ${datos.q.folio}`;
  activarAdjuntos(contenedor);
}
