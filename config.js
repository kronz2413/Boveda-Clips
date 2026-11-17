// Pega aquí los datos de tu proyecto de Supabase (Project Settings → API).
// La "anon key" es pública por diseño: la seguridad real la ponen las reglas de supabase/setup.sql.
window.BOVEDA_CONFIG = {
  SUPABASE_URL: "https://jrbcizeykamtdlwfkoct.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_NTslAcpI6tyPW3rVnCGTkA_WsODtL2Gx",
  BUCKET: "clips",
  MAX_MB: 50 // Debe coincidir con file_size_limit de supabase/setup.sql. El plan gratis de Supabase permite hasta 50 MB por archivo.
};
