import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml, confirmarAccion } from './auth-guard.js';
import { enlaceDetalle, establecerRolActual } from './detalle.js';

const sesion = await exigirSesion(['cedis']);
if (sesion) {
  establecerRolActual(sesion.perfil.rol);
  pintarEncabezado(sesion.perfil, 'CEDIS', {
    boton: {
      id: 'btn-sin-queja',
      texto: 'Folio sin queja',
      icono: '📦',
      titulo: 'Genera un folio de recolección cuando llega material sin que haya una queja registrada.',
    },
  });
  await cargarTodo();
  escucharCambiosEnVivo();

  document.getElementById('btn-sin-queja').addEventListener('click', async (evento) => {
    if (!confirmarAccion('¿Confirmas generar un folio de recolección sin queja asociada?')) return;
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
        ${enlaceDetalle(q.id, q.folio, q.cliente)}
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}</span>
      </div>
      <div class="zx-fila-acciones">
        <button class="zx-btn zx-btn-secundario zx-btn-sm" data-id="${q.id}" data-accion="material-recibido">Material recibido (generar folio)</button>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-accion="material-recibido"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const folio = btn.closest('.zx-fila').querySelector('.zx-fila-folio').textContent;
      const id = btn.getAttribute('data-id');
      abrirModalMaterialRecibido(id, folio);
    });
  });
}

// ---------- Popup "Material recibido": pide cantidad y lote de rechazo antes de generar el folio ----------
function abrirModalMaterialRecibido(id, folio) {
  const previo = document.getElementById('zx-modal-material-fondo');
  if (previo) previo.remove();

  const fondo = document.createElement('div');
  fondo.id = 'zx-modal-material-fondo';
  fondo.className = 'zx-modal-fondo';
  fondo.innerHTML = `
    <div class="zx-modal">
      <div class="zx-modal-cabecera">
        <h2>Material recibido · ${escaparHtml(folio)}</h2>
        <button type="button" class="zx-modal-cerrar" data-cerrar>✕</button>
      </div>
      <p class="zx-fila-meta" style="margin-top:-4px;">Captura estos datos antes de generar el folio de recolección.</p>
      <div class="zx-form-grid">
        <div class="zx-campo">
          <label>Cantidad</label>
          <input type="number" step="any" min="0" data-cantidad required />
        </div>
        <div class="zx-campo">
          <label>Lote de rechazo</label>
          <input type="text" data-lote-rechazo />
        </div>
      </div>
      <div class="zx-fila-acciones" style="margin-top:14px;">
        <button type="button" class="zx-btn zx-btn-secundario zx-btn-sm" data-cerrar>Cancelar</button>
        <button type="button" class="zx-btn zx-btn-exito zx-btn-sm" data-confirmar>Generar folio</button>
      </div>
    </div>`;
  document.body.appendChild(fondo);

  function cerrar() {
    fondo.remove();
    document.removeEventListener('keydown', escListener);
  }
  function escListener(evento) {
    if (evento.key === 'Escape') cerrar();
  }
  fondo.addEventListener('click', (evento) => { if (evento.target === fondo) cerrar(); });
  document.addEventListener('keydown', escListener);
  fondo.querySelectorAll('[data-cerrar]').forEach((btn) => btn.addEventListener('click', cerrar));

  fondo.querySelector('[data-confirmar]').addEventListener('click', async () => {
    const cantidadTexto = fondo.querySelector('[data-cantidad]').value.trim();
    const loteRechazo = fondo.querySelector('[data-lote-rechazo]').value.trim();

    if (!cantidadTexto) {
      mostrarMensaje('Captura la cantidad antes de continuar.', false);
      fondo.querySelector('[data-cantidad]').focus();
      return;
    }
    const cantidad = Number(cantidadTexto);
    if (Number.isNaN(cantidad) || cantidad < 0) {
      mostrarMensaje('La cantidad debe ser un número válido.', false);
      fondo.querySelector('[data-cantidad]').focus();
      return;
    }
    if (!confirmarAccion(`¿Confirmas que el material de ${folio} ya llegó y quieres generar su folio de recolección?`)) return;

    const btnConfirmar = fondo.querySelector('[data-confirmar]');
    btnConfirmar.disabled = true;
    const { data: idFolio, error } = await supabase.rpc('recoleccion_material_recibido', {
      p_queja_id: id,
      p_cantidad: cantidad,
      p_lote_rechazo: loteRechazo || null,
    });
    if (error) {
      mostrarMensaje('No se pudo generar el folio: ' + error.message, false);
      btnConfirmar.disabled = false;
      return;
    }
    cerrar();
    const { data: fila } = await supabase.from('recolecciones').select('folio').eq('id', idFolio).single();
    mostrarMensaje(`Folio de recolección generado: ${fila?.folio || idFolio}.`, true);
    await cargarTodo();
  });
}

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
      const folio = btn.closest('.zx-fila').querySelector('.zx-fila-folio').textContent;
      if (!confirmarAccion(`¿Confirmas marcar el folio ${folio} como enviado a planta?`)) return;
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
        ${enlaceDetalle(q.id, q.folio, q.cliente)}
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}</span>
      </div>
      <div class="zx-fila-acciones">
        <button class="zx-btn zx-btn-exito zx-btn-sm" data-accion="aceptar">Aceptar NC</button>
        <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="rechazar">Rechazar NC</button>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-accion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fila = btn.closest('[data-id]');
      const id = fila.getAttribute('data-id');
      const folio = fila.querySelector('.zx-fila-folio').textContent;
      const aceptar = btn.getAttribute('data-accion') === 'aceptar';
      const mensajeConfirmacion = aceptar
        ? `¿Confirmas ACEPTAR la nota de crédito de ${folio}? El folio quedará cerrado.`
        : `¿Confirmas RECHAZAR la nota de crédito de ${folio}?`;
      if (!confirmarAccion(mensajeConfirmacion)) return;
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
