import { supabase } from './supabase-client.js';
import { pintarPie } from './auth-guard.js';
import { mostrarError, ocultarMensaje, redirigirSegunRol } from './login-comun.js';

// Usuario local: cuentas con usuario y contraseña que crea un administrador en Usuarios. Supabase Auth
// siempre necesita un correo, así que se construye aquí (<usuario>@zx-procesos.local) y la persona
// nunca lo ve.
const DOMINIO_INTERNO = 'zx-procesos.local';
function construirCorreoInterno(usuario) {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, '');
  return `${limpio}@${DOMINIO_INTERNO}`;
}

pintarPie();

const btnMicrosoft = document.getElementById('zx-btn-microsoft');

// Si Microsoft/Supabase devolvió un error en la URL (cuenta ajena a la organización,
// permisos rechazados, etc.), se muestra y se limpia la dirección.
(function mostrarErrorDeRetorno() {
  const params = new URLSearchParams(location.search + '&' + location.hash.replace(/^#/, ''));
  const desc = params.get('error_description');
  if (desc) {
    mostrarError('No se pudo iniciar sesión con Microsoft: ' + desc.replace(/\+/g, ' '));
    history.replaceState(null, '', location.pathname);
  }
})();

// Si ya había sesión (o Supabase acaba de intercambiar el código de Microsoft), redirige directo.
redirigirSegunRol();

btnMicrosoft.addEventListener('click', async () => {
  ocultarMensaje();
  btnMicrosoft.disabled = true;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email',
      redirectTo: location.origin + location.pathname,
    },
  });
  if (error) {
    mostrarError('No se pudo iniciar sesión con Microsoft: ' + error.message);
    btnMicrosoft.disabled = false;
  }
  // Si no hay error, el navegador ya va camino a la pantalla de Microsoft.
});

// ---------- Usuario local ----------
const btnLocal = document.getElementById('zx-btn-mostrar-local');
const formLocal = document.getElementById('zx-form-login');
const btnEntrar = document.getElementById('zx-btn-entrar');

btnLocal.addEventListener('click', () => {
  const abrir = formLocal.classList.contains('zx-oculto');
  formLocal.classList.toggle('zx-oculto', !abrir);
  btnLocal.setAttribute('aria-expanded', String(abrir));
  if (abrir) document.getElementById('usuario').focus();
});

formLocal.addEventListener('submit', async (evento) => {
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
