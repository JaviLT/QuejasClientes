import { supabase } from './supabase-client.js';
import { exigirSesion, pintarEncabezado, escaparHtml } from './auth-guard.js';

const sesion = await exigirSesion(['comercial', 'admin']);
if (sesion) {
  pintarEncabezado(sesion.perfil, 'Comercial');
  await cargarCatalogoTiposQueja();
  await cargarMisQuejas();
  escucharCambiosEnVivo();
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

document.getElementById('zx-form-queja').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const mensaje = document.getElementById('zx-mensaje');
  mensaje.classList.add('zx-oculto');

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

  const { data, error } = await supabase.from('quejas').insert(nuevaQueja).select('folio').single();

  btn.disabled = false;
  btn.textContent = 'Registrar queja';

  if (error) {
    console.error(error);
    mensaje.textContent = 'No se pudo registrar la queja: ' + error.message;
    mensaje.className = 'zx-mensaje zx-mensaje-error';
    return;
  }

  mensaje.textContent = `Queja registrada con folio ${data.folio}.`;
  mensaje.className = 'zx-mensaje zx-mensaje-ok';
  document.getElementById('zx-form-queja').reset();
  await cargarMisQuejas();
});

async function cargarMisQuejas() {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from('quejas')
    .select('folio, cliente, tipo_queja, estado, creada_en, catalogo_estados(etiqueta)')
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
      </div>
    </div>
  `).join('');
}

function escucharCambiosEnVivo() {
  supabase
    .channel('comercial-quejas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quejas' }, () => {
      cargarMisQuejas();
    })
    .subscribe();
}
