import { supabase } from './supabase-client.js';
import { pintarPie } from './auth-guard.js';

pintarPie();

const DESTINOS = { comercial: 'comercial.html', calidad: 'calidad.html', cedis: 'cedis.html', admin: 'tiempos.html' };

// El usuario solo escribe una palabra (COMERCIAL, CALIDAD, CEDIS, ADMIN); por
// dentro Supabase Auth siempre necesita un correo, así que se construye aquí
// y nunca se le muestra a la persona que inicia sesión.
const DOMINIO_INTERNO = 'zx-procesos.local';

function construirCorreoInterno(usuario) {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, '');
  return `${limpio}@${DOMINIO_INTERNO}`;
}

const form = document.getElementById('zx-form-login');
const mensaje = document.getElementById('zx-mensaje');
const btnEntrar = document.getElementById('zx-btn-entrar');

function mostrarError(texto) {
  mensaje.textContent = texto;
  mensaje.classList.remove('zx-oculto');
}

async function redirigirSegunRol() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('rol, activo')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil || perfil.activo === false) {
    await supabase.auth.signOut();
    mostrarError('Tu cuenta no está activa. Contacta a un administrador.');
    return;
  }

  const destino = DESTINOS[perfil.rol];
  if (!destino) {
    mostrarError('Tu cuenta todavía no tiene un rol asignado. Pide a un administrador que te lo asigne.');
    await supabase.auth.signOut();
    return;
  }

  location.replace(destino);
}

// Si ya había una sesión activa (o Supabase la restaura al cargar), redirige directo.
redirigirSegunRol();

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensaje.classList.add('zx-oculto');
  btnEntrar.disabled = true;
  btnEntrar.textContent = 'Entrando…';

  const usuario = document.getElementById('usuario').value;
  const contrasena = document.getElementById('contrasena').value;
  const correoInterno = construirCorreoInterno(usuario);

  const { error } = await supabase.auth.signInWithPassword({ email: correoInterno, password: contrasena });

  if (error) {
    mostrarError('Usuario o contraseña incorrectos.');
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'Entrar';
    return;
  }

  await redirigirSegunRol();
  btnEntrar.disabled = false;
  btnEntrar.textContent = 'Entrar';
});
