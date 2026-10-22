-- Tabla principal del dictamen (formato oficial VEN-F-08)
create table public.dictamenes (
  id uuid primary key default gen_random_uuid(),
  queja_id uuid not null unique references public.quejas(id),
  tipo_accion text not null check (tipo_accion in ('correctiva','preventiva')),
  cantidad text,
  desviacion_reportada text,
  descripcion_problema text not null,
  identificacion_causa_raiz text,
  conclusion text,
  fecha_emision date not null default current_date,
  recibido_por text,
  aceptado boolean not null,
  creado_por uuid references public.profiles(id),
  creado_en timestamptz not null default now()
);

-- Equipo multidisciplinario (repetible)
create table public.dictamen_equipo (
  id uuid primary key default gen_random_uuid(),
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,
  nombre text not null,
  puesto text,
  orden int not null default 0
);

-- Medidas de contención y preventivas (repetible)
create table public.dictamen_medidas (
  id uuid primary key default gen_random_uuid(),
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,
  medida text not null,
  responsable text,
  fecha date,
  orden int not null default 0
);

alter table public.dictamenes enable row level security;
alter table public.dictamen_equipo enable row level security;
alter table public.dictamen_medidas enable row level security;

-- Lectura: mismo criterio que el resto del esquema (cualquier usuario autenticado con perfil/rol activo)
create policy dictamenes_select on public.dictamenes for select using (mi_rol() is not null);
create policy dictamen_equipo_select on public.dictamen_equipo for select using (mi_rol() is not null);
create policy dictamen_medidas_select on public.dictamen_medidas for select using (mi_rol() is not null);
-- Sin políticas de escritura para el cliente: todo pasa por el RPC queja_dictamen (security definer).

-- Reemplaza la firma anterior (p_texto text) por una estructurada (p_dictamen jsonb)
drop function if exists public.queja_dictamen(uuid, text, boolean);

create function public.queja_dictamen(p_id uuid, p_dictamen jsonb, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_q public.quejas;
  v_dictamen_id uuid;
  v_tipo_accion text;
  v_descripcion text;
begin
  if coalesce(public.mi_rol(), '') not in ('calidad','admin') then raise exception 'No autorizado'; end if;
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
    descripcion_problema, identificacion_causa_raiz, conclusion,
    recibido_por, aceptado, creado_por
  ) values (
    p_id, v_tipo_accion,
    nullif(trim(p_dictamen->>'cantidad'), ''),
    nullif(trim(p_dictamen->>'desviacion_reportada'), ''),
    v_descripcion,
    nullif(trim(p_dictamen->>'identificacion_causa_raiz'), ''),
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
end $function$;

revoke all on function public.queja_dictamen(uuid, jsonb, boolean) from public, anon;
grant execute on function public.queja_dictamen(uuid, jsonb, boolean) to authenticated;
