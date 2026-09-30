// Quejas de Clientes — selector de archivos reutilizable (botón + chips con ícono + quitar).
//
// Antes, "adjuntos" era un <input type="file" multiple> a secas: cada vez que dabas clic en
// "Elegir archivos" el navegador REEMPLAZABA la selección anterior por la nueva (así funciona
// el input nativo), así que si olvidabas un archivo o estaba en otra carpeta, tenías que volver
// a elegir todos desde cero. Este selector guarda los archivos en una lista propia (no en el
// input), así que cada clic en el botón AGREGA a lo ya elegido, y cada archivo se puede quitar
// individualmente sin perder los demás.
import { escaparHtml } from './auth-guard.js';
import { MAX_ADJUNTO_BYTES, formatoTamano, iconoParaArchivo } from './adjuntos.js';

let contadorSelectores = 0;

/**
 * Pinta el selector dentro de `contenedor` (un <div> vacío) y devuelve una API para leerlo/limpiarlo.
 * @param {Object} opciones
 * @param {HTMLElement} opciones.contenedor - dónde se pinta el selector (se sobreescribe su contenido).
 * @param {string} [opciones.textoBoton] - texto del botón para elegir archivos.
 * @param {number} [opciones.maxBytes] - tamaño máximo por archivo; los que lo superen no se agregan.
 * @param {(archivos: File[]) => void} [opciones.onCambio] - se llama cada vez que la lista cambia.
 */
export function crearSelectorArchivos({ contenedor, textoBoton = 'Elegir archivos', maxBytes = MAX_ADJUNTO_BYTES, onCambio } = {}) {
  contadorSelectores += 1;
  const idInput = `zx-selector-input-${contadorSelectores}`;
  let archivos = [];

  contenedor.innerHTML = `
    <input type="file" id="${idInput}" class="zx-oculto" multiple />
    <button type="button" class="zx-btn zx-btn-secundario zx-btn-sm" data-boton-elegir>
      <span aria-hidden="true">📎</span> ${escaparHtml(textoBoton)}
    </button>
    <p class="zx-fila-meta zx-oculto" data-error-adjuntos style="color:var(--zx-peligro); margin:8px 0 0;"></p>
    <div class="zx-lista-adjuntos" data-lista-chips style="margin-top:10px;"></div>
  `;

  const input = contenedor.querySelector(`#${idInput}`);
  const boton = contenedor.querySelector('[data-boton-elegir]');
  const lista = contenedor.querySelector('[data-lista-chips]');
  const errorEl = contenedor.querySelector('[data-error-adjuntos]');

  boton.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const nuevos = Array.from(input.files || []);
    const rechazadosPorTamano = [];

    for (const archivo of nuevos) {
      const yaEstaba = archivos.some((a) => a.name === archivo.name && a.size === archivo.size);
      if (yaEstaba) continue; // ya lo habías elegido antes, no lo dupliques en la lista
      if (archivo.size > maxBytes) {
        rechazadosPorTamano.push(archivo.name);
        continue;
      }
      archivos.push(archivo);
    }

    // Limpia el input para que, si vuelves a abrir el explorador, el navegador no "recuerde"
    // la selección anterior — nuestra lista (`archivos`) es la única fuente de verdad.
    input.value = '';

    if (rechazadosPorTamano.length > 0) {
      const limiteMb = Math.round(maxBytes / (1024 * 1024));
      errorEl.textContent = `No se agregaron (pasan de ${limiteMb} MB): ${rechazadosPorTamano.join(', ')}.`;
      errorEl.classList.remove('zx-oculto');
    } else {
      errorEl.classList.add('zx-oculto');
    }

    pintarLista();
    onCambio?.(archivos.slice());
  });

  function pintarLista() {
    if (archivos.length === 0) {
      lista.innerHTML = '';
      return;
    }
    lista.innerHTML = archivos.map((archivo, indice) => `
      <div class="zx-chip-adjunto">
        <span class="zx-chip-icono" aria-hidden="true">${iconoParaArchivo(archivo.type, archivo.name)}</span>
        <span class="zx-chip-nombre" title="${escaparHtml(archivo.name)}">${escaparHtml(archivo.name)}</span>
        <span class="zx-chip-tamano">${formatoTamano(archivo.size)}</span>
        <button type="button" class="zx-btn-quitar-fila" data-quitar-adjunto="${indice}" title="Quitar ${escaparHtml(archivo.name)}">✕</button>
      </div>
    `).join('');

    lista.querySelectorAll('[data-quitar-adjunto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const indice = Number(btn.getAttribute('data-quitar-adjunto'));
        archivos.splice(indice, 1);
        pintarLista();
        onCambio?.(archivos.slice());
      });
    });
  }

  return {
    /** Lista actual de archivos elegidos (copia; no modifiques el arreglo devuelto). */
    obtenerArchivos: () => archivos.slice(),
    /** Vacía la selección (usar después de guardar con éxito, o al cerrar un modal). */
    limpiar: () => {
      archivos = [];
      errorEl.classList.add('zx-oculto');
      pintarLista();
    },
  };
}
