import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

// Inicializar Firebase directamente (sin usar env.ts que tiene validaciones)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || ''
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

export const config = { maxDuration: 30 };

// Tipos locales (sin importar de db.ts para evitar validaciones)
type Modalidad = 'propio' | 'pedido';
interface FotoProducto {
  file_id: string;
  url: string;
  orden: number;
  principal: boolean;
}
interface Producto {
  id?: string;
  proveedor: string;
  tipos: string[];
  nombre: string;
  precio?: string;
  precios?: Record<string, string>;
  precio_total?: string;
  fotos?: FotoProducto[];
  foto_url?: string;
  foto_file_id?: string;
  disponible: boolean;
  modalidad: Modalidad;
  fecha_carga: string;
}

// Helper functions locales
function normalizarProducto(data: any): Producto {
  const producto = { ...data } as Producto;
  if (!producto.fotos || producto.fotos.length === 0) {
    if (data.foto_file_id && data.foto_url) {
      producto.fotos = [{
        file_id: data.foto_file_id,
        url: data.foto_url,
        orden: 0,
        principal: true
      }];
    } else {
      producto.fotos = [];
    }
  }
  return producto;
}

function getPrecioParaTipo(producto: Producto, tipo?: string): string {
  if (tipo && producto.precios?.[tipo.toLowerCase().trim()]) {
    return producto.precios[tipo.toLowerCase().trim()];
  }
  return producto.precio_total || producto.precio || 'Sin precio';
}

/**
 * Genera el HTML de precios con desglose si hay múltiples precios.
 * Si hay precios individuales + precio de conjunto, muestra ambos.
 * Si solo hay precios individuales, muestra el desglose.
 */
function getPrecioHTML(producto: Producto): string {
  // Si hay precios individuales
  if (producto.precios && Object.keys(producto.precios).length > 0) {
    const entries = Object.entries(producto.precios);

    // Si hay precio de conjunto (diferente a la suma o explícito)
    if (producto.precio_total) {
      const desglose = entries.map(([tipo, precio]) => {
        const tipoCap = tipo.charAt(0).toUpperCase() + tipo.slice(1);
        return `<span class="precio-item">${tipoCap}: ${precio}</span>`;
      }).join('');

      // Calcular la suma para mostrar ahorro
      const suma = entries.reduce((acc, [, p]) => {
        const num = parseFloat(p.replace(/[$,]/g, ''));
        return acc + (isNaN(num) ? 0 : num);
      }, 0);
      const precioTotal = parseFloat(producto.precio_total.replace(/[$,]/g, '') || '0');
      const ahorro = suma - precioTotal;
      const ahorroHTML = ahorro > 0 ? `<span class="precio-ahorro">¡Ahorras $${ahorro}!</span>` : '';

      return `
        <div class="precio-desglose">
          <div class="precio-items">${desglose}</div>
          <div class="precio-conjunto">
            <span class="precio-total-label">Conjunto:</span>
            <span class="precio-total-value">${producto.precio_total}</span>
            ${ahorroHTML}
          </div>
        </div>`;
    }

    // Solo precios individuales (sin precio de conjunto)
    const desglose = entries.map(([tipo, precio]) => {
      const tipoCap = tipo.charAt(0).toUpperCase() + tipo.slice(1);
      return `<span class="precio-item">${tipoCap}: ${precio}</span>`;
    }).join('');

    return `<div class="precio-desglose"><div class="precio-items">${desglose}</div></div>`;
  }

  // Precio único
  const precio = producto.precio || 'Sin precio';
  return `<div class="precio">${precio}</div>`;
}

function getTodasLasFotos(producto: Producto): FotoProducto[] {
  if (producto.fotos && producto.fotos.length > 0) {
    return [...producto.fotos].sort((a, b) => a.orden - b.orden);
  }
  if (producto.foto_file_id && producto.foto_url) {
    return [{
      file_id: producto.foto_file_id,
      url: producto.foto_url,
      orden: 0,
      principal: true
    }];
  }
  return [];
}

async function obtenerProductos(filtros?: { modalidad?: Modalidad }): Promise<Producto[]> {
  const snapshot = await getDocs(query(collection(db, 'inventario'), where('disponible', '==', true)));
  let productos: Producto[] = snapshot.docs.map(d => normalizarProducto({ id: d.id, ...d.data() }));

  if (filtros?.modalidad) {
    productos = productos.filter(p => p.modalidad === filtros.modalidad);
  }

  return productos;
}

function buildHTML(propios: Producto[], pedidos: Producto[], host: string): string {
  const baseUrl = `https://${host}`;
  const whatsappNumber = process.env.WHATSAPP_NUMBER || '';

  const cardHTML = (p: Producto, index: number) => {
    const precioHTML = getPrecioHTML(p);
    const fotos = getTodasLasFotos(p);
    const fotoPrincipal = fotos[0];
    const tipos = p.tipos.map(t =>
      `<span class="badge">${t.charAt(0).toUpperCase() + t.slice(1)}</span>`
    ).join('');

    // Si no hay foto principal, usar placeholder
    const fotoSrc = fotoPrincipal
      ? `${baseUrl}/api/photos?id=${fotoPrincipal.file_id}`
      : 'https://via.placeholder.com/400x400/1a1a2e/9b59b6?text=Sin+Foto';

    // Indicador de múltiples fotos
    const photoIndicator = fotos.length > 1
      ? `<div class="photo-count">📷 ${fotos.length}</div>`
      : '';

    // Precio para WhatsApp (usar el más relevante)
    const precioParaWhatsApp = getPrecioParaTipo(p);

    // WhatsApp href
    const waHref = whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola! Me interesa ${p.tipos.join(' y ')}${precioParaWhatsApp !== 'Sin precio' ? ` (${precioParaWhatsApp})` : ''}. ¿Está disponible?`)}`
      : '#';

    // Data de todas las fotos para lightbox
    const fotosDataAttr = JSON.stringify(fotos.map(f => ({ id: f.file_id, url: `${baseUrl}/api/photos?id=${f.file_id}` })));
    const fotosDataEscaped = fotosDataAttr.replace(/"/g, '&quot;');

    return `
    <div class="card" data-product-index="${index}">
      <div class="card-img-wrap" onclick="openLightbox(${index}, 0)" data-fotos='${fotosDataEscaped}'>
        <img src="${fotoSrc}"
             loading="lazy"
             onerror="this.src='https://via.placeholder.com/400x400/1a1a2e/9b59b6?text=OpenGravity'"
             alt="${p.tipos.join(', ')}" />
        ${photoIndicator}
        <div class="availability-tag ${p.modalidad === 'propio' ? 'tag-now' : 'tag-order'}">
          ${p.modalidad === 'propio' ? '✅ Disponible' : '📦 Por Pedido'}
        </div>
      </div>
      <div class="card-body">
        <div class="tipos">${tipos}</div>
        ${precioHTML}
        <a class="btn-contact ${!whatsappNumber ? 'btn-disabled' : ''}"
           href="${waHref}"
           target="_blank"
           ${!whatsappNumber ? 'onclick="event.preventDefault(); alert(\'WhatsApp no configurado. Contacte al administrador.\')"' : ''}>
          ${whatsappNumber ? '💬 Consultar' : '⚠️ Sin WhatsApp'}
        </a>
      </div>
    </div>`;
  };

  // Generar datos de productos para lightbox
  const productosData = [...propios, ...pedidos].map(p => {
    const fotos = getTodasLasFotos(p);
    return fotos.map(f => ({
      id: f.file_id,
      url: `${baseUrl}/api/photos?id=${f.file_id}`
    }));
  });

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
      cursor: zoom-in;
    }
    .card-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }
    .card:hover .card-img-wrap img { transform: scale(1.05); }

    /* Photo count indicator */
    .photo-count {
      position: absolute;
      bottom: 8px;
      left: 8px;
      padding: 4px 8px;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      color: #fff;
    }

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
    .precio-desglose {
      margin-top: 0.3rem;
    }
    .precio-items {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .precio-item {
      background: rgba(255,255,255,0.05);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .precio-conjunto {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.4rem;
      flex-wrap: wrap;
    }
    .precio-total-label {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .precio-total-value {
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--now);
    }
    .precio-ahorro {
      font-size: 0.7rem;
      color: #f59e0b;
      background: rgba(245,158,11,0.15);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
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
      transition: opacity 0.2s ease, filter 0.2s ease;
    }
    .btn-contact:hover { opacity: 0.85; }
    .btn-contact.btn-disabled {
      background: #555;
      cursor: not-allowed;
    }

    /* ── LIGHTBOX ── */
    .lightbox {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.95);
      z-index: 1000;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
    }
    .lightbox.active { display: flex; }
    .lightbox-content {
      position: relative;
      max-width: 95vw;
      max-height: 90vh;
    }
    .lightbox-img {
      max-width: 95vw;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 8px;
    }
    .lightbox-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 40px;
      height: 40px;
      background: rgba(255,255,255,0.1);
      border: none;
      border-radius: 50%;
      color: #fff;
      font-size: 24px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .lightbox-close:hover { background: rgba(255,255,255,0.2); }
    .lightbox-nav {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
    }
    .lightbox-nav button {
      padding: 0.5rem 1.5rem;
      background: rgba(123,95,255,0.3);
      border: 1px solid rgba(123,95,255,0.5);
      border-radius: 8px;
      color: #fff;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .lightbox-nav button:hover { background: rgba(123,95,255,0.5); }
    .lightbox-nav button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .lightbox-counter {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }

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
    ${propios.map((p, i) => cardHTML(p, i)).join('')}
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
    ${pedidos.map((p, i) => cardHTML(p, propios.length + i)).join('')}
  </div>` : `
  <div class="empty">
    <div class="empty-icon">📦</div>
    <p>No hay pedidos por ahora.</p>
  </div>`}
</section>

<!-- LIGHTBOX -->
<div id="lightbox" class="lightbox" onclick="closeLightbox(event)">
  <button class="lightbox-close" onclick="closeLightbox(event)">✕</button>
  <div class="lightbox-content" onclick="event.stopPropagation()">
    <img id="lightbox-img" class="lightbox-img" src="" alt="Foto del producto" />
  </div>
  <div class="lightbox-nav">
    <button onclick="prevPhoto(event)" id="btn-prev">◀ Anterior</button>
    <button onclick="nextPhoto(event)" id="btn-next">Siguiente ▶</button>
  </div>
  <div class="lightbox-counter" id="lightbox-counter"></div>
</div>

<footer>
  ⚡ OpenGravity • Catálogo actualizado en tiempo real
</footer>

<script>
  // Estado global para lightbox
  let currentProductIndex = 0;
  let currentPhotoIndex = 0;
  let productPhotos = [];
  const allProducts = ${JSON.stringify(productosData)};

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

  function openLightbox(productIndex, photoIndex) {
    currentProductIndex = productIndex;
    currentPhotoIndex = photoIndex;
    productPhotos = allProducts[productIndex] || [];

    if (productPhotos.length === 0) return;

    updateLightboxImage();
    document.getElementById('lightbox').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox(event) {
    if (event.target.closest('.lightbox-nav') || event.target.closest('.lightbox-counter')) return;
    document.getElementById('lightbox').classList.remove('active');
    document.body.style.overflow = '';
  }

  function updateLightboxImage() {
    const photo = productPhotos[currentPhotoIndex];
    if (!photo) return;

    document.getElementById('lightbox-img').src = photo.url;
    document.getElementById('lightbox-counter').textContent =
      productPhotos.length > 1
        ? \`\${currentPhotoIndex + 1} / \${productPhotos.length}\`
        : '';

    // Deshabilitar botones si no hay más fotos
    document.getElementById('btn-prev').disabled = currentPhotoIndex === 0;
    document.getElementById('btn-next').disabled = currentPhotoIndex === productPhotos.length - 1;
  }

  function prevPhoto(event) {
    event.stopPropagation();
    if (currentPhotoIndex > 0) {
      currentPhotoIndex--;
      updateLightboxImage();
    }
  }

  function nextPhoto(event) {
    event.stopPropagation();
    if (currentPhotoIndex < productPhotos.length - 1) {
      currentPhotoIndex++;
      updateLightboxImage();
    }
  }

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('lightbox').classList.contains('active')) {
      document.getElementById('lightbox').classList.remove('active');
      document.body.style.overflow = '';
    }
    // Navegación con flechas
    if (e.key === 'ArrowLeft') prevPhoto(e);
    if (e.key === 'ArrowRight') nextPhoto(e);
  });
</script>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log('[Tienda API] Iniciando...');
    console.log('[Tienda API] Firebase config:', {
      projectId: process.env.FIREBASE_PROJECT_ID,
      hasApiKey: !!process.env.FIREBASE_API_KEY
    });

    const todos = await obtenerProductos();
    console.log('[Tienda API] Productos obtenidos:', todos.length);

    const propios = todos.filter(p => p.modalidad === 'propio');
    const pedidos = todos.filter(p => p.modalidad === 'pedido');
    const host = req.headers.host || 'opengravity.vercel.app';

    const html = buildHTML(propios, pedidos, host);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.send(html);
  } catch (err: any) {
    console.error('[Tienda API] Error:', err);
    res.status(500).send(`<h1>Error cargando la tienda: ${err.message}</h1><pre>${err.stack}</pre>`);
  }
}