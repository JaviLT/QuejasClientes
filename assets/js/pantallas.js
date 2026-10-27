// ZX · Procesos — catálogo de pantallas de la app. Es la única lista que usan el encabezado, la
// pantalla Roles y el login. Las claves son las mismas que acepta la columna roles.pantallas de la
// base de datos (check): solo las pantallas "asignables" pueden dárseles a un rol; las pantallas
// "solo admin" (Administrador, Usuarios, Roles) las ve únicamente el rol Administrador.

export const PANTALLAS_ASIGNABLES = [
  { clave: 'comercial',       href: 'comercial.html',       etiqueta: 'Comercial',       rolNativo: 'comercial' },
  { clave: 'calidad',         href: 'calidad.html',         etiqueta: 'Calidad',         rolNativo: 'calidad' },
  { clave: 'cedis',           href: 'cedis.html',           etiqueta: 'CEDIS',           rolNativo: 'cedis' },
  { clave: 'tiempos',         href: 'tiempos.html',         etiqueta: 'Tiempos' },
  { clave: 'quejas_cerradas', href: 'quejas-cerradas.html', etiqueta: 'Quejas cerradas' },
];

export const PANTALLAS_SOLO_ADMIN = [
  { clave: 'admin',    href: 'admin.html',    etiqueta: 'Administrador' },
  { clave: 'usuarios', href: 'usuarios.html', etiqueta: 'Usuarios' },
  { clave: 'roles',    href: 'roles.html',    etiqueta: 'Roles' },
];

export const TODAS_LAS_PANTALLAS = [...PANTALLAS_SOLO_ADMIN, ...PANTALLAS_ASIGNABLES];

export function pantallaPorClave(clave) {
  return TODAS_LAS_PANTALLAS.find((p) => p.clave === clave) || null;
}

/** Pantallas que realmente puede abrir un perfil: las fijas de admin (más Comercial/Calidad/CEDIS en solo lectura) + las de su rol, en el orden del catálogo. */
export function pantallasDePerfil(rol, pantallasDelRol) {
  const claves = new Set(pantallasDelRol || []);
  if (rol === 'admin') {
    PANTALLAS_SOLO_ADMIN.forEach((p) => claves.add(p.clave));
    // Admin también puede ver Comercial, Calidad y CEDIS (en modo solo lectura: ver exigirSesion).
    PANTALLAS_ASIGNABLES.filter((p) => p.rolNativo).forEach((p) => claves.add(p.clave));
  }
  return TODAS_LAS_PANTALLAS.filter((p) => claves.has(p.clave)).map((p) => p.clave);
}
