// ZX · Procesos — modal compartido "Ver detalles" de una queja (datos + línea de tiempo + dictamen si existe).
import { supabase } from './supabase-client.js';
import { escaparHtml } from './auth-guard.js';
import { formatoTamano, iconoParaArchivo } from './adjuntos.js';

// Los tiempos (fechas/horas de cada etapa) son información exclusiva de Admin. Cada pantalla
// llama a establecerRolActual(rol) justo después de exigirSesion(); mientras no se llame, se
// asume el criterio más restrictivo (no-admin) para no filtrar fechas por accidente.
let rolActual = null;

/** Le dice a este módulo qué rol tiene la sesión actual, para decidir qué fechas mostrar en "Ver detalles". */
export function establecerRolActual(rol) {
  rolActual = rol;
}

function esAdmin() {
  return rolActual === 'admin';
}

function formatoFecha(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return iso;
  }
}

function dato(etiqueta, valor) {
  return `<div class="zx-detalle-dato"><span>${escaparHtml(etiqueta)}</span>${escaparHtml(valor || '—')}</div>`;
}

function cerrarModal() {
  const fondo = document.getElementById('zx-detalle-fondo');
  if (fondo) fondo.remove();
  document.removeEventListener('keydown', escListener);
}

function escListener(evento) {
  if (evento.key === 'Escape') cerrarModal();
}

/** Abre el modal de detalle para la queja con este id. Se puede llamar desde cualquier pantalla. */
export async function abrirDetalleQueja(id) {
  const previo = document.getElementById('zx-detalle-fondo');
  if (previo) previo.remove();

  const fondo = document.createElement('div');
  fondo.id = 'zx-detalle-fondo';
  fondo.className = 'zx-modal-fondo';
  fondo.innerHTML = `<div class="zx-modal"><p class="zx-vacio">Cargando detalle…</p></div>`;
  document.body.appendChild(fondo);
  fondo.addEventListener('click', (evento) => { if (evento.target === fondo) cerrarModal(); });
  document.addEventListener('keydown', escListener);

  const [{ data: q, error: errQ }, { data: tempos }, { data: dictamenes }, { data: recolecciones }, { data: adjuntos }] = await Promise.all([
    supabase.from('quejas')
      .select('*, catalogo_estados(etiqueta), catalogo_tipos_queja(etiqueta), profiles!quejas_creada_por_fkey(nombre_completo)')
      .eq('id', id)
      .single(),
    supabase.from('tempos').select('*').eq('queja_id', id).order('creado_en', { ascending: true }),
    supabase.from('dictamenes').select('*').eq('queja_id', id).maybeSingle(),
    supabase.from('recolecciones').select('folio, generado_en, enviado_en, cantidad, lote_rechazo').eq('queja_id', id).maybeSingle(),
    supabase.from('queja_adjuntos').select('id, nombre_archivo, ruta_storage, tipo_mime, tamanio_bytes').eq('queja_id', id).order('subido_en', { ascending: true }),
  ]);

  if (errQ || !q) {
    fondo.querySelector('.zx-modal').innerHTML = `
      <div class="zx-modal-cabecera"><h2>No se pudo cargar</h2><button class="zx-modal-cerrar" data-cerrar>✕</button></div>
      <p class="zx-vacio">${escaparHtml(errQ?.message || 'La queja no existe o ya no está disponible.')}</p>`;
    fondo.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
    return;
  }

  let equipo = [];
  let medidas = [];
  if (dictamenes) {
    const [{ data: eq }, { data: med }] = await Promise.all([
      supabase.from('dictamen_equipo').select('*').eq('dictamen_id', dictamenes.id).order('orden'),
      supabase.from('dictamen_medidas').select('*').eq('dictamen_id', dictamenes.id).order('orden'),
    ]);
    equipo = eq || [];
    medidas = med || [];
  }

  // Los tiempos son información exclusiva de Admin: solo Admin ve la fecha/hora de cada etapa.
  // El resto de los roles ve la lista de etapas ya pasadas, pero sin ninguna fecha junto a ellas.
  const lineaTiempo = (tempos || []).map((t) => `
    <div class="zx-linea-tiempo-item">
      <span class="zx-linea-tiempo-punto"></span>
      <div class="zx-linea-tiempo-texto">
        <strong>${escaparHtml(t.etiqueta)}${t.resultado ? ' · ' + escaparHtml(t.resultado) : ''}</strong>
        ${esAdmin() ? `<span class="zx-lt-meta">${formatoFecha(t.fin)}</span>` : ''}
        ${t.texto ? `<span class="zx-lt-meta">${escaparHtml(t.texto)}</span>` : ''}
      </div>
    </div>`).join('') || '<p class="zx-vacio">Todavía no hay etapas cerradas.</p>';

  const bloqueDictamen = dictamenes ? `
    <div class="zx-detalle-seccion">
      <h3>Dictamen (${dictamenes.aceptado ? 'aceptado' : 'rechazado'})</h3>
      <div class="zx-detalle-grid">
        ${dato('Tipo de acción', dictamenes.tipo_accion === 'correctiva' ? 'Acción correctiva' : 'Acción preventiva')}
        ${dato('Cantidad', dictamenes.cantidad)}
        ${dato('Desviación reportada', dictamenes.desviacion_reportada)}
        ${esAdmin() ? dato('Fecha de emisión', dictamenes.fecha_emision) : ''}
        ${dato('Recibido por', dictamenes.recibido_por)}
      </div>
      ${dictamenes.descripcion_problema ? `<p><strong>Descripción del problema:</strong> ${escaparHtml(dictamenes.descripcion_problema)}</p>` : ''}
      ${dictamenes.identificacion_causa_raiz ? `<p><strong>Causa raíz:</strong> ${escaparHtml(dictamenes.identificacion_causa_raiz)}</p>` : ''}
      ${equipo.length ? `<p><strong>Equipo multidisciplinario:</strong> ${equipo.map((e) => escaparHtml(e.nombre) + (e.puesto ? ' (' + escaparHtml(e.puesto) + ')' : '')).join(', ')}</p>` : ''}
      ${medidas.length ? `<p><strong>Medidas de contención/preventivas:</strong></p><ul>${medidas.map((m) => `<li>${escaparHtml(m.medida)}${m.responsable ? ' — ' + escaparHtml(m.responsable) : ''}${m.fecha ? ' (' + escaparHtml(m.fecha) + ')' : ''}</li>`).join('')}</ul>` : ''}
      ${dictamenes.conclusion ? `<p><strong>Conclusión:</strong> ${escaparHtml(dictamenes.conclusion)}</p>` : ''}
    </div>` : '';

  const bloqueAdjuntos = (adjuntos && adjuntos.length > 0) ? `
    <div class="zx-detalle-seccion">
      <h3>Adjuntos <span class="zx-contador">${adjuntos.length}</span></h3>
      <div class="zx-lista-adjuntos">
        ${adjuntos.map((a) => `
          <div class="zx-fila-adjunto">
            <span><span aria-hidden="true">${iconoParaArchivo(a.tipo_mime, a.nombre_archivo)}</span> ${escaparHtml(a.nombre_archivo)}${a.tamanio_bytes ? ` <span class="zx-lt-meta">(${formatoTamano(a.tamanio_bytes)})</span>` : ''}</span>
            <button type="button" class="zx-btn zx-btn-secundario zx-btn-sm" data-descargar-adjunto="${escaparHtml(a.ruta_storage)}">Descargar</button>
          </div>`).join('')}
      </div>
    </div>` : '';

  const bloqueRecoleccion = recolecciones ? `
    <div class="zx-detalle-seccion">
      <h3>Recolección</h3>
      <div class="zx-detalle-grid">
        ${dato('Folio', recolecciones.folio)}
        ${recolecciones.cantidad !== null && recolecciones.cantidad !== undefined ? dato('Cantidad', recolecciones.cantidad) : ''}
        ${recolecciones.lote_rechazo ? dato('Lote de rechazo', recolecciones.lote_rechazo) : ''}
        ${esAdmin() ? dato('Generado', formatoFecha(recolecciones.generado_en)) : ''}
        ${esAdmin() ? dato('Enviado', recolecciones.enviado_en ? formatoFecha(recolecciones.enviado_en) : 'Pendiente') : ''}
      </div>
    </div>` : '';

  fondo.querySelector('.zx-modal').innerHTML = `
    <div class="zx-modal-cabecera">
      <h2>${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</h2>
      <button class="zx-modal-cerrar" data-cerrar>✕</button>
    </div>
    <span class="zx-detalle-estado">${escaparHtml(q.catalogo_estados?.etiqueta || q.estado)}</span>

    <div class="zx-detalle-grid">
      ${dato('Tipo de queja', q.catalogo_tipos_queja?.etiqueta || q.tipo_queja)}
      ${dato('Producto', q.producto)}
      ${dato('Código', q.codigo)}
      ${dato('Pedido', q.pedido)}
      ${dato('Lote', q.lote)}
      ${dato('Factura', q.factura)}
      ${dato('ID\'s', q.ids)}
      ${dato('Prioridad', q.prioridad)}
      ${dato('Registrada por', q.profiles?.nombre_completo)}
      ${dato('Fecha de registro', formatoFecha(q.creada_en))}
    </div>

    <div class="zx-detalle-seccion">
      <h3>D2 — Descripción del problema</h3>
      <div class="zx-detalle-grid">
        ${dato('Quién', q.d2_quien)}
        ${dato('Qué', q.d2_que)}
        ${dato('Porqué', q.d2_porque)}
        ${dato('Cuándo', q.d2_cuando)}
        ${dato('Dónde', q.d2_donde)}
      </div>
      ${q.d2_cuanto ? `<p><strong>Cuánto:</strong> ${escaparHtml(q.d2_cuanto)}</p>` : ''}
    </div>

    ${bloqueDictamen}
    ${bloqueRecoleccion}
    ${bloqueAdjuntos}

    <div class="zx-detalle-seccion">
      <h3>Línea de tiempo</h3>
      <div class="zx-linea-tiempo">${lineaTiempo}</div>
    </div>
  `;
  fondo.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  fondo.querySelectorAll('[data-descargar-adjunto]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ruta = btn.getAttribute('data-descargar-adjunto');
      btn.disabled = true;
      const textoOriginal = btn.textContent;
      btn.textContent = 'Abriendo…';
      const { data, error } = await supabase.storage.from('adjuntos-quejas').createSignedUrl(ruta, 60);
      btn.disabled = false;
      btn.textContent = textoOriginal;
      if (error || !data?.signedUrl) {
        window.alert('No se pudo abrir el archivo: ' + (error?.message || 'error desconocido'));
        return;
      }
      window.open(data.signedUrl, '_blank', 'noopener');
    });
  });
}

/** Genera el botón "Ver detalles" ya con su atributo data-id, listo para insertarse en cualquier fila. */
export function botonDetalle(id) {
  return `<button type="button" class="zx-btn zx-btn-detalle zx-btn-sm" data-ver-detalle="${id}">Ver detalles</button>`;
}

/** Delega el click de todos los botones "Ver detalles" dentro de un contenedor. Llamar después de pintar filas. */
export function activarBotonesDetalle(contenedor) {
  contenedor.querySelectorAll('[data-ver-detalle]').forEach((btn) => {
    btn.addEventListener('click', () => abrirDetalleQueja(btn.getAttribute('data-ver-detalle')));
  });
}
