import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml, confirmarAccion } from './auth-guard.js';
import { enlaceDetalle, establecerRolActual } from './detalle.js';
import { subirAdjuntos } from './adjuntos.js';
import { crearSelectorArchivos } from './selector-archivos.js';

const sesion = await exigirSesion(['calidad']);
if (sesion) {
  establecerRolActual(sesion.perfil.rol);
  pintarEncabezado(sesion.perfil, 'Calidad');
  await cargarTodo();
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
      ${enlaceDetalle(q.id, q.folio, q.cliente)}
      <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')}${q.prioridad ? ' · Prioridad ' + q.prioridad : ''}</span>
    </div>`;
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
      const folio = btn.closest('.zx-fila').querySelector('.zx-fila-folio').textContent;
      const accion = btn.getAttribute('data-accion');
      if (accion === 'aceptar') {
        if (!confirmarAccion(`¿Confirmas ACEPTAR la queja ${folio}? Pasará a espera de muestra.`)) return;
        btn.disabled = true;
        await llamarRpc('queja_aceptar', { p_id: id }, 'Queja aceptada. Pasa a espera de muestra.');
      }
      if (accion === 'rechazar') {
        if (!confirmarAccion(`¿Confirmas RECHAZAR la queja ${folio}?`)) return;
        btn.disabled = true;
        await llamarRpc('queja_rechazar', { p_id: id }, 'Queja rechazada.');
      }
      if (accion === 'muestra_recibida') {
        if (!confirmarAccion(`¿Confirmas que la muestra de ${folio} ya fue recibida? Pasará a dictamen.`)) return;
        btn.disabled = true;
        await llamarRpc('queja_muestra_recibida', { p_id: id }, 'Muestra marcada como recibida. Pasa a dictamen.');
      }
      if (accion === 'material_recibido') {
        if (!confirmarAccion(`¿Confirmas que el material de ${folio} ya llegó a planta? Pasará a revisión.`)) return;
        btn.disabled = true;
        await llamarRpc('queja_material_recibido_calidad', { p_id: id }, 'Material recibido. Pasa a revisión.');
      }
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
    const folio = fila.querySelector('.zx-fila-folio').textContent;
    const textarea = fila.querySelector('[data-texto]');
    fila.querySelectorAll('[data-accion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const aceptar = btn.getAttribute('data-accion') === 'aceptar';
        const mensajeConfirmacion = aceptar
          ? `¿Confirmas ACEPTAR la revisión de ${folio}? Se generará la nota de crédito.`
          : `¿Confirmas RECHAZAR la revisión de ${folio}?`;
        if (!confirmarAccion(mensajeConfirmacion)) return;
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

// ---------- Dictamen (VEN-F-08): lista con "Iniciar dictamen" + formulario en pop up ----------
async function renderizarDictamenLista(contenedorId, contadorId, estado) {
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
        <button type="button" class="zx-btn zx-btn-secundario zx-btn-sm" data-accion="iniciar-dictamen">Iniciar dictamen</button>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-accion="iniciar-dictamen"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-id]').getAttribute('data-id');
      const folio = btn.closest('.zx-fila').querySelector('.zx-fila-folio').textContent;
      abrirModalDictamen(id, folio);
    });
  });
}

function filaEquipo() {
  return `
    <div class="zx-subtabla-fila" data-fila-equipo>
      <input type="text" placeholder="Nombre" data-equipo-nombre />
      <input type="text" placeholder="Puesto" data-equipo-puesto />
      <button type="button" class="zx-btn-quitar-fila" data-quitar-fila title="Quitar">✕</button>
    </div>`;
}

function filaMedida() {
  return `
    <div class="zx-subtabla-fila zx-subtabla-3" data-fila-medida>
      <input type="text" placeholder="Medida" data-medida-texto />
      <input type="text" placeholder="Responsable" data-medida-responsable />
      <input type="date" data-medida-fecha />
      <button type="button" class="zx-btn-quitar-fila" data-quitar-fila title="Quitar">✕</button>
    </div>`;
}

function activarSubtabla(contenedorFila, selectorFilas, crearFila, botonAgregarId) {
  const listaEl = contenedorFila.querySelector(`[data-lista="${botonAgregarId}"]`);
  function ligarQuitar() {
    listaEl.querySelectorAll('[data-quitar-fila]').forEach((btn) => {
      btn.onclick = () => {
        if (listaEl.querySelectorAll(selectorFilas).length > 1) btn.closest(selectorFilas).remove();
      };
    });
  }
  ligarQuitar();
  contenedorFila.querySelector(`[data-agregar="${botonAgregarId}"]`).addEventListener('click', () => {
    listaEl.insertAdjacentHTML('beforeend', crearFila());
    ligarQuitar();
  });
}

function cerrarModalDictamen() {
  document.getElementById('zx-modal-dictamen-fondo').classList.add('zx-oculto');
}

const modalDictamenFondo = document.getElementById('zx-modal-dictamen-fondo');
modalDictamenFondo.addEventListener('click', (evento) => { if (evento.target === modalDictamenFondo) cerrarModalDictamen(); });
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && !modalDictamenFondo.classList.contains('zx-oculto')) cerrarModalDictamen();
});

function abrirModalDictamen(id, folio) {
  const modal = modalDictamenFondo.querySelector('.zx-modal');

  modal.innerHTML = `
    <div class="zx-modal-cabecera">
      <h2>Dictamen · ${escaparHtml(folio)}</h2>
      <button type="button" class="zx-modal-cerrar" data-cerrar>✕</button>
    </div>

    <div class="zx-dictamen-form">
      <div class="zx-dictamen-seccion">
        <span class="zx-etiqueta-seccion">Tipo de acción</span>
        <div class="zx-radio-grupo">
          <label><input type="radio" name="tipo_accion" value="correctiva" data-tipo-accion checked /> Acción correctiva</label>
          <label><input type="radio" name="tipo_accion" value="preventiva" data-tipo-accion /> Acción preventiva</label>
        </div>
      </div>

      <div class="zx-form-grid zx-dictamen-seccion">
        <div class="zx-campo">
          <label>Cantidad</label>
          <input type="text" data-cantidad />
        </div>
        <div class="zx-campo">
          <label>Desviación reportada</label>
          <input type="text" data-desviacion />
        </div>
      </div>

      <div class="zx-dictamen-seccion">
        <span class="zx-etiqueta-seccion">1. Descripción del problema <span class="req">*</span></span>
        <textarea class="zx-textarea-inline" data-descripcion required></textarea>
      </div>

      <div class="zx-dictamen-seccion">
        <span class="zx-etiqueta-seccion">2. Identificación de la causa raíz</span>
        <textarea class="zx-textarea-inline" data-causa-raiz></textarea>
        <span class="zx-etiqueta-seccion" style="margin-top:10px;">Equipo multidisciplinario</span>
        <div class="zx-subtabla" data-lista="equipo">${filaEquipo()}</div>
        <button type="button" class="zx-btn-agregar-fila" data-agregar="equipo">+ Agregar integrante</button>
      </div>

      <div class="zx-dictamen-seccion">
        <span class="zx-etiqueta-seccion">3. Medidas de contención y preventivas</span>
        <div class="zx-subtabla" data-lista="medidas">${filaMedida()}</div>
        <button type="button" class="zx-btn-agregar-fila" data-agregar="medidas">+ Agregar medida</button>
      </div>

      <div class="zx-dictamen-seccion">
        <span class="zx-etiqueta-seccion">4. Conclusión</span>
        <textarea class="zx-textarea-inline" data-conclusion></textarea>
      </div>

      <div class="zx-form-grid zx-dictamen-seccion">
        <div class="zx-campo">
          <label>Recibido por</label>
          <input type="text" data-recibido-por />
        </div>
      </div>

      <div class="zx-dictamen-seccion">
        <span class="zx-etiqueta-seccion">Adjuntos (evidencia del dictamen — opcional)</span>
        <div data-selector-adjuntos-dictamen></div>
        <span class="zx-fila-meta" style="display:block; margin-top:4px;">Máximo 15 MB por archivo.</span>
      </div>

      <div class="zx-fila-acciones" style="margin-top:14px;">
        <button class="zx-btn zx-btn-exito zx-btn-sm" data-accion="aceptar">Aceptado</button>
        <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="rechazar">Rechazado</button>
      </div>
    </div>
  `;

  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModalDictamen);
  activarSubtabla(modal, '[data-fila-equipo]', () => filaEquipo(), 'equipo');
  activarSubtabla(modal, '[data-fila-medida]', () => filaMedida(), 'medidas');
  const selectorAdjuntosDictamen = crearSelectorArchivos({
    contenedor: modal.querySelector('[data-selector-adjuntos-dictamen]'),
    textoBoton: 'Elegir archivos',
  });

  modal.querySelectorAll('[data-accion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const aceptar = btn.getAttribute('data-accion') === 'aceptar';
      const descripcion = modal.querySelector('[data-descripcion]').value.trim();
      if (!descripcion) {
        mostrarMensaje('La descripción del problema es obligatoria antes de continuar.', false);
        modal.querySelector('[data-descripcion]').focus();
        return;
      }

      const mensajeConfirmacion = aceptar
        ? `¿Confirmas registrar este dictamen de ${folio} como ACEPTADO? La queja avanzará a espera de recolección.`
        : `¿Confirmas registrar este dictamen de ${folio} como RECHAZADO? La queja quedará cerrada como rechazada.`;
      if (!confirmarAccion(mensajeConfirmacion)) return;

      modal.querySelectorAll('[data-accion]').forEach((b) => (b.disabled = true));

      const equipo = Array.from(modal.querySelectorAll('[data-fila-equipo]')).map((f) => ({
        nombre: f.querySelector('[data-equipo-nombre]').value.trim(),
        puesto: f.querySelector('[data-equipo-puesto]').value.trim(),
      })).filter((e) => e.nombre);

      const medidas = Array.from(modal.querySelectorAll('[data-fila-medida]')).map((f) => ({
        medida: f.querySelector('[data-medida-texto]').value.trim(),
        responsable: f.querySelector('[data-medida-responsable]').value.trim(),
        fecha: f.querySelector('[data-medida-fecha]').value || null,
      })).filter((m) => m.medida);

      const p_dictamen = {
        tipo_accion: modal.querySelector('[data-tipo-accion]:checked').value,
        cantidad: modal.querySelector('[data-cantidad]').value.trim(),
        desviacion_reportada: modal.querySelector('[data-desviacion]').value.trim(),
        descripcion_problema: descripcion,
        identificacion_causa_raiz: modal.querySelector('[data-causa-raiz]').value.trim(),
        conclusion: modal.querySelector('[data-conclusion]').value.trim(),
        recibido_por: modal.querySelector('[data-recibido-por]').value.trim(),
        equipo,
        medidas,
      };

      const archivosDictamen = selectorAdjuntosDictamen.obtenerArchivos();
      const ok = await llamarRpc(
        'queja_dictamen',
        { p_id: id, p_dictamen, p_aceptar: aceptar },
        aceptar ? 'Dictamen registrado como aceptado.' : 'Dictamen registrado como rechazado.'
      );
      if (ok) {
        if (archivosDictamen.length > 0) {
          const fallos = await subirAdjuntos(id, archivosDictamen);
          if (fallos.length > 0) {
            mostrarMensaje(`Dictamen guardado, pero no se pudieron subir estos archivos: ${fallos.join(', ')}.`, false);
          }
        }
        cerrarModalDictamen();
      } else {
        modal.querySelectorAll('[data-accion]').forEach((b) => (b.disabled = false));
      }
    });
  });

  modalDictamenFondo.classList.remove('zx-oculto');
}

async function cargarTodo() {
  await renderizarSimple('lista-muestra', 'c-muestra', 'esperando_muestra', `
    <button class="zx-btn zx-btn-secundario zx-btn-sm" data-accion="muestra_recibida">Muestra recibida</button>
  `);
  await renderizarDictamenLista('lista-dictamen', 'c-dictamen', 'dictamen_pendiente');
  await renderizarSimple('lista-planta', 'c-planta', 'enviado_planta', `
    <button class="zx-btn zx-btn-secundario zx-btn-sm" data-accion="material_recibido">Material recibido</button>
  `);
  await renderizarConTexto('lista-revision', 'c-revision', 'revision_pendiente', 'queja_revision', 'Texto de la revisión');
}

function escucharCambiosEnVivo() {
  supabase
    .channel('calidad-quejas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => cargarTodo())
    .subscribe();
}
