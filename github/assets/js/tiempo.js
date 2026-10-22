// Utilidades para mostrar duraciones como texto fijo y legible (nunca un reloj en vivo):
// 1-59 minutos, 1-23 horas, 1-6 días, 1-4 semanas, 1-12 meses, 1 año en adelante.

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const SEMANA = 7 * DIA;
const MES = 30 * DIA;
const ANIO = 365 * DIA;

function plural(n, singular, pluralForma) {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

export function formatoDuracionFija(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;

  if (ms < HORA) {
    return plural(Math.max(1, Math.floor(ms / MIN)), 'minuto', 'minutos');
  }
  if (ms < DIA) {
    return plural(Math.floor(ms / HORA), 'hora', 'horas');
  }
  if (ms < SEMANA) {
    return plural(Math.floor(ms / DIA), 'día', 'días');
  }
  if (ms < MES) {
    return plural(Math.floor(ms / SEMANA), 'semana', 'semanas');
  }
  if (ms < ANIO) {
    return plural(Math.floor(ms / MES), 'mes', 'meses');
  }
  return plural(Math.floor(ms / ANIO), 'año', 'años');
}

/**
 * Actualiza (sin animación de reloj) cada elemento [data-desde="<ISO>"] con el
 * texto fijo de cuánto ha pasado. Se refresca cada minuto — suficiente para que
 * "3 horas" pase a "4 horas" solo, sin dar la impresión de un cronómetro en vivo.
 */
export function iniciarActualizacionFija() {
  const actualizar = () => {
    document.querySelectorAll('[data-desde]').forEach((el) => {
      const desde = el.getAttribute('data-desde');
      if (!desde) return;
      el.textContent = formatoDuracionFija(Date.now() - new Date(desde).getTime());
    });
  };
  actualizar();
  return setInterval(actualizar, 60000);
}
