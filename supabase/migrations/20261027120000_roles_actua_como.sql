-- Ronda 13 (v1.12.0) · Roles con "Puede ejecutar acciones como" (comercial / calidad / cedis).
-- Registro de lo ya aplicado en Supabase (migraciones roles_actua_como_acciones y roles_actua_como_politicas).
-- Sirve para el rol "todo": hacer el flujo completo sin cambiar de usuario. Eliminar quejas y gestionar usuarios/roles siguen solo Admin.

alter table public.roles
  add column if not exists actua_como text[] not null default '{}'
  check (actua_como <@ array['comercial','calidad','cedis']::text[]);

-- ¿El usuario actual es de uno de esos roles, o su rol "actúa como" alguno?
create or replace function public.rol_en(p_roles text[])
returns boolean language sql stable set search_path to 'public' as $$
  select coalesce(public.mi_rol(), '') = any(p_roles)
      or exists (select 1 from public.roles r where r.clave = public.mi_rol() and r.actua_como && p_roles);
$$;
revoke execute on function public.rol_en(text[]) from public, anon;
grant execute on function public.rol_en(text[]) to authenticated;

-- Los roles del sistema no pueden cambiar actua_como.
create or replace function public.proteger_roles() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    if old.es_sistema then raise exception 'Los roles del sistema no se pueden borrar'; end if;
    return old;
  end if;
  if old.es_sistema then
    if old.clave = 'admin' then raise exception 'El rol Administrador no se puede modificar'; end if;
    if new.clave is distinct from old.clave or new.nombre is distinct from old.nombre
       or new.es_sistema is distinct from old.es_sistema or new.actua_como is distinct from old.actua_como then
      raise exception 'En un rol del sistema solo se pueden cambiar sus pantallas';
    end if;
  else
    if new.clave is distinct from old.clave or new.es_sistema is distinct from old.es_sistema then
      raise exception 'No se puede cambiar la clave de un rol';
    end if;
  end if;
  return new;
end; $$;

-- RPCs: se reemplazó, dentro de cada función, la validación
--   coalesce(public.mi_rol(),'') not in ('X','admin')   →   not public.rol_en(array['X','admin'])
-- Calidad + admin: queja_aceptar, queja_dictamen, queja_material_recibido_calidad, queja_muestra_recibida, queja_rechazar, queja_revision
-- CEDIS + admin:   queja_nc_decidir, recoleccion_enviar, recoleccion_material_recibido, recoleccion_sin_queja
-- queja_eliminar NO cambia (solo admin).

-- Políticas:
alter policy quejas_insert_comercial on public.quejas with check (public.rol_en(array['comercial','admin']));
-- (adjuntos_insert en public.adjuntos y adjuntos_storage_insert en storage.objects: rol_en(array['comercial','calidad','admin']))

-- Rol de pruebas "todo" creado desde la pantalla Roles:
update public.roles set actua_como = array['comercial','calidad','cedis'] where clave = 'todo' and not es_sistema;
