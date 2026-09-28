import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { iniciarCronometros } from './tiempo.js';
import { botonDetalle, activarBotonesDetalle } from './detalle.js';

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
        ${botonDetalle(q.id)}
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
  activarBotonesDetalle(contenedor);
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
        ${botonDetalle(q.id)}
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
  activarBotonesDetalle(contenedor);
}

// ---------- Dictamen (VEN-F-08): formulario estructurado ----------
function filaEquipo(indice) {
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

async function renderizarDictamen(contenedorId, contadorId, estado) {
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
      <div class="zx-dictamen-form">
        <div class="zx-dictamen-seccion">
          <span class="zx-etiqueta-seccion">Tipo de acción</span>
          <div class="zx-radio-grupo">
            <label><input type="radio" name="tipo_accion_${q.id}" value="correctiva" data-tipo-accion checked /> Acción correctiva</label>
            <label><input type="radio" name="tipo_accion_${q.id}" value="preventiva" data-tipo-accion /> Acción preventiva</label>
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
          <div class="zx-subtabla" data-lista="equipo-${q.id}">${filaEquipo()}</div>
          <button type="button" class="zx-btn-agregar-fila" data-agregar="equipo-${q.id}">+ Agregar integrante</button>
        </div>

        <div class="zx-dictamen-seccion">
          <span class="zx-etiqueta-seccion">3. Medidas de contención y preventivas</span>
          <div class="zx-subtabla" data-lista="medidas-${q.id}">${filaMedida()}</div>
          <button type="button" class="zx-btn-agregar-fila" data-agregar="medidas-${q.id}">+ Agregar medida</button>
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

        <div class="zx-fila-acciones" style="margin-top:14px;">
          ${botonDetalle(q.id)}
          <button class="zx-btn zx-btn-exito zx-btn-sm" data-accion="aceptar">Aceptado</button>
          <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="rechazar">Rechazado</button>
        </div>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-id]').forEach((fila) => {
    const id = fila.getAttribute('data-id');
    activarSubtabla(fila, '[data-fila-equipo]', () => filaEquipo(), `equipo-${id}`);
    activarSubtabla(fila, '[data-fila-medida]', () => filaMedida(), `medidas-${id}`);

    fila.querySelectorAll('[data-accion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const aceptar = btn.getAttribute('data-accion') === 'aceptar';
        const descripcion = fila.querySelector('[data-descripcion]').value.trim();
        if (!descripcion) {
          mostrarMensaje('La descripción del problema es obligatoria antes de continuar.', false);
          fila.querySelector('[data-descripcion]').focus();
          return;
        }
        fila.querySelectorAll('[data-accion]').forEach((b) => (b.disabled = true));

        const equipo = Array.from(fila.querySelectorAll('[data-fila-equipo]')).map((f) => ({
          nombre: f.querySelector('[data-equipo-nombre]').value.trim(),
          puesto: f.querySelector('[data-equipo-puesto]').value.trim(),
        })).filter((e) => e.nombre);

        const medidas = Array.from(fila.querySelectorAll('[data-fila-medida]')).map((f) => ({
          medida: f.querySelector('[data-medida-texto]').value.trim(),
          responsable: f.querySelector('[data-medida-responsable]').value.trim(),
          fecha: f.querySelector('[data-medida-fecha]').value || null,
        })).filter((m) => m.medida);

        const p_dictamen = {
          tipo_accion: fila.querySelector('[data-tipo-accion]:checked').value,
          cantidad: fila.querySelector('[data-cantidad]').value.trim(),
          desviacion_reportada: fila.querySelector('[data-desviacion]').value.trim(),
          descripcion_problema: descripcion,
          identificacion_causa_raiz: fila.querySelector('[data-causa-raiz]').value.trim(),
          conclusion: fila.querySelector('[data-conclusion]').value.trim(),
          recibido_por: fila.querySelector('[data-recibido-por]').value.trim(),
          equipo,
          medidas,
        };

        const ok = await llamarRpc(
          'queja_dictamen',
          { p_id: id, p_dictamen, p_aceptar: aceptar },
          aceptar ? 'Dictamen registrado como aceptado.' : 'Dictamen registrado como rechazado.'
        );
        if (!ok) fila.querySelectorAll('[data-accion]').forEach((b) => (b.disabled = false));
      });
    });
  });
  activarBotonesDetalle(contenedor);
}

async function cargarTodo() {
  await renderizarSimple('lista-nuevas', 'c-nuevas', 'nueva', `
    <button class="zx-btn zx-btn-exito zx-btn-sm" data-accion="aceptar">Aceptar</button>
    <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="rechazar">Rechazar</button>
  `);
  await renderizarSimple('lista-muestra', 'c-muestra', 'esperando_muestra', `
    <button class="zx-btn zx-btn-secundario zx-btn-sm" data-accion="muestra_recibida">Muestra recibida</button>
  `);
  await renderizarDictamen('lista-dictamen', 'c-dictamen', 'dictamen_pendiente');
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
