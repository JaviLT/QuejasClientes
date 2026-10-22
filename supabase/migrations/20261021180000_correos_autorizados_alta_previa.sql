-- Alta previa por correo: el admin deja listo el rol de una persona ANTES de que entre con Microsoft.
-- Al primer ingreso, handle_new_user toma rol (y nombre, si se capturó) de esta tabla; si el correo no está, la persona queda sin rol.
create table if not exists public.correos_autorizados (
  correo text primary key check (correo = lower(correo)),
  rol text not null check (rol in ('comercial','calidad','cedis','admin')),
  nombre_completo text,
  creado_en timestamptz not null default now(),
  usado_en timestamptz
);
alter table public.correos_autorizados enable row level security;
create policy correos_autorizados_admin on public.correos_autorizados
  for all to authenticated
  using (public.mi_rol() = 'admin')
  with check (public.mi_rol() = 'admin');
revoke all on public.correos_autorizados from anon, public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auth public.correos_autorizados%rowtype;
  v_correo text := case when new.email is null or new.email like '%@zx-procesos.local' then null else lower(new.email) end;
begin
  if v_correo is not null then
    select * into v_auth from public.correos_autorizados where correo = v_correo;
  end if;
  insert into public.profiles (id, nombre_completo, rol, correo)
  values (
    new.id,
    coalesce(
      nullif(v_auth.nombre_completo, ''),
      nullif(new.raw_user_meta_data->>'nombre_completo', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      new.email
    ),
    coalesce(v_auth.rol, nullif(new.raw_app_meta_data->>'rol', '')),
    v_correo
  )
  on conflict (id) do nothing;
  if v_auth.correo is not null then
    update public.correos_autorizados set usado_en = now() where correo = v_auth.correo;
  end if;
  return new;
end;
$function$;
-- Datos cargados el 21 de octubre de 2026: auxcedis@zubex.com.mx (cedis), a.patino@zubex.com.mx (comercial), a.valadez@zubex.com.mx (calidad).
