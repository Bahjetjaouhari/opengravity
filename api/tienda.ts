import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inventarioDB, Producto } from '../src/inventory/db.js';

export const config = { maxDuration: 30 };

function buildHTML(propios: Producto[], pedidos: Producto[], host: string): string {
  const baseUrl = `https://${host}`;

  const cardHTML = (p: Producto) => {
    const precio = inventarioDB.getPrecioParaTipo(p);
    const tipos = p.tipos.map(t =>
      `<span class="badge">${t.charAt(0).toUpperCase() + t.slice(1)}</span>`
    ).join('');
    return `
    <div class="card">
      <div class="card-img-wrap">
        <img src="${baseUrl}/api/photos?id=${p.foto_file_id}"
             loading="lazy"
             onerror="this.src='https://via.placeholder.com/400x400/1a1a2e/9b59b6?text=OpenGravity'"
             alt="${p.tipos.join(', ')}" />
        <div class="availability-tag ${p.modalidad === 'propio' ? 'tag-now' : 'tag-order'}">
          ${p.modalidad === 'propio' ? '✅ Disponible' : '📦 Por Pedido'}
        </div>
      </div>
      <div class="card-body">
        <div class="tipos">${tipos}</div>
        ${precio !== 'Sin precio' ? `<div class="precio">${precio}</div>` : '<div class="precio-consultar">Precio a consultar</div>'}
        <a class="btn-contact" href="${process.env.WHATSAPP_NUMBER ? `https://wa.me/${process.env.WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola! Me interesa ${p.tipos.join(' y ')}${precio !== 'Sin precio' ? ` (${precio})` : ''}. ¿Está disponible?`)}` : '#'}" target="_blank">
          💬 Consultar
        </a>
      </div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OpenGravity – Tienda</title>
  <meta name="description" content="Ropa y accesorios disponibles ahora o por pedido. Calidad garantizada." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0d0d18;
      --card-bg: #15152a;
      --card-border: rgba(120,80,255,0.18);
      --accent: #7b5fff;
      --accent2: #3ecf8e;
      --text: #e8e8f0;
      --text-muted: #8888aa;
      --now: #3ecf8e;
      --order: #7b5fff;
    }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    /* ── HEADER ── */
    header {
      background: linear-gradient(135deg, #1a0a3a 0%, #0a1628 50%, #0d0d18 100%);
      padding: 2rem 1.5rem 1.5rem;
      text-align: center;
      border-bottom: 1px solid rgba(123,95,255,0.2);
      position: relative;
      overflow: hidden;
    }
    header::before {
      content: '';
      position: absolute;
      top: -80px; left: 50%; transform: translateX(-50%);
      width: 400px; height: 400px;
      background: radial-gradient(circle, rgba(123,95,255,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .logo {
      font-size: 2rem;
      font-weight: 800;
      background: linear-gradient(90deg, #7b5fff, #3ecf8e);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -1px;
    }
    .tagline {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-top: 0.3rem;
    }

    /* ── TABS ── */
    .tabs {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
      padding: 1.5rem 1rem 0;
    }
    .tab {
      padding: 0.5rem 1.5rem;
      border-radius: 999px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      border: 1.5px solid transparent;
      transition: all 0.25s ease;
      background: transparent;
      color: var(--text-muted);
    }
    .tab.active-now {
      background: rgba(62,207,142,0.12);
      border-color: var(--now);
      color: var(--now);
    }
    .tab.active-order {
      background: rgba(123,95,255,0.12);
      border-color: var(--order);
      color: var(--order);
    }
    .tab:not(.active-now):not(.active-order):hover {
      background: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.1);
      color: var(--text);
    }

    /* ── COUNTER ── */
    .counter {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.82rem;
      padding: 0.6rem 0 0;
    }

    /* ── GRID ── */
    .section { display: none; padding: 1rem 1rem 3rem; }
    .section.visible { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      max-width: 1100px;
      margin: 1rem auto 0;
    }

    /* ── CARD ── */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(123,95,255,0.2);
    }
    .card-img-wrap {
      position: relative;
      aspect-ratio: 1/1;
      background: #1a1a30;
      overflow: hidden;
    }
    .card-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }
    .card:hover .card-img-wrap img { transform: scale(1.05); }

    .availability-tag {
      position: absolute;
      top: 10px; right: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      backdrop-filter: blur(8px);
    }
    .tag-now { background: rgba(62,207,142,0.88); color: #0d2518; }
    .tag-order { background: rgba(123,95,255,0.88); color: #fff; }

    .card-body {
      padding: 0.9rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .tipos { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .badge {
      background: rgba(123,95,255,0.15);
      border: 1px solid rgba(123,95,255,0.3);
      color: #a89aff;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 8px;
    }
    .precio {
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--now);
    }
    .precio-consultar {
      font-size: 0.82rem;
      color: var(--text-muted);
      font-style: italic;
    }
    .btn-contact {
      display: block;
      text-align: center;
      padding: 0.5rem;
      border-radius: 10px;
      background: linear-gradient(135deg, #7b5fff, #3ecf8e);
      color: #fff;
      font-weight: 700;
      font-size: 0.85rem;
      text-decoration: none;
      transition: opacity 0.2s ease;
    }
    .btn-contact:hover { opacity: 0.85; }

    /* ── EMPTY STATE ── */
    .empty {
      text-align: center;
      padding: 4rem 1rem;
      color: var(--text-muted);
    }
    .empty-icon { font-size: 3rem; margin-bottom: 1rem; }

    /* ── FOOTER ── */
    footer {
      text-align: center;
      padding: 1.5rem;
      color: var(--text-muted);
      font-size: 0.78rem;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    /* ── RESPONSIVE ── */
    @media (max-width: 480px) {
      .logo { font-size: 1.5rem; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 0.7rem; }
      .card-body { padding: 0.7rem; }
      .precio { font-size: 1rem; }
    }

    /* ── LOADING SKELETON ── */
    @keyframes shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .skeleton {
      background: linear-gradient(90deg, #1a1a30 25%, #22223a 50%, #1a1a30 75%);
      background-size: 400px 100%;
      animation: shimmer 1.4s ease-in-out infinite;
      border-radius: 16px;
      aspect-ratio: 3/4;
    }
  </style>
</head>
<body>

<header>
  <div class="logo">⚡ OpenGravity</div>
  <div class="tagline">Ropa y accesorios para todos los estilos</div>
</header>

<div class="tabs">
  <button class="tab active-now" onclick="show('now')">
    🟢 Disponible Ahora (${propios.length})
  </button>
  <button class="tab" id="tab-order" onclick="show('order')">
    📦 Por Pedido (${pedidos.length})
  </button>
</div>

<!-- SECCIÓN: DISPONIBLE AHORA -->
<section class="section visible" id="sec-now">
  ${propios.length > 0 ? `
  <div class="grid">
    ${propios.map(cardHTML).join('')}
  </div>` : `
  <div class="empty">
    <div class="empty-icon">🛍️</div>
    <p>No hay stock inmediato por ahora.<br/>¡Pronto habrá novedades!</p>
  </div>`}
</section>

<!-- SECCIÓN: POR PEDIDO -->
<section class="section" id="sec-order">
  ${pedidos.length > 0 ? `
  <div class="grid">
    ${pedidos.map(cardHTML).join('')}
  </div>` : `
  <div class="empty">
    <div class="empty-icon">📦</div>
    <p>No hay pedidos por ahora.</p>
  </div>`}
</section>

<footer>
  ⚡ OpenGravity • Catálogo actualizado en tiempo real
</footer>

<script>
  function show(tab) {
    const tabs = document.querySelectorAll('.tab');
    document.getElementById('sec-now').classList.remove('visible');
    document.getElementById('sec-order').classList.remove('visible');
    tabs.forEach(t => { t.className = 'tab'; });

    if (tab === 'now') {
      document.getElementById('sec-now').classList.add('visible');
      tabs[0].className = 'tab active-now';
    } else {
      document.getElementById('sec-order').classList.add('visible');
      tabs[1].className = 'tab active-order';
    }
  }
</script>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const todos = await inventarioDB.obtener();
    const propios = todos.filter(p => p.modalidad === 'propio');
    const pedidos = todos.filter(p => p.modalidad === 'pedido');
    const host = req.headers.host || 'opengravity.vercel.app';

    const html = buildHTML(propios, pedidos, host);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.send(html);
  } catch (err: any) {
    console.error('[Tienda API]', err);
    res.status(500).send(`<h1>Error cargando la tienda: ${err.message}</h1>`);
  }
}
