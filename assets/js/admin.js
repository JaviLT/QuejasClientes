import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { formatoDuracionFija, iniciarActualizacionFija } from './tiempo.js';
import { enlaceDetalle, establecerRolActual, ESTADOS_TERMINALES } from './detalle.js';

const sesion = await exigirSesion(['admin']);
if (sesion) {
  establecerRolActual(sesion.perfil.rol);
  pintarEncabezado(sesion.perfil, 'Administrador');
  await cargarTodo();
  iniciarActualizacionFija();
  escucharCambiosEnVivo();
}

const mensaje = document.getElementById('zx-mensaje');

function mostrarMensaje(texto, ok) {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (ok ? 'zx-mensaje-ok' : 'zx-mensaje-error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function cargarTodo() {
  await cargarQuejas();
}

// ---------- Quejas abiertas ----------
// Las quejas cerradas ya no se traen ni se pintan aquí: desde esta ronda (30 de septiembre de
// 2026, séptima del día) viven únicamente en quejas-cerradas.html — accesible desde la pestaña
// "Quejas cerradas" de la barra superior — y en ningún otro lado, ni siquiera como conteo.
async function cargarQuejas() {
  const listaTerminales = `(${ESTADOS_TERMINALES.join(',')})`;
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, estado, creada_en, tempo_activo_desde, tempo_label_activo, catalogo_estados(etiqueta)')
    .not('estado', 'in', listaTerminales)
    .order('creada_en', { ascending: false });

  if (error) {
    document.getElementById('lista-abiertas').innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }

  pintarLista('lista-abiertas', 'c-abiertas', data, 'No hay quejas abiertas.');
}

function pintarLista(contenedorId, contadorId, quejas, textoVacio) {
  const contenedor = document.getElementById(contenedorId);
  document.getElementById(contadorId).textContent = quejas.length;

  if (quejas.length === 0) {
    contenedor.innerHTML = `<p class="zx-vacio">${textoVacio}</p>`;
    return;
  }

  contenedor.innerHTML = quejas.map((q) => `
    <div class="zx-fila-expandible" data-id="${q.id}" data-estado="${escaparHtml(q.estado)}" data-desde-activo="${q.tempo_activo_desde || ''}" data-etiqueta-activa="${escaparHtml(q.tempo_label_activo || '')}">
      <div class="zx-fila">
        <div class="zx-fila-info">
          ${enlaceDetalle(q.id, q.folio, q.cliente)}
          <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')} · ${escaparHtml(q.catalogo_estados?.etiqueta || q.estado)} · ${new Date(q.creada_en).toLocaleString('es-MX')}</span>
        </div>
        <div class="zx-fila-acciones">
          <button type="button" class="zx-btn-expandir" data-accion="expandir">Ver tiempos</button>
          <button type="button" class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="eliminar">Eliminar</button>
        </div>
      </div>
      <div class="zx-panel-tiempos zx-oculto" data-panel>
        <p class="zx-vacio">Cargando…</p>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-id]').forEach((fila) => {
    const id = fila.getAttribute('data-id');
    const panel = fila.querySelector('[data-panel]');

    fila.querySelector('[data-accion="expandir"]').addEventListener('click', async (evento) => {
      const abierto = !panel.classList.contains('zx-oculto');
      if (abierto) {
        panel.classList.add('zx-oculto');
        evento.currentTarget.textContent = 'Ver tiempos';
        return;
      }
      panel.classList.remove('zx-oculto');
      evento.currentTarget.textContent = 'Ocultar tiempos';
      if (!panel.getAttribute('data-cargado')) {
        panel.setAttribute('data-cargado', '1');
        await cargarTiemposDeQueja(id, panel, fila);
      }
    });

    fila.querySelector('[data-accion="eliminar"]').addEventListener('click', async (evento) => {
      const btn = evento.currentTarget;
      const folio = fila.querySelector('.zx-fila-folio').textContent;
      if (!confirm(`¿Eliminar definitivamente ${folio}? Esta acción no se puede deshacer.`)) return;
      btn.disabled = true;

      // Antes de borrar la queja, borra sus archivos adjuntos del bucket de Storage — si no,
      // el borrado en cascada solo quita el renglón de queja_adjuntos y el archivo se queda
      // huérfano ocupando espacio de Storage para siempre.
      const { data: adjuntos } = await supabase.from('queja_adjuntos').select('ruta_storage').eq('queja_id', id);
      if (adjuntos && adjuntos.length > 0) {
        await supabase.storage.from('adjuntos-quejas').remove(adjuntos.map((a) => a.ruta_storage));
      }

      const { error: errBorrar } = await supabase.rpc('queja_eliminar', { p_id: id });
      if (errBorrar) {
        mostrarMensaje('No se pudo eliminar: ' + errBorrar.message, false);
        btn.disabled = false;
        return;
      }
      mostrarMensaje(`${folio} eliminada.`, true);
      await cargarQuejas();
    });
  });
}

/** Carga y pinta, dentro del panel desplegable de una queja, la duración fija de cada etapa cerrada y (si aplica) la etapa actual. */
async function cargarTiemposDeQueja(id, panel, fila) {
  const { data: tempos, error } = await supabase
    .from('tempos')
    .select('etiqueta, inicio, fin, duracion_ms, resultado')
    .eq('queja_id', id)
    .order('creado_en', { ascending: true });

  if (error) {
    panel.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }

  const lineaTiempo = (tempos || []).map((t) => `
    <div class="zx-linea-tiempo-item">
      <span class="zx-linea-tiempo-punto"></span>
      <div class="zx-linea-tiempo-texto">
        <strong>${escaparHtml(t.etiqueta)}${t.resultado ? ' · ' + escaparHtml(t.resultado) : ''}</strong>
        <span class="zx-lt-meta">${formatoDuracionFija(Number(t.duracion_ms) || 0)}</span>
      </div>
    </div>`).join('') || '<p class="zx-vacio">Todavía no hay etapas cerradas.</p>';

  const estado = fila.getAttribute('data-estado');
  const desdeActivo = fila.getAttribute('data-desde-activo');
  const etiquetaActiva = fila.getAttribute('data-etiqueta-activa');
  const esTerminal = ESTADOS_TERMINALES.includes(estado);

  const etapaActual = (!esTerminal && desdeActivo) ? `
    <div class="zx-etapa-actual">
      <span>Etapa actual: <strong>${escaparHtml(etiquetaActiva || '—')}</strong></span>
      <span class="zx-cronometro" data-desde="${desdeActivo}">${formatoDuracionFija(Date.now() - new Date(desdeActivo).getTime())}</span>
    </div>` : '';

  panel.innerHTML = `<div class="zx-linea-tiempo">${lineaTiempo}</div>${etapaActual}`;
}

function escucharCambiosEnVivo() {
  supabase
    .channel('admin-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => cargarTodo())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tempos' }, () => cargarTodo())
    .subscribe();
}
