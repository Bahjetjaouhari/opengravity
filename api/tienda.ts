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

function formatearPrecio(precio: string): string {
  if (!precio || precio === 'Sin precio') return 'Sin precio';
  const num = precio.replace(/[$,]/g, '');
  return `REF ${num}`;
}

function getPrecioHTML(producto: Producto): string {
  if (producto.precios && Object.keys(producto.precios).length > 0) {
    const entries = Object.entries(producto.precios);

    if (producto.precio_total) {
      const desglose = entries.map(([tipo, precio]) => {
        const tipoCap = tipo.charAt(0).toUpperCase() + tipo.slice(1);
        return `<span class="precio-item">${tipoCap}: ${formatearPrecio(precio)}</span>`;
      }).join('');

      const suma = entries.reduce((acc, [, p]) => {
        const num = parseFloat(p.replace(/[$,]/g, ''));
        return acc + (isNaN(num) ? 0 : num);
      }, 0);
      const precioTotal = parseFloat(producto.precio_total.replace(/[$,]/g, '') || '0');
      const ahorro = suma - precioTotal;
      const ahorroHTML = ahorro > 0 ? `<span class="precio-ahorro">Ahorras REF ${ahorro}!</span>` : '';

      return `
        <div class="precio-desglose">
          <div class="precio-items">${desglose}</div>
          <div class="precio-conjunto">
            <span class="precio-total-label">Conjunto:</span>
            <span class="precio-total-value">${formatearPrecio(producto.precio_total)}</span>
            ${ahorroHTML}
          </div>
        </div>`;
    }

    const desglose = entries.map(([tipo, precio]) => {
      const tipoCap = tipo.charAt(0).toUpperCase() + tipo.slice(1);
      return `<span class="precio-item">${tipoCap}: ${formatearPrecio(precio)}</span>`;
    }).join('');

    return `<div class="precio-desglose"><div class="precio-items">${desglose}</div></div>`;
  }

  const precio = producto.precio || 'Sin precio';
  return `<div class="precio">${formatearPrecio(precio)}</div>`;
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

// Extraer categorias unicas de los productos
function extraerCategorias(productos: Producto[]): string[] {
  const todosTipos = productos.flatMap(p => p.tipos);
  return [...new Set(todosTipos.map(t => t.toLowerCase().trim()))].sort();
}

function buildHTML(propios: Producto[], pedidos: Producto[], host: string): string {
  const baseUrl = `https://${host}`;
  const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
  const todasCategorias = extraerCategorias([...propios, ...pedidos]);

  const cardHTML = (p: Producto, index: number) => {
    const precioHTML = getPrecioHTML(p);
    const fotos = getTodasLasFotos(p);
    const fotoPrincipal = fotos[0];
    const tipos = p.tipos.map(t =>
      `<span class="badge">${t.charAt(0).toUpperCase() + t.slice(1)}</span>`
    ).join('');

    const fotoSrc = fotoPrincipal
      ? `${baseUrl}/api/photos?id=${fotoPrincipal.file_id}`
      : 'https://via.placeholder.com/400x400/1a1a1a/D4AF37?text=BJ+Prestige';

    const photoIndicator = fotos.length > 1
      ? `<div class="photo-count"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> ${fotos.length}</div>`
      : '';

    const precioParaWhatsApp = getPrecioParaTipo(p);
    const nombreProducto = p.tipos.join(' + ');
    const fotoPreviewUrl = fotoPrincipal
      ? `${baseUrl}/api/producto-preview?id=${encodeURIComponent(fotoPrincipal.file_id)}&nombre=${encodeURIComponent(nombreProducto)}&precio=${encodeURIComponent(precioParaWhatsApp)}`
      : '';

    const mensajeWhatsApp = `Hola BJ Prestige, me interesa ${p.tipos.join(' y ')}${precioParaWhatsApp !== 'Sin precio' ? ` (${precioParaWhatsApp})` : ''}. ¿Está disponible?${fotoPreviewUrl ? `\n\n${fotoPreviewUrl}` : ''}`;
    const waHref = whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(mensajeWhatsApp)}`
      : '#';

    const fotosDataAttr = JSON.stringify(fotos.map(f => ({ id: f.file_id, url: `${baseUrl}/api/photos?id=${f.file_id}` })));
    const fotosDataEscaped = fotosDataAttr.replace(/"/g, '&quot;');

    // Etiquetas de producto (simular aleatorio para demo)
    const badgeNuevo = Math.random() > 0.7 ? '<span class="product-badge new">Nuevo</span>' : '';
    const badgeBestSeller = Math.random() > 0.85 ? '<span class="product-badge bestseller">Best Seller</span>' : '';

    return `
    <div class="card" data-product-index="${index}" data-category="${p.tipos.join(',').toLowerCase()}">
      ${badgeNuevo}${badgeBestSeller}
      <div class="card-img-wrap" onclick="openLightbox(${index}, 0)" data-fotos='${fotosDataEscaped}'>
        <img src="${fotoSrc}"
             loading="lazy"
             onerror="this.src='https://via.placeholder.com/400x400/1a1a1a/D4AF37?text=BJ+Prestige'"
             alt="${p.tipos.join(', ')}" />
        ${photoIndicator}
        <div class="availability-tag ${p.modalidad === 'propio' ? 'tag-now' : 'tag-order'}">
          ${p.modalidad === 'propio' ? 'Disponible' : 'Por Pedido'}
        </div>
      </div>
      <div class="card-body">
        <div class="tipos">${tipos}</div>
        ${precioHTML}
        <div class="card-actions">
          <button class="btn-add-cart" onclick="addToCart(${index}, event)" data-product='${JSON.stringify({
            index,
            nombre: p.tipos.join(' + '),
            precio: precioParaWhatsApp,
            foto: fotoSrc
          }).replace(/'/g, "&#39;")}'>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
          </button>
          <a class="btn-whatsapp ${!whatsappNumber ? 'btn-disabled' : ''}"
             href="${waHref}"
             target="_blank"
             ${!whatsappNumber ? 'onclick="event.preventDefault(); alert(\'WhatsApp no configurado. Contacte al administrador.\')"' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.866 9.866 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.171A11.965 11.965 0 0012.028 0C5.398 0 .067 5.331.067 11.962c0 2.108.55 4.165 1.594 5.98L.007 24l6.192-1.624a11.932 11.932 0 005.826 1.482h.005c6.629 0 12.094-5.366 12.094-11.997 0-3.203-1.246-6.213-3.512-8.473"/>
            </svg>
            <span>Consultar</span>
          </a>
        </div>
      </div>
    </div>`;
  };

  const productosData = [...propios, ...pedidos].map(p => {
    const fotos = getTodasLasFotos(p);
    return fotos.map(f => ({
      id: f.file_id,
      url: `${baseUrl}/api/photos?id=${f.file_id}`
    }));
  });

  // Generar HTML de categorias
  const categoriasHTML = todasCategorias.slice(0, 6).map((cat, i) => {
    const iconos: Record<string, string> = {
      'reloj': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
      'gorra': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12a9 9 0 11-6.219-8.56"></path><path d="M3 12h18"></path><path d="M12 3v9"></path></svg>',
      'franela': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.64 4.47a2 2 0 001.96 1.68H6v7a2 2 0 002 2h8a2 2 0 002-2v-7h1.12a2 2 0 001.96-1.68l.64-4.47a2 2 0 00-1.34-2.23z"></path></svg>',
      'pantalon': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v16H4z"></path><path d="M12 4v16"></path></svg>',
      'zapato': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12h6l2-4h4l2 4h6"></path></svg>',
      'cadena': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="12" r="4"></circle><circle cx="16" cy="12" r="4"></circle><path d="M12 12h-4"></path></svg>',
      'joya': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 15 10-15-10-5z"></path></svg>',
      'accesorio': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"></path></svg>'
    };
    const icon = iconos[cat.toLowerCase()] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle></svg>';
    return `<button class="category-chip" onclick="filterByCategory('${cat}')">
      <span class="category-icon">${icon}</span>
      <span class="category-name">${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
    </button>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>BJ Prestige - Tienda Exclusiva</title>
  <meta name="description" content="Relojeria, accesorios y joyas exclusivas. Calidad premium garantizada." />
  <meta name="theme-color" content="#0A0A0A" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0A0A0A;
      --bg-secondary: #111111;
      --card-bg: rgba(26, 26, 26, 0.8);
      --card-border: rgba(212, 175, 55, 0.15);
      --gold: #D4AF37;
      --gold-light: #F4D03F;
      --gold-dark: #B8960C;
      --silver: #C0C0C0;
      --carbon: #1A1A1A;
      --text: #F5F5F5;
      --text-muted: #888888;
      --text-secondary: #CCCCCC;
      --success: #4CAF50;
      --warning: #FF9800;
      --now: #4CAF50;
      --order: #D4AF37;
      --glass-bg: rgba(26, 26, 26, 0.7);
      --glass-border: rgba(212, 175, 55, 0.2);
      --shadow-gold: 0 8px 32px rgba(212, 175, 55, 0.15);
      --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.4);
      --radius: 16px;
      --radius-sm: 8px;
      --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Light mode */
    [data-theme="light"] {
      --bg: #FAFAFA;
      --bg-secondary: #F5F5F5;
      --card-bg: rgba(255, 255, 255, 0.9);
      --card-border: rgba(212, 175, 55, 0.3);
      --text: #1A1A1A;
      --text-muted: #666666;
      --text-secondary: #333333;
      --glass-bg: rgba(255, 255, 255, 0.8);
      --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.1);
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Leopard pattern overlay */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: radial-gradient(ellipse 8px 12px at 20% 30%, rgba(212, 175, 55, 0.03) 0%, transparent 50%),
                        radial-gradient(ellipse 6px 10px at 80% 20%, rgba(212, 175, 55, 0.02) 0%, transparent 50%),
                        radial-gradient(ellipse 10px 8px at 40% 70%, rgba(212, 175, 55, 0.02) 0%, transparent 50%),
                        radial-gradient(ellipse 5px 7px at 70% 80%, rgba(212, 175, 55, 0.03) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }

    /* ── HEADER ── */
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: linear-gradient(180deg, var(--bg) 0%, transparent 100%);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-img {
      height: 42px;
      width: auto;
      border-radius: 4px;
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }

    .brand-name {
      font-family: 'Playfair Display', serif;
      font-size: 1.4rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 50%, var(--gold) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: 0.02em;
    }

    .brand-tagline {
      font-size: 0.65rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.15em;
      font-weight: 500;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .btn-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: var(--transition);
      color: var(--text);
      position: relative;
    }

    .btn-icon:hover {
      background: var(--gold);
      color: var(--bg);
      border-color: var(--gold);
    }

    .btn-icon svg {
      width: 20px;
      height: 20px;
    }

    .cart-count {
      position: absolute;
      top: -4px;
      right: -4px;
      background: var(--gold);
      color: var(--bg);
      font-size: 0.7rem;
      font-weight: 700;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transform: scale(0);
      transition: var(--transition);
    }

    .cart-count.visible {
      opacity: 1;
      transform: scale(1);
    }

    /* ── HERO BANNER ── */
    .hero {
      position: relative;
      padding: 2rem 1.5rem;
      text-align: center;
      background: linear-gradient(135deg, rgba(212, 175, 55, 0.05) 0%, transparent 50%, rgba(212, 175, 55, 0.03) 100%);
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(212, 175, 55, 0.1) 0%, transparent 70%);
      pointer-events: none;
    }

    .hero-title {
      font-family: 'Playfair Display', serif;
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: var(--text);
    }

    .hero-title span {
      color: var(--gold);
    }

    .hero-subtitle {
      font-size: 0.9rem;
      color: var(--text-muted);
      max-width: 400px;
      margin: 0 auto;
    }

    /* ── CATEGORY CHIPS ── */
    .categories {
      padding: 0 1rem 1rem;
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      scroll-snap-type: x mandatory;
    }

    .categories::-webkit-scrollbar { display: none; }

    .category-chip {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text);
      cursor: pointer;
      transition: var(--transition);
      scroll-snap-align: start;
    }

    .category-chip:hover, .category-chip.active {
      background: var(--gold);
      color: var(--bg);
      border-color: var(--gold);
    }

    .category-chip.active {
      box-shadow: var(--shadow-gold);
    }

    .category-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .category-icon svg {
      width: 100%;
      height: 100%;
    }

    /* ── TABS ── */
    .tabs {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      padding: 1rem 1rem 0;
      position: relative;
      z-index: 2;
    }

    .tab {
      padding: 0.6rem 1.5rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: 1.5px solid transparent;
      transition: var(--transition);
      background: transparent;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .tab.active-now {
      background: rgba(76, 175, 80, 0.12);
      border-color: var(--now);
      color: var(--now);
    }

    .tab.active-order {
      background: rgba(212, 175, 55, 0.12);
      border-color: var(--order);
      color: var(--order);
    }

    .tab:not(.active-now):not(.active-order):hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
      color: var(--text);
    }

    .tab-count {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    /* ── GRID ── */
    .section { display: none; padding: 1rem 1rem 6rem; }
    .section.visible { display: block; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
      max-width: 1200px;
      margin: 1rem auto 0;
    }

    /* ── CARD ── */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      overflow: hidden;
      transition: var(--transition);
      position: relative;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .card:hover {
      transform: translateY(-6px);
      box-shadow: var(--shadow-gold);
      border-color: var(--gold);
    }

    .product-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      z-index: 5;
    }

    .product-badge.new {
      background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%);
      color: var(--bg);
    }

    .product-badge.bestseller {
      background: linear-gradient(135deg, #E91E63 0%, #C2185B 100%);
      color: white;
    }

    .card-img-wrap {
      position: relative;
      aspect-ratio: 1/1;
      background: var(--carbon);
      overflow: hidden;
      cursor: zoom-in;
    }

    .card-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .card:hover .card-img-wrap img {
      transform: scale(1.08);
    }

    .photo-count {
      position: absolute;
      bottom: 10px;
      left: 10px;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-radius: var(--radius-sm);
      font-size: 0.7rem;
      font-weight: 600;
      color: white;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .availability-tag {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .tag-now {
      background: rgba(76, 175, 80, 0.9);
      color: white;
    }

    .tag-order {
      background: rgba(212, 175, 55, 0.9);
      color: var(--bg);
    }

    .card-body {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .tipos {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .badge {
      background: linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(212, 175, 55, 0.05) 100%);
      border: 1px solid rgba(212, 175, 55, 0.3);
      color: var(--gold);
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 3px 8px;
      text-transform: capitalize;
    }

    .precio {
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--gold);
    }

    .precio-desglose {
      margin-top: 0.2rem;
    }

    .precio-items {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .precio-item {
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 8px;
      border-radius: 4px;
      display: inline-block;
      width: fit-content;
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
      color: var(--gold);
    }

    .precio-ahorro {
      font-size: 0.7rem;
      color: var(--warning);
      background: rgba(255, 152, 0, 0.15);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .card-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .btn-add-cart {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: var(--radius-sm);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: var(--transition);
    }

    .btn-add-cart:hover {
      background: var(--gold);
      color: var(--bg);
      border-color: var(--gold);
      transform: scale(1.05);
    }

    .btn-add-cart.added {
      background: var(--success);
      border-color: var(--success);
      color: white;
      animation: pulse-success 0.5s ease;
    }

    @keyframes pulse-success {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    .btn-whatsapp {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0 1rem;
      height: 44px;
      border-radius: var(--radius-sm);
      background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
      color: white;
      font-weight: 700;
      font-size: 0.85rem;
      text-decoration: none;
      transition: var(--transition);
      position: relative;
      overflow: hidden;
    }

    .btn-whatsapp::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      transition: left 0.5s ease;
    }

    .btn-whatsapp:hover::before {
      left: 100%;
    }

    .btn-whatsapp:hover {
      transform: scale(1.02);
      box-shadow: 0 4px 20px rgba(37, 211, 102, 0.4);
    }

    .btn-whatsapp.btn-disabled {
      background: #555;
      cursor: not-allowed;
    }

    /* ── CART SIDEBAR ── */
    .cart-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 200;
      opacity: 0;
      visibility: hidden;
      transition: var(--transition);
    }

    .cart-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    .cart-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-width: 400px;
      background: var(--bg);
      border-left: 1px solid var(--card-border);
      z-index: 201;
      transform: translateX(100%);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
    }

    .cart-sidebar.active {
      transform: translateX(0);
    }

    .cart-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .cart-title {
      font-family: 'Playfair Display', serif;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--gold);
    }

    .cart-close {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: var(--transition);
    }

    .cart-close:hover {
      background: var(--gold);
      color: var(--bg);
    }

    .cart-items {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }

    .cart-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-sm);
      margin-bottom: 0.75rem;
    }

    .cart-item-img {
      width: 70px;
      height: 70px;
      border-radius: var(--radius-sm);
      object-fit: cover;
      flex-shrink: 0;
    }

    .cart-item-info {
      flex: 1;
      min-width: 0;
    }

    .cart-item-name {
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.25rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cart-item-price {
      font-size: 0.9rem;
      color: var(--gold);
      font-weight: 600;
    }

    .cart-item-qty {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .qty-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--card-bg);
      border: 1px solid var(--glass-border);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1rem;
      transition: var(--transition);
    }

    .qty-btn:hover {
      background: var(--gold);
      color: var(--bg);
    }

    .cart-item-remove {
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
      transition: var(--transition);
    }

    .cart-item-remove:hover {
      color: #E91E63;
    }

    .cart-empty {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--text-muted);
    }

    .cart-empty svg {
      width: 64px;
      height: 64px;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .cart-footer {
      padding: 1.5rem;
      border-top: 1px solid var(--card-border);
      background: var(--bg-secondary);
    }

    .cart-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .cart-total-label {
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .cart-total-value {
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--gold);
    }

    .btn-checkout {
      width: 100%;
      padding: 1rem;
      border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%);
      color: var(--bg);
      font-weight: 700;
      font-size: 1rem;
      border: none;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .btn-checkout:hover {
      transform: scale(1.02);
      box-shadow: var(--shadow-gold);
    }

    .btn-checkout:disabled {
      background: #555;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* ── LIGHTBOX ── */
    .lightbox {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 300;
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
      border-radius: var(--radius-sm);
    }

    .lightbox-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 44px;
      height: 44px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 50%;
      color: var(--text);
      font-size: 24px;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-close:hover { background: var(--gold); color: var(--bg); }

    .lightbox-nav {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
    }

    .lightbox-nav button {
      padding: 0.6rem 1.5rem;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: 0.9rem;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .lightbox-nav button:hover { background: var(--gold); color: var(--bg); }
    .lightbox-nav button:disabled { opacity: 0.3; cursor: not-allowed; }

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
      padding: 2rem 1rem;
      color: var(--text-muted);
      font-size: 0.75rem;
      border-top: 1px solid var(--card-border);
      background: var(--bg);
    }

    .footer-brand {
      font-family: 'Playfair Display', serif;
      font-size: 1.2rem;
      color: var(--gold);
      margin-bottom: 0.5rem;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      margin-top: 1rem;
    }

    .footer-links a {
      color: var(--text-muted);
      text-decoration: none;
      transition: var(--transition);
    }

    .footer-links a:hover {
      color: var(--gold);
    }

    /* ── RESPONSIVE ── */
    @media (max-width: 480px) {
      .brand-name { font-size: 1.2rem; }
      .hero-title { font-size: 1.6rem; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
      .card-body { padding: 0.75rem; }
      .precio { font-size: 1rem; }
      .categories { padding: 0 0.75rem 0.75rem; }
    }

    /* ── ANIMATIONS ── */
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .card {
      animation: fadeInUp 0.5s ease forwards;
      animation-delay: calc(var(--i, 0) * 0.05s);
      opacity: 0;
    }

    @keyframes shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }

    .skeleton {
      background: linear-gradient(90deg, var(--carbon) 25%, var(--bg-secondary) 50%, var(--carbon) 75%);
      background-size: 400px 100%;
      animation: shimmer 1.4s ease-in-out infinite;
      border-radius: var(--radius);
      aspect-ratio: 3/4;
    }
  </style>
</head>
<body>

<header>
  <div class="logo-container">
    <img src="/logo-main.jpg" alt="BJ Prestige" class="logo-img" onerror="this.style.display='none'" />
    <div class="brand-text">
      <div class="brand-name">BJ Prestige</div>
      <div class="brand-tagline">Excelencia en cada detalle</div>
    </div>
  </div>
  <div class="header-actions">
    <button class="btn-icon" onclick="toggleTheme()" aria-label="Cambiar tema">
      <svg id="theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
      <svg id="theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    </button>
    <button class="btn-icon" onclick="toggleCart()" aria-label="Ver carrito">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      <span class="cart-count" id="cart-count">0</span>
    </button>
  </div>
</header>

<section class="hero">
  <h1 class="hero-title">Descubre lo <span>Exclusivo</span></h1>
  <p class="hero-subtitle">Relojeria, accesorios y joyas de alta calidad. Cada pieza cuenta una historia.</p>
</section>

<div class="categories">
  <button class="category-chip active" onclick="filterByCategory('all')">
    <span class="category-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
    </span>
    <span class="category-name">Todos</span>
  </button>
  ${categoriasHTML}
</div>

<div class="tabs">
  <button class="tab active-now" onclick="show('now')">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
    Disponible <span class="tab-count">(${propios.length})</span>
  </button>
  <button class="tab" id="tab-order" onclick="show('order')">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
    Por Pedido <span class="tab-count">(${pedidos.length})</span>
  </button>
</div>

<!-- SECCION: DISPONIBLE AHORA -->
<section class="section visible" id="sec-now">
  ${propios.length > 0 ? `
  <div class="grid" id="grid-now">
    ${propios.map((p, i) => cardHTML(p, i)).join('')}
  </div>` : `
  <div class="empty">
    <div class="empty-icon">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
    </div>
    <p>No hay stock inmediato por ahora.<br/>Pronto habran novedades!</p>
  </div>`}
</section>

<!-- SECCION: POR PEDIDO -->
<section class="section" id="sec-order">
  ${pedidos.length > 0 ? `
  <div class="grid" id="grid-order">
    ${pedidos.map((p, i) => cardHTML(p, propios.length + i)).join('')}
  </div>` : `
  <div class="empty">
    <div class="empty-icon">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <path d="M16 10a4 4 0 0 1-8 0"></path>
      </svg>
    </div>
    <p>No hay pedidos disponibles por ahora.</p>
  </div>`}
</section>

<!-- CART SIDEBAR -->
<div class="cart-overlay" id="cart-overlay" onclick="closeCart()"></div>
<div class="cart-sidebar" id="cart-sidebar">
  <div class="cart-header">
    <h2 class="cart-title">Tu Carrito</h2>
    <button class="cart-close" onclick="closeCart()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
  <div class="cart-items" id="cart-items">
    <div class="cart-empty" id="cart-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      <p>Tu carrito esta vacio</p>
      <p style="font-size: 0.8rem; margin-top: 0.5rem;">Agrega productos para consultar por WhatsApp</p>
    </div>
  </div>
  <div class="cart-footer">
    <div class="cart-total">
      <span class="cart-total-label">Productos seleccionados</span>
      <span class="cart-total-value" id="cart-total-count">0 items</span>
    </div>
    <button class="btn-checkout" id="btn-checkout" onclick="checkoutWhatsApp()" disabled>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.866 9.866 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.171A11.965 11.965 0 0012.028 0C5.398 0 .067 5.331.067 11.962c0 2.108.55 4.165 1.594 5.98L.007 24l6.192-1.624a11.932 11.932 0 005.826 1.482h.005c6.629 0 12.094-5.366 12.094-11.997 0-3.203-1.246-6.213-3.512-8.473"/>
      </svg>
      <span>Consultar por WhatsApp</span>
    </button>
  </div>
</div>

<!-- LIGHTBOX -->
<div id="lightbox" class="lightbox" onclick="closeLightbox(event)">
  <button class="lightbox-close" onclick="closeLightbox(event)">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>
  <div class="lightbox-content" onclick="event.stopPropagation()">
    <img id="lightbox-img" class="lightbox-img" src="" alt="Foto del producto" />
  </div>
  <div class="lightbox-nav">
    <button onclick="prevPhoto(event)" id="btn-prev">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
      Anterior
    </button>
    <button onclick="nextPhoto(event)" id="btn-next">
      Siguiente
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>
  </div>
  <div class="lightbox-counter" id="lightbox-counter"></div>
</div>

<footer>
  <div class="footer-brand">BJ Prestige</div>
  <p>Catalogo actualizado en tiempo real</p>
  <p style="margin-top: 0.5rem; opacity: 0.7;">Excelencia en cada detalle</p>
</footer>

<script>
  // ===== STATE =====
  let currentProductIndex = 0;
  let currentPhotoIndex = 0;
  let productPhotos = [];
  let cart = [];
  const allProducts = ${JSON.stringify(productosData)};
  const whatsappNumber = ${whatsappNumber ? `"${whatsappNumber}"` : 'null'};

  // ===== THEME =====
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');

    const darkIcon = document.getElementById('theme-icon-dark');
    const lightIcon = document.getElementById('theme-icon-light');
    darkIcon.style.display = isDark ? 'none' : 'block';
    lightIcon.style.display = isDark ? 'block' : 'none';
  }

  // Initialize theme
  (function() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    const darkIcon = document.getElementById('theme-icon-dark');
    const lightIcon = document.getElementById('theme-icon-light');
    darkIcon.style.display = theme === 'dark' ? 'block' : 'none';
    lightIcon.style.display = theme === 'light' ? 'block' : 'none';
  })();

  // ===== TABS =====
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

  // ===== CATEGORY FILTER =====
  function filterByCategory(category) {
    document.querySelectorAll('.category-chip').forEach(chip => {
      chip.classList.toggle('active', chip.textContent.toLowerCase().includes(category.toLowerCase()) ||
        (category === 'all' && chip.textContent.toLowerCase().includes('todos')));
    });

    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
      const cardCategory = card.getAttribute('data-category') || '';
      if (category === 'all' || cardCategory.includes(category.toLowerCase())) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // ===== LIGHTBOX =====
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
        ? (currentPhotoIndex + 1) + ' / ' + productPhotos.length
        : '';

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

  // ===== CART =====
  function addToCart(productIndex, event) {
    event.stopPropagation();
    const btn = event.currentTarget;
    const data = JSON.parse(btn.getAttribute('data-product').replace(/&#39;/g, "'"));

    const existingItem = cart.find(item => item.index === productIndex);
    if (existingItem) {
      existingItem.quantity++;
    } else {
      cart.push({
        index: productIndex,
        nombre: data.nombre,
        precio: data.precio,
        foto: data.foto,
        quantity: 1
      });
    }

    // Visual feedback
    btn.classList.add('added');
    setTimeout(() => btn.classList.remove('added'), 500);

    updateCartUI();
    openCart();
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
  }

  function updateCartQuantity(index, delta) {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    updateCartUI();
  }

  function updateCartUI() {
    const countEl = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const emptyEl = document.getElementById('cart-empty');
    const totalEl = document.getElementById('cart-total-count');
    const checkoutBtn = document.getElementById('btn-checkout');

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    countEl.textContent = totalItems;
    countEl.classList.toggle('visible', totalItems > 0);

    if (cart.length === 0) {
      emptyEl.style.display = 'block';
      itemsEl.innerHTML = '';
      itemsEl.appendChild(emptyEl);
      checkoutBtn.disabled = true;
    } else {
      emptyEl.style.display = 'none';
      checkoutBtn.disabled = false;

      itemsEl.innerHTML = cart.map((item, i) =>
        '<div class="cart-item">' +
          '<img src="' + item.foto + '" alt="' + item.nombre + '" class="cart-item-img" ' +
               'onerror="this.src=\'https://via.placeholder.com/70x70/1a1a1a/D4AF37?text=BJ\'">' +
          '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + item.nombre + '</div>' +
            '<div class="cart-item-price">' + item.precio + '</div>' +
            '<div class="cart-item-qty">' +
              '<button class="qty-btn" onclick="updateCartQuantity(' + i + ', -1)">-</button>' +
              '<span>' + item.quantity + '</span>' +
              '<button class="qty-btn" onclick="updateCartQuantity(' + i + ', 1)">+</button>' +
            '</div>' +
          '</div>' +
          '<button class="cart-item-remove" onclick="removeFromCart(' + i + ')">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<polyline points="3 6 5 6 21 6"></polyline>' +
              '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1 2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>' +
            '</svg>' +
          '</button>' +
        '</div>'
      ).join('');

      itemsEl.appendChild(emptyEl);
    }

    totalEl.textContent = totalItems + ' item' + (totalItems !== 1 ? 's' : '');
  }

  function openCart() {
    document.getElementById('cart-overlay').classList.add('active');
    document.getElementById('cart-sidebar').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    document.getElementById('cart-overlay').classList.remove('active');
    document.getElementById('cart-sidebar').classList.remove('active');
    document.body.style.overflow = '';
  }

  function checkoutWhatsApp() {
    if (!whatsappNumber || cart.length === 0) return;

    var itemsText = cart.map(function(item) {
      return '- ' + item.quantity + 'x ' + item.nombre + ' (' + item.precio + ')';
    }).join('\\n');

    var message = 'Hola BJ Prestige, me interesa consultar disponibilidad de:\\n\\n' + itemsText + '\\n\\nGracias!';

    var url = 'https://wa.me/' + whatsappNumber + '?text=' + encodeURIComponent(message);
    window.open(url, '_blank');
  }

  // ===== KEYBOARD NAVIGATION =====
  document.addEventListener('keydown', (e) => {
    // Close lightbox on Escape
    if (e.key === 'Escape') {
      if (document.getElementById('lightbox').classList.contains('active')) {
        document.getElementById('lightbox').classList.remove('active');
        document.body.style.overflow = '';
      }
      if (document.getElementById('cart-sidebar').classList.contains('active')) {
        closeCart();
      }
    }
    // Navigate lightbox with arrows
    if (document.getElementById('lightbox').classList.contains('active')) {
      if (e.key === 'ArrowLeft') prevPhoto(e);
      if (e.key === 'ArrowRight') nextPhoto(e);
    }
  });

  // Initialize cart UI
  updateCartUI();
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