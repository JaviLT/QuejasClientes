-- Ronda 11 (22 de octubre de 2026): roles configurables con pantallas permitidas. Registro de lo aplicado.
-- Un rol = qué PANTALLAS ve. Las acciones que cambian el proceso siguen atadas a comercial/calidad/cedis/admin en los RPCs.
create table if not exists public.roles (
  clave text primary key check (clave ~ '^[a-z][a-z0-9_]{1,29}$'),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 40),
  pantallas text[] not null default '{}'
    check (pantallas <@ array['comercial','calidad','cedis','tiempos','quejas_cerradas']::text[]),
  es_sistema boolean not null default false,
  creado_en timestamptz not null default now()
);
create unique index if not exists roles_nombre_unico on public.roles (lower(btrim(nombre)));

insert into public.roles (clave, nombre, pantallas, es_sistema) values
  ('comercial', 'Comercial', array['comercial','quejas_cerradas'], true),
  ('calidad',   'Calidad',   array['calidad','quejas_cerradas'],   true),
  ('cedis',     'CEDIS',     array['cedis','quejas_cerradas'],     true),
  ('admin',     'Administrador', array['tiempos','quejas_cerradas'], true)
on conflict (clave) do nothing;

alter table public.roles enable row level security;
revoke all on public.roles from anon, public;
grant select, insert, update, delete on public.roles to authenticated;
create policy roles_select on public.roles for select to authenticated using (public.mi_rol() is not null);
create policy roles_admin_insert on public.roles for insert to authenticated with check (public.mi_rol() = 'admin' and es_sistema = false);
create policy roles_admin_update on public.roles for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');
create policy roles_admin_delete on public.roles for delete to authenticated using (public.mi_rol() = 'admin');

create or replace function public.proteger_roles()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if tg_op = 'DELETE' then
    if old.es_sistema then raise exception 'Los roles del sistema no se pueden borrar'; end if;
    return old;
  end if;
  if old.es_sistema then
    if old.clave = 'admin' then raise exception 'El rol Administrador no se puede modificar'; end if;
    if new.clave is distinct from old.clave or new.nombre is distinct from old.nombre or new.es_sistema is distinct from old.es_sistema then
      raise exception 'En un rol del sistema solo se pueden cambiar sus pantallas';
    end if;
  else
    if new.clave is distinct from old.clave or new.es_sistema is distinct from old.es_sistema then
      raise exception 'No se puede cambiar la clave de un rol';
    end if;
  end if;
  return new;
end; $function$;
revoke execute on function public.proteger_roles() from public, anon, authenticated;
create trigger trg_proteger_roles before update or delete on public.roles for each row execute function public.proteger_roles();

-- El rol de cada perfil (y de cada alta previa) ahora se valida contra la tabla roles, no contra una lista fija.
alter table public.profiles drop constraint profiles_rol_check;
alter table public.correos_autorizados drop constraint correos_autorizados_rol_check;
alter table public.profiles add constraint profiles_rol_fkey foreign key (rol) references public.roles(clave) on update cascade on delete restrict;
alter table public.correos_autorizados add constraint correos_autorizados_rol_fkey foreign key (rol) references public.roles(clave) on update cascade on delete cascade;
