# Bóveda de Clips

Galería compartida para subir, ver, descargar y eliminar videos e imágenes sin perder calidad. Los archivos se suben tal cual, sin convertir ni recomprimir.

- La página es estática: va en GitHub Pages.
- Los archivos y la lista viven en Supabase (Storage + una tabla).
- Cada visitante entra con una sesión anónima automática. Puede subir, y solo puede eliminar lo que subió él.

## Puesta en marcha

1. **Supabase.** Crea un proyecto en supabase.com (el plan gratis alcanza para empezar).
2. **Acceso anónimo.** Authentication → Sign In / Providers → activa **Allow anonymous sign-ins**.
3. **Base de datos.** SQL Editor → pega todo `supabase/setup.sql` y ejecútalo. Crea el bucket público `clips`, la tabla `media` y las reglas de seguridad.
4. **Claves.** Project Settings → API. Copia la **Project URL** y la **anon public key** dentro de `config.js`.
5. **GitHub.** Sube esta carpeta a un repositorio. En Settings → Pages elige "Deploy from a branch", rama `main`, carpeta `/ (root)`.
6. Abre la URL que te da GitHub Pages.

## Límites que debes conocer

- **Tamaño por archivo.** El plan gratis de Supabase permite hasta 50 MB por archivo. Con un plan de pago puedes subirlo: cambia `file_size_limit` en `setup.sql` (en bytes) y `MAX_MB` en `config.js`.
- **Espacio total.** El plan gratis incluye 1 GB de almacenamiento y un tope de transferencia mensual. Muchos clips pesados lo llenan rápido.
- **Sesión anónima.** Si alguien borra los datos de su navegador o cambia de dispositivo, deja de ser "dueño" de lo que subió y ya no podrá eliminarlo. Tú puedes borrar cualquier archivo desde el panel de Supabase (Storage y Table Editor).
- **Subidas abiertas.** Cualquiera con el enlace puede subir. Si no quieres eso, cambia las reglas de `setup.sql` para exigir usuarios con correo en vez de anónimos.
- **Formatos.** MP4, WebM, MOV, PNG, JPG, WebP y GIF. Algunos navegadores no muestran vista previa de MOV, pero el archivo se descarga igual.
- La anon key es pública por diseño. La seguridad la dan las reglas de `setup.sql`, así que no las quites.
