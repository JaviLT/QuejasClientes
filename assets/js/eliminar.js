import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { botonDetalle, activarBotonesDetalle } from './detalle.js';

const sesion = await exigirSesion(['admin']);
if (sesion) {
  pintarEncabezado(sesion.perfil, 'Eliminar quejas');
  await cargar();
}

const mensaje = document.getElementById('zx-mensaje');

function mostrarMensaje(texto, ok) {
  mensaje.textContent = texto;
  mensaje.className = 'zx-mensaje ' + (ok ? 'zx-mensaje-ok' : 'zx-mensaje-error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function cargar() {
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, creada_en, catalogo_estados(etiqueta)')
    .order('creada_en', { ascending: false });

  const contenedor = document.getElementById('lista-quejas');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-quejas').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay quejas registradas.</p>';
    return;
  }

  contenedor.innerHTML = data.map((q) => `
    <div class="zx-fila" data-id="${q.id}">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')} · ${escaparHtml(q.catalogo_estados?.etiqueta || '')} · ${new Date(q.creada_en).toLocaleString('es-MX')}</span>
      </div>
      <div class="zx-fila-acciones">
        ${botonDetalle(q.id)}
        <button class="zx-btn zx-btn-peligro zx-btn-sm" data-accion="eliminar">Eliminar</button>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fila = btn.closest('[data-id]');
      const id = fila.getAttribute('data-id');
      const folio = fila.querySelector('.zx-fila-folio').textContent;
      if (!confirm(`¿Eliminar definitivamente ${folio}? Esta acción no se puede deshacer.`)) return;
      btn.disabled = true;
      const { error: errBorrar } = await supabase.rpc('queja_eliminar', { p_id: id });
      if (errBorrar) {
        mostrarMensaje('No se pudo eliminar: ' + errBorrar.message, false);
        btn.disabled = false;
        return;
      }
      mostrarMensaje(`${folio} eliminada.`, true);
      await cargar();
    });
  });
  activarBotonesDetalle(contenedor);
}
