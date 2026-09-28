import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';

const ETIQUETAS_ROL = { comercial: 'Comercial', calidad: 'Calidad', cedis: 'CEDIS', admin: 'Admin' };

const sesion = await exigirSesion(['admin']);
if (sesion) {
  pintarEncabezado(sesion.perfil, 'Usuarios');
  await cargarUsuarios();
}

const mensaje = document.getElementById('zx-mensaje');

function mostrarMensaje(texto, ok) {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (ok ? 'zx-mensaje-ok' : 'zx-mensaje-error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('zx-form-usuario').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensaje.classList.add('zx-oculto');

  const btn = document.getElementById('zx-btn-crear-usuario');
  btn.disabled = true;
  btn.textContent = 'Creando…';

  const usuario = document.getElementById('nuevo-usuario').value.trim();
  const nombre_completo = document.getElementById('nuevo-nombre').value.trim();
  const rol = document.getElementById('nuevo-rol').value;
  const contrasena = document.getElementById('nueva-contrasena').value;

  const { data, error } = await supabase.functions.invoke('admin-crear-usuario', {
    body: { usuario, nombre_completo, rol, contrasena },
  });

  btn.disabled = false;
  btn.textContent = 'Crear usuario';

  // Con supabase-js, un error de function (4xx/5xx) también trae el cuerpo JSON en error.context.
  const cuerpoError = data?.error || (error && error.context ? (await leerError(error)) : null);
  if (error || data?.error) {
    mostrarMensaje('No se pudo crear el usuario: ' + (cuerpoError || error?.message || 'error desconocido'), false);
    return;
  }

  mostrarMensaje(`Usuario ${data.usuario} creado con rol ${ETIQUETAS_ROL[data.rol] || data.rol}.`, true);
  document.getElementById('zx-form-usuario').reset();
  await cargarUsuarios();
});

async function leerError(error) {
  try {
    const cuerpo = await error.context.json();
    return cuerpo?.error || null;
  } catch (e) {
    return null;
  }
}

async function cargarUsuarios() {
  const { data, error } = await supabase
    .from('profiles')
    .select('usuario, nombre_completo, rol, activo')
    .order('usuario', { ascending: true });

  const contenedor = document.getElementById('lista-usuarios');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-usuarios').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay usuarios registrados.</p>';
    return;
  }

  contenedor.innerHTML = data.map((u) => `
    <div class="zx-fila">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(u.usuario || '—')}</span>
        <span class="zx-fila-meta">${escaparHtml(u.nombre_completo || '')}${u.activo === false ? ' · inactivo' : ''}</span>
      </div>
      <span class="zx-contador">${escaparHtml(ETIQUETAS_ROL[u.rol] || u.rol || 'Sin rol')}</span>
    </div>
  `).join('');
}
