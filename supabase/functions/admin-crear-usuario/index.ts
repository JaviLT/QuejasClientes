import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const ROLES_VALIDOS = ["comercial", "calidad", "cedis", "admin"];
const DOMINIO_INTERNO = "zx-procesos.local";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";

  // Verifica que quien llama tiene sesión y rol admin (usando su propio token, respeta RLS).
  const clienteUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await clienteUsuario.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "No autorizado" }, 401);

  const { data: perfil, error: perfilErr } = await clienteUsuario
    .from("profiles")
    .select("rol")
    .eq("id", userData.user.id)
    .single();
  if (perfilErr || !perfil || perfil.rol !== "admin") {
    return json({ error: "No autorizado" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido" }, 400);
  }

  const usuarioCrudo = String(body.usuario ?? "").trim();
  const contrasena = String(body.contrasena ?? "");
  const nombreCompleto = String(body.nombre_completo ?? "").trim() || usuarioCrudo;
  const rol = String(body.rol ?? "");

  if (!usuarioCrudo) return json({ error: "Falta el usuario" }, 400);
  if (contrasena.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  if (!ROLES_VALIDOS.includes(rol)) return json({ error: "Rol inválido" }, 400);

  const usuario = usuarioCrudo.toUpperCase().replace(/\s+/g, "");
  const correoInterno = `${usuario.toLowerCase()}@${DOMINIO_INTERNO}`;

  const clienteAdmin = createClient(supabaseUrl, serviceKey);

  const { data: creado, error: crearErr } = await clienteAdmin.auth.admin.createUser({
    email: correoInterno,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreCompleto, rol },
  });

  if (crearErr) {
    const msg = /already been registered|already exists/i.test(crearErr.message)
      ? "Ya existe un usuario con ese nombre."
      : crearErr.message;
    return json({ error: msg }, 400);
  }

  // El trigger on_auth_user_created ya creó el renglón en profiles; le agregamos el usuario (palabra de login).
  const { error: updErr } = await clienteAdmin
    .from("profiles")
    .update({ usuario })
    .eq("id", creado.user.id);
  if (updErr) return json({ error: `Usuario creado, pero no se pudo guardar el nombre de usuario: ${updErr.message}` }, 200);

  return json({ ok: true, id: creado.user.id, usuario, rol });
});
