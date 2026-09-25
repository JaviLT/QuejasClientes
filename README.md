# ZX · Procesos — Quejas de Cliente

Front real (HTML/CSS/JS estático) conectado a Supabase, para registrar y dar seguimiento a quejas de cliente (formato VEN-F-03) por las áreas de Comercial, Calidad y CEDIS.

## Estructura

```
index.html              Login (correo + contraseña)
comercial.html           Levantar una queja nueva
calidad.html             Bandejas de Calidad (aceptar/rechazar, dictamen, revisión…)
cedis.html               Bandejas de CEDIS (recolección, envío a planta, notas de crédito)
assets/css/estilos.css   Estilos compartidos (paleta de marca Zubex)
assets/js/
  supabase-client.js     Inicializa el cliente de Supabase (URL + publishable key)
  auth-guard.js          Exige sesión + rol correcto en cada pantalla, pinta el encabezado
  tiempo.js               Cronómetro en vivo del "tempo" activo de cada queja
  login.js, comercial.js, calidad.js, cedis.js   Lógica de cada pantalla
supabase/migrations/     Esquema completo de la base de datos (SQL)
```

Es un sitio 100% estático: no necesita build ni servidor propio. Se puede publicar tal cual en GitHub Pages, Netlify, Vercel o cualquier hosting de archivos estáticos.

## Base de datos (Supabase)

- Proyecto: `Quejas-Clientes` (`zxtlnciowqcwhbfbkokv`)
- El esquema completo (tablas, RLS, funciones RPC) vive en [`supabase/migrations/`](supabase/migrations). Aplícalo con la CLI de Supabase:
  ```
  supabase link --project-ref zxtlnciowqcwhbfbkokv
  supabase db push
  ```
  o pegando el contenido del archivo en el SQL Editor del dashboard.
- La `publishable key` que usa el front (`assets/js/supabase-client.js`) es segura para exponer en el navegador: por diseño, solo puede hacer lo que las políticas de RLS y los permisos de cada función permiten. **Nunca** pongas aquí la `service_role key`.

### Usuarios

Este repositorio **no** crea usuarios (a propósito: las contraseñas no deben vivir en control de versiones). Créalos una vez desde el Dashboard de Supabase → Authentication → Users, o con un script separado fuera de este repo, y asígnales su `rol` (`comercial`, `calidad`, `cedis` o `admin`) en la tabla `profiles`.

Hoy existen 3 cuentas compartidas por área (Comercial/Calidad/CEDIS); en el futuro se planea pasar a una cuenta por empleado.

## Cómo se mueve el flujo

Todas las transiciones de estatus de una queja pasan por funciones RPC en la base de datos (`queja_aceptar`, `queja_dictamen`, `recoleccion_enviar`, etc.), nunca por `update` directo desde el cliente. Cada función valida el rol de quien llama y el estatus actual antes de cambiar cualquier cosa. El detalle completo del flujo y de cada función está documentado en el proyecto de Claude de Zubex (documento `BASE-DE-DATOS.md`).

## Pendientes conocidos

- Activar "Leaked Password Protection" en el dashboard de Supabase (Authentication → Providers) — no se puede hacer por SQL/migración.
- Llenar `contactos_notificacion` con correos reales (Josué, Fili, Alex Ruiz, Axzel, etc.) antes de conectar el envío real de correo.
- Conectar el envío real de avisos (Outlook/M365); hoy `correos_enviados` solo lleva el registro (`estado_envio = 'simulado'`).
