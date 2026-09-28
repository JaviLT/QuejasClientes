// ZX · Procesos — control de sesión y de rol, compartido por comercial/calidad/cedis.
import { supabase } from './supabase-client.js';

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

/** Pinta el encabezado compartido (logo, título de pantalla, usuario, modo noche, botón salir). */
export function pintarEncabezado(perfil, tituloPantalla) {
  const el = document.getElementById('zx-encabezado');
  if (!el) return;
  el.innerHTML = `
    <div class="zx-header-inner">
      <div class="zx-header-marca">
        <span class="zx-header-logo">ZX</span>
        <span class="zx-header-titulo">${tituloPantalla}</span>
      </div>
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
