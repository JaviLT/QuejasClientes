import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml, confirmarAccion } from './auth-guard.js';
import { tituloQueja, botonDetalle, establecerRolActual } from './detalle.js';

const sesion = await exigirSesion(null, 'cedis');
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

  document.getElementById('btn-sin-queja').addEventListener('click', abrirModalSinQueja);
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
        ${tituloQueja(q.folio, q.cliente)}
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}</span>
      </div>
      <div class="zx-fila-acciones">
        ${botonDetalle(q.id)}
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

// ---------- Utilidades de pop up ----------
function crearModal(idFondo, html) {
  const previo = document.getElementById(idFondo);
  if (previo) previo.remove();
  const fondo = document.createElement('div');
  fondo.id = idFondo;
  fondo.className = 'zx-modal-fondo';
  fondo.innerHTML = `<div class="zx-modal">${html}</div>`;
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
  return { fondo, cerrar };
}

// Mensaje de error dentro del pop up (el aviso de arriba de la página queda tapado por el pop up).
function avisoModal(fondo, texto) {
  let el = fondo.querySelector('[data-aviso]');
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('data-aviso', '');
    el.className = 'zx-mensaje zx-mensaje-error';
    fondo.querySelector('.zx-fila-acciones').insertAdjacentElement('beforebegin', el);
  }
  el.textContent = texto;
}

// ---------- Popup "Material recibido": uno o varios lotes (cada uno con su cantidad) antes de generar el folio ----------
function filaLote(puedeQuitar) {
  return `
    <div class="zx-subtabla-fila" data-fila-lote>
      <input type="text" placeholder="Lote" data-lote />
      <input type="number" step="any" min="0" placeholder="Cantidad" data-cantidad />
      ${puedeQuitar ? '<button type="button" class="zx-btn-quitar-fila" data-quitar-lote title="Quitar lote">✕</button>' : '<span></span>'}
    </div>`;
}

function abrirModalMaterialRecibido(id, folio) {
  const { fondo, cerrar } = crearModal('zx-modal-material-fondo', `
      <div class="zx-modal-cabecera">
        <h2>Material recibido · ${escaparHtml(folio)}</h2>
        <button type="button" class="zx-modal-cerrar" data-cerrar>✕</button>
      </div>
      <p class="zx-fila-meta" style="margin-top:-4px;">Captura el lote y la cantidad recibidos antes de generar el folio de recolección. Si llegaron varios lotes, agrégalos con el botón.</p>
      <div class="zx-subtabla" data-lista-lotes>${filaLote(false)}</div>
      <button type="button" class="zx-btn-agregar-fila" data-agregar-lote>+ Agregar nuevo lote</button>
      <div class="zx-fila-acciones" style="margin-top:14px;">
        <button type="button" class="zx-btn zx-btn-secundario zx-btn-sm" data-cerrar>Cancelar</button>
        <button type="button" class="zx-btn zx-btn-exito zx-btn-sm" data-confirmar>Generar folio</button>
      </div>`);

  const lista = fondo.querySelector('[data-lista-lotes]');
  fondo.querySelector('[data-agregar-lote]').addEventListener('click', () => {
    lista.insertAdjacentHTML('beforeend', filaLote(true));
    lista.lastElementChild.querySelector('[data-lote]').focus();
  });
  lista.addEventListener('click', (evento) => {
    const quitar = evento.target.closest('[data-quitar-lote]');
    if (quitar) quitar.closest('[data-fila-lote]').remove();
  });

  fondo.querySelector('[data-confirmar]').addEventListener('click', async () => {
    const lotes = [];
    for (const fila of lista.querySelectorAll('[data-fila-lote]')) {
      const lote = fila.querySelector('[data-lote]').value.trim();
      const cantidadTexto = fila.querySelector('[data-cantidad]').value.trim();
      const cantidad = Number(cantidadTexto);
      if (!lote) { avisoModal(fondo, 'Captura el nombre de cada lote.'); fila.querySelector('[data-lote]').focus(); return; }
      if (!cantidadTexto || Number.isNaN(cantidad) || cantidad < 0) {
        avisoModal(fondo, `Captura una cantidad válida para el lote ${lote}.`);
        fila.querySelector('[data-cantidad]').focus();
        return;
      }
      lotes.push({ lote, cantidad });
    }
    const resumen = lotes.map((l) => `${l.lote} (${l.cantidad})`).join(', ');
    if (!confirmarAccion(`¿Confirmas que el material de ${folio} ya llegó (${resumen}) y quieres generar su folio de recolección?`)) return;

    const btnConfirmar = fondo.querySelector('[data-confirmar]');
    btnConfirmar.disabled = true;
    const { data: idFolio, error } = await supabase.rpc('recoleccion_material_recibido', {
      p_queja_id: id,
      p_lotes: lotes,
    });
    if (error) {
      avisoModal(fondo, 'No se pudo generar el folio: ' + error.message);
      btnConfirmar.disabled = false;
      return;
    }
    cerrar();
    const { data: fila } = await supabase.from('recolecciones').select('folio').eq('id', idFolio).single();
    mostrarMensaje(`Folio de recolección generado: ${fila?.folio || idFolio}.`, true);
    await cargarTodo();
  });
}

// ---------- Popup "Folio sin queja": código, lote y cantidad ----------
function abrirModalSinQueja() {
  const { fondo, cerrar } = crearModal('zx-modal-sinqueja-fondo', `
      <div class="zx-modal-cabecera">
        <h2>Folio sin queja</h2>
        <button type="button" class="zx-modal-cerrar" data-cerrar>✕</button>
      </div>
      <p class="zx-fila-meta" style="margin-top:-4px;">Captura los datos del material que llegó sin queja registrada.</p>
      <div class="zx-form-grid">
        <div class="zx-campo">
          <label>Código <span class="req">*</span></label>
          <input type="text" data-codigo />
        </div>
        <div class="zx-campo">
          <label>Lote <span class="req">*</span></label>
          <input type="text" data-lote />
        </div>
        <div class="zx-campo">
          <label>Cantidad <span class="req">*</span></label>
          <input type="number" step="any" min="0" data-cantidad />
        </div>
      </div>
      <div class="zx-fila-acciones" style="margin-top:14px;">
        <button type="button" class="zx-btn zx-btn-secundario zx-btn-sm" data-cerrar>Cancelar</button>
        <button type="button" class="zx-btn zx-btn-exito zx-btn-sm" data-confirmar>Generar folio</button>
      </div>`);

  fondo.querySelector('[data-codigo]').focus();
  fondo.querySelector('[data-confirmar]').addEventListener('click', async () => {
    const codigo = fondo.querySelector('[data-codigo]').value.trim();
    const lote = fondo.querySelector('[data-lote]').value.trim();
    const cantidadTexto = fondo.querySelector('[data-cantidad]').value.trim();
    const cantidad = Number(cantidadTexto);
    if (!codigo) { avisoModal(fondo, 'Captura el código.'); fondo.querySelector('[data-codigo]').focus(); return; }
    if (!lote) { avisoModal(fondo, 'Captura el lote.'); fondo.querySelector('[data-lote]').focus(); return; }
    if (!cantidadTexto || Number.isNaN(cantidad) || cantidad < 0) {
      avisoModal(fondo, 'Captura una cantidad válida.');
      fondo.querySelector('[data-cantidad]').focus();
      return;
    }
    if (!confirmarAccion('¿Confirmas generar un folio de recolección sin queja asociada?')) return;

    const btn = fondo.querySelector('[data-confirmar]');
    btn.disabled = true;
    const { data: idFolio, error } = await supabase.rpc('recoleccion_sin_queja', {
      p_codigo: codigo,
      p_lote: lote,
      p_cantidad: cantidad,
    });
    if (error) {
      avisoModal(fondo, 'No se pudo generar el folio: ' + error.message);
      btn.disabled = false;
      return;
    }
    cerrar();
    const { data: fila } = await supabase.from('recolecciones').select('folio').eq('id', idFolio).single();
    mostrarMensaje(`Folio generado: ${fila?.folio || idFolio}.`, true);
    await cargarTodo();
  });
}

// Datos del material capturados en CEDIS (código solo en folios sin queja; lotes y cantidad en ambos).
function detalleMaterial(r) {
  const partes = [];
  if (r.codigo) partes.push('Código ' + r.codigo);
  if (r.lote_rechazo) partes.push('Lote ' + r.lote_rechazo);
  if (r.cantidad !== null && r.cantidad !== undefined) partes.push('Cantidad ' + r.cantidad);
  return partes.length ? ' · ' + escaparHtml(partes.join(' · ')) : '';
}

// ---------- Folios pendientes de enviar ----------
async function cargarPendientesDeEnvio() {
  const { data, error } = await supabase
    .from('recolecciones')
    .select('id, folio, generado_en, queja_id, codigo, cantidad, lote_rechazo, quejas(folio, cliente)')
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
        <span class="zx-fila-meta">${r.quejas ? escaparHtml(r.quejas.folio) + ' · ' + escaparHtml(r.quejas.cliente) : 'Sin queja asociada'}${detalleMaterial(r)}</span>
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
        ${tituloQueja(q.folio, q.cliente)}
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}</span>
      </div>
      <div class="zx-fila-acciones">
        ${botonDetalle(q.id)}
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
