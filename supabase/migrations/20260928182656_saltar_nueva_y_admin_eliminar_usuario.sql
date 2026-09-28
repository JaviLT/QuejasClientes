-- 1) Las quejas ya no pasan por "nueva": Comercial las manda directo a Calidad como "esperando_muestra".
create or replace function public.inicializar_queja()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.estado := 'esperando_muestra';
  new.creada_por := auth.uid();
  new.tempo_activo_desde := now();
  new.tempo_label_activo := 'Esperando muestra';
  return new;
end;
$function$;

-- 2) Columna para mostrar el usuario (palabra de login) en la pantalla de administración de usuarios.
alter table public.profiles add column usuario text unique;
update public.profiles set usuario = 'COMERCIAL' where rol = 'comercial' and usuario is null;
update public.profiles set usuario = 'CALIDAD' where rol = 'calidad' and usuario is null;
update public.profiles set usuario = 'CEDIS' where rol = 'cedis' and usuario is null;
update public.profiles set usuario = 'ADMIN' where rol = 'admin' and usuario is null;

-- 3) Eliminar una queja por completo (solo admin) — pantalla nueva "Eliminar quejas".
create function public.queja_eliminar(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.mi_rol(), '') <> 'admin' then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.quejas where id = p_id) then
    raise exception 'La queja no existe';
  end if;

  delete from public.dictamenes where queja_id = p_id; -- cascada a dictamen_equipo/dictamen_medidas
  delete from public.tempos where queja_id = p_id;
  delete from public.correos_enviados where queja_id = p_id;
  update public.recolecciones set queja_id = null where queja_id = p_id; -- conserva el folio, solo se desliga
  delete from public.quejas where id = p_id;
end;
$function$;

revoke all on function public.queja_eliminar(uuid) from public, anon;
grant execute on function public.queja_eliminar(uuid) to authenticated;
