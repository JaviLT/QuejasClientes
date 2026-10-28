import { supabase } from './supabase-client.js';
import { PANTALLAS_ASIGNABLES } from './pantallas.js';
import { pareceCorreo } from './auth-guard.js';

export const DESTINOS = { comercial: 'comercial.html', calidad: 'calidad.html', cedis: 'cedis.html', admin: 'admin.html' };

const mensaje = document.getElementById('zx-mensaje');

/** El directorio suele traer los nombres en MAYÚSCULAS: se pasan a "Nombre Apellido". */
function formatearNombre(texto) {
  const t = String(texto || '').trim().replace(/\s+/g, ' ');
  if (t && t === t.toUpperCase()) return t.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  return t;
}

export function mostrarError(texto, tipo = 'error') {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (tipo === 'info' ? 'zx-mensaje-info' : 'zx-mensaje-error');
}

export function ocultarMensaje() {
  mensaje.classList.add('zx-oculto');
}

/**
 * Con la sesión de Microsoft ya abierta manda a cada persona a su pantalla.
 * Quien entra por primera vez queda registrado SIN rol: se le avisa y se cierra la sesión de la
 * app hasta que un administrador le asigne uno desde la pantalla Usuarios.
 * @returns {Promise<'ok'|'sin_sesion'|'bloqueado'>} 'ok' = ya se redirigió; 'sin_sesion' = no hay sesión
 *   (toca ir a Microsoft); 'bloqueado' = hay sesión pero no puede entrar (ya se mostró el motivo; NO
 *   hay que reenviarla a Microsoft en automático o se crearía un ciclo).
 */
export async function redirigirSegunRol() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'sin_sesion';

  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('rol, activo, nombre_completo, roles(pantallas)')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil || perfil.activo === false) {
    await supabase.auth.signOut();
    mostrarError('Tu cuenta no está activa. Contacta a un administrador.');
    return 'bloqueado';
  }

  // Cuentas cuyo nombre guardado es un correo: se completa con el nombre real de Microsoft (tenant) si llega
  // en la sesión o, si no, se le pregunta a Microsoft con el permiso de la sesión recién abierta.
  if (pareceCorreo(perfil.nombre_completo)) {
    let nombreMicrosoft = session.user.user_metadata?.name || session.user.user_metadata?.full_name || '';
    if (!nombreMicrosoft && session.provider_token) {
      try {
        const r = await fetch('https://graph.microsoft.com/oidc/userinfo', { headers: { Authorization: `Bearer ${session.provider_token}` } });
        if (r.ok) nombreMicrosoft = (await r.json()).name || '';
      } catch (e) { /* sin red o sin permiso: se queda como está */ }
    }
    nombreMicrosoft = formatearNombre(nombreMicrosoft);
    if (nombreMicrosoft && !pareceCorreo(nombreMicrosoft)) {
      await supabase.from('profiles').update({ nombre_completo: nombreMicrosoft }).eq('id', session.user.id);
    }
  }

  // Admin → su panel; cualquier otro rol (de siempre o creado por el admin) → la primera de sus pantallas asignadas.
  const primera = PANTALLAS_ASIGNABLES.find((p) => (perfil.roles?.pantallas || []).includes(p.clave));
  const destino = perfil.rol === 'admin' ? DESTINOS.admin : (primera && primera.href);
  if (!destino) {
    const quien = '';
    await supabase.auth.signOut();
    mostrarError(perfil.rol
      ? `Tu rol todavía no tiene pantallas asignadas${quien}. Pide a un administrador que se las asigne y vuelve a entrar.`
      : `Tu cuenta${quien} ya quedó registrada, pero todavía no tiene un rol asignado. Pide a un administrador que te lo asigne y vuelve a entrar.`, 'info');
    return 'bloqueado';
  }

  location.replace(destino);
  return 'ok';
}
