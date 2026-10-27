// ZX · Procesos — pantalla Roles (solo Admin): crear roles y decidir qué pantallas ve cada uno.
// Controla qué PANTALLAS ve cada rol y, opcionalmente, como qué rol (Comercial/Calidad/CEDIS) puede ejecutar acciones.
// Las acciones se validan en la base de datos (RPCs con rol_en()); aquí solo se configura roles.actua_como.
import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { PANTALLAS_ASIGNABLES } from './pantallas.js';

const mensaje = document.getElementById('zx-mensaje');

function mostrarMensaje(texto, ok) {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (ok ? 'zx-mensaje-ok' : 'zx-mensaje-error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function casillas(prefijo, marcadas, deshabilitar = false) {
  return PANTALLAS_ASIGNABLES.map((p) => `
    <label><input type="checkbox" data-pantalla="${p.clave}" ${marcadas.includes(p.clave) ? 'checked' : ''} ${deshabilitar ? 'disabled' : ''} /> ${escaparHtml(p.etiqueta)}</label>`).join('');
}

const ACCIONES = PANTALLAS_ASIGNABLES.filter((p) => p.rolNativo);

function casillasActua(marcadas) {
  return ACCIONES.map((p) => `
    <label><input type="checkbox" data-actua="${p.rolNativo}" ${marcadas.includes(p.rolNativo) ? 'checked' : ''} /> ${escaparHtml(p.etiqueta)}</label>`).join('');
}

/** Marcar "actúa como X" marca también la pantalla X; quitar la pantalla quita el permiso de acción. */
function enlazarCasillas(contenedor) {
  contenedor.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const ambito = t.closest('.zx-rol-tarjeta') || contenedor; // solo la tarjeta del rol que se está editando
    if (t.dataset.actua && t.checked) {
      const pant = ambito.querySelector(`input[data-pantalla="${t.dataset.actua}"]`);
      if (pant) pant.checked = true;
    }
    if (t.dataset.pantalla && !t.checked) {
      const act = ambito.querySelector(`input[data-actua="${t.dataset.pantalla}"]`);
      if (act) act.checked = false;
    }
  });
}

/** Clave estable a partir del nombre: minúsculas, sin acentos, guiones bajos. */
function claveDesdeNombre(nombre) {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 29);
}

const sesion = await exigirSesion(['admin']);
if (sesion) {
  pintarEncabezado(sesion.perfil, 'Roles');
  document.getElementById('nuevo-rol-pantallas').innerHTML = casillas('nuevo', []);
  document.getElementById('nuevo-rol-actua').innerHTML = casillasActua([]);
  enlazarCasillas(document.getElementById('zx-form-rol'));
  enlazarCasillas(document.getElementById('lista-roles'));
  await cargarRoles();
}

async function cargarRoles() {
  const [rr, rp] = await Promise.all([
    supabase.from('roles').select('clave, nombre, pantallas, actua_como, es_sistema').order('es_sistema', { ascending: false }).order('nombre'),
    supabase.from('profiles').select('rol'),
  ]);
  const cont = document.getElementById('lista-roles');
  if (rr.error) { cont.innerHTML = `<p class="zx-vacio">${escaparHtml(rr.error.message)}</p>`; return; }

  const personas = {};
  (rp.data || []).forEach((p) => { if (p.rol) personas[p.rol] = (personas[p.rol] || 0) + 1; });
  document.getElementById('c-roles').textContent = rr.data.length;

  cont.innerHTML = rr.data.map((r) => {
    const esAdmin = r.clave === 'admin';
    const n = personas[r.clave] || 0;
    return `
    <div class="zx-rol-tarjeta" data-clave="${escaparHtml(r.clave)}">
      <div class="zx-rol-cabecera">
        <strong>${escaparHtml(r.nombre)}</strong>
        <span>
          <span class="zx-rol-etiqueta">${r.es_sistema ? 'Del sistema' : 'Personalizado'}</span>
          <span class="zx-rol-etiqueta">${n} ${n === 1 ? 'persona' : 'personas'}</span>
        </span>
      </div>
      ${esAdmin
        ? '<p class="zx-fila-meta" style="margin:10px 0 0;">Ve Administrador, Usuarios, Roles, Tiempos y Quejas cerradas. No se puede modificar.</p>'
        : `<div class="zx-rol-pantallas">${casillas('r', r.pantallas)}</div>
           ${r.es_sistema ? '' : `<p class="zx-fila-meta" style="margin:0 0 4px;">Puede ejecutar acciones como:</p><div class="zx-rol-pantallas" style="margin-top:4px;">${casillasActua(r.actua_como || [])}</div>`}
           <div class="zx-rol-acciones">
             <button type="button" class="zx-btn zx-btn-primario zx-btn-sm" data-accion="guardar">Guardar pantallas</button>
             ${r.es_sistema ? '' : `<button type="button" class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="borrar" data-personas="${n}">Borrar rol</button>`}
           </div>`}
    </div>`;
  }).join('');
}

document.getElementById('lista-roles').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;
  const tarjeta = btn.closest('[data-clave]');
  const clave = tarjeta.dataset.clave;
  const nombre = tarjeta.querySelector('strong').textContent;

  if (btn.dataset.accion === 'guardar') {
    const pantallas = [...tarjeta.querySelectorAll('input[data-pantalla]:checked')].map((i) => i.dataset.pantalla);
    const cambios = { pantallas };
    if (tarjeta.querySelector('input[data-actua]')) {
      cambios.actua_como = [...tarjeta.querySelectorAll('input[data-actua]:checked')].map((i) => i.dataset.actua);
    }
    btn.disabled = true;
    const { data, error } = await supabase.from('roles').update(cambios).eq('clave', clave).select('clave');
    if (error || !data || data.length === 0) mostrarMensaje('No se pudo guardar: ' + (error?.message || 'sin permiso'), false);
    else mostrarMensaje(`Pantallas de "${nombre}" guardadas.`, true);
    await cargarRoles();
  }

  if (btn.dataset.accion === 'borrar') {
    if (Number(btn.dataset.personas) > 0) {
      mostrarMensaje(`No se puede borrar "${nombre}": hay ${btn.dataset.personas} persona(s) con ese rol. Cámbiales el rol en Usuarios primero.`, false);
      return;
    }
    if (!confirm(`¿Borrar el rol "${nombre}"? No se puede deshacer.`)) return;
    btn.disabled = true;
    const { error } = await supabase.from('roles').delete().eq('clave', clave);
    if (error) mostrarMensaje('No se pudo borrar: ' + error.message, false);
    else mostrarMensaje(`Rol "${nombre}" borrado.`, true);
    await cargarRoles();
  }
});

document.getElementById('zx-form-rol').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('rol-nombre').value.trim();
  const clave = claveDesdeNombre(nombre);
  const pantallas = [...document.querySelectorAll('#nuevo-rol-pantallas input:checked')].map((i) => i.dataset.pantalla);
  const actua_como = [...document.querySelectorAll('#nuevo-rol-actua input:checked')].map((i) => i.dataset.actua);
  if (!/^[a-z][a-z0-9_]{1,29}$/.test(clave)) {
    mostrarMensaje('El nombre debe empezar con una letra y tener al menos 2 caracteres.', false);
    return;
  }
  const btn = document.getElementById('zx-btn-crear-rol');
  btn.disabled = true;
  const { error } = await supabase.from('roles').insert({ clave, nombre, pantallas, actua_como, es_sistema: false });
  btn.disabled = false;
  if (error) {
    mostrarMensaje(/duplicate|unique/i.test(error.message) ? `Ya existe un rol con ese nombre.` : 'No se pudo crear el rol: ' + error.message, false);
    return;
  }
  mostrarMensaje(`Rol "${nombre}" creado. Ya puedes asignarlo en Usuarios.`, true);
  e.target.reset();
  document.querySelectorAll('#nuevo-rol-pantallas input, #nuevo-rol-actua input').forEach((i) => { i.checked = false; });
  await cargarRoles();
});
