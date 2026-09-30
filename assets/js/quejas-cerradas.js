// ZX · Procesos — página con todas las quejas cerradas de la empresa (antes vivía como una
// bandeja más dentro de cada pantalla de Comercial/Calidad/CEDIS/Admin; desde el 30 de
// septiembre de 2026, sexta ronda del día, es una página aparte, enlazada desde las cuatro).
import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml, confirmarAccion } from './auth-guard.js';
import { formatoDuracionFija } from './tiempo.js';
import { botonDetalle, activarBotonesDetalle, establecerRolActual, ESTADOS_TERMINALES } from './detalle.js';

const TODOS_LOS_ROLES = ['comercial', 'calidad', 'cedis', 'admin'];
let esAdmin = false;

const sesion = await exigirSesion(TODOS_LOS_ROLES);
if (sesion) {
  esAdmin = sesion.perfil.rol === 'admin';
  establecerRolActual(sesion.perfil.rol);
  pintarEncabezado(sesion.perfil, 'Quejas cerradas');

  document.getElementById('zx-btn-volver').addEventListener('click', (evento) => {
    evento.preventDefault();
    history.back();
  });

  await cargarQuejasCerradas();
  escucharCambiosEnVivo();
}

const mensaje = document.getElementById('zx-mensaje');

function mostrarMensaje(texto, ok) {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (ok ? 'zx-mensaje-ok' : 'zx-mensaje-error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Todas las quejas cerradas de la empresa, sin filtrar por quién la creó ni por rol — mismo
// alcance que ya se había confirmado con el usuario para la bandeja que reemplaza esta página.
async function cargarQuejasCerradas() {
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, estado, creada_en, catalogo_estados(etiqueta)')
    .in('estado', ESTADOS_TERMINALES)
    .order('creada_en', { ascending: false });

  const contenedor = document.getElementById('lista-cerradas-todas');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-cerradas-todas').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay quejas cerradas.</p>';
    return;
  }

  if (!esAdmin) {
    // Comercial, Calidad y CEDIS: fila simple, de solo lectura — solo "Ver detalles".
    contenedor.innerHTML = data.map((q) => `
      <div class="zx-fila">
        <div class="zx-fila-info">
          <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
          <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')} · ${new Date(q.creada_en).toLocaleString('es-MX')}</span>
        </div>
        <div class="zx-fila-acciones">
          <span class="zx-contador">${escaparHtml(q.catalogo_estados?.etiqueta || q.estado)}</span>
          ${botonDetalle(q.id)}
        </div>
      </div>
    `).join('');
    activarBotonesDetalle(contenedor);
    return;
  }

  // Admin: misma fila expandible con "Ver tiempos" + "Eliminar" que ya tenía su propia tarjeta
  // "Quejas cerradas" en admin.html (ver HANDOFF/FRONTEND.md) — ahora vive aquí, en la página
  // compartida con Comercial/Calidad/CEDIS, para no mantener dos listas de lo mismo.
  contenedor.innerHTML = data.map((q) => `
    <div class="zx-fila-expandible" data-id="${q.id}">
      <div class="zx-fila">
        <div class="zx-fila-info">
          <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
          <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')} · ${escaparHtml(q.catalogo_estados?.etiqueta || q.estado)} · ${new Date(q.creada_en).toLocaleString('es-MX')}</span>
        </div>
        <div class="zx-fila-acciones">
          ${botonDetalle(q.id)}
          <button type="button" class="zx-btn-expandir" data-accion="expandir">Ver tiempos</button>
          <button type="button" class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="eliminar">Eliminar</button>
        </div>
      </div>
      <div class="zx-panel-tiempos zx-oculto" data-panel>
        <p class="zx-vacio">Cargando…</p>
      </div>
    </div>
  `).join('');
  activarBotonesDetalle(contenedor);

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
        await cargarTiemposDeQueja(id, panel);
      }
    });

    fila.querySelector('[data-accion="eliminar"]').addEventListener('click', async (evento) => {
      const btn = evento.currentTarget;
      const folio = fila.querySelector('.zx-fila-folio').textContent;
      if (!confirmarAccion(`¿Eliminar definitivamente ${folio}? Esta acción no se puede deshacer.`)) return;
      btn.disabled = true;

      // Igual que en admin.js: borrar primero los adjuntos del bucket de Storage, para no dejar
      // archivos huérfanos (el borrado en cascada de la fila de queja_adjuntos no borra el
      // archivo físico).
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
      await cargarQuejasCerradas();
    });
  });
}

/** Duración fija de cada etapa ya cerrada (sin "etapa actual": todas las quejas de esta página
 * ya están cerradas, a diferencia de la lista de "Quejas abiertas" de admin.js). */
async function cargarTiemposDeQueja(id, panel) {
  const { data: tempos, error } = await supabase
    .from('tempos')
    .select('etiqueta, duracion_ms, resultado')
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

  panel.innerHTML = `<div class="zx-linea-tiempo">${lineaTiempo}</div>`;
}

function escucharCambiosEnVivo() {
  supabase
    .channel('quejas-cerradas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => cargarQuejasCerradas())
    .subscribe();
}
