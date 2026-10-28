// DESACTIVADA (27 de octubre de 2026, ronda 15): la app ya no usa usuarios locales con contraseña.
// Todas las personas entran con su cuenta de Microsoft. Se deja este archivo para que ninguna llamada
// antigua cree cuentas; responde 410 (Gone) a todo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((_req: Request) =>
  new Response(JSON.stringify({ error: "Función desactivada: la app usa solo cuentas de Microsoft." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
