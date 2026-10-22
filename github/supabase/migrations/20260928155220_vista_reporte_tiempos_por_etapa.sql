-- Reporte agregado de cuánto tarda cada etapa del proceso, usando el
-- historial ya cerrado en "tempos". Alimenta la pantalla de Tiempos (Admin).
-- security_invoker=true: la vista respeta el RLS de "tempos" según quien
-- consulta, no según quien la creó.
create view public.vw_tiempos_por_etapa
with (security_invoker = true) as
select
  etiqueta,
  count(*)::int as cantidad,
  round(avg(duracion_ms))::bigint as promedio_ms,
  min(duracion_ms) as minimo_ms,
  max(duracion_ms) as maximo_ms
from public.tempos
group by etiqueta
order by etiqueta;

revoke all on public.vw_tiempos_por_etapa from public, anon;
grant select on public.vw_tiempos_por_etapa to authenticated;

-- Nota: la cuenta ADMIN (rol 'admin' en profiles) se crea manualmente desde
-- el Dashboard de Supabase, igual que Comercial/Calidad/CEDIS — no se
-- versiona aquí porque implicaría subir una contraseña al repositorio.
