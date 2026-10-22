-- ============================================================
-- ZX · Procesos / Quejas-Clientes — esquema completo (baseline)
-- Refleja el estado real del proyecto de Supabase al día de hoy,
-- generado por introspección directa de la base de datos viva
-- (zxtlnciowqcwhbfbkokv), no reconstruido de memoria.
--
-- Esta es la primera versión que se sube a control de versiones;
-- por eso viene consolidada en un solo archivo en vez de repetir
-- paso a paso las migraciones intermedias que ya se aplicaron.
--
-- NO incluye la creación de los 3 usuarios reales (Comercial,
-- Calidad, CEDIS) a propósito: eso son credenciales y no debe
-- vivir en el repositorio. Se crean una sola vez desde el
-- Dashboard de Supabase (Authentication → Users) o con un script
-- separado que NO se sube a GitHub.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Catálogo de estados (editable sin migraciones) ----------
create table public.catalogo_estados (
  clave    text primary key,
  etiqueta text not null,
  orden    int  not null
);

insert into public.catalogo_estados (clave, etiqueta, orden) values
  ('nueva',              'Nueva',                          1),
  ('rechazada_calidad',  'Rechazada por Calidad',          2),
  ('esperando_muestra',  'Esperando muestra',              3),
  ('dictamen_pendiente', 'Dictamen en proceso',            4),
  ('rechazada_dictamen', 'Dictamen rechazado',             5),
  ('espera_recoleccion', 'Espera de recolección',          6),
  ('folio_generado',     'Folio generado (falta enviar)',  7),
  ('enviado_planta',     'Enviado a planta',               8),
  ('revision_pendiente', 'Revisión en proceso',            9),
  ('rechazada_revision', 'Revisión rechazada',            10),
  ('nc_creada',          'NC creada',                     11),
  ('rechazada_nc',       'NC rechazada',                  12),
  ('cerrada',            'Cerrada',                       13);

-- ---------- Catálogo real de "Tipo de queja" (formato oficial VEN-F-03) ----------
create table public.catalogo_tipos_queja (
  clave    text primary key,
  etiqueta text not null,
  orden    int  not null
);

insert into public.catalogo_tipos_queja (clave, etiqueta, orden) values
  ('Cobranza',               'Cobranza',               1),
  ('Facturación',            'Facturación',            2),
  ('Logística',              'Logística',              3),
  ('Producto',               'Producto',               4),
  ('Servicio',               'Servicio',               5),
  ('Ventas',                 'Ventas',                 6),
  ('Producción',             'Producción',             7),
  ('Otro',                   'Otro',                   8),
  ('Certificado de Calidad', 'Certificado de Calidad', 9);

-- ---------- Perfiles (extiende auth.users de Supabase) ----------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  rol             text check (rol in ('comercial','calidad','cedis','admin')),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

comment on column public.profiles.rol is 'Null = cuenta creada pero sin rol asignado todavía (pendiente que un admin lo asigne)';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre_completo, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    nullif(new.raw_user_meta_data->>'rol', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Rol del usuario autenticado actual (null si no tiene perfil activo).
-- security invoker: corre con los permisos de quien llama, no necesita
-- ser definer porque solo lee su propio renglón de profiles.
create or replace function public.mi_rol()
returns text
language sql
stable
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid() and activo = true;
$$;

revoke execute on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated;

-- ---------- Quejas (formato VEN-F-03) ----------
create sequence public.quejas_folio_seq start 1;

create table public.quejas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text unique,
  tipo_queja          text references public.catalogo_tipos_queja(clave),
  cliente             text not null,
  producto            text,
  codigo              text,
  pedido              text,
  factura             text,
  lote                text,
  prioridad           smallint check (prioridad between 1 and 5),
  d2_quien            text,
  d2_que              text,
  d2_porque           text,
  d2_cuando           date,
  d2_donde            text,
  d2_cuanto           text,
  estado              text not null default 'nueva' references public.catalogo_estados(clave),
  tempo_activo_desde  timestamptz,
  tempo_label_activo  text,
  creada_por          uuid references public.profiles(id),
  creada_en           timestamptz not null default now()
);

create or replace function public.asignar_folio_queja()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.folio is null then
    new.folio := 'Q-' || lpad(nextval('public.quejas_folio_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_asignar_folio_queja
before insert on public.quejas
for each row execute function public.asignar_folio_queja();

-- El cliente nunca manda estado/creada_por/tempo_* al crear una queja:
-- el servidor los fija siempre, sin importar lo que llegue del formulario.
create or replace function public.inicializar_queja()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.estado := 'nueva';
  new.creada_por := auth.uid();
  new.tempo_activo_desde := now();
  new.tempo_label_activo := 'Esperando revisión de Calidad';
  return new;
end;
$$;

create trigger trg_inicializar_queja
before insert on public.quejas
for each row execute function public.inicializar_queja();

-- Avisa a Calidad automáticamente al crearse la queja.
create or replace function public.avisar_queja_nueva()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.correos_enviados (queja_id, evento, destinatarios, mensaje)
  values (new.id, 'queja_nueva', array['Calidad'], 'Nueva queja registrada (Folio ' || new.folio || ')');
  return new;
end;
$$;

create trigger trg_avisar_queja_nueva
after insert on public.quejas
for each row execute function public.avisar_queja_nueva();

create index idx_quejas_estado on public.quejas(estado);
create index idx_quejas_creada_por on public.quejas(creada_por);
create index idx_quejas_tipo_queja on public.quejas(tipo_queja);

-- ---------- Tempos (bitácora de tiempos por etapa — para análisis) ----------
create table public.tempos (
  id              uuid primary key default gen_random_uuid(),
  queja_id        uuid not null references public.quejas(id) on delete cascade,
  etiqueta        text not null,
  inicio          timestamptz not null,
  fin             timestamptz not null,
  duracion_ms     bigint generated always as (round(extract(epoch from (fin - inicio)) * 1000)::bigint) stored,
  texto           text,
  resultado       text check (resultado in ('aceptado','rechazado')),
  registrado_por  uuid references public.profiles(id),
  creado_en       timestamptz not null default now()
);

create index idx_tempos_queja on public.tempos(queja_id);
create index idx_tempos_etiqueta on public.tempos(etiqueta);
create index idx_tempos_registrado_por on public.tempos(registrado_por);

-- ---------- Recolecciones (folios de CEDIS, con o sin queja asociada) ----------
create sequence public.recolecciones_folio_seq start 1;

create table public.recolecciones (
  id            uuid primary key default gen_random_uuid(),
  queja_id      uuid references public.quejas(id) on delete set null,
  folio         text unique,
  generado_en   timestamptz not null default now(),
  generado_por  uuid references public.profiles(id),
  enviado_en    timestamptz,
  enviado_por   uuid references public.profiles(id)
);

create or replace function public.asignar_folio_recoleccion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.folio is null then
    new.folio := 'F-' || lpad(nextval('public.recolecciones_folio_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger trg_asignar_folio_recoleccion
before insert on public.recolecciones
for each row execute function public.asignar_folio_recoleccion();

create index idx_recolecciones_queja on public.recolecciones(queja_id);
create index idx_recolecciones_generado_por on public.recolecciones(generado_por);
create index idx_recolecciones_enviado_por on public.recolecciones(enviado_por);

-- ---------- Contactos de notificación (para correos reales más adelante) ----------
create table public.contactos_notificacion (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  correo  text unique,
  area    text,
  activo  boolean not null default true
);

comment on table public.contactos_notificacion is 'Personas/listas que reciben avisos (ej. Josué, Fili, Alex Ruiz, Axzel) — llenar con correos reales antes de activar el envío real.';

-- ---------- Correos enviados (log; simulado por ahora, real más adelante vía Outlook/M365) ----------
create table public.correos_enviados (
  id              uuid primary key default gen_random_uuid(),
  queja_id        uuid references public.quejas(id) on delete cascade,
  evento          text not null,
  destinatarios   text[] not null default '{}',
  mensaje         text not null,
  estado_envio    text not null default 'simulado' check (estado_envio in ('simulado','enviado','error')),
  proveedor       text,
  enviado_en      timestamptz not null default now()
);

create index idx_correos_queja on public.correos_enviados(queja_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.catalogo_estados enable row level security;
alter table public.catalogo_tipos_queja enable row level security;
alter table public.quejas enable row level security;
alter table public.tempos enable row level security;
alter table public.recolecciones enable row level security;
alter table public.contactos_notificacion enable row level security;
alter table public.correos_enviados enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_propio_o_admin" on public.profiles
  for update to authenticated using (id = (select auth.uid()) or public.mi_rol() = 'admin');

create policy "catalogo_select" on public.catalogo_estados
  for select to authenticated using (true);
create policy "catalogo_admin_insert" on public.catalogo_estados
  for insert to authenticated with check (public.mi_rol() = 'admin');
create policy "catalogo_admin_update" on public.catalogo_estados
  for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');
create policy "catalogo_admin_delete" on public.catalogo_estados
  for delete to authenticated using (public.mi_rol() = 'admin');

create policy "tipos_queja_select" on public.catalogo_tipos_queja
  for select to authenticated using (true);
create policy "tipos_queja_admin_insert" on public.catalogo_tipos_queja
  for insert to authenticated with check (public.mi_rol() = 'admin');
create policy "tipos_queja_admin_update" on public.catalogo_tipos_queja
  for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');
create policy "tipos_queja_admin_delete" on public.catalogo_tipos_queja
  for delete to authenticated using (public.mi_rol() = 'admin');

create policy "quejas_select" on public.quejas
  for select to authenticated using (public.mi_rol() is not null);
create policy "quejas_insert_comercial" on public.quejas
  for insert to authenticated with check (public.mi_rol() in ('comercial','admin'));
-- No hay política de UPDATE directo: toda transición de estatus pasa por los RPCs de abajo.

create policy "tempos_select" on public.tempos
  for select to authenticated using (public.mi_rol() is not null);
-- No hay política de INSERT directo: los RPCs (security definer) son los únicos que escriben aquí.

create policy "recolecciones_select" on public.recolecciones
  for select to authenticated using (public.mi_rol() is not null);
-- No hay política de INSERT/UPDATE directo: los RPCs son el único camino de escritura.

create policy "contactos_select" on public.contactos_notificacion
  for select to authenticated using (public.mi_rol() is not null);
create policy "contactos_admin_insert" on public.contactos_notificacion
  for insert to authenticated with check (public.mi_rol() = 'admin');
create policy "contactos_admin_update" on public.contactos_notificacion
  for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');
create policy "contactos_admin_delete" on public.contactos_notificacion
  for delete to authenticated using (public.mi_rol() = 'admin');

create policy "correos_select" on public.correos_enviados
  for select to authenticated using (public.mi_rol() is not null);
create policy "correos_insert_autenticados" on public.correos_enviados
  for insert to authenticated with check (public.mi_rol() is not null);

-- ============================================================
-- RPCs de transición de estatus — únicos autorizados a mover el
-- flujo después de creada la queja. Cada uno valida el rol y el
-- estado actual antes de tocar nada. Importante: la comprobación
-- de rol usa coalesce(public.mi_rol(), '') y no public.mi_rol()
-- a secas, porque en PL/pgSQL "if NULL then ..." nunca se dispara
-- (NULL se trata como falso) — sin el coalesce, un usuario sin rol
-- asignado se saltaría la validación en vez de recibir el error.
-- ============================================================

create or replace function public.queja_aceptar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.mi_rol(), '') not in ('calidad','admin') then raise exception 'No autorizado'; end if;
  update public.quejas set estado = 'esperando_muestra' where id = p_id and estado = 'nueva';
  if not found then raise exception 'La queja no está en estado "nueva"'; end if;
end $$;

create or replace function public.queja_rechazar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.mi_rol(), '') not in ('calidad','admin') then raise exception 'No autorizado'; end if;
  update public.quejas set estado = 'rechazada_calidad', tempo_activo_desde = null, tempo_label_activo = null
    where id = p_id and estado = 'nueva';
  if not found then raise exception 'La queja no está en estado "nueva"'; end if;
end $$;

create or replace function public.queja_muestra_recibida(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_q public.quejas;
begin
  if coalesce(public.mi_rol(), '') not in ('calidad','admin') then raise exception 'No autorizado'; end if;
  select * into v_q from public.quejas where id = p_id and estado = 'esperando_muestra' for update;
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.tempos(queja_id, etiqueta, inicio, fin, registrado_por)
    values (p_id, 'Espera de muestra', v_q.tempo_activo_desde, now(), auth.uid());
  update public.quejas set estado = 'dictamen_pendiente', tempo_activo_desde = now(), tempo_label_activo = 'Dictamen en proceso'
    where id = p_id;
end $$;

create or replace function public.queja_dictamen(p_id uuid, p_texto text, p_aceptar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_q public.quejas;
begin
  if coalesce(public.mi_rol(), '') not in ('calidad','admin') then raise exception 'No autorizado'; end if;
  select * into v_q from public.quejas where id = p_id and estado = 'dictamen_pendiente' for update;
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.tempos(queja_id, etiqueta, inicio, fin, texto, resultado, registrado_por)
    values (p_id, 'Dictamen', v_q.tempo_activo_desde, now(), p_texto,
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

create or replace function public.recoleccion_material_recibido(p_queja_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(public.mi_rol(), '') not in ('cedis','admin') then raise exception 'No autorizado'; end if;
  update public.quejas set estado = 'folio_generado' where id = p_queja_id and estado = 'espera_recoleccion';
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.recolecciones(queja_id, generado_por) values (p_queja_id, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.recoleccion_sin_queja()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(public.mi_rol(), '') not in ('cedis','admin') then raise exception 'No autorizado'; end if;
  insert into public.recolecciones(queja_id, generado_por) values (null, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.recoleccion_enviar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_r public.recolecciones; v_inicio timestamptz;
begin
  if coalesce(public.mi_rol(), '') not in ('cedis','admin') then raise exception 'No autorizado'; end if;
  select * into v_r from public.recolecciones where id = p_id and enviado_en is null for update;
  if not found then raise exception 'Folio inválido o ya enviado'; end if;
  update public.recolecciones set enviado_en = now(), enviado_por = auth.uid() where id = p_id;
  if v_r.queja_id is not null then
    select tempo_activo_desde into v_inicio from public.quejas where id = v_r.queja_id;
    insert into public.tempos(queja_id, etiqueta, inicio, fin, registrado_por)
      values (v_r.queja_id, 'Recolección', coalesce(v_inicio, now()), now(), auth.uid());
    update public.quejas set estado = 'enviado_planta', tempo_activo_desde = now(), tempo_label_activo = 'Enviado a planta'
      where id = v_r.queja_id;
    insert into public.correos_enviados(queja_id, evento, destinatarios, mensaje)
      values (v_r.queja_id, 'material_enviado_planta', array['Calidad','Almacén','Comercial','Alex Ruiz','Axzel'], 'Material enviado a planta');
  end if;
end $$;

create or replace function public.queja_material_recibido_calidad(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_q public.quejas;
begin
  if coalesce(public.mi_rol(), '') not in ('calidad','admin') then raise exception 'No autorizado'; end if;
  select * into v_q from public.quejas where id = p_id and estado = 'enviado_planta' for update;
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.tempos(queja_id, etiqueta, inicio, fin, registrado_por)
    values (p_id, 'Material en planta', v_q.tempo_activo_desde, now(), auth.uid());
  update public.quejas set estado = 'revision_pendiente', tempo_activo_desde = now(), tempo_label_activo = 'Revisión en proceso'
    where id = p_id;
end $$;

create or replace function public.queja_revision(p_id uuid, p_texto text, p_aceptar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_q public.quejas;
begin
  if coalesce(public.mi_rol(), '') not in ('calidad','admin') then raise exception 'No autorizado'; end if;
  select * into v_q from public.quejas where id = p_id and estado = 'revision_pendiente' for update;
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.tempos(queja_id, etiqueta, inicio, fin, texto, resultado, registrado_por)
    values (p_id, 'Revisión', v_q.tempo_activo_desde, now(), p_texto,
            case when p_aceptar then 'aceptado' else 'rechazado' end, auth.uid());
  if p_aceptar then
    update public.quejas set estado = 'nc_creada', tempo_activo_desde = now(), tempo_label_activo = 'En espera de nota de crédito'
      where id = p_id;
    insert into public.correos_enviados(queja_id, evento, destinatarios, mensaje)
      values (p_id, 'nc_creada', array['Comercial'], 'NC creada');
  else
    update public.quejas set estado = 'rechazada_revision', tempo_activo_desde = null, tempo_label_activo = null
      where id = p_id;
  end if;
end $$;

create or replace function public.queja_nc_decidir(p_id uuid, p_aceptar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_q public.quejas;
begin
  if coalesce(public.mi_rol(), '') not in ('cedis','admin') then raise exception 'No autorizado'; end if;
  select * into v_q from public.quejas where id = p_id and estado = 'nc_creada' for update;
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.tempos(queja_id, etiqueta, inicio, fin, resultado, registrado_por)
    values (p_id, 'Nota de crédito', v_q.tempo_activo_desde, now(),
            case when p_aceptar then 'aceptado' else 'rechazado' end, auth.uid());
  if p_aceptar then
    update public.quejas set estado = 'cerrada', tempo_activo_desde = null, tempo_label_activo = null where id = p_id;
    insert into public.correos_enviados(queja_id, evento, destinatarios, mensaje)
      values (p_id, 'folio_cerrado', array['Comercial'], 'Folio cerrado');
  else
    update public.quejas set estado = 'rechazada_nc', tempo_activo_desde = null, tempo_label_activo = null where id = p_id;
  end if;
end $$;

-- Solo "authenticated" puede invocarlas (y cada una revisa el rol exacto por dentro).
-- Revocar de "public" no basta en Supabase: por default también se otorga a
-- anon/authenticated, así que se revoca de anon de forma explícita.
revoke execute on function public.queja_aceptar(uuid) from public, anon;
revoke execute on function public.queja_rechazar(uuid) from public, anon;
revoke execute on function public.queja_muestra_recibida(uuid) from public, anon;
revoke execute on function public.queja_dictamen(uuid, text, boolean) from public, anon;
revoke execute on function public.recoleccion_material_recibido(uuid) from public, anon;
revoke execute on function public.recoleccion_sin_queja() from public, anon;
revoke execute on function public.recoleccion_enviar(uuid) from public, anon;
revoke execute on function public.queja_material_recibido_calidad(uuid) from public, anon;
revoke execute on function public.queja_revision(uuid, text, boolean) from public, anon;
revoke execute on function public.queja_nc_decidir(uuid, boolean) from public, anon;

grant execute on function public.queja_aceptar(uuid) to authenticated;
grant execute on function public.queja_rechazar(uuid) to authenticated;
grant execute on function public.queja_muestra_recibida(uuid) to authenticated;
grant execute on function public.queja_dictamen(uuid, text, boolean) to authenticated;
grant execute on function public.recoleccion_material_recibido(uuid) to authenticated;
grant execute on function public.recoleccion_sin_queja() to authenticated;
grant execute on function public.recoleccion_enviar(uuid) to authenticated;
grant execute on function public.queja_material_recibido_calidad(uuid) to authenticated;
grant execute on function public.queja_revision(uuid, text, boolean) to authenticated;
grant execute on function public.queja_nc_decidir(uuid, boolean) to authenticated;

-- ============================================================
-- Realtime — para que las pantallas de Calidad/CEDIS se
-- actualicen solas cuando algo cambia en otra sesión/pestaña.
-- ============================================================
alter publication supabase_realtime add table public.quejas;
alter publication supabase_realtime add table public.recolecciones;
alter publication supabase_realtime add table public.correos_enviados;
