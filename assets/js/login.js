// ZX · Procesos — entrada a la app. No hay formulario: la persona entra con su cuenta de Microsoft.
//  · Al abrir la app sin sesión → se la manda directo a la pantalla de inicio de sesión de Microsoft
//    (si ya tiene sesión de Microsoft abierta, Microsoft la regresa sin pedir nada).
//  · Al regresar de Microsoft → se la lleva a la pantalla que le toca según su rol.
//  · Si algo falla (cuenta ajena, sin rol, inactiva, sesión cerrada a propósito) se muestra el motivo con
//    un botón; NO se reenvía a Microsoft en automático, para no crear un ciclo infinito.
import { supabase } from './supabase-client.js';
import { pintarPie } from './auth-guard.js';
import { mostrarError, redirigirSegunRol } from './login-comun.js';

pintarPie();

const btnMicrosoft = document.getElementById('zx-btn-microsoft');
const textoBtn = document.getElementById('zx-btn-microsoft-texto');
const estado = document.getElementById('zx-login-estado');
const params = new URLSearchParams(location.search + '&' + location.hash.replace(/^#/, ''));

/** Muestra el botón (con un texto de estado) en lugar de redirigir automáticamente. */
function mostrarBoton(textoEstado, textoBoton) {
  estado.textContent = textoEstado;
  textoBtn.textContent = textoBoton;
  btnMicrosoft.classList.remove('zx-oculto');
  btnMicrosoft.disabled = false;
}

/** Va a Microsoft. `elegirCuenta` obliga a escoger la cuenta (para cambiar de cuenta tras un error). */
async function irAMicrosoft(elegirCuenta) {
  btnMicrosoft.disabled = true;
  estado.textContent = 'Entrando con tu cuenta de Microsoft…';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile',
      redirectTo: location.origin + location.pathname,
      ...(elegirCuenta ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  });
  if (error) {
    mostrarError('No se pudo iniciar sesión con Microsoft: ' + error.message);
    mostrarBoton('No se pudo conectar con Microsoft.', 'Reintentar');
  }
  // Sin error, el navegador ya va camino a la pantalla de Microsoft.
}

btnMicrosoft.addEventListener('click', () => irAMicrosoft(btnMicrosoft.dataset.elegir === '1'));

// Freno anti-ciclo: máximo 2 redirecciones automáticas en 2 minutos; después se pide un clic.
function puedeRedirigirSolo() {
  try {
    const ahora = Date.now();
    const intentos = JSON.parse(sessionStorage.getItem('zx-intentos-login') || '[]').filter((t) => ahora - t < 120000);
    if (intentos.length >= 2) return false;
    intentos.push(ahora);
    sessionStorage.setItem('zx-intentos-login', JSON.stringify(intentos));
  } catch (e) { /* sin almacenamiento: se permite */ }
  return true;
}

(async function iniciar() {
  // 1) Microsoft/Supabase devolvió un error (cuenta ajena a la organización, usuario sin asignar en Entra, permisos rechazados…).
  const desc = params.get('error_description');
  if (desc) {
    mostrarError('No se pudo iniciar sesión con Microsoft: ' + desc.replace(/\+/g, ' '));
    history.replaceState(null, '', location.pathname);
    btnMicrosoft.dataset.elegir = '1';
    mostrarBoton('Puedes volver a intentarlo o usar otra cuenta de Microsoft.', 'Reintentar con Microsoft');
    return;
  }

  // 2) Hay sesión (o Supabase acaba de intercambiar el código de Microsoft) → a su pantalla.
  const resultado = await redirigirSegunRol();
  if (resultado === 'ok') return;
  if (resultado === 'bloqueado') {
    btnMicrosoft.dataset.elegir = '1';
    mostrarBoton('No se pudo entrar con esta cuenta.', 'Entrar con otra cuenta de Microsoft');
    return;
  }

  // 3) Sin sesión. Si venimos de "Cerrar sesión" o de una cuenta inactiva, no se reenvía solo.
  if (params.get('salida') === '1') {
    history.replaceState(null, '', location.pathname);
    mostrarBoton('Cerraste tu sesión.', 'Entrar con Microsoft');
    return;
  }
  if (params.get('motivo')) {
    history.replaceState(null, '', location.pathname);
    mostrarError(params.get('motivo') === 'inactiva'
      ? 'Tu cuenta no está activa o no se pudo cargar tu perfil. Contacta a un administrador.'
      : 'Tu sesión terminó.');
    btnMicrosoft.dataset.elegir = '1';
    mostrarBoton('Puedes volver a entrar con tu cuenta de Microsoft.', 'Entrar con Microsoft');
    return;
  }
  // Si veníamos de Microsoft con un código y aun así no hay sesión, algo falló: no se repite el ciclo.
  if (params.get('code') || !puedeRedirigirSolo()) {
    history.replaceState(null, '', location.pathname);
    mostrarBoton('No se pudo completar el inicio de sesión.', 'Entrar con Microsoft');
    return;
  }

  // 4) Caso normal: abrir la app sin sesión → directo a Microsoft.
  await irAMicrosoft(false);
})();
