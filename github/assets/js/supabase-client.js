// ZX · Procesos — cliente único de Supabase, compartido por todas las pantallas.
// La "publishable key" es segura para usar en el navegador: solo puede hacer lo
// que las políticas de RLS y los permisos de cada función RPC le permiten.

const SUPABASE_URL = 'https://zxtlnciowqcwhbfbkokv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-yBJn4YEXapLW2Dqr5a-Lg_le1Jw_Hg';

if (!window.supabase) {
  throw new Error('No se cargó la librería de Supabase (revisa el <script> del CDN en el HTML).');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
