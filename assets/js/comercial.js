import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';
import { botonDetalle, activarBotonesDetalle, establecerRolActual } from './detalle.js';
import { subirAdjuntos } from './adjuntos.js';
import { crearSelectorArchivos } from './selector-archivos.js';

const sesion = await exigirSesion(['comercial']);
if (sesion) {
  establecerRolActual(sesion.perfil.rol);
  pintarEncabezado(sesion.perfil, 'Comercial', {
    boton: { id: 'zx-btn-abrir-nueva', texto: 'Nueva queja', icono: '+' },
  });
  await cargarCatalogoTiposQueja();
  await cargarMisQuejas();
  escucharCambiosEnVivo();

  const modalFondo = document.getElementById('zx-modal-nueva-fondo');
  const modalMensaje = document.getElementById('zx-modal-mensaje');
  const selectorAdjuntos = crearSelectorArchivos({
    contenedor: document.getElementById('zx-selector-adjuntos'),
    textoBoton: 'Elegir archivos',
  });

  function abrirModalNueva() {
    modalMensaje.classList.add('zx-oculto');
    modalFondo.classList.remove('zx-oculto');
  }

  function cerrarModalNueva() {
    modalFondo.classList.add('zx-oculto');
  }

  document.getElementById('zx-btn-abrir-nueva').addEventListener('click', abrirModalNueva);
  document.getElementById('zx-btn-cerrar-nueva').addEventListener('click', cerrarModalNueva);
  modalFondo.addEventListener('click', (evento) => { if (evento.target === modalFondo) cerrarModalNueva(); });

  document.getElementById('zx-form-queja').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    modalMensaje.classList.add('zx-oculto');

    // El selector de archivos ya filtra los que pasan de 15 MB al elegirlos, así que aquí solo
    // se lee la lista final (lo que haya quedado después de agregar/quitar en el selector).
    const archivos = selectorAdjuntos.obtenerArchivos();

    // Registrar una queja nueva es una captura, no un cambio de proceso sobre una queja
    // existente, así que aquí no pedimos doble check (a diferencia de aceptar/rechazar/etc.).
    const btn = document.getElementById('zx-btn-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    const prioridadTexto = document.getElementById('prioridad').value;

    const nuevaQueja = {
      cliente: valorOTexto('cliente'),
      tipo_queja: valorOTexto('tipo_queja'),
      producto: valorOTexto('producto'),
      codigo: valorOTexto('codigo'),
      pedido: valorOTexto('pedido'),
      factura: valorOTexto('factura'),
      lote: valorOTexto('lote'),
      ids: valorOTexto('ids'),
      prioridad: prioridadTexto === '' ? null : Number(prioridadTexto),
      d2_quien: valorOTexto('d2_quien'),
      d2_que: valorOTexto('d2_que'),
      d2_porque: valorOTexto('d2_porque'),
      d2_cuando: valorOTexto('d2_cuando'),
      d2_donde: valorOTexto('d2_donde'),
      d2_cuanto: valorOTexto('d2_cuanto'),
    };
    // Nota: estado, creada_por, tempo_activo_desde y tempo_label_activo los fija
    // el servidor (trigger trg_inicializar_queja) — el cliente nunca los manda.

    const { data, error } = await supabase.from('quejas').insert(nuevaQueja).select('id, folio').single();

    if (error) {
      btn.disabled = false;
      btn.textContent = 'Registrar queja';
      console.error(error);
      modalMensaje.textContent = 'No se pudo registrar la queja: ' + error.message;
      modalMensaje.className = 'zx-mensaje zx-mensaje-error';
      return;
    }

    let avisoAdjuntos = '';
    if (archivos.length > 0) {
      btn.textContent = `Subiendo ${archivos.length} archivo(s)…`;
      const fallos = await subirAdjuntos(data.id, archivos);
      if (fallos.length > 0) {
        avisoAdjuntos = ` No se pudieron subir estos archivos: ${fallos.join(', ')}.`;
      }
    }

    btn.disabled = false;
    btn.textContent = 'Registrar queja';

    const mensaje = document.getElementById('zx-mensaje');
    mensaje.textContent = `Queja registrada con folio ${data.folio}.${avisoAdjuntos}`;
    mensaje.className = 'zx-mensaje ' + (avisoAdjuntos ? 'zx-mensaje-error' : 'zx-mensaje-ok');
    document.getElementById('zx-form-queja').reset();
    selectorAdjuntos.limpiar();
    cerrarModalNueva();
    await cargarMisQuejas();
  });
}

async function cargarCatalogoTiposQueja() {
  const { data, error } = await supabase
    .from('catalogo_tipos_queja')
    .select('clave, etiqueta')
    .order('orden', { ascending: true });

  const select = document.getElementById('tipo_queja');
  if (error) {
    console.error(error);
    return;
  }
  for (const fila of data) {
    const opcion = document.createElement('option');
    opcion.value = fila.clave;
    opcion.textContent = fila.etiqueta;
    select.appendChild(opcion);
  }
}

function valorOTexto(id) {
  const el = document.getElementById(id);
  const v = el.value.trim();
  return v === '' ? null : v;
}

async function cargarMisQuejas() {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from('quejas')
    .select('id, folio, cliente, tipo_queja, estado, creada_en, catalogo_estados(etiqueta)')
    .eq('creada_por', session.user.id)
    .order('creada_en', { ascending: false })
    .limit(20);

  const lista = document.getElementById('zx-lista-quejas');
  const contador = document.getElementById('zx-contador-quejas');

  if (error) {
    lista.innerHTML = `<p class="zx-vacio">No se pudo cargar la lista (${escaparHtml(error.message)}).</p>`;
    return;
  }

  contador.textContent = data.length;

  if (data.length === 0) {
    lista.innerHTML = '<p class="zx-vacio">Todavía no has registrado ninguna queja.</p>';
    return;
  }

  lista.innerHTML = data.map((q) => `
    <div class="zx-fila">
      <div class="zx-fila-info">
        <span class="zx-fila-folio">${escaparHtml(q.folio)} · ${escaparHtml(q.cliente)}</span>
        <span class="zx-fila-meta">${escaparHtml(q.tipo_queja)} · ${new Date(q.creada_en).toLocaleString('es-MX')}</span>
      </div>
      <div class="zx-fila-acciones">
        <span class="zx-contador">${escaparHtml(q.catalogo_estados?.etiqueta || q.estado)}</span>
        ${botonDetalle(q.id)}
      </div>
    </div>
  `).join('');
  activarBotonesDetalle(lista);
}

function escucharCambiosEnVivo() {
  supabase
    .channel('comercial-quejas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => {
      cargarMisQuejas();
    })
    .subscribe();
}
