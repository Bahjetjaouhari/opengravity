import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Pagina de preview para compartir en WhatsApp con meta tags de Open Graph.
 * Uso: /api/producto-preview?id={file_id}&nombre={nombre}&precio={precio}
 */
export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = req.query.id as string;
  const nombre = req.query.nombre as string || 'Producto';
  const precio = req.query.precio as string || '';
  const host = req.headers.host || 'opengravity.vercel.app';

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
  <meta property="og:title" content="${nombre}${precioTexto} - BJ Prestige" />
  <meta property="og:description" content="Producto exclusivo disponible en BJ Prestige. Relojeria, accesorios y joyas de alta calidad." />
  <meta property="og:image" content="${fotoUrl}" />
  <meta property="og:image:width" content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="og:type" content="product" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${nombre}${precioTexto}" />
  <meta name="twitter:description" content="Producto exclusivo disponible en BJ Prestige" />
  <meta name="twitter:image" content="${fotoUrl}" />

  <title>${nombre} - BJ Prestige</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --gold: #D4AF37;
      --gold-light: #F4D03F;
      --bg: #0A0A0A;
      --text: #F5F5F5;
      --text-muted: #888888;
    }

    body {
      background: var(--bg);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 1rem;
    }

    .container {
      text-align: center;
      max-width: 500px;
      width: 100%;
    }

    .product-card {
      background: linear-gradient(145deg, rgba(26, 26, 26, 0.9) 0%, rgba(10, 10, 10, 0.95) 100%);
      border: 1px solid rgba(212, 175, 55, 0.2);
      border-radius: 20px;
      padding: 1.5rem;
      box-shadow: 0 20px 60px rgba(212, 175, 55, 0.1);
    }

    .image-container {
      position: relative;
      margin-bottom: 1.5rem;
    }

    img {
      max-width: 100%;
      max-height: 60vh;
      border-radius: 16px;
      box-shadow: 0 15px 50px rgba(212, 175, 55, 0.15);
    }

    .brand-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      background: linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%);
      color: var(--bg);
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .product-name {
      font-family: 'Playfair Display', serif;
      color: var(--text);
      font-size: 1.6rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      line-height: 1.3;
    }

    .precio {
      color: var(--gold);
      font-size: 1.4rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .brand-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(212, 175, 55, 0.1);
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      border-radius: 4px;
      object-fit: cover;
    }

    .brand-text {
      font-family: 'Playfair Display', serif;
      color: var(--gold);
      font-size: 1rem;
      font-weight: 600;
    }

    .brand-tagline {
      color: var(--text-muted);
      font-size: 0.7rem;
      display: block;
      font-family: 'Inter', sans-serif;
      margin-top: 2px;
    }

    .cta-button {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      padding: 0.8rem 1.5rem;
      background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
      color: white;
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
      border-radius: 12px;
      transition: transform 0.2s ease;
    }

    .cta-button:hover {
      transform: scale(1.02);
    }

    .cta-button svg {
      width: 18px;
      height: 18px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="product-card">
      <div class="image-container">
        <img src="${fotoUrl}" alt="${nombre}" onerror="this.src='https://via.placeholder.com/400x400/1a1a1a/D4AF37?text=BJ+Prestige'" />
        <span class="brand-badge">BJ Prestige</span>
      </div>
      <h1 class="product-name">${nombre}</h1>
      ${precio ? `<div class="precio">${precio}</div>` : ''}
      <div class="brand-footer">
        <img src="/logo-main.jpg" alt="BJ Prestige" class="brand-logo" onerror="this.style.display='none'" />
        <div>
          <span class="brand-text">BJ Prestige</span>
          <span class="brand-tagline">Excelencia en cada detalle</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.send(html);
}