import { supabase } from './supabase-client.js';

export const DESTINOS = { comercial: 'comercial.html', calidad: 'calidad.html', cedis: 'cedis.html', admin: 'admin.html' };

const mensaje = document.getElementById('zx-mensaje');

export function mostrarError(texto, tipo = 'error') {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (tipo === 'info' ? 'zx-mensaje-info' : 'zx-mensaje-error');
}

export function ocultarMensaje() {
  mensaje.classList.add('zx-oculto');
}

// Con la sesión ya abierta (contraseña o Microsoft) manda a cada persona a su pantalla.
// Quien entra con Microsoft por primera vez queda registrado SIN rol: se le avisa y se
// cierra la sesión hasta que un administrador le asigne uno desde la pantalla Usuarios.
export async function redirigirSegunRol() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('rol, activo, correo')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil || perfil.activo === false) {
    await supabase.auth.signOut();
    mostrarError('Tu cuenta no está activa. Contacta a un administrador.');
    return false;
  }

  const destino = DESTINOS[perfil.rol];
  if (!destino) {
    const quien = perfil.correo ? ` (${perfil.correo})` : '';
    await supabase.auth.signOut();
    mostrarError(`Tu cuenta${quien} ya quedó registrada, pero todavía no tiene un rol asignado. Pide a un administrador que te lo asigne y vuelve a entrar.`, 'info');
    return false;
  }

  location.replace(destino);
  return true;
}
