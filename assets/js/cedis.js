import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { botonDetalle, activarBotonesDetalle } from './detalle.js';

const sesion = await exigirSesion(['cedis']);
if (sesion) {
  pintarEncabezado(sesion.perfil, 'CEDIS');
  await cargarTodo();
  escucharCambiosEnVivo();
}

const mensaje = document.getElementById('zx-mensaje');

function mostrarMensaje(texto, ok) {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (ok ? 'zx-mensaje-ok' : 'zx-mensaje-error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function cargarTodo() {
  await cargarEspera();
  await cargarPendientesDeEnvio();
  await cargarNc();
}

// ---------- Espera de recolección ----------
async function cargarEspera() {
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, tempo_activo_desde')
    .eq('estado', 'espera_recoleccion')
    .order('creada_en', { ascending: true });

  const contenedor = document.getElementById('lista-espera');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-espera').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay quejas en espera de recolección.</p>';
    return;
  }

  contenedor.innerHTML = data.map((q) => `
    <div class="zx-fila">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}</span>
      </div>
      <div class="zx-fila-acciones">
        ${botonDetalle(q.id)}
        <button class="zx-btn zx-btn-secundario zx-btn-sm" data-id="${q.id}" data-accion="material-recibido">Material recibido (generar folio)</button>
      </div>
    </div>
  `).join('');
  activarBotonesDetalle(contenedor);

  contenedor.querySelectorAll('[data-accion="material-recibido"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const id = btn.getAttribute('data-id');
      const { data: idFolio, error } = await supabase.rpc('recoleccion_material_recibido', { p_queja_id: id });
      if (error) {
        mostrarMensaje('No se pudo generar el folio: ' + error.message, false);
        btn.disabled = false;
        return;
      }
      const { data: fila } = await supabase.from('recolecciones').select('folio').eq('id', idFolio).single();
      mostrarMensaje(`Folio de recolección generado: ${fila?.folio || idFolio}.`, true);
      await cargarTodo();
    });
  });
}

// ---------- Recolección sin queja ----------
document.getElementById('btn-sin-queja').addEventListener('click', async (evento) => {
  const btn = evento.currentTarget;
  btn.disabled = true;
  const { data: idFolio, error } = await supabase.rpc('recoleccion_sin_queja');
  btn.disabled = false;
  if (error) {
    mostrarMensaje('No se pudo generar el folio: ' + error.message, false);
    return;
  }
  const { data: fila } = await supabase.from('recolecciones').select('folio').eq('id', idFolio).single();
  mostrarMensaje(`Folio generado: ${fila?.folio || idFolio}.`, true);
  await cargarTodo();
});

// ---------- Folios pendientes de enviar ----------
async function cargarPendientesDeEnvio() {
  const { data, error } = await supabase
    .from('recolecciones')
    .select('id, folio, generado_en, queja_id, quejas(folio, cliente)')
    .is('enviado_en', null)
    .order('generado_en', { ascending: true });

  const contenedor = document.getElementById('lista-pendientes');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-pendientes').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay folios pendientes de enviar.</p>';
    return;
  }

  contenedor.innerHTML = data.map((r) => `
    <div class="zx-fila">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(r.folio)}</span>
        <span class="zx-fila-meta">${r.quejas ? escaparHtml(r.quejas.folio) + ' · ' + escaparHtml(r.quejas.cliente) : 'Sin queja asociada'}</span>
      </div>
      <div class="zx-fila-acciones">
        <button class="zx-btn zx-btn-secundario zx-btn-sm" data-id="${r.id}" data-accion="enviar">Enviar a planta</button>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-accion="enviar"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await supabase.rpc('recoleccion_enviar', { p_id: btn.getAttribute('data-id') });
      if (error) {
        mostrarMensaje('No se pudo enviar: ' + error.message, false);
        btn.disabled = false;
        return;
      }
      mostrarMensaje('Folio marcado como enviado a planta.', true);
      await cargarTodo();
    });
  });
}

// ---------- NC creada ----------
async function cargarNc() {
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, tempo_activo_desde')
    .eq('estado', 'nc_creada')
    .order('creada_en', { ascending: true });

  const contenedor = document.getElementById('lista-nc');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-nc').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay notas de crédito pendientes.</p>';
    return;
  }

  contenedor.innerHTML = data.map((q) => `
    <div class="zx-fila" data-id="${q.id}">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}</span>
      </div>
      <div class="zx-fila-acciones">
        ${botonDetalle(q.id)}
        <button class="zx-btn zx-btn-exito zx-btn-sm" data-accion="aceptar">Aceptar NC</button>
        <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="rechazar">Rechazar NC</button>
      </div>
    </div>
  `).join('');
  activarBotonesDetalle(contenedor);

  contenedor.querySelectorAll('[data-accion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').getAttribute('data-id');
      const aceptar = btn.getAttribute('data-accion') === 'aceptar';
      btn.disabled = true;
      const { error } = await supabase.rpc('queja_nc_decidir', { p_id: id, p_aceptar: aceptar });
      if (error) {
        mostrarMensaje('No se pudo registrar la decisión: ' + error.message, false);
        btn.disabled = false;
        return;
      }
      mostrarMensaje(aceptar ? 'Folio cerrado.' : 'NC rechazada.', true);
      await cargarTodo();
    });
  });
}

function escucharCambiosEnVivo() {
  supabase
    .channel('cedis-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => cargarTodo())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recolecciones' }, () => cargarTodo())
    .subscribe();
}
