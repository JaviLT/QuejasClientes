import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { iniciarCronometros, formatoDuracion } from './tiempo.js';

const ESTADOS_TERMINALES = ['cerrada', 'rechazada_calidad', 'rechazada_dictamen', 'rechazada_revision', 'rechazada_nc'];

const sesion = await exigirSesion(['admin']);
if (sesion) {
  pintarEncabezado(sesion.perfil, 'Tiempos');
  await cargarTodo();
  iniciarCronometros();
  escucharCambiosEnVivo();
}

const mensaje = document.getElementById('zx-mensaje');

async function cargarTodo() {
  await cargarQuejasAbiertas();
  await cargarReportePorEtapa();
  iniciarCronometros();
}

// ---------- Monitor en vivo ----------
async function cargarQuejasAbiertas() {
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, tempo_activo_desde, tempo_label_activo, catalogo_estados(etiqueta)')
    .not('estado', 'in', `(${ESTADOS_TERMINALES.join(',')})`)
    .order('tempo_activo_desde', { ascending: true, nullsFirst: false });

  const contenedor = document.getElementById('lista-abiertas');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-abiertas').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">No hay quejas abiertas en este momento.</p>';
    return;
  }

  contenedor.innerHTML = data.map((q) => `
    <div class="zx-fila">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja || 'Sin tipo')} · ${escaparHtml(q.tempo_label_activo || q.catalogo_estados?.etiqueta || '')}</span>
      </div>
      <span class="zx-cronometro" data-desde="${q.tempo_activo_desde || ''}">--:--</span>
    </div>
  `).join('');
}

// ---------- Reporte por etapa ----------
async function cargarReportePorEtapa() {
  const { data, error } = await supabase
    .from('vw_tiempos_por_etapa')
    .select('etiqueta, cantidad, promedio_ms, minimo_ms, maximo_ms')
    .order('etiqueta', { ascending: true });

  const contenedor = document.getElementById('tabla-etapas');
  if (error) {
    contenedor.innerHTML = `<p class="zx-vacio">${escaparHtml(error.message)}</p>`;
    return;
  }
  document.getElementById('c-etapas').textContent = data.length;

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="zx-vacio">Todavía no hay etapas cerradas para analizar.</p>';
    return;
  }

  contenedor.innerHTML = data.map((fila) => `
    <div class="zx-fila">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(fila.etiqueta)}</span>
        <span class="zx-fila-meta">${fila.cantidad} registro${fila.cantidad === 1 ? '' : 's'}</span>
      </div>
      <div class="zx-fila-acciones">
        <span class="zx-cronometro" title="Promedio">Prom. ${formatoDuracion(Number(fila.promedio_ms))}</span>
        <span class="zx-cronometro" title="Mínimo">Mín. ${formatoDuracion(Number(fila.minimo_ms))}</span>
        <span class="zx-cronometro" title="Máximo">Máx. ${formatoDuracion(Number(fila.maximo_ms))}</span>
      </div>
    </div>
  `).join('');
}

function escucharCambiosEnVivo() {
  supabase
    .channel('tiempos-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => cargarTodo())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tempos' }, () => cargarTodo())
    .subscribe();
}
