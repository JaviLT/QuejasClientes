-- La nueva versión de recoleccion_material_recibido(uuid, numeric, text) tiene valores por
-- defecto para el 2do y 3er parámetro, así que convivía de forma ambigua con la firma vieja
-- de un solo argumento. Se elimina la firma vieja para dejar una sola función.
drop function if exists public.recoleccion_material_recibido(uuid);
