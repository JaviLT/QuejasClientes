// Utilidades para mostrar el "tempo" (cronómetro) activo de cada queja, en vivo.

export function formatoDuracion(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Actualiza cada segundo todos los elementos con el atributo [data-desde="<ISO>"]
 * escribiendo el tiempo transcurrido dentro del elemento. Devuelve el interval id.
 */
export function iniciarCronometros() {
  const actualizar = () => {
    document.querySelectorAll('[data-desde]').forEach((el) => {
      const desde = el.getAttribute('data-desde');
      if (!desde) return;
      el.textContent = formatoDuracion(Date.now() - new Date(desde).getTime());
    });
  };
  actualizar();
  return setInterval(actualizar, 1000);
}
