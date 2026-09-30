-- Calidad ahora también puede adjuntar archivos (evidencia del dictamen), no solo Comercial/Admin.
drop policy if exists adjuntos_storage_insert on storage.objects;
create policy adjuntos_storage_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'adjuntos-quejas'
    and coalesce(mi_rol(), '') in ('comercial', 'calidad', 'admin')
  );

drop policy if exists adjuntos_insert on public.queja_adjuntos;
create policy adjuntos_insert
  on public.queja_adjuntos
  for insert
  with check (coalesce(mi_rol(), '') in ('comercial', 'calidad', 'admin'));
