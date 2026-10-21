import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';

const ETIQUETAS_ROL = { comercial: 'Comercial', calidad: 'Calidad', cedis: 'CEDIS', admin: 'Administrador' };

const ROLES = ['comercial', 'calidad', 'cedis', 'admin'];
let miId = null;

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
  if (!miId) {
    const { data: { session } } = await supabase.auth.getSession();
    miId = session?.user?.id || null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, usuario, nombre_completo, correo, rol, activo')
    .order('nombre_completo', { ascending: true });

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

  const pendientes = data.filter((u) => !u.rol);
  const conRol = data.filter((u) => u.rol);

  const fila = (u) => {
    const propio = u.id === miId;
    const opciones = ['<option value="">Sin rol</option>']
      .concat(ROLES.map((r) => `<option value="${r}"${u.rol === r ? ' selected' : ''}>${ETIQUETAS_ROL[r]}</option>`))
      .join('');
    const identidad = u.correo || (u.usuario ? `usuario ${u.usuario}` : '');
    return `
    <div class="zx-fila zx-usuario-fila" data-id="${escaparHtml(u.id)}">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(u.nombre_completo || u.usuario || '—')}${propio ? ' (tú)' : ''}</span>
        <span class="zx-fila-meta">${escaparHtml(identidad)}${u.activo === false ? ' · inactivo' : ''}</span>
      </div>
      <div class="zx-usuario-controles">
        ${u.rol ? '' : '<span class="zx-etiqueta-pendiente">Pendiente de rol</span>'}
        <select data-accion="rol" aria-label="Rol"${propio ? ' disabled title="No puedes cambiar tu propio rol"' : ''}>${opciones}</select>
        <button type="button" class="zx-btn zx-btn-sm" data-accion="activo" data-activo="${u.activo === false ? '0' : '1'}"${propio ? ' disabled title="No puedes desactivar tu propia cuenta"' : ''}>${u.activo === false ? 'Activar' : 'Desactivar'}</button>
      </div>
    </div>`;
  };

  contenedor.innerHTML =
    (pendientes.length ? `<h3 class="zx-subtitulo-lista">Pendientes de rol (${pendientes.length})</h3>${pendientes.map(fila).join('')}` : '') +
    (conRol.length ? `<h3 class="zx-subtitulo-lista">Con rol (${conRol.length})</h3>${conRol.map(fila).join('')}` : '');
}

async function actualizarPerfil(id, cambios, textoOk) {
  const { data, error } = await supabase.from('profiles').update(cambios).eq('id', id).select('id');
  if (error || !data || data.length === 0) {
    mostrarMensaje('No se pudo actualizar: ' + (error?.message || 'sin permiso'), false);
  } else {
    mostrarMensaje(textoOk, true);
  }
  await cargarUsuarios();
}

document.getElementById('lista-usuarios').addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-accion="rol"]');
  if (!sel) return;
  const id = sel.closest('[data-id]').dataset.id;
  const rol = sel.value || null;
  sel.disabled = true;
  await actualizarPerfil(id, { rol }, rol ? `Rol asignado: ${ETIQUETAS_ROL[rol]}.` : 'Se quitó el rol (la persona ya no podrá entrar).');
});

document.getElementById('lista-usuarios').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion="activo"]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const activar = btn.dataset.activo === '0';
  btn.disabled = true;
  await actualizarPerfil(id, { activo: activar }, activar ? 'Cuenta activada.' : 'Cuenta desactivada.');
});
