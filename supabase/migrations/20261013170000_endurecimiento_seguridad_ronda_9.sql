-- Ronda 9 (13 de octubre de 2026): auditoría de seguridad. Se aplicó en producción en varios pasos
-- (la herramienta de despliegue se atoraba con instrucciones DROP, por eso se usó ALTER POLICY).
-- Este archivo deja constancia del conjunto completo, para repetirlo en otro ambiente.

-- 1) CRÍTICO — el rol de un usuario nuevo solo puede venir de app_metadata (que únicamente escribe la API de
--    administración con service_role), nunca de raw_user_meta_data (que cualquiera manda al auto-registrarse:
--    antes, signUp con data:{rol:'admin'} creaba un administrador).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.profiles (id, nombre_completo, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre_completo', new.email), nullif(new.raw_app_meta_data->>'rol', ''))
  on conflict (id) do nothing;
  return new;
end;
$function$;
-- (la Edge Function admin-crear-usuario v2 manda ahora { app_metadata: { rol } })

-- 2) CRÍTICO — nadie salvo un admin activo puede cambiar rol / activo / usuario / id de un perfil
--    (antes cualquier usuario con sesión podía hacerse admin editando su propia fila de profiles).
--    auth.uid() es null cuando escribe service_role / el panel de Supabase, y eso se permite.
create or replace function public.proteger_campos_profiles()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if auth.uid() is not null and coalesce(public.mi_rol(), '') <> 'admin' then
    if new.rol is distinct from old.rol or new.activo is distinct from old.activo
       or new.usuario is distinct from old.usuario or new.id is distinct from old.id then
      raise exception 'No autorizado para cambiar rol, estado o usuario';
    end if;
  end if;
  return new;
end;
$function$;
create trigger trg_proteger_campos_profiles before update on public.profiles
  for each row execute function public.proteger_campos_profiles();

-- 3) Perfiles: alguien sin rol asignado solo ve su propia fila (no la lista de todo el personal).
--    La función auxiliar es SECURITY DEFINER para no recursar sobre la propia política.
create or replace function public.tiene_rol_activo()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and activo = true and rol is not null);
$function$;
revoke all on function public.tiene_rol_activo() from public, anon;
grant execute on function public.tiene_rol_activo() to authenticated;
alter policy profiles_select on public.profiles using (id = (select auth.uid()) or public.tiene_rol_activo());

-- 4) La bitácora/cola de correos solo la escriben funciones del servidor: se cierra el INSERT directo para que
--    nadie fabrique filas (con destinatarios arbitrarios) que luego un envío real mandaría.
alter function public.avisar_queja_nueva() security definer;
alter policy correos_insert_autenticados on public.correos_enviados with check (false);

-- 5) Funciones de trigger: no deben poder llamarse por /rest/v1/rpc.
revoke all on function public.fijar_subido_por_adjunto() from public, anon, authenticated;
revoke all on function public.asignar_folio_queja() from public, anon, authenticated;
revoke all on function public.asignar_folio_recoleccion() from public, anon, authenticated;
revoke all on function public.avisar_queja_nueva() from public, anon, authenticated;
revoke all on function public.inicializar_queja() from public, anon, authenticated;
revoke all on function public.proteger_campos_profiles() from public, anon, authenticated;

-- 6) Defensa en profundidad: el rol anónimo no necesita tocar nada de public (el login pasa por Auth y las
--    consultas de la app siempre van con sesión).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 7) Con sesión tampoco hacen falta TRUNCATE / REFERENCES / TRIGGER sobre las tablas.
revoke truncate, references, trigger on all tables in schema public from authenticated;
