-- Ronda 10 (21 de octubre de 2026): login con Microsoft (Entra ID) vía proveedor "azure" de Supabase Auth.
-- Registro de lo aplicado en el proyecto (ya está en producción).

-- 1) Correo real de cada persona (las cuentas de prueba tienen correo interno @zx-procesos.local → queda null).
alter table public.profiles add column if not exists correo text;

-- 2) Perfil automático al primer ingreso: nombre desde Microsoft, SIN rol (lo asigna un admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, nombre_completo, rol, correo)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'nombre_completo', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      new.email
    ),
    nullif(new.raw_app_meta_data->>'rol', ''),
    case when new.email is null or new.email like '%@zx-procesos.local' then null else lower(new.email) end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- 3) Candado: "Allow new users to sign up" debe quedar ENCENDIDO para que Microsoft pueda crear cuentas,
--    así que se bloquea aquí el auto-registro por correo/teléfono. Solo pasa lo que traiga
--    app_metadata.creado_por_admin = true (lo pone la Edge Function admin-crear-usuario v3).
create or replace function public.bloquear_registro_por_correo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.raw_app_meta_data->>'provider', 'email') in ('email', 'phone')
     and coalesce(new.raw_app_meta_data->>'creado_por_admin', 'false') <> 'true' then
    raise exception 'El registro por correo está deshabilitado. Entra con tu cuenta de Microsoft.';
  end if;
  return new;
end;
$function$;

revoke execute on function public.bloquear_registro_por_correo() from public, anon, authenticated;

create trigger trg_bloquear_registro_por_correo
before insert on auth.users
for each row execute function public.bloquear_registro_por_correo();

-- 4) Protección de profiles: no-admin no cambia rol/activo/usuario/correo/id; un admin no puede cambiarse
--    a sí mismo el rol ni desactivarse (evita dejar el sistema sin administrador).
create or replace function public.proteger_campos_profiles()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null then
    if coalesce(public.mi_rol(), '') <> 'admin' then
      if new.rol is distinct from old.rol
         or new.activo is distinct from old.activo
         or new.usuario is distinct from old.usuario
         or new.correo is distinct from old.correo
         or new.id is distinct from old.id then
        raise exception 'No autorizado para cambiar rol, estado, usuario o correo';
      end if;
    elsif old.id = auth.uid() and (new.rol is distinct from old.rol or new.activo is distinct from old.activo) then
      raise exception 'No puedes cambiar tu propio rol ni desactivar tu propia cuenta';
    end if;
  end if;
  return new;
end;
$function$;
