import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml, pareceCorreo } from './auth-guard.js';

let ETIQUETAS_ROL = { comercial: 'Comercial', calidad: 'Calidad', cedis: 'CEDIS', admin: 'Administrador' };

let ROLES = ['comercial', 'calidad', 'cedis', 'admin'];
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

async function cargarRolesDisponibles() {
  const { data } = await supabase.from('roles').select('clave, nombre').order('es_sistema', { ascending: false }).order('nombre');
  if (data && data.length) {
    ROLES = data.map((r) => r.clave);
    ETIQUETAS_ROL = Object.fromEntries(data.map((r) => [r.clave, r.nombre]));
  }
}

async function cargarUsuarios() {
  await cargarRolesDisponibles();
  if (!miId) {
    const { data: { session } } = await supabase.auth.getSession();
    miId = session?.user?.id || null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre_completo, rol, activo')
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
    const sinNombre = !u.nombre_completo || pareceCorreo(u.nombre_completo);
    return `
    <div class="zx-fila zx-usuario-fila" data-id="${escaparHtml(u.id)}">
      <div class="zx-fila-info">
        <span class="zx-fila-folio" data-nombre-texto>${sinNombre ? '<em>Sin nombre registrado</em>' : escaparHtml(u.nombre_completo)}${propio ? ' (tú)' : ''}</span>
        <span class="zx-fila-meta" data-nombre-meta>${sinNombre ? 'Falta el nombre: usa "Editar nombre"' : ''}${u.activo === false ? (sinNombre ? ' · ' : '') + 'inactivo' : ''}</span>
      </div>
      <div class="zx-usuario-controles">
        ${u.rol ? '' : '<span class="zx-etiqueta-pendiente">Pendiente de rol</span>'}
        <button type="button" class="zx-btn zx-btn-sm zx-btn-secundario" data-accion="editar-nombre" data-nombre="${escaparHtml(sinNombre ? '' : u.nombre_completo)}">Editar nombre</button>
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

// ---------- Editar nombre ----------
function abrirEdicionNombre(btn) {
  const fila = btn.closest('[data-id]');
  const info = fila.querySelector('.zx-fila-info');
  info.innerHTML = `<input type="text" class="zx-input-nombre" data-input-nombre maxlength="120" placeholder="Nombre completo" value="${escaparHtml(btn.dataset.nombre)}" aria-label="Nombre completo" />`;
  btn.textContent = 'Guardar';
  btn.dataset.accion = 'guardar-nombre';
  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.className = 'zx-btn zx-btn-sm zx-btn-secundario';
  cancelar.dataset.accion = 'cancelar-nombre';
  cancelar.textContent = 'Cancelar';
  btn.insertAdjacentElement('afterend', cancelar);
  info.querySelector('input').focus();
}

async function guardarNombre(fila) {
  const nombre = fila.querySelector('[data-input-nombre]').value.trim().replace(/\s+/g, ' ');
  if (!nombre) { mostrarMensaje('Escribe el nombre completo de la persona.', false); return; }
  if (pareceCorreo(nombre)) { mostrarMensaje('Escribe el nombre de la persona, no su correo.', false); return; }
  await actualizarPerfil(fila.dataset.id, { nombre_completo: nombre }, 'Nombre actualizado.');
}

document.getElementById('lista-usuarios').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;
  const accion = btn.dataset.accion; // se lee antes de que abrirEdicionNombre la cambie
  if (accion === 'editar-nombre') abrirEdicionNombre(btn);
  else if (accion === 'cancelar-nombre') await cargarUsuarios();
  else if (accion === 'guardar-nombre') await guardarNombre(btn.closest('[data-id]'));
});
document.getElementById('lista-usuarios').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-input-nombre]')) { e.preventDefault(); await guardarNombre(e.target.closest('[data-id]')); }
  if (e.key === 'Escape' && e.target.matches('[data-input-nombre]')) await cargarUsuarios();
});
