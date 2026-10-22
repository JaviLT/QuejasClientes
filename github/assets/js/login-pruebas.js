import { supabase } from './supabase-client.js';
import { pintarPie } from './auth-guard.js';
import { mostrarError, ocultarMensaje, redirigirSegunRol } from './login-comun.js';

pintarPie();

// Acceso con usuario y contraseña SOLO para cuentas de prueba (COMERCIAL, CALIDAD, CEDIS, ADMIN
// creadas por un administrador). Supabase Auth necesita un correo, así que se construye aquí.
const DOMINIO_INTERNO = 'zx-procesos.local';

function construirCorreoInterno(usuario) {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, '');
  return `${limpio}@${DOMINIO_INTERNO}`;
}

const form = document.getElementById('zx-form-login');
const btnEntrar = document.getElementById('zx-btn-entrar');

redirigirSegunRol();

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  ocultarMensaje();
  btnEntrar.disabled = true;
  btnEntrar.textContent = 'Entrando…';

  const usuario = document.getElementById('usuario').value;
  const contrasena = document.getElementById('contrasena').value;

  const { error } = await supabase.auth.signInWithPassword({
    email: construirCorreoInterno(usuario),
    password: contrasena,
  });

  if (error) {
    mostrarError('Usuario o contraseña incorrectos.');
  } else {
    await redirigirSegunRol();
  }
  btnEntrar.disabled = false;
  btnEntrar.textContent = 'Entrar';
});
