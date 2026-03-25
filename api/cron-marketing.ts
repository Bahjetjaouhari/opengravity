import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inventarioDB } from '../src/inventory/db.js';
import { filtrarProductosDisponibles, registrarProductoEnviado } from '../src/marketing/tracking.js';

export const config = { maxDuration: 30 };

/**
 * Mensajes promocionales para WhatsApp Status
 */
function getMensajeWhatsAppPromocional(tipos: string[], precio: string): string {
  const nombre = tipos.join(' + ');
  const precioTexto = precio !== 'Sin precio' ? `💰 ${precio}` : '';

  const promociones = [
    `🔥 ¡OFERTA ESPECIAL! 🔥\n\n${nombre}\n${precioTexto}\n\n✨ Los mejores precios del mercado\n📦 Disponible ahora\n📲 Escríbeme para más info`,
    `⭐ EXCLUSIVO ⭐\n\n${nombre}\n${precioTexto}\n\n💎 Calidad premium garantizada\n🔥 ¡Pocos disponibles!\n📱 Contáctame YA`,
    `🎯 ¡NO TE LO PIERDAS! 🎯\n\n${nombre}\n${precioTexto}\n\n💸 Precio especial por tiempo limitado\n🚀 Envío inmediato\n📲 Pide el catálogo completo`,
    `💥 OFERTÓN 💥\n\n${nombre}\n${precioTexto}\n\n⭐ Mejores marcas, mejores precios\n🎁 Stock disponible\n📱 Escríbeme para comprar`,
    `🛍️ ¡LO QUIERES, LO TIENES! 🛍️\n\n${nombre}\n${precioTexto}\n\n💎 Producto premium\n🔥 ¡Últimas unidades!\n📲 Contáctame ahora`
  ];

  return promociones[Math.floor(Math.random() * promociones.length)];
}

/**
 * Mensajes promocionales para Instagram
 */
function getMensajeInstagramPromocional(tipos: string[], precio: string): string {
  const nombre = tipos.join(' + ');
  const precioTexto = precio !== 'Sin precio' ? `💰 REF ${precio}` : '';

  const promociones = [
    `✨ ${nombre}\n${precioTexto}\n\n🔥 Los mejores precios los encuentras aquí\n💎 Calidad premium garantizada\n📦 Envíos disponibles\n\n📲 Pedidos al DM o WhatsApp`,
    `⭐ ${nombre}\n${precioTexto}\n\n💼 Atención personalizada\n🚀 Disponibilidad inmediata\n💯 Tu satisfacción garantizada\n\n📱 Escríbeme para tu pedido`,
    `🎯 ${nombre}\n${precioTexto}\n\n💎 Exclusivo y único\n🔥 Precio especial\n📦 Stock limitado\n\n📲 Contáctame YA`,
    `💫 ${nombre}\n${precioTexto}\n\n✨ Destaca con estilo\n💎 Calidad superior\n🔥 ¡No te lo pierdas!\n\n📱 Pedidos por DM o WhatsApp`
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

    if (productos.length === 0) {
      return res.json({ ok: true, message: 'No hay productos en el inventario' });
    }

    // Filtrar productos enviados
    const productosDisponibles = await filtrarProductosDisponibles(productos);

    if (productosDisponibles.length === 0) {
      console.log('[Cron Marketing] Todos enviados, usando cualquiera');
      productosDisponibles.push(...productos);
    }

    // Seleccionar producto aleatorio
    const producto = productosDisponibles[Math.floor(Math.random() * productosDisponibles.length)];

    // Obtener datos del producto
    const fotoPrincipal = inventarioDB.getFotoPrincipal(producto);
    const precio = inventarioDB.getPrecioParaTipo(producto);
    const fotoFileId = fotoPrincipal?.file_id || producto.foto_file_id;

    // Generar mensajes promocionales
    const textoWhatsApp = getMensajeWhatsAppPromocional(producto.tipos, precio);
    const textoInstagram = getMensajeInstagramPromocional(producto.tipos, precio);

    // Mensaje para WhatsApp Status
    const mensajeWhatsApp =
      `📱 *TEXTO PARA WHATSAPP STATUS:*\n` +
      `\`\`\`\n${textoWhatsApp}\n\`\`\`\n\n` +
      `💡 *Toca el texto para copiar*`;

    // Mensaje para Instagram
    const mensajeInstagram =
      `📷 *TEXTO PARA INSTAGRAM:*\n` +
      `\`\`\`\n${textoInstagram}\n\`\`\`\n\n` +
      `💡 *Toca el texto para copiar*`;

    console.log('[Cron Marketing] Enviando mensaje 1: WhatsApp Status...');

    // Enviar mensaje 1: WhatsApp Status
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: fotoFileId,
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
        photo: fotoFileId,
        caption: mensajeInstagram,
        parse_mode: 'Markdown'
      })
    });

    // Registrar producto enviado
    if (producto.id) {
      await registrarProductoEnviado(
        producto.id,
        'telegram_marketing',
        mensajeWhatsApp,
        producto.tipos
      );
    }

    console.log('[Cron Marketing] Mensaje enviado exitosamente');

    return res.json({
      ok: true,
      producto: producto.id,
      tipo: 'telegram_marketing'
    });

  } catch (err: any) {
    console.error('[Cron Marketing] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}