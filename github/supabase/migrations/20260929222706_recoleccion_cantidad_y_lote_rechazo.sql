-- Ronda 5: CEDIS captura cantidad y lote de rechazo al marcar "Material recibido".
alter table public.recolecciones
  add column if not exists cantidad numeric,
  add column if not exists lote_rechazo text;

comment on column public.recolecciones.cantidad is 'Cantidad del material/queja recibido en CEDIS (capturada al generar el folio desde "Material recibido"). Puede ser NULL para folios generados con recoleccion_sin_queja().';
comment on column public.recolecciones.lote_rechazo is 'Lote de rechazo asociado al material recibido en CEDIS. Puede ser NULL para folios generados con recoleccion_sin_queja().';

create or replace function public.recoleccion_material_recibido(p_queja_id uuid, p_cantidad numeric default null, p_lote_rechazo text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if coalesce(public.mi_rol(), '') not in ('cedis','admin') then raise exception 'No autorizado'; end if;
  update public.quejas set estado = 'folio_generado' where id = p_queja_id and estado = 'espera_recoleccion';
  if not found then raise exception 'Estado inválido para esta acción'; end if;
  insert into public.recolecciones(queja_id, generado_por, cantidad, lote_rechazo)
    values (p_queja_id, auth.uid(), p_cantidad, p_lote_rechazo)
    returning id into v_id;
  return v_id;
end $function$;

revoke all on function public.recoleccion_material_recibido(uuid, numeric, text) from public;
revoke all on function public.recoleccion_material_recibido(uuid, numeric, text) from anon;
grant execute on function public.recoleccion_material_recibido(uuid, numeric, text) to authenticated;
