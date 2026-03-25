import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inventarioDB } from '../src/inventory/db.js';
import { filtrarProductosDisponibles, registrarProductoEnviado } from '../src/marketing/tracking.js';

export const config = { maxDuration: 30 };

/**
 * Mensajes promocionales para WhatsApp Status (sin precio)
 */
function getMensajeWhatsAppPromocional(tipos: string[]): string {
  const nombre = tipos.join(' + ');

  const promociones = [
    `🔥 ¡OFERTA ESPECIAL! 🔥\n\n${nombre}\n\n✨ Los mejores precios del mercado\n📦 Disponible ahora\n📲 Escríbeme para más info`,
    `⭐ EXCLUSIVO ⭐\n\n${nombre}\n\n💎 Calidad premium garantizada\n🔥 ¡Pocos disponibles!\n📱 Contáctame YA`,
    `🎯 ¡NO TE LO PIERDAS! 🎯\n\n${nombre}\n\n💸 Precio especial por tiempo limitado\n🚀 Envío inmediato\n📲 Pide el catálogo completo`,
    `💥 OFERTÓN 💥\n\n${nombre}\n\n⭐ Mejores marcas, mejores precios\n🎁 Stock disponible\n📱 Escríbeme para comprar`,
    `🛍️ ¡LO QUIERES, LO TIENES! 🛍️\n\n${nombre}\n\n💎 Producto premium\n🔥 ¡Últimas unidades!\n📲 Contáctame ahora`
  ];

  return promociones[Math.floor(Math.random() * promociones.length)];
}

/**
 * Mensajes promocionales para Instagram (sin precio)
 */
function getMensajeInstagramPromocional(tipos: string[]): string {
  const nombre = tipos.join(' + ');

  const promociones = [
    `✨ ${nombre}\n\n🔥 Los mejores precios los encuentras aquí\n💎 Calidad premium garantizada\n📦 Envíos disponibles\n\n📲 Pedidos al DM o WhatsApp`,
    `⭐ ${nombre}\n\n💼 Atención personalizada\n🚀 Disponibilidad inmediata\n💯 Tu satisfacción garantizada\n\n📱 Escríbeme para tu pedido`,
    `🎯 ${nombre}\n\n💎 Exclusivo y único\n🔥 Precio especial\n📦 Stock limitado\n\n📲 Contáctame YA`,
    `💫 ${nombre}\n\n✨ Destaca con estilo\n💎 Calidad superior\n🔥 ¡No te lo pierdas!\n\n📱 Pedidos por DM o WhatsApp`
  ];

  return promociones[Math.floor(Math.random() * promociones.length)];
}

/**
 * Cron Job de Marketing para Telegram
 * Envía 1 mensaje diario con texto copiable
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar autenticación
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Faltan variables de entorno' });
  }

  try {
    console.log('[Cron Marketing] Iniciando...');

    // Obtener productos disponibles
    const productos = await inventarioDB.obtener();
    console.log('[Cron Marketing] Productos obtenidos:', productos.length, productos.map(p => p.id));

    if (productos.length === 0) {
      return res.json({ ok: true, message: 'No hay productos en el inventario' });
    }

    // Filtrar productos enviados
    const productosDisponibles = await filtrarProductosDisponibles(productos);
    console.log('[Cron Marketing] Productos disponibles después de filtrar:', productosDisponibles.length, productosDisponibles.map(p => p.id));

    if (productosDisponibles.length === 0) {
      console.log('[Cron Marketing] Todos enviados, usando cualquiera');
      productosDisponibles.push(...productos);
    }

    // Seleccionar 2 productos aleatorios diferentes
    const productosParaEnviar = productosDisponibles.length >= 2
      ? [...productosDisponibles].sort(() => Math.random() - 0.5).slice(0, 2)
      : productosDisponibles.slice(0, 1);

    const productoWhatsApp = productosParaEnviar[0];
    const productoInstagram = productosParaEnviar[1] || productosParaEnviar[0]; // Fallback al mismo si solo hay 1

    // Obtener datos del producto para WhatsApp
    const fotoWhatsApp = inventarioDB.getFotoPrincipal(productoWhatsApp);
    const precioWhatsApp = inventarioDB.getPrecioParaTipo(productoWhatsApp);
    const fotoFileIdWhatsApp = fotoWhatsApp?.file_id || productoWhatsApp.foto_file_id;

    // Obtener datos del producto para Instagram
    const fotoInstagram = inventarioDB.getFotoPrincipal(productoInstagram);
    const precioInstagram = inventarioDB.getPrecioParaTipo(productoInstagram);
    const fotoFileIdInstagram = fotoInstagram?.file_id || productoInstagram.foto_file_id;

    // Generar textos promocionales (sin precio)
    const textoWhatsApp = getMensajeWhatsAppPromocional(productoWhatsApp.tipos);
    const textoInstagram = getMensajeInstagramPromocional(productoInstagram.tipos);

    // Mensaje para WhatsApp Status (precio fuera del cuadro)
    const mensajeWhatsApp =
      `📱 *TEXTO PARA WHATSAPP STATUS:*\n` +
      `💰 *Precio: ${precioWhatsApp}*\n\n` +
      `\`\`\`\n${textoWhatsApp}\n\`\`\`\n\n` +
      `💡 *Toca el texto para copiar*`;

    // Mensaje para Instagram (precio fuera del cuadro)
    const mensajeInstagram =
      `📷 *TEXTO PARA INSTAGRAM:*\n` +
      `💰 *Precio: REF ${precioInstagram}*\n\n` +
      `\`\`\`\n${textoInstagram}\n\`\`\`\n\n` +
      `💡 *Toca el texto para copiar*`;

    console.log('[Cron Marketing] Enviando mensaje 1: WhatsApp Status...');

    // Enviar mensaje 1: WhatsApp Status
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: fotoFileIdWhatsApp,
        caption: mensajeWhatsApp,
        parse_mode: 'Markdown'
      })
    });

    console.log('[Cron Marketing] Enviando mensaje 2: Instagram...');

    // Enviar mensaje 2: Instagram
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: fotoFileIdInstagram,
        caption: mensajeInstagram,
        parse_mode: 'Markdown'
      })
    });

    // Registrar productos enviados
    if (productoWhatsApp.id) {
      await registrarProductoEnviado(
        productoWhatsApp.id,
        'telegram_marketing',
        textoWhatsApp,
        productoWhatsApp.tipos
      );
    }
    if (productoInstagram.id && productoInstagram.id !== productoWhatsApp.id) {
      await registrarProductoEnviado(
        productoInstagram.id,
        'telegram_marketing',
        textoInstagram,
        productoInstagram.tipos
      );
    }

    console.log('[Cron Marketing] Mensajes enviados exitosamente');

    return res.json({
      ok: true,
      productos: [productoWhatsApp.id, productoInstagram.id].filter(Boolean),
      tipo: 'telegram_marketing'
    });

  } catch (err: any) {
    console.error('[Cron Marketing] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}