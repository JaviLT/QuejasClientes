-- Ronda 5: adjuntar archivos (PDF, fotos, video, cualquier tipo) a una queja desde Comercial.
-- Los archivos viven en Supabase Storage (bucket privado), no en la base de datos: en Postgres
-- solo se guarda una referencia chiquita (nombre + ruta), para no llenar el cupo de la base.

insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos-quejas', 'adjuntos-quejas', false, 15728640) -- 15 MB por archivo
on conflict (id) do nothing;

create table if not exists public.queja_adjuntos (
  id uuid primary key default gen_random_uuid(),
  queja_id uuid not null references public.quejas(id) on delete cascade,
  nombre_archivo text not null,
  ruta_storage text not null unique,
  tipo_mime text,
  tamanio_bytes bigint,
  subido_por uuid references public.profiles(id),
  subido_en timestamptz not null default now()
);

comment on table public.queja_adjuntos is 'Referencia a archivos adjuntos de una queja (PDF/foto/video/cualquier tipo). El archivo en sí vive en Supabase Storage, bucket adjuntos-quejas; aquí solo se guarda la ruta.';

alter table public.queja_adjuntos enable row level security;

-- Lectura abierta a cualquier usuario autenticado con rol, igual que el resto de las tablas.
create policy "adjuntos_select" on public.queja_adjuntos
  for select to authenticated
  using (mi_rol() is not null);

-- Solo comercial/admin pueden registrar adjuntos (mismo criterio que crear la queja).
create policy "adjuntos_insert" on public.queja_adjuntos
  for insert to authenticated
  with check (mi_rol() = any (array['comercial','admin']));

-- Fuerza que subido_por sea siempre quien hace la llamada (nunca lo que mande el cliente).
create or replace function public.fijar_subido_por_adjunto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.subido_por := auth.uid();
  return new;
end;
$function$;

drop trigger if exists trg_fijar_subido_por_adjunto on public.queja_adjuntos;
create trigger trg_fijar_subido_por_adjunto
  before insert on public.queja_adjuntos
  for each row execute function public.fijar_subido_por_adjunto();

-- Políticas de Storage: mismo criterio (lectura abierta a cualquiera con rol, escritura solo comercial/admin).
create policy "adjuntos_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'adjuntos-quejas' and mi_rol() is not null);

create policy "adjuntos_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'adjuntos-quejas' and mi_rol() = any (array['comercial','admin']));
