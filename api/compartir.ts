import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';

// Inicializar Firebase
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

/**
 * Página para compartir producto en WhatsApp Status e Instagram
 * Usa las fotos almacenadas en Firebase
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).send('ID de producto requerido');
  }

  try {
    // Obtener producto desde Firebase
    const docRef = doc(db, 'inventario', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).send('Producto no encontrado');
    }

    const data = docSnap.data() as any;
    const producto = {
      id: docSnap.id,
      ...data
    };

    // Obtener la foto principal
    const fotos: any[] = producto.fotos || [];
    const fotoPrincipal = fotos.find((f: any) => f.principal) || fotos[0];
    const fotoUrl = fotoPrincipal?.url || producto.foto_url;

    // Datos del producto
    const tipos = producto.tipos?.join(' + ') || 'Producto';
    const precio = producto.precio_total || producto.precio || 'Sin precio';
    const precioFormateado = precio !== 'Sin precio' ? `REF ${precio}` : '';

    // Construir URL de la página
    const host = req.headers.host || 'opengravity.vercel.app';
    const shareUrl = `https://${host}/api/compartir?id=${id}`;
    const tiendaUrl = `https://${host}/tienda`;

    // Generar mensaje corto
    const mensajeWhatsApp = `${tipos}\n${precioFormateado}\n\n📦 Pide el catálogo digital para más modelos 📲`;
    const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(mensajeWhatsApp)}`;

    // Instagram deep link (abre Instagram)
    const instagramUrl = 'instagram://user?username=BJPRESTIGE_MEN';
    const instagramWebUrl = 'https://instagram.com/BJPRESTIGE_MEN';

    // HTML de la página
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tipos} - BJ Prestige</title>

  <!-- Open Graph para compartir -->
  <meta property="og:title" content="${tipos} - BJ Prestige">
  <meta property="og:description" content="${precioFormateado} - Disponible ahora">
  <meta property="og:image" content="${fotoUrl}">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:type" content="product">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      color: #fff;
    }
    .container {
      max-width: 400px;
      width: 100%;
    }
    .photo-container {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 16px;
      overflow: hidden;
      background: #1A1A1A;
      margin-bottom: 20px;
    }
    .photo-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .info {
      text-align: center;
      margin-bottom: 30px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #D4AF37;
    }
    .price {
      font-size: 20px;
      font-weight: 600;
      color: #F5F5F5;
    }
    .cta {
      font-size: 14px;
      color: #888;
      margin-top: 12px;
    }
    .buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: transform 0.2s, opacity 0.2s;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn-whatsapp {
      background: #25D366;
      color: white;
    }
    .btn-instagram {
      background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
      color: white;
    }
    .btn-copy {
      background: #333;
      color: white;
      border: 1px solid #444;
    }
    .btn svg {
      width: 24px;
      height: 24px;
    }
    .logo {
      text-align: center;
      margin-top: 30px;
      color: #666;
      font-size: 14px;
    }
    .logo a {
      color: #D4AF37;
      text-decoration: none;
    }

    @media (max-width: 400px) {
      .title { font-size: 20px; }
      .price { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="photo-container">
      <img src="${fotoUrl}" alt="${tipos}" onerror="this.src='https://via.placeholder.com/400x400/1a1a1a/D4AF37?text=BJ+Prestige'">
    </div>

    <div class="info">
      <div class="title">${tipos}</div>
      ${precioFormateado ? `<div class="price">${precioFormateado}</div>` : ''}
      <div class="cta">📦 Pide el catálogo digital para más modelos</div>
    </div>

    <div class="buttons">
      <a href="${whatsappUrl}" class="btn btn-whatsapp" target="_blank">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.866 9.866 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.171A11.965 11.965 0 0012.028 0C5.398 0 .067 5.331.067 11.962c0 2.108.55 4.165 1.594 5.98L.007 24l6.192-1.624a11.932 11.932 0 005.826 1.482h.005c6.629 0 12.094-5.366 12.094-11.997 0-3.203-1.246-6.213-3.512-8.473"/>
        </svg>
        Compartir a WhatsApp Status
      </a>

      <button onclick="shareToInstagram()" class="btn btn-instagram">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.668-.072-4.948-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
        Compartir a Instagram
      </button>

      <button onclick="copyText()" class="btn btn-copy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copiar texto
      </button>
    </div>

    <div class="logo">
      <a href="${tiendaUrl}">🛒 Ver tienda completa</a>
    </div>
  </div>

  <script>
    const message = \`${tipos}\\n${precioFormateado}\\n\\n📦 Pide el catálogo digital para más modelos 📲\`;
    const photoUrl = \`${fotoUrl}\`;

    function shareToInstagram() {
      // Intentar abrir la app de Instagram
      const instagramApp = 'instagram://share';
      const instagramWeb = '${instagramWebUrl}';

      // Copiar texto al portapapeles primero
      copyText();

      // Intentar abrir app de Instagram
      window.location.href = instagramApp;

      // Fallback a web después de 2 segundos
      setTimeout(function() {
        window.open(instagramWeb, '_blank');
      }, 2000);
    }

    function copyText() {
      navigator.clipboard.writeText(message).then(function() {
        alert('Texto copiado!\\n\\nAhora:\\n1. Abre Instagram\\n2. Crea una historia\\n3. Pega el texto y la foto');
      }).catch(function() {
        // Fallback para navegadores sin clipboard API
        prompt('Copia este texto:', message);
      });
    }

    // Web Share API (funciona en móviles)
    async function shareNative() {
      if (navigator.share) {
        try {
          await navigator.share({
            title: '${tipos}',
            text: message,
            url: '${shareUrl}'
          });
        } catch (err) {
          console.log('Error sharing:', err);
        }
      }
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);

  } catch (err: any) {
    console.error('[Compartir API] Error:', err);
    res.status(500).send(`Error: ${err.message}`);
  }
}