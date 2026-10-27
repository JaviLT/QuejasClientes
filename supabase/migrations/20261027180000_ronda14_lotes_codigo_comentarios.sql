-- Ronda 14 (v1.13.0, 27 de octubre de 2026)
--  · CEDIS "Material recibido": varios lotes (cada uno con su cantidad).
--  · CEDIS "Folio sin queja": se capturan código, lote y cantidad.
--  · Calidad, dictamen: comentarios en "3. Medidas de contención y preventivas".

alter table public.recolecciones
  add column if not exists lotes  jsonb not null default '[]'::jsonb,
  add column if not exists codigo text;
comment on column public.recolecciones.lotes  is 'Lotes recibidos en CEDIS: [{"lote":"...","cantidad":n}, ...]. cantidad = suma de los lotes y lote_rechazo = lotes separados por coma (para detalle y PDF).';
comment on column public.recolecciones.codigo is 'Código capturado al generar un folio sin queja asociada (NULL en folios con queja).';

alter table public.dictamenes add column if not exists comentarios_medidas text;
comment on column public.dictamenes.comentarios_medidas is 'Comentarios de Calidad bajo "3. Medidas de contención y preventivas".';

-- Material recibido con uno o varios lotes (sobrecarga nueva; la versión antigua se desactiva al final).
create or replace function public.recoleccion_material_recibido(p_queja_id uuid, p_lotes jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_total numeric; v_texto text;
begin
  if not public.rol_en(array['cedis','admin']) then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_lotes) is distinct from 'array' or jsonb_array_length(p_lotes) = 0 then
    raise exception 'Captura al menos un lote';
  end if;
  select count(*), coalesce(sum((e->>'cantidad')::numeric), 0), string_agg(trim(e->>'lote'), ', ')
    into v_n, v_total, v_texto
  from jsonb_array_elements(p_lotes) e;
  if exists (select 1 from jsonb_array_elements(p_lotes) e
             where coalesce(trim(e->>'lote'), '') = '' or (e->>'cantidad') is null or (e->>'cantidad')::numeric < 0) then
    raise exception 'Cada lote necesita nombre y una cantidad válida';
  end if;
  update public.quejas set estado = 'folio_generado' where id = p_queja_id and estado = 'espera_recoleccion';
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.recolecciones(queja_id, generado_por, cantidad, lote_rechazo, lotes)
    values (p_queja_id, auth.uid(), v_total, v_texto, p_lotes)
    returning id into v_id;
  return v_id;
end $$;

-- Folio sin queja con código, lote y cantidad (sobrecarga nueva; la versión antigua se desactiva al final).
create or replace function public.recoleccion_sin_queja(p_codigo text, p_lote text, p_cantidad numeric)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.rol_en(array['cedis','admin']) then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_codigo), '') = '' or coalesce(trim(p_lote), '') = '' or p_cantidad is null or p_cantidad < 0 then
    raise exception 'Código, lote y cantidad son obligatorios';
  end if;
  insert into public.recolecciones(queja_id, generado_por, codigo, lote_rechazo, cantidad, lotes)
    values (null, auth.uid(), trim(p_codigo), trim(p_lote), p_cantidad,
            jsonb_build_array(jsonb_build_object('lote', trim(p_lote), 'cantidad', p_cantidad)))
    returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.recoleccion_material_recibido(uuid, jsonb) from public, anon;
revoke execute on function public.recoleccion_sin_queja(text, text, numeric) from public, anon;
grant  execute on function public.recoleccion_material_recibido(uuid, jsonb) to authenticated;
grant  execute on function public.recoleccion_sin_queja(text, text, numeric) to authenticated;

-- Las versiones antiguas se desactivan (sin borrarlas) para que nadie genere folios sin lotes/datos.
create or replace function public.recoleccion_material_recibido(p_queja_id uuid, p_cantidad numeric default null, p_lote_rechazo text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
begin raise exception 'Función reemplazada: usa recoleccion_material_recibido(p_queja_id, p_lotes)'; end $$;
create or replace function public.recoleccion_sin_queja()
returns uuid language plpgsql security definer set search_path to 'public' as $$
begin raise exception 'Función reemplazada: usa recoleccion_sin_queja(p_codigo, p_lote, p_cantidad)'; end $$;

-- queja_dictamen: guarda comentarios_medidas (el resto de la función queda igual).
create or replace function public.queja_dictamen(p_id uuid, p_dictamen jsonb, p_aceptar boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_q public.quejas;
  v_dictamen_id uuid;
  v_tipo_accion text;
  v_descripcion text;
begin
  if not public.rol_en(array['calidad','admin']) then raise exception 'No autorizado'; end if;
  select * into v_q from public.quejas where id = p_id and estado = 'dictamen_pendiente' for update;
  if not found then raise exception 'Estado inválido para esta acción'; end if;

  v_tipo_accion := p_dictamen->>'tipo_accion';
  v_descripcion := p_dictamen->>'descripcion_problema';
  if v_tipo_accion not in ('correctiva','preventiva') then
    raise exception 'tipo_accion inválido';
  end if;
  if coalesce(trim(v_descripcion), '') = '' then
    raise exception 'La descripción del problema es obligatoria';
  end if;

  insert into public.dictamenes(
    queja_id, tipo_accion, cantidad, desviacion_reportada,
    descripcion_problema, identificacion_causa_raiz, comentarios_medidas, conclusion,
    recibido_por, aceptado, creado_por
  ) values (
    p_id, v_tipo_accion,
    nullif(trim(p_dictamen->>'cantidad'), ''),
    nullif(trim(p_dictamen->>'desviacion_reportada'), ''),
    v_descripcion,
    nullif(trim(p_dictamen->>'identificacion_causa_raiz'), ''),
    nullif(trim(p_dictamen->>'comentarios_medidas'), ''),
    nullif(trim(p_dictamen->>'conclusion'), ''),
    nullif(trim(p_dictamen->>'recibido_por'), ''),
    p_aceptar,
    auth.uid()
  )
  returning id into v_dictamen_id;

  insert into public.dictamen_equipo(dictamen_id, nombre, puesto, orden)
  select v_dictamen_id, trim(elem->>'nombre'), nullif(trim(elem->>'puesto'), ''), (ord - 1)::int
  from jsonb_array_elements(coalesce(p_dictamen->'equipo', '[]'::jsonb)) with ordinality as t(elem, ord)
  where coalesce(trim(elem->>'nombre'), '') <> '';

  insert into public.dictamen_medidas(dictamen_id, medida, responsable, fecha, orden)
  select v_dictamen_id, trim(elem->>'medida'), nullif(trim(elem->>'responsable'), ''),
         nullif(trim(elem->>'fecha'), '')::date, (ord - 1)::int
  from jsonb_array_elements(coalesce(p_dictamen->'medidas', '[]'::jsonb)) with ordinality as t(elem, ord)
  where coalesce(trim(elem->>'medida'), '') <> '';

  insert into public.tempos(queja_id, etiqueta, inicio, fin, texto, resultado, registrado_por)
    values (p_id, 'Dictamen', v_q.tempo_activo_desde, now(),
            coalesce(nullif(trim(p_dictamen->>'conclusion'), ''), v_descripcion),
            case when p_aceptar then 'aceptado' else 'rechazado' end, auth.uid());

  if p_aceptar then
    update public.quejas set estado = 'espera_recoleccion', tempo_activo_desde = now(), tempo_label_activo = 'Espera de recolección'
      where id = p_id;
    insert into public.correos_enviados(queja_id, evento, destinatarios, mensaje)
      values (p_id, 'en_espera_recoleccion', array['Calidad','CEDIS','Comercial','Josué','Fili'], 'En espera de recolección');
  else
    update public.quejas set estado = 'rechazada_dictamen', tempo_activo_desde = null, tempo_label_activo = null
      where id = p_id;
  end if;
end $$;
