// ZX · Procesos — exportación a PDF del "Dictamen de atención al cliente" (formato VEN-F-08).
//
// Ronda 8 (8 de octubre de 2026): Calidad pidió poder descargar un archivo igual al formato oficial
// VEN-F-08 (revisión 05, 24 de julio 2023) con toda la información que ya se capturó en los pasos
// anteriores (queja, D2, dictamen, equipo, medidas, recolección y fotos de evidencia). El botón
// "Exportar PDF" vive en la bandeja "Material en planta (recibido de CEDIS)" de calidad.html.
//
// Se genera en el navegador con jsPDF (se carga de cdnjs solo la primera vez que se exporta), así
// que no hace falta servidor ni cambios en la base de datos. El diseño imita el formato original:
// encabezado con logo y cuadro de control del documento, datos generales en tabla con filas
// alternadas, secciones 1 a 4, fecha de emisión / recibido por / elaboró, y la nota de copia
// controlada al pie de cada página.
import { supabase } from './supabase-client.js';
import { obtenerDatosQueja, textoLotes } from './detalle.js';
import { esImagenAdjunto } from './adjuntos.js';

const URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
// Huella (SRI) de esa versión exacta: si alguien alterara el archivo en la red de entrega, el navegador lo rechaza.
const SRI_JSPDF = 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk';

// Colores (paleta de marca Zubex: azul #0D18A8; recuadros #dbeafe).
const AZUL = [13, 24, 168];
const AZUL_TEXTO = [30, 50, 150];
const FILA_CLARA = [219, 234, 254];
const FILA_MEDIDAS = [200, 220, 242];
const ROJO = [220, 20, 40];
const GRIS_CAJA = [232, 234, 242];
const NEGRO = [20, 20, 20];

// Geometría de la hoja (carta, puntos).
const PAG_ANCHO = 612;
const PAG_ALTO = 792;
const IZQ = 80;
const DER = 532;
const ANCHO = DER - IZQ;
const Y_INICIO = 112;
const Y_FIN = 716; // de aquí hacia abajo va la nota de pie

const NOTA_PIE = 'NOTA: Los documentos del Sistema de Gestión de Inocuidad y Calidad de ZUBEX INDUSTRIAL, se controlan en RED INTERNA, cualquier copia impresa es SOLO REFERENCIA';

let promesaJsPdf = null;
function cargarJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!promesaJsPdf) {
    promesaJsPdf = new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = URL_JSPDF;
      s.integrity = SRI_JSPDF;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.jspdf?.jsPDF ? resolver(window.jspdf.jsPDF) : rechazar(new Error('No se pudo iniciar la librería de PDF.')));
      s.onerror = () => { promesaJsPdf = null; rechazar(new Error('No se pudo cargar la librería de PDF (revisa tu conexión).')); };
      document.head.appendChild(s);
    });
  }
  return promesaJsPdf;
}

// jsPDF estándar solo escribe bien el alfabeto latino: se normalizan comillas/rayas "elegantes".
function limpiar(t) {
  return String(t ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[  ]/g, ' ')
    .replace(/[^\x09\x0A\x20-\x7E¡-ÿ]/g, '');
}

function fechaCorta(valor, anio4) {
  if (!valor) return '';
  // 'YYYY-MM-DD' (columna date) se trata sin zona horaria para que no se recorra un día.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (m) return `${m[3]}/${m[2]}/${anio4 ? m[1] : m[1].slice(2)}`;
  try {
    return new Date(valor).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: anio4 ? 'numeric' : '2-digit', timeZone: 'America/Mexico_City' });
  } catch (e) { return String(valor); }
}

async function logoComoDataUrl() {
  try {
    const r = await fetch('assets/img/logo-zubex-wordmark.png');
    const b = await r.blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  } catch (e) { return null; }
}

// Descarga una imagen adjunta (URL firmada) y la devuelve como JPEG reducido, con su tamaño.
async function imagenParaPdf(ruta) {
  try {
    const { data, error } = await supabase.storage.from('adjuntos-quejas').createSignedUrl(ruta, 120);
    if (error || !data?.signedUrl) return null;
    const resp = await fetch(data.signedUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const max = 1400;
      const esc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * esc));
      const h = Math.max(1, Math.round(img.naturalHeight * esc));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return { dataUrl: c.toDataURL('image/jpeg', 0.85), w, h };
    } finally { URL.revokeObjectURL(url); }
  } catch (e) { return null; }
}

/** Genera y descarga el PDF del dictamen (VEN-F-08) de la queja `id`. Devuelve el nombre del archivo. */
export async function exportarDictamenPdf(id) {
  const [JsPDF, datos, logo] = await Promise.all([cargarJsPdf(), obtenerDatosQueja(id), logoComoDataUrl()]);
  if (datos.error) throw new Error(datos.error);
  const { q, dictamenes: d, equipo, medidas, recolecciones: rec, adjuntos } = datos;
  if (!d) throw new Error('Esta queja todavía no tiene dictamen capturado.');

  // Quién elaboró el dictamen (perfil de quien lo registró) — si no se puede leer, queda en blanco.
  let elaboro = '';
  if (d.creado_por) {
    const { data: p } = await supabase.from('profiles').select('nombre_completo').eq('id', d.creado_por).maybeSingle();
    elaboro = p?.nombre_completo || '';
  }

  // Fotos de evidencia: todas las imágenes adjuntas a la queja.
  const fotos = [];
  for (const a of adjuntos.filter((x) => esImagenAdjunto(x.tipo_mime, x.nombre_archivo))) {
    const f = await imagenParaPdf(a.ruta_storage);
    if (f) fotos.push(f);
  }

  const doc = new JsPDF({ unit: 'pt', format: 'letter' });
  let y = Y_INICIO;

  // ---------- Encabezado y pie (se repiten en cada página) ----------
  function encabezado() {
    if (logo) doc.addImage(logo, 'PNG', 40, 36, 124, 32);
    doc.setFillColor(...GRIS_CAJA);
    doc.rect(312, 20, 248, 72, 'F');
    doc.setTextColor(...AZUL_TEXTO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text('Sistema de Gestión de Inocuidad y Calidad', 324, 36);
    const filas = [['Formato:', 'Dictamen de atención al cliente'], ['Fecha de Revisión:', '24 de julio 2023'], ['Clave:', 'VEN-F-08'], ['Revisión:', '05']];
    filas.forEach(([k, v], i) => {
      const yy = 54 + i * 9;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.text(k, 324, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(v, 324 + doc.getTextWidth(k) + 4, yy);
    });
  }
  function pie() {
    doc.setTextColor(...AZUL_TEXTO);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    const l = doc.splitTextToSize(NOTA_PIE, 450);
    doc.text(l, 85, 732);
  }
  function paginaNueva() {
    doc.addPage();
    encabezado(); pie();
    y = Y_INICIO;
  }
  function asegurar(alto) {
    if (y + alto > Y_FIN) paginaNueva();
  }
  encabezado(); pie();

  // ---------- Utilidades de texto ----------
  const INTERLINEA = 1.32;
  function parrafo(texto, { tam = 10, justificar = true, x = IZQ, ancho = ANCHO, bold = false, color = NEGRO, despues = 8 } = {}) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(tam);
    doc.setTextColor(...color);
    const lh = tam * INTERLINEA;
    const lineas = doc.splitTextToSize(limpiar(texto), ancho);
    lineas.forEach((ln, i) => {
      asegurar(lh);
      const ultima = i === lineas.length - 1;
      if (justificar && !ultima && ln.includes(' ')) doc.text(ln, x, y, { align: 'justify', maxWidth: ancho });
      else doc.text(ln, x, y);
      y += lh;
    });
    y += despues;
  }
  function titulo(texto) {
    asegurar(40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text(limpiar(texto), IZQ, y);
    y += 20;
  }

  // ---------- Acción correctiva / preventiva + folio y fecha ----------
  const correctiva = d.tipo_accion === 'correctiva';
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...AZUL_TEXTO);
  doc.text('Acción Correctiva:', IZQ + 5, y + 10);
  doc.text('Acción preventiva:', IZQ + 5, y + 25);
  [[correctiva, y + 2], [!correctiva, y + 17]].forEach(([marcada, yy]) => {
    if (marcada) { doc.setFillColor(...ROJO); doc.rect(IZQ + 118, yy, 22, 10, 'F'); }
    else { doc.setDrawColor(...AZUL_TEXTO); doc.setLineWidth(0.6); doc.rect(IZQ + 118, yy, 22, 10, 'S'); }
  });
  doc.text(`Folio de queja: ${limpiar(q.folio)}`, 300, y + 10);
  doc.text(`Fecha de queja: ${fechaCorta(q.creada_en, true)}`, 300, y + 25);
  y += 52;

  // ---------- Datos generales ----------
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(...ROJO);
  doc.text('DATOS GENERALES', (IZQ + DER) / 2, y, { align: 'center' });
  y += 6;

  const filasDatos = [
    ['NOMBRE DE CLIENTE:', q.cliente],
    ['CODIGO DE PRODUCTO:', q.codigo],
    ['PRODUCTO:', q.producto],
    ['LOTE:', q.lote],
    ['DESVIACIÓN REPORTADA:', d.desviacion_reportada || q.d2_que],
  ];
  // Información extra capturada en pasos anteriores (solo si tiene valor).
  const extras = [
    ['TIPO DE QUEJA:', q.catalogo_tipos_queja?.etiqueta || q.tipo_queja],
    ['PEDIDO:', q.pedido], ['FACTURA:', q.factura], ["ID'S:", q.ids],
    ['PRIORIDAD:', q.prioridad],
    ['CANTIDAD:', d.cantidad],
    ['QUIÉN (D2):', q.d2_quien], ['QUÉ (D2):', q.d2_que], ['PORQUÉ (D2):', q.d2_porque],
    ['CUÁNDO (D2):', /^\d{4}-\d{2}-\d{2}$/.test(q.d2_cuando || '') ? fechaCorta(q.d2_cuando, true) : q.d2_cuando], ['DÓNDE (D2):', q.d2_donde], ['CUÁNTO (D2):', q.d2_cuanto],
    ['FOLIO DE RECOLECCIÓN:', rec?.folio],
    ['CANTIDAD RECOLECTADA:', rec?.cantidad],
    ['LOTE DE RECHAZO:', textoLotes(rec)],
    ['REGISTRADA POR:', q.profiles?.nombre_completo],
  ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  const todas = [...filasDatos, ...extras];

  doc.setDrawColor(...AZUL_TEXTO); doc.setLineWidth(0.8);
  doc.line(IZQ, y, DER, y);
  const X_VAL = IZQ + 150;
  todas.forEach(([k, v], i) => {
    const valor = limpiar(v ?? '');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const lineas = doc.splitTextToSize(valor, DER - X_VAL - 8);
    const alto = Math.max(18, lineas.length * 12.5 + 7);
    if (y + alto > Y_FIN) { paginaNueva(); doc.setDrawColor(...AZUL_TEXTO); doc.setLineWidth(0.8); doc.line(IZQ, y, DER, y); }
    if (i % 2 === 1) { doc.setFillColor(...FILA_CLARA); doc.rect(IZQ, y, ANCHO, alto, 'F'); }
    doc.setTextColor(...AZUL_TEXTO);
    const kl = doc.splitTextToSize(k, 140);
    doc.text(kl, IZQ + 5, y + 12.5);
    doc.setTextColor(...NEGRO);
    doc.text(lineas, X_VAL, y + 12.5);
    y += alto;
  });
  doc.setDrawColor(...AZUL_TEXTO); doc.setLineWidth(0.8);
  doc.line(IZQ, y, DER, y);
  y += 22;

  // ---------- 1. Descripción del problema ----------
  titulo('1.  Descripción del problema:');
  parrafo(d.descripcion_problema || '(Sin descripción capturada)', { despues: 12 });

  if (fotos.length > 0) {
    const colAncho = fotos.length === 1 ? 300 : (ANCHO - 6) / 2;
    const altoMax = fotos.length === 1 ? 260 : 200;
    let k = 0;
    while (k < fotos.length) {
      const fila = fotos.slice(k, k + (fotos.length === 1 ? 1 : 2));
      const tamanos = fila.map((f) => {
        const esc = Math.min(colAncho / f.w, altoMax / f.h);
        return { w: f.w * esc, h: f.h * esc };
      });
      const alto = Math.max(...tamanos.map((t) => t.h));
      asegurar(alto + 30);
      const anchoFila = tamanos.reduce((a, t) => a + t.w, 0) + (fila.length - 1) * 6;
      let x = IZQ + (ANCHO - anchoFila) / 2;
      fila.forEach((f, i) => {
        doc.addImage(f.dataUrl, 'JPEG', x, y, tamanos[i].w, tamanos[i].h);
        x += tamanos[i].w + 6;
      });
      y += alto + 8;
      k += fila.length;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NEGRO);
    asegurar(20);
    doc.text(fotos.length === 1 ? 'Imagen 1. Fotografía de evidencia del cliente.' : `Imágenes 1 a ${fotos.length}. Fotografías de evidencia del cliente.`, (IZQ + DER) / 2, y + 4, { align: 'center' });
    y += 24;
  }

  // ---------- 2. Identificación de la causa raíz ----------
  titulo('2.  Identificación de la causa raíz:');
  if (equipo.length > 0) {
    parrafo('Al recibir el reporte de queja se realiza una investigación en conjunto del equipo multidisciplinario de atención a quejas involucrados en la falla presentada, como son las siguientes áreas:', { despues: 8 });
    const X_NOM = IZQ + 30;
    const X_PUE = IZQ + 250;
    asegurar(40);
    doc.setFillColor(...AZUL); doc.rect(IZQ + 8, y, ANCHO - 16, 17, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255);
    doc.text('Nombre', X_NOM + 60, y + 12, { align: 'center' });
    doc.text('Puesto', X_PUE + 70, y + 12, { align: 'center' });
    y += 17;
    equipo.forEach((e, i) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      const ln = doc.splitTextToSize(limpiar(e.puesto || ''), DER - 8 - X_PUE - 4);
      const lnN = doc.splitTextToSize(limpiar(e.nombre || ''), X_PUE - X_NOM - 8);
      const alto = Math.max(15, Math.max(ln.length, lnN.length) * 12 + 4);
      asegurar(alto);
      if (i % 2 === 0) { doc.setFillColor(...FILA_CLARA); doc.rect(IZQ + 8, y, ANCHO - 16, alto, 'F'); }
      doc.setTextColor(...NEGRO);
      doc.text(String(i + 1), IZQ + 12, y + 11);
      doc.text(lnN, X_NOM, y + 11);
      doc.text(ln, X_PUE, y + 11);
      y += alto;
    });
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.6);
    doc.line(IZQ + 8, y, DER - 8, y);
    y += 16;
  }
  if (d.identificacion_causa_raiz && d.identificacion_causa_raiz.trim()) {
    parrafo('Tras la investigación se realizan las siguientes actividades:', { despues: 8 });
    const partes = d.identificacion_causa_raiz.split(/\n+/).map((t) => t.trim()).filter(Boolean);
    if (partes.length > 1) {
      partes.forEach((t, i) => parrafo(`${i + 1}.  ${t}`, { x: IZQ + 18, ancho: ANCHO - 18, despues: 6 }));
    } else {
      parrafo(partes[0], { despues: 10 });
    }
  } else if (equipo.length === 0) {
    parrafo('(Sin causa raíz capturada)', { justificar: false });
  }

  // ---------- 3. Medidas de contención y preventivas ----------
  titulo('3.  Medidas de contención y preventivas.');
  if (medidas.length > 0) {
    const X_RESP = IZQ + 215;
    const X_FEC = IZQ + 370;
    const encabezadoMedidas = () => {
      doc.setDrawColor(...AZUL_TEXTO); doc.setLineWidth(0.8);
      doc.line(IZQ, y - 8, DER, y - 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...AZUL_TEXTO);
      doc.text('Medidas', IZQ + 6, y + 4);
      doc.text('Responsable', X_RESP, y + 4);
      doc.text('Fecha', X_FEC + 22, y + 4);
      y += 10;
    };
    asegurar(50);
    encabezadoMedidas();
    medidas.forEach((m) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      const lm = doc.splitTextToSize(limpiar(m.medida), X_RESP - IZQ - 14);
      const lr = doc.splitTextToSize(limpiar(m.responsable || ''), X_FEC - X_RESP - 8);
      const alto = Math.max(lm.length, lr.length) * 12 + 12;
      if (y + alto > Y_FIN) { paginaNueva(); y += 8; encabezadoMedidas(); }
      doc.setFillColor(...FILA_MEDIDAS); doc.rect(IZQ, y, ANCHO, alto, 'F');
      doc.setTextColor(...NEGRO);
      doc.text(lm, IZQ + 6, y + 12);
      doc.text(lr, X_RESP, y + 12);
      doc.text(fechaCorta(m.fecha, false), X_FEC + 22, y + 12);
      y += alto;
    });
    doc.setDrawColor(...AZUL_TEXTO); doc.setLineWidth(0.8);
    doc.line(IZQ, y, DER, y);
    y += 20;
  } else {
    parrafo('(Sin medidas capturadas)', { justificar: false });
  }
  if (d.comentarios_medidas && d.comentarios_medidas.trim()) {
    d.comentarios_medidas.split(/\n+/).map((t) => t.trim()).filter(Boolean)
      .forEach((t, i) => parrafo(i === 0 ? `Comentarios: ${t}` : t, { despues: 8 }));
  }

  // ---------- 4. Conclusión ----------
  titulo('4.  Conclusión:');
  const conclusion = (d.conclusion || '').split(/\n+/).map((t) => t.trim()).filter(Boolean);
  if (conclusion.length === 0) parrafo('(Sin conclusión capturada)', { justificar: false });
  conclusion.forEach((t) => parrafo(t, { despues: 10 }));

  // ---------- Cierre: fecha de emisión, recibido por, elaboró ----------
  y += 14;
  asegurar(80);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...AZUL_TEXTO);
  doc.text(`Fecha de Emisión: ${fechaCorta(d.fecha_emision || d.creado_en, true)}`, IZQ + 5, y);
  y += 15;
  doc.text(`Recibido por: ${limpiar(d.recibido_por || '')}`, IZQ + 5, y);
  y += 56;
  doc.text(`Elaboró: ${limpiar(elaboro)}`, IZQ + 5, y);
  y += 15;
  doc.text('Auditor de Atención a Clientes.', IZQ + 5, y);

  // ---------- Numeración "Página X de N" en cada hoja ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...AZUL_TEXTO);
    doc.text(`Página ${p} de ${total}`, 432, 81);
  }

  const nombre = `VEN-F-08_Dictamen_${limpiar(q.folio).replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;
  doc.save(nombre);
  return nombre;
}

// ---------- Botón "Descargar PDF" compartido (Comercial y Quejas cerradas) ----------
// Estados en los que todavía NO existe un dictamen registrado. A partir del siguiente estado
// (o si la queja se rechazó en el dictamen) el botón se habilita.
const ESTADOS_SIN_DICTAMEN = ['nueva', 'esperando_muestra', 'dictamen_pendiente', 'rechazada_calidad'];

/** HTML del botón "Descargar PDF" de una fila de queja; va deshabilitado mientras no haya dictamen. */
export function botonDescargarPdf(q) {
  const habilitado = !ESTADOS_SIN_DICTAMEN.includes(q.estado);
  const titulo = habilitado
    ? 'Descarga el dictamen en PDF (formato VEN-F-08)'
    : (q.estado === 'rechazada_calidad' ? 'Esta queja se rechazó antes del dictamen' : 'Disponible cuando Calidad termine el dictamen');
  return `<button type="button" class="zx-btn zx-btn-sm" data-accion="exportar_pdf" data-id-pdf="${q.id}" title="${titulo}"${habilitado ? '' : ' disabled'}>Descargar PDF</button>`;
}

/** Engancha los botones creados con botonDescargarPdf dentro de `contenedor`. */
export function activarBotonesPdf(contenedor, avisar) {
  contenedor.querySelectorAll('[data-accion="exportar_pdf"][data-id-pdf]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const textoOriginal = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Generando PDF…';
      try {
        const nombre = await exportarDictamenPdf(btn.getAttribute('data-id-pdf'));
        avisar(`PDF generado: ${nombre}`, true);
      } catch (e) {
        avisar('No se pudo generar el PDF: ' + (e?.message || e), false);
      } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    });
  });
}
