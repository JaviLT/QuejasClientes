// ZX · Procesos — página "Tiempos": una tabla con la duración de cada etapa de cada queja y
// nada más (sin detalles de la queja). Nace como pantalla solo de Admin, pero es una pantalla
// asignable: el admin puede dársela a otros roles desde la pantalla Roles.
import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { formatoDuracionFija, iniciarActualizacionFija } from './tiempo.js';
import { ESTADOS_TERMINALES } from './detalle.js';

// Orden en que ocurre el proceso. Las etapas que aparezcan en la base y no estén aquí se
// agregan al final, para no esconder nunca un tiempo registrado.
const ETAPAS = ['Espera de muestra', 'Dictamen', 'Recolección', 'Material en planta', 'Revisión', 'Nota de crédito'];

// La etapa en curso de una queja se guarda con otro nombre (quejas.tempo_label_activo) que el que
// lleva la etapa ya cerrada (tempos.etiqueta); aquí se alinean para que ambas caigan en la misma columna.
const ETAPA_DE_ETIQUETA_ACTIVA = {
  'Espera de muestra': 'Espera de muestra',
  'Dictamen en proceso': 'Dictamen',
  'Espera de recolección': 'Recolección',
  'Enviado a planta': 'Material en planta',
  'Revisión en proceso': 'Revisión',
  'En espera de nota de crédito': 'Nota de crédito',
};
const etapaActiva = (q) => (q.tempo_label_activo ? (ETAPA_DE_ETIQUETA_ACTIVA[q.tempo_label_activo] || q.tempo_label_activo) : null);

let filas = [];
let etapas = [...ETAPAS];

const sesion = await exigirSesion(null, 'tiempos');
if (sesion) {
  pintarEncabezado(sesion.perfil, 'Tiempos');
  document.getElementById('filtro-texto').addEventListener('input', pintarTabla);
  document.getElementById('filtro-estado').addEventListener('change', pintarTabla);
  await cargar();
  iniciarActualizacionFija();
  supabase
    .channel('tiempos-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => cargar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tempos' }, () => cargar())
    .subscribe();
}

async function cargar() {
  const [rq, rt] = await Promise.all([
    supabase.from('quejas')
      .select('id, folio, cliente, estado, creada_en, tempo_activo_desde, tempo_label_activo')
      .order('creada_en', { ascending: false }),
    supabase.from('tempos').select('queja_id, etiqueta, duracion_ms'),
  ]);
  const err = rq.error || rt.error;
  if (err) {
    document.getElementById('tabla-tiempos').innerHTML = `<tbody><tr><td>${escaparHtml(err.message)}</td></tr></tbody>`;
    return;
  }

  const porQueja = new Map();
  const extras = new Set();
  for (const t of rt.data) {
    if (!ETAPAS.includes(t.etiqueta)) extras.add(t.etiqueta);
    const m = porQueja.get(t.queja_id) || {};
    m[t.etiqueta] = (m[t.etiqueta] || 0) + (Number(t.duracion_ms) || 0);
    porQueja.set(t.queja_id, m);
  }
  for (const q of rq.data) { const a = etapaActiva(q); if (a && !ETAPAS.includes(a)) extras.add(a); }
  etapas = [...ETAPAS, ...[...extras].sort()];

  filas = rq.data.map((q) => ({
    ...q,
    cerrada: ESTADOS_TERMINALES.includes(q.estado),
    cerradas: porQueja.get(q.id) || {},
  }));
  pintarTabla();
}

function pintarTabla() {
  const texto = document.getElementById('filtro-texto').value.trim().toLowerCase();
  const estado = document.getElementById('filtro-estado').value;
  const visibles = filas.filter((q) =>
    (estado === 'todas' || (estado === 'cerradas') === q.cerrada) &&
    (!texto || `${q.folio} ${q.cliente || ''}`.toLowerCase().includes(texto)));

  document.getElementById('c-quejas').textContent = visibles.length;
  const tabla = document.getElementById('tabla-tiempos');
  if (visibles.length === 0) {
    tabla.innerHTML = '<tbody><tr><td class="zx-t-vacio">No hay quejas con ese filtro.</td></tr></tbody>';
    return;
  }

  const cabecera = `<thead><tr><th>Folio</th><th>Cliente</th>${etapas.map((e) => `<th>${escaparHtml(e)}</th>`).join('')}<th>Total</th></tr></thead>`;
  const cuerpo = visibles.map((q) => {
    let total = 0;
    const celdas = etapas.map((e) => {
      const cerrado = q.cerradas[e];
      const enCurso = !q.cerrada && q.tempo_activo_desde && etapaActiva(q) === e;
      if (enCurso) {
        const ms = Date.now() - new Date(q.tempo_activo_desde).getTime();
        total += ms + (cerrado || 0);
        return `<td class="zx-t-curso" title="Etapa en curso"><span data-desde="${q.tempo_activo_desde}">${formatoDuracionFija(ms)}</span></td>`;
      }
      if (cerrado === undefined) return '<td class="zx-t-vacio">—</td>';
      total += cerrado;
      return `<td>${formatoDuracionFija(cerrado)}</td>`;
    }).join('');
    return `<tr><td class="zx-t-folio">${escaparHtml(q.folio)}</td><td>${escaparHtml(q.cliente || '—')}</td>${celdas}<td class="zx-t-total">${total > 0 ? formatoDuracionFija(total) : '—'}</td></tr>`;
  }).join('');
  tabla.innerHTML = `${cabecera}<tbody>${cuerpo}</tbody>`;
}
