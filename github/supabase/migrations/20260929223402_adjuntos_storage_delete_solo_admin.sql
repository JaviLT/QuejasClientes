-- Permite borrar los archivos del bucket cuando Admin elimina una queja (evita dejar archivos
-- huérfanos ocupando el cupo de Storage tras un queja_eliminar()).
create policy "adjuntos_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'adjuntos-quejas' and coalesce(mi_rol(), '') = 'admin');
