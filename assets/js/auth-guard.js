// ZX · Procesos — control de sesión y de rol, compartido por comercial/calidad/cedis.
import { supabase } from './supabase-client.js';
import { APP_VERSION } from './version.js';
import { TODAS_LAS_PANTALLAS, pantallaPorClave, pantallasDePerfil } from './pantallas.js';

/**
 * Exige que haya una sesión activa y (opcionalmente) un rol o una pantalla permitidos.
 * Si no se cumple, redirige al login o bloquea la pantalla.
 * @param {string[]|null} rolesPermitidos - ej. ['admin']. null = no se filtra por nombre de rol.
 * @param {string|null} pantalla - clave de pantalla (ver pantallas.js). Si se da, el rol de la
 *   persona debe tener esa pantalla asignada (en la pantalla Roles). Si la pantalla es de las que
 *   tienen un rol "nativo" (comercial/calidad/cedis) y la persona ni tiene ese rol ni "actúa como" él
 *   (roles.actua_como, ver pantalla Roles), la pantalla se abre en solo lectura (body.zx-solo-lectura: se esconden los botones que cambian el proceso).
 * @returns {Promise<{session, perfil}|null>} perfil incluye `rolNombre` y `pantallas` (claves).
 */
export async function exigirSesion(rolesPermitidos = null, pantalla = null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.replace('login.html');
    return null;
  }

  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('rol, nombre_completo, activo, roles(nombre, pantallas, actua_como)')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil || perfil.activo === false) {
    await supabase.auth.signOut();
    location.replace('login.html?motivo=inactiva');
    return null;
  }

  if (!perfil.rol) {
    mostrarBloqueo('Tu cuenta todavía no tiene un rol asignado. Pide a un administrador que te lo asigne.');
    return null;
  }

  perfil.rolNombre = perfil.roles?.nombre || ETIQUETAS_ROL[perfil.rol] || perfil.rol;
  perfil.pantallas = pantallasDePerfil(perfil.rol, perfil.roles?.pantallas);
  // Roles de los que la persona puede ejecutar acciones: el suyo + los que le dio el admin en Roles ("actúa como").
  perfil.actuaComo = [perfil.rol, ...(perfil.roles?.actua_como || [])];

  if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) {
    mostrarBloqueo('Tu cuenta no tiene acceso a esta pantalla.');
    return null;
  }

  if (pantalla) {
    if (!perfil.pantallas.includes(pantalla)) {
      mostrarBloqueo('Tu rol no tiene acceso a esta pantalla.');
      return null;
    }
    const rolNativo = pantallaPorClave(pantalla)?.rolNativo;
    if (rolNativo && !perfil.actuaComo.includes(rolNativo)) {
      document.body.classList.add('zx-solo-lectura');
    }
  }

  return { session, perfil };
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
  location.replace('login.html?salida=1'); // evita que la entrada directa a Microsoft la reabra sola
}

function mostrarBloqueo(mensaje) {
  document.body.innerHTML = `
    <div class="zx-bloqueo">
      <p>${mensaje}</p>
      <button id="zx-btn-salir-bloqueo" class="zx-btn zx-btn-primario">Cerrar sesión</button>
    </div>`;
  document.getElementById('zx-btn-salir-bloqueo').addEventListener('click', cerrarSesion);
}

/** Etiqueta legible de cada rol (para el botón de usuario del encabezado y otras pantallas). */
export const ETIQUETAS_ROL = { comercial: 'Comercial', calidad: 'Calidad', cedis: 'CEDIS', admin: 'Administrador' };

/**
 * Pinta el encabezado compartido: a la izquierda el ícono (y el título de la pantalla), en medio
 * las pestañas de admin o el botón de acción propio de la pantalla, y a la derecha un botón con
 * un interruptor sol/luna (modo noche) y el nombre del usuario que, al darle clic, abre un menú con
 * "Cerrar sesión".
 * @param {object} perfil
 * @param {string} tituloPantalla
 * @param {{boton?: {id: string, texto: string, titulo?: string, icono?: string}}} [opciones] -
 *   botón de acción extra a mostrar junto a las pestañas (ej. "Nueva queja"). Solo se pinta el
 *   <button>; quien llama debe engancharle su propio listener después de esta función.
 */
export function pintarEncabezado(perfil, tituloPantalla, opciones = {}) {
  const el = document.getElementById('zx-encabezado');
  if (!el) return;
  const paginaActual = location.pathname.split('/').pop();
  const pantallasNav = (perfil.pantallas || []).map(pantallaPorClave).filter(Boolean);
  const navAdmin = `
    <nav class="zx-header-nav">
      ${pantallasNav.map((p) => `<a class="${[p.href === paginaActual ? 'zx-nav-activo' : '', p.clave === 'quejas_cerradas' ? 'zx-nav-boton' : ''].filter(Boolean).join(' ')}" href="${p.href}">${p.etiqueta}</a>`).join('')}
    </nav>`;
  const botonAccion = opciones.boton
    ? `<button type="button" id="${opciones.boton.id}" class="zx-btn-header-accion"${opciones.boton.titulo ? ` title="${escaparHtml(opciones.boton.titulo)}"` : ''}>${opciones.boton.icono ? `<span class="zx-btn-header-icono">${escaparHtml(opciones.boton.icono)}</span>` : ''}<span>${escaparHtml(opciones.boton.texto)}</span></button>`
    : '';
  el.innerHTML = `
    <div class="zx-header-inner">
      <div class="zx-header-marca">
        <img class="zx-header-logo" src="assets/img/logo-zx.png" alt="ZX" />
        <span class="zx-header-titulo">${tituloPantalla}</span>
      </div>
      ${navAdmin}
      ${botonAccion}
      <div class="zx-header-derecha">
        <button type="button" id="zx-btn-tema" class="zx-interruptor-tema" role="switch" aria-checked="false" aria-label="Modo noche" title="Modo noche">
          <span class="zx-interruptor-icono zx-icono-sol" aria-hidden="true">☀️</span>
          <span class="zx-interruptor-icono zx-icono-luna" aria-hidden="true">🌙</span>
          <span class="zx-interruptor-bola" aria-hidden="true"></span>
        </button>
        <div class="zx-header-usuario-menu">
          <button type="button" id="zx-btn-usuario-menu" class="zx-btn-usuario" aria-haspopup="true" aria-expanded="false">
            <span class="zx-usuario-nombre">${escaparHtml(nombreVisible(perfil.nombre_completo))}</span>
            <span class="zx-usuario-flecha" aria-hidden="true">▾</span>
          </button>
          <div id="zx-menu-usuario" class="zx-menu-desplegable zx-oculto">
            <button type="button" id="zx-btn-salir" class="zx-menu-item zx-menu-item-peligro">Cerrar sesión</button>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById('zx-btn-salir').addEventListener('click', cerrarSesion);
  if (document.body.classList.contains('zx-solo-lectura') && !document.getElementById('zx-aviso-lectura')) {
    el.insertAdjacentHTML('afterend', '<div id="zx-aviso-lectura" class="zx-aviso-lectura">Estás viendo esta pantalla en modo solo lectura: tu rol puede consultar la información, pero no ejecutar acciones.</div>');
  }

  const btnTema = document.getElementById('zx-btn-tema');
  pintarIconoTema(btnTema);
  btnTema.addEventListener('click', () => {
    alternarTema();
    pintarIconoTema(btnTema);
  });

  const btnMenu = document.getElementById('zx-btn-usuario-menu');
  const menu = document.getElementById('zx-menu-usuario');
  function cerrarMenu() {
    menu.classList.add('zx-oculto');
    btnMenu.setAttribute('aria-expanded', 'false');
  }
  function abrirMenu() {
    menu.classList.remove('zx-oculto');
    btnMenu.setAttribute('aria-expanded', 'true');
  }
  btnMenu.addEventListener('click', (evento) => {
    evento.stopPropagation();
    if (menu.classList.contains('zx-oculto')) abrirMenu(); else cerrarMenu();
  });
  document.addEventListener('click', (evento) => {
    if (!menu.classList.contains('zx-oculto') && !menu.contains(evento.target) && evento.target !== btnMenu) cerrarMenu();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') cerrarMenu();
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
  const oscuro = temaActual() === 'oscuro';
  boton.setAttribute('aria-checked', oscuro ? 'true' : 'false');
  boton.title = oscuro ? 'Cambiar a modo día' : 'Cambiar a modo noche';
  boton.setAttribute('aria-label', boton.title);
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

/** ¿El texto parece un correo? (algunas cuentas nuevas traían el correo como nombre). */
export function pareceCorreo(texto) {
  return /^\S+@\S+\.\S+$/.test(String(texto || '').trim());
}

/** Nombre para mostrar en pantallas y documentos: el nombre de la persona; nunca su correo. */
export function nombreVisible(nombre) {
  const t = String(nombre ?? '').trim();
  return t && !pareceCorreo(t) ? t : 'Sin nombre registrado';
}

export function escaparHtml(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
