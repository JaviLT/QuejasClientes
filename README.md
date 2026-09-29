# Quejas de Clientes — Zubex

Front real (HTML/CSS/JS estático) conectado a Supabase, para registrar y dar seguimiento a quejas de cliente (formato VEN-F-03) por las áreas de Comercial, Calidad y CEDIS, más una pantalla de Administrador.

## Estructura

```
index.html              Login (usuario + contraseña — sin formato de correo, ver abajo)
comercial.html           Mis quejas + botón "Nueva queja" (en la barra superior, abre un modal)
calidad.html             Bandejas de Calidad (esperando muestra, dictamen, revisión…)
cedis.html               Bandejas de CEDIS (espera de recolección, envío a planta, notas de crédito) + botón "Folio sin queja" (en la barra superior)
admin.html               Solo Admin: quejas separadas en "Abiertas" y "Cerradas", con Ver detalles, Eliminar y tiempos por etapa desplegables
tiempos.html             Redirige a admin.html (nombre anterior de esa pantalla; se deja por si hay enlaces viejos)
usuarios.html            Solo Admin: crear usuarios nuevos + lista de usuarios existentes
assets/img/logo-zx.png   Ícono de la marca (usado en el encabezado de cada pantalla y en el login)
assets/css/estilos.css   Estilos compartidos (paleta de marca Zubex)
assets/js/
  supabase-client.js     Inicializa el cliente de Supabase (URL + publishable key)
  version.js             Número de versión visible de la app (ver "Versión de la app" abajo)
  auth-guard.js          Exige sesión + rol correcto en cada pantalla, pinta el encabezado (ícono, pestañas/botón de acción, botón de usuario con menú de modo noche y cerrar sesión, y la versión en el pie), y centraliza el doble check (`confirmarAccion`)
  tiempo.js               Duración fija y legible de cada etapa (minutos/horas/días/semanas/meses/años) — nunca un reloj en vivo, y solo la usa `admin.js`
  detalle.js              Modal compartido "Ver detalles" de una queja (datos + línea de tiempo + dictamen) — la línea de tiempo y otras fechas de proceso solo se muestran completas si quien mira la pantalla es Admin (ver "Tiempos: solo para Admin")
  login.js, comercial.js, calidad.js, cedis.js, admin.js, usuarios.js   Lógica de cada pantalla
supabase/migrations/     Esquema completo de la base de datos (SQL)
supabase/functions/admin-crear-usuario/   Edge Function para crear usuarios (usa la service_role key del lado del servidor)
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

Este repositorio **no** crea usuarios (a propósito: las contraseñas no deben vivir en control de versiones). Créalos una vez desde el Dashboard de Supabase → Authentication → Users, o con un script separado fuera de este repo, y asígnales su `rol` (`comercial`, `calidad`, `cedis` o `admin`) en la tabla `profiles`. El correo interno de cada cuenta sigue el patrón `<usuario>@zx-procesos.local` (ej. `comercial@zx-procesos.local`), aunque en el login la persona nunca ve ni escribe esa parte.

Hoy existen 4 cuentas compartidas (Comercial/Calidad/CEDIS/Admin); en el futuro se planea pasar a una cuenta por empleado.

### Login sin formato de correo

Supabase Auth siempre necesita internamente un identificador con forma de correo, pero la persona que inicia sesión solo escribe una palabra (`COMERCIAL`, `CALIDAD`, `CEDIS`, `ADMIN`). `assets/js/login.js` construye el correo interno (`usuario.toLowerCase() + '@zx-procesos.local'`) antes de llamar a `signInWithPassword` — si más adelante se pasa a cuentas por empleado con correos reales, basta con cambiar esa función.

## Cómo se mueve el flujo

Todas las transiciones de estatus de una queja pasan por funciones RPC en la base de datos (`queja_aceptar`, `queja_dictamen`, `recoleccion_enviar`, etc.), nunca por `update` directo desde el cliente. Cada función valida el rol de quien llama y el estatus actual antes de cambiar cualquier cosa. El detalle completo del flujo y de cada función está documentado en el proyecto de Claude de Zubex (documento `BASE-DE-DATOS.md`).

## Dictamen de Calidad (VEN-F-08)

El dictamen ya no es un texto libre: Calidad llena un formulario con los campos del formato oficial VEN-F-08 (tipo de acción, cantidad, desviación reportada, descripción del problema, causa raíz, equipo multidisciplinario, medidas de contención y preventivas, conclusión, recibido por). Se guarda estructurado en `dictamenes`/`dictamen_equipo`/`dictamen_medidas` (`supabase/migrations/20260928171133_dictamen_estructurado.sql`) vía el RPC `queja_dictamen(p_id, p_dictamen jsonb, p_aceptar)`.

## El encabezado

Cada pantalla comparte el mismo encabezado, pintado por `pintarEncabezado()` en `auth-guard.js`:

- A la izquierda, el ícono de la marca (`assets/img/logo-zx.png`) y el nombre de la pantalla.
- En medio, según la pantalla: las pestañas de Admin ("Administrador" / "Usuarios"), o el botón de acción propio de esa pantalla (Comercial: "Nueva queja"; CEDIS: "Folio sin queja"). Calidad no tiene nada ahí.
- A la derecha, un botón con el nombre de la persona y su rol/departamento debajo; al darle clic se abre un menú con "Modo noche/día" y "Cerrar sesión" (antes eran botones sueltos en la barra).

## Ver detalles

Cada queja tiene un botón "Ver detalles" que abre un modal de solo lectura con todos sus datos, el dictamen si existe y una línea de tiempo de sus etapas. Esa línea de tiempo (compartida por todas las pantallas) siempre muestra la etiqueta de cada etapa ya cerrada; la fecha/hora junto a cada una, y las demás fechas de proceso del modal (fecha de emisión del dictamen, fecha de generado/enviado de la recolección), solo se pintan si quien mira la pantalla es Admin — para el resto de los roles esas fechas se ocultan por completo (ver "Tiempos: solo para Admin"). La única fecha que ven todos los roles, sin excepción, es la "Fecha de registro" de la queja (cuándo se creó), que aparece en los datos generales del modal.

## Tiempos: solo para Admin

Ninguna pantalla de Comercial, Calidad o CEDIS muestra duraciones, cronómetros, ni ninguna fecha de proceso más allá de la fecha en que se creó la queja — ni en sus bandejas ni en "Ver detalles". Esa información (fechas exactas y duración por etapa) vive únicamente en `admin.html`, la pantalla de Admin. `assets/js/detalle.js` sabe qué rol tiene la sesión actual porque cada pantalla llama a `establecerRolActual(rol)` justo después de `exigirSesion()`.

## Pantallas de Admin (Administrador / Usuarios)

La cuenta `admin` entra directo a `admin.html` (ya no elige entre 4 pantallas, y ya no tiene acceso a Comercial/Calidad/CEDIS). Desde el encabezado se mueve entre sus dos pantallas:

- **Administrador** (`admin.html`, antes `tiempos.html`) — lista todas las quejas separadas en dos tarjetas, **"Quejas abiertas"** y **"Quejas cerradas"** (según si su estatus está en la lista de estatus terminales), cada una con botones "Ver detalles" y "Eliminar" (RPC `queja_eliminar`, borra en cascada el dictamen, la bitácora de tiempos y desliga cualquier folio de recolección). Al darle clic a "Ver tiempos" se abre una sección desplegable por queja con la duración de cada etapa ya cerrada y, si la queja sigue abierta, la etapa actual con su tiempo transcurrido. Ninguna duración se muestra como reloj en vivo: siempre es un texto fijo (minutos/horas/días/semanas/meses/años) que se actualiza cada minuto (`assets/js/tiempo.js`) — Admin sigue viendo este formato de texto (no fechas exactas) en este panel; lo que cambió es que "Ver detalles" ahora sí le muestra a Admin las fechas exactas de cada etapa (ver arriba). El reporte agregado por etapa (promedio/mínimo/máximo) se había quitado del front en la ronda anterior; la vista `vw_tiempos_por_etapa` sigue existiendo en la base de datos por si se vuelve a necesitar, pero ya no se consulta desde ningún lado.
- **Usuarios** (`usuarios.html`) — crea cuentas nuevas llamando a la Edge Function `admin-crear-usuario` (`supabase/functions/admin-crear-usuario/`), que valida que quien llama sea admin y usa la `service_role key` del lado del servidor.

`tiempos.html` sigue existiendo como una página que solo redirige a `admin.html` (por si algún enlace o marcador viejo la usa).

Desde el 28 de septiembre de 2026 una queja nueva ya no pasa por el estatus `nueva`: arranca directo en `esperando_muestra` (por eso Calidad ya no tiene bandeja de "Quejas nuevas").

## Versión de la app

`assets/js/version.js` exporta `APP_VERSION`, un número de versión visible que se pinta en el pie de página de cada pantalla (incluyendo el login) vía `pintarPie()` en `auth-guard.js`. Sirve para que cualquiera — sobre todo Admin — pueda confirmar de un vistazo que ya tiene la versión más reciente desplegada. **Convención:** cada ronda de cambios que se entregue debe subir este número (minor para pantallas/funciones nuevas o cambiadas, patch para una corrección chica). Actual: `1.1.0`.

## Ícono de la marca

`assets/img/logo-zx.png` (128×128) es el ícono oficial de la app: se usa en el encabezado de cada pantalla (con un pequeño fondo blanco para que resalte sobre el azul), en el logo del login y como favicon (`<link rel="icon">`) de cada página HTML. Reemplaza a las letras "ZX" que se dibujaban como texto en rondas anteriores.

## Botones de acción en la barra superior

El botón principal de cada pantalla (Comercial: "Nueva queja"; CEDIS: "Folio sin queja") vive en la barra superior, en forma de pastilla con un ícono redondo a la izquierda del texto, no dentro de una tarjeta. Se pinta pasando `opciones.boton = { id, texto, titulo?, icono? }` a `pintarEncabezado(perfil, tituloPantalla, opciones)`; quien llama debe engancharle su propio listener después, ya que `pintarEncabezado` solo dibuja el `<button>`.

## Dictamen de Calidad: pop up

La bandeja "Dictamen en proceso" de Calidad ya no muestra el formulario VEN-F-08 completo por cada queja: cada fila solo tiene "Ver detalles" y un botón "Iniciar dictamen". Al darle clic se abre un pop up (`#zx-modal-dictamen-fondo` en `calidad.html`, construido por `abrirModalDictamen` en `calidad.js`) con el formulario completo; Aceptado/Rechazado sigue llamando al mismo RPC `queja_dictamen`.

## Doble check antes de cambiar el proceso de una queja

Todo botón que dispara un cambio de estatus sobre una queja (aceptar, rechazar, muestra/material recibido, dictamen, revisión, notas de crédito, enviar a planta, eliminar, generar folio sin queja, etc.) pide confirmación antes de ejecutar la acción, para evitar clics accidentales. Es una ventana `confirm()` del navegador, centralizada en `confirmarAccion(mensaje)` (`assets/js/auth-guard.js`) — si más adelante se quiere otro estilo de confirmación, solo hay que tocar esa función. Registrar una queja nueva (Comercial) y crear un usuario (Admin → Usuarios) quedan fuera de esta regla porque son una captura, no un cambio de proceso sobre una queja existente.

## Pendientes conocidos

- Activar "Leaked Password Protection" en el dashboard de Supabase (Authentication → Providers) — no se puede hacer por SQL/migración.
- Llenar `contactos_notificacion` con correos reales (Josué, Fili, Alex Ruiz, Axzel, etc.) antes de conectar el envío real de correo.
- Conectar el envío real de avisos (Outlook/M365); hoy `correos_enviados` solo lleva el registro (`estado_envio = 'simulado'`).
