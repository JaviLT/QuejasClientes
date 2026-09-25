import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { iniciarCronometros } from './tiempo.js';

const sesion = await exigirSesion(['calidad', 'admin']);
if (sesion) {
  pintarEncabezado(sesion.perfil, 'Calidad');
  await cargarTodo();
  iniciarCronometros();
  escucharCambiosEnVivo();
}

const mensaje = document.getElementById('zx-mensaje');

function mostrarMensaje(texto, ok) {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (ok ? 'zx-mensaje-ok' : 'zx-mensaje-error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function llamarRpc(nombre, parametros, mensajeOk) {
  const { error } = await supabase.rpc(nombre, parametros);
  if (error) {
    mostrarMensaje('No se pudo completar la acción: ' + error.message, false);
    return false;
  }
  mostrarMensaje(mensajeOk, true);
  await cargarTodo();
  return true;
}

async function obtenerQuejasPorEstado(estado) {
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, prioridad, tempo_activo_desde, tempo_label_activo')
    .eq('estado', estado)
    .order('creada_en', { ascending: true });
  if (error) {
    console.error(error);
    return [];
  }
  return data;
}

function encabezadoFila(q) {
  return `
    <div class="zx-fila-info">
      <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
      <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}${q.prioridad ? ' · Prioridad ' + q.prioridad : ''}</span>
    </div>
    <span class="zx-cronometro" data-desde="${q.tempo_activo_desde || ''}">--:--</span>`;
}

async function renderizarSimple(contenedorId, contadorId, estado, botones) {
  const filas = await obtenerQuejasPorEstado(estado);
  document.getElementById(contadorId).textContent = filas.length;
  const contenedor = document.getElementById(contenedorId);

  if (filas.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay quejas en esta bandeja.</p>';
    return;
  }

  contenedor.innerHTML = filas.map((q) => `
    <div class="zx-fila">
      ${encabezadoFila(q)}
      <div class="zx-fila-acciones" data-id="${q.id}">
        ${botones}
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-accion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').getAttribute('data-id');
      const accion = btn.getAttribute('data-accion');
      btn.disabled = true;
      if (accion === 'aceptar') await llamarRpc('queja_aceptar', { p_id: id }, 'Queja aceptada. Pasa a espera de muestra.');
      if (accion === 'rechazar') await llamarRpc('queja_rechazar', { p_id: id }, 'Queja rechazada.');
      if (accion === 'muestra_recibida') await llamarRpc('queja_muestra_recibida', { p_id: id }, 'Muestra marcada como recibida. Pasa a dictamen.');
      if (accion === 'material_recibido') await llamarRpc('queja_material_recibido_calidad', { p_id: id }, 'Material recibido. Pasa a revisión.');
    });
  });
}

async function renderizarConTexto(contenedorId, contadorId, estado, rpcNombre, etiquetaCampo) {
  const filas = await obtenerQuejasPorEstado(estado);
  document.getElementById(contadorId).textContent = filas.length;
  const contenedor = document.getElementById(contenedorId);

  if (filas.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay quejas en esta bandeja.</p>';
    return;
  }

  contenedor.innerHTML = filas.map((q) => `
    <div class="zx-fila" style="display:block;" data-id="${q.id}">
      <div class="zx-fila" style="border:none; padding:0;">
        ${encabezadoFila(q)}
      </div>
      <textarea class="zx-textarea-inline" placeholder="${etiquetaCampo}" data-texto></textarea>
      <div class="zx-fila-acciones">
        <button class="zx-btn zx-btn-exito zx-btn-sm" data-accion="aceptar">Aceptar</button>
        <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="rechazar">Rechazar</button>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-id]').forEach((fila) => {
    const id = fila.getAttribute('data-id');
    const textarea = fila.querySelector('[data-texto]');
    fila.querySelectorAll('[data-accion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const aceptar = btn.getAttribute('data-accion') === 'aceptar';
        btn.disabled = true;
        const ok = await llamarRpc(
          rpcNombre,
          { p_id: id, p_texto: textarea.value.trim() || null, p_aceptar: aceptar },
          aceptar ? 'Registrado como aceptado.' : 'Registrado como rechazado.'
        );
        if (!ok) btn.disabled = false;
      });
    });
  });
}

async function cargarTodo() {
  await renderizarSimple('lista-nuevas', 'c-nuevas', 'nueva', `
    <button class="zx-btn zx-btn-exito zx-btn-sm" data-accion="aceptar">Aceptar</button>
    <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="rechazar">Rechazar</button>
  `);
  await renderizarSimple('lista-muestra', 'c-muestra', 'esperando_muestra', `
    <button class="zx-btn zx-btn-secundario zx-btn-sm" data-accion="muestra_recibida">Muestra recibida</button>
  `);
  await renderizarConTexto('lista-dictamen', 'c-dictamen', 'dictamen_pendiente', 'queja_dictamen', 'Texto del dictamen');
  await renderizarSimple('lista-planta', 'c-planta', 'enviado_planta', `
    <button class="zx-btn zx-btn-secundario zx-btn-sm" data-accion="material_recibido">Material recibido</button>
  `);
  await renderizarConTexto('lista-revision', 'c-revision', 'revision_pendiente', 'queja_revision', 'Texto de la revisión');
  iniciarCronometros();
}

function escucharCambiosEnVivo() {
  supabase
    .channel('calidad-quejas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => cargarTodo())
    .subscribe();
}
