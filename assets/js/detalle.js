// ZX · Procesos — datos y HTML compartidos del detalle de una queja.
//
// Hasta la ronda anterior, "Ver detalles" abría un pop up construido por este mismo módulo.
// Desde esta ronda (30 de septiembre de 2026, sexta del día) el detalle vive en su propia
// página (detalle-queja.html?id=...), a petición del usuario — sobre todo para que los
// adjuntos de la queja tengan más espacio. Este módulo ya no abre ningún modal: solo expone
// los datos (obtenerDatosQueja) y el HTML del contenido (construirContenidoDetalle) para que
// detalle-queja.js los pinte dentro de la página. botonDetalle() ahora genera un enlace normal
// en vez de un botón con listener.
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

/** Trae todo lo necesario para pintar el detalle de una queja: la queja misma, su línea de
 * tiempo, el dictamen (con equipo/medidas si existe), la recolección y los adjuntos. Se usa
 * desde detalle-queja.js; separado de construirContenidoDetalle para poder, si hace falta más
 * adelante, reusar los datos sin volver a pintar HTML (o al revés). */
export async function obtenerDatosQueja(id) {
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
    return { error: errQ?.message || 'La queja no existe o ya no está disponible.' };
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

  return { q, tempos: tempos || [], dictamenes, equipo, medidas, recolecciones, adjuntos: adjuntos || [] };
}

/** Construye el HTML completo del detalle (título, estado, datos generales, D2, dictamen,
 * recolección, adjuntos y línea de tiempo) a partir de lo que devuelve obtenerDatosQueja(). */
export function construirContenidoDetalle(datos) {
  const { q, tempos, dictamenes, equipo, medidas, recolecciones, adjuntos } = datos;

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

  const bloqueAdjuntos = `
    <div class="zx-detalle-seccion">
      <h3>Adjuntos <span class="zx-contador">${adjuntos.length}</span></h3>
      ${adjuntos.length > 0 ? `
      <div class="zx-lista-adjuntos">
        ${adjuntos.map((a) => `
          <div class="zx-fila-adjunto">
            <span><span aria-hidden="true">${iconoParaArchivo(a.tipo_mime, a.nombre_archivo)}</span> ${escaparHtml(a.nombre_archivo)}${a.tamanio_bytes ? ` <span class="zx-lt-meta">(${formatoTamano(a.tamanio_bytes)})</span>` : ''}</span>
            <button type="button" class="zx-btn zx-btn-secundario zx-btn-sm" data-descargar-adjunto="${escaparHtml(a.ruta_storage)}">Descargar</button>
          </div>`).join('')}
      </div>` : '<p class="zx-vacio">Esta queja no tiene archivos adjuntos.</p>'}
    </div>`;

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

  return `
    <h2>${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)} <span class="zx-detalle-estado">${escaparHtml(q.catalogo_estados?.etiqueta || q.estado)}</span></h2>

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
}

/** Engancha el botón "Descargar" de cada adjunto pintado por construirContenidoDetalle(). Llamar
 * una vez después de insertar ese HTML en la página. */
export function activarDescargasAdjuntos(contenedor) {
  contenedor.querySelectorAll('[data-descargar-adjunto]').forEach((btn) => {
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

/** Genera el enlace "Ver detalles" que lleva a la página detalle-queja.html?id=... — ya no abre
 * ningún pop up. Se ve y se usa igual que el botón de siempre porque comparte la clase .zx-btn. */
export function botonDetalle(id) {
  return `<a href="detalle-queja.html?id=${encodeURIComponent(id)}" class="zx-btn zx-btn-detalle zx-btn-sm">Ver detalles</a>`;
}

/** Ya no hace falta: botonDetalle() ahora es un enlace normal, no un botón con listener. Se deja
 * como función vacía (en vez de quitar la llamada de cada pantalla) para no tener que tocar
 * todos los lugares que todavía la invocan después de pintar sus filas. */
export function activarBotonesDetalle(contenedor) {
  // sin efecto — ver comentario arriba.
}

// Lista de estados que se consideran "cerrados" (ya no están en proceso): aceptadas al final
// (cerrada) o rechazadas en cualquiera de las etapas donde eso es posible. admin.js y
// quejas-cerradas.js importan esta misma constante en vez de tener cada uno su propia copia.
export const ESTADOS_TERMINALES = ['cerrada', 'rechazada_calidad', 'rechazada_dictamen', 'rechazada_revision', 'rechazada_nc'];

/** Pinta solo el número de quejas cerradas (sin la lista) en el contador de la tarjeta-enlace
 * que llevan a quejas-cerradas.html. Antes esta bandeja se pintaba completa dentro de cada
 * pantalla (Comercial/Calidad/CEDIS); desde esta ronda esa lista vive en su propia página, así
 * que aquí solo hace falta un conteo, no traer y pintar cada fila. */
export async function pintarContadorQuejasCerradas(contadorId) {
  const el = document.getElementById(contadorId);
  if (!el) return;
  const { count, error } = await supabase
    .from('quejas')
    .select('id', { count: 'exact', head: true })
    .in('estado', ESTADOS_TERMINALES);
  el.textContent = error ? '—' : (count ?? 0);
}
