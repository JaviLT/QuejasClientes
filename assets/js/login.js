import { supabase } from './supabase-client.js';
import { pintarPie } from './auth-guard.js';
import { mostrarError, ocultarMensaje, redirigirSegunRol } from './login-comun.js';

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
