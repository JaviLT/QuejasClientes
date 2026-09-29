// ZX · Procesos — control de sesión y de rol, compartido por comercial/calidad/cedis.
import { supabase } from './supabase-client.js';
import { APP_VERSION } from './version.js';

/**
 * Exige que haya una sesión activa y (opcionalmente) un rol permitido.
 * Si no se cumple, redirige al login o bloquea la pantalla.
 * @param {string[]|null} rolesPermitidos - ej. ['calidad','admin']. null = cualquier rol con sesión.
 * @returns {Promise<{session, perfil}|null>}
 */
export async function exigirSesion(rolesPermitidos = null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.replace('index.html');
    return null;
  }

  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('rol, nombre_completo, activo')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil || perfil.activo === false) {
    await supabase.auth.signOut();
    location.replace('index.html');
    return null;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) {
    mostrarBloqueo('Tu cuenta no tiene acceso a esta pantalla.');
    return null;
  }

  if (!perfil.rol) {
    mostrarBloqueo('Tu cuenta todavía no tiene un rol asignado. Pide a un administrador que te lo asigne.');
    return null;
  }

  return { session, perfil };
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
  location.replace('index.html');
}

function mostrarBloqueo(mensaje) {
  document.body.innerHTML = `
    <div class="zx-bloqueo">
      <p>${mensaje}</p>
      <button id="zx-btn-salir-bloqueo" class="zx-btn zx-btn-primario">Cerrar sesión</button>
    </div>`;
  document.getElementById('zx-btn-salir-bloqueo').addEventListener('click', cerrarSesion);
}

const PANTALLAS_ADMIN = [
  { href: 'tiempos.html', etiqueta: 'Tiempos' },
  { href: 'usuarios.html', etiqueta: 'Usuarios' },
];

/**
 * Pinta el encabezado compartido (logo, título de pantalla, usuario, modo noche, botón salir).
 * @param {object} perfil
 * @param {string} tituloPantalla
 * @param {{boton?: {id: string, texto: string, titulo?: string}}} [opciones] - botón de acción
 *   extra a mostrar en la barra superior (ej. "+ Nueva queja"). Solo se pinta el <button>; quien
 *   llama debe engancharle su propio listener después de esta función.
 */
export function pintarEncabezado(perfil, tituloPantalla, opciones = {}) {
  const el = document.getElementById('zx-encabezado');
  if (!el) return;
  const paginaActual = location.pathname.split('/').pop();
  const navAdmin = perfil.rol === 'admin' ? `
    <nav class="zx-header-nav-admin">
      ${PANTALLAS_ADMIN.map((p) => `<a class="${p.href === paginaActual ? 'zx-nav-activo' : ''}" href="${p.href}">${p.etiqueta}</a>`).join('')}
    </nav>` : '';
  const botonAccion = opciones.boton
    ? `<button type="button" id="${opciones.boton.id}" class="zx-btn zx-btn-primario zx-btn-sm"${opciones.boton.titulo ? ` title="${escaparHtml(opciones.boton.titulo)}"` : ''}>${escaparHtml(opciones.boton.texto)}</button>`
    : '';
  el.innerHTML = `
    <div class="zx-header-inner">
      <div class="zx-header-marca">
        <span class="zx-header-logo">ZX</span>
        <span class="zx-header-titulo">${tituloPantalla}</span>
      </div>
      ${navAdmin}
      ${botonAccion}
      <div class="zx-header-usuario">
        <span>${escaparHtml(perfil.nombre_completo)} · <strong>${escaparHtml(perfil.rol)}</strong></span>
        <button id="zx-btn-tema" class="zx-btn-tema" type="button" title="Cambiar a modo noche/día"></button>
        <button id="zx-btn-salir" class="zx-btn zx-btn-ghost zx-btn-sm">Cerrar sesión</button>
      </div>
    </div>`;
  document.getElementById('zx-btn-salir').addEventListener('click', cerrarSesion);
  const btnTema = document.getElementById('zx-btn-tema');
  pintarIconoTema(btnTema);
  btnTema.addEventListener('click', () => {
    alternarTema();
    pintarIconoTema(btnTema);
  });
  pintarPie();
}

/** Escribe la versión de la app en el pie de página (assets/js/version.js), en cualquier pantalla que tenga <footer class="zx-pie">. */
export function pintarPie() {
  const el = document.querySelector('footer.zx-pie');
  if (el) el.textContent = `Quejas de Clientes — Zubex · v${APP_VERSION}`;
}

/**
 * Doble check antes de una acción que cambia el proceso de una queja (para evitar clics
 * accidentales). Hoy es un simple confirm() del navegador; centralizado aquí para que, si
 * más adelante se cambia el estilo de confirmación, solo haya que tocar esta función.
 */
export function confirmarAccion(mensaje) {
  return window.confirm(mensaje);
}

const CLAVE_TEMA = 'zx-tema';

function temaActual() {
  return document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'oscuro' : 'claro';
}

function pintarIconoTema(boton) {
  boton.textContent = temaActual() === 'oscuro' ? '☀️' : '🌙';
}

/** Alterna entre modo claro/oscuro y lo guarda para futuras visitas. */
export function alternarTema() {
  const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
  if (nuevo === 'oscuro') {
    document.documentElement.setAttribute('data-tema', 'oscuro');
  } else {
    document.documentElement.removeAttribute('data-tema');
  }
  try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch (e) { /* almacenamiento no disponible */ }
}

export function escaparHtml(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
