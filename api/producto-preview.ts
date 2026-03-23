import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Página de preview para compartir en WhatsApp con meta tags de Open Graph.
 * Uso: /api/producto-preview?id={file_id}&nombre={nombre}&precio={precio}
 */
export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = req.query.id as string;
  const nombre = req.query.nombre as string || 'Producto';
  const precio = req.query.precio as string || '';
  const host = req.headers.host || 'opengravity-three.vercel.app';

  if (!fileId) {
    return res.status(400).send('Falta el ID de la foto');
  }

  const fotoUrl = `https://${host}/api/photos?id=${encodeURIComponent(fileId)}`;
  const precioTexto = precio ? ` (${precio})` : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Open Graph para WhatsApp -->
  <meta property="og:title" content="${nombre}${precioTexto} - OpenGravity" />
  <meta property="og:description" content="Producto disponible en OpenGravity" />
  <meta property="og:image" content="${fotoUrl}" />
  <meta property="og:image:width" content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="og:type" content="product" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${nombre}${precioTexto}" />
  <meta name="twitter:image" content="${fotoUrl}" />

  <title>${nombre} - OpenGravity</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0d0d18;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .container {
      text-align: center;
      padding: 1rem;
      max-width: 500px;
    }
    img {
      max-width: 100%;
      max-height: 70vh;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(123,95,255,0.3);
    }
    h1 {
      color: #e8e8f0;
      margin-top: 1rem;
      font-size: 1.5rem;
    }
    .precio {
      color: #3ecf8e;
      font-size: 1.2rem;
      font-weight: bold;
      margin-top: 0.5rem;
    }
    .logo {
      color: #7b5fff;
      margin-top: 1.5rem;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${fotoUrl}" alt="${nombre}" onerror="this.src='https://via.placeholder.com/400x400/1a1a2e/9b59b6?text=OpenGravity'" />
    <h1>${nombre}</h1>
    ${precio ? `<div class="precio">${precio}</div>` : ''}
    <div class="logo">⚡ OpenGravity</div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}