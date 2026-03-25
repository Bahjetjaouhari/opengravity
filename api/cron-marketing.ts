import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inventarioDB } from '../src/inventory/db.js';
import { getMensajeWhatsAppStatus, getMensajeTelegramMarketing, getMensajeSimple } from '../src/marketing/messages.js';
import { filtrarProductosDisponibles, registrarProductoEnviado } from '../src/marketing/tracking.js';

export const config = { maxDuration: 30 };

/**
 * Cron Job de Marketing para Telegram
 * Envía 2 mensajes diarios a Telegram (12:00 PM):
 * 1. Post para WhatsApp Status (mensaje corto)
 * 2. Post para Instagram (mensaje de marketing)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar autenticación (solo Vercel cron puede llamar)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
  const host = req.headers.host || 'opengravity.vercel.app';

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Faltan variables de entorno' });
  }

  try {
    console.log('[Cron Marketing] Iniciando...');

    // Obtener todos los productos disponibles
    const productos = await inventarioDB.obtener();

    if (productos.length === 0) {
      return res.json({ ok: true, message: 'No hay productos en el inventario' });
    }

    // Filtrar productos enviados en los últimos 7 días
    const productosDisponibles = await filtrarProductosDisponibles(productos);

    if (productosDisponibles.length === 0) {
      // Si todos fueron enviados, usar cualquier producto
      console.log('[Cron Marketing] Todos los productos fueron enviados recientemente, usando cualquiera');
      productosDisponibles.push(...productos);
    }

    // Seleccionar producto aleatorio
    const producto = productosDisponibles[Math.floor(Math.random() * productosDisponibles.length)];

    // Obtener datos del producto
    const fotoPrincipal = inventarioDB.getFotoPrincipal(producto);
    const precio = inventarioDB.getPrecioParaTipo(producto);
    const nombre = producto.tipos.join(' + ');
    const fotoFileId = fotoPrincipal?.file_id || producto.foto_file_id;

    // ========================================
    // MENSAJE 1: PARA WHATSAPP STATUS
    // ========================================
    const mensajeWhatsapp = getMensajeWhatsAppStatus(producto.tipos);
    const mensajeWhatsappCorto = mensajeWhatsapp.replace(/\n\n📦 Pide el catálogo digital para más modelos 📲/, '');

    // Mensaje para Telegram con formato WhatsApp
    const mensajeTelegramWhatsapp =
      `📱 *PARA WHATSAPP STATUS*\n\n` +
      `${mensajeWhatsappCorto}\n\n` +
      `──────────────\n` +
      `💡 *Cómo compartir:*\n` +
      `1. Toca la foto para descargar\n` +
      `2. Abre WhatsApp\n` +
      `3. Ve a Estado → Mi estado\n` +
      `4. Pega el texto y la foto`;

    // Botones para WhatsApp (link a tu WhatsApp personal)
    const keyboardWhatsapp = {
      inline_keyboard: [
        [
          {
            text: '📋 Copiar Texto',
            url: `https://opengravity.vercel.app/tienda`
          }
        ]
      ]
    };

    console.log('[Cron Marketing] Enviando mensaje 1: WhatsApp Status');

    // Enviar mensaje 1
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: fotoFileId,
        caption: mensajeTelegramWhatsapp,
        parse_mode: 'Markdown',
        reply_markup: keyboardWhatsapp
      })
    });

    // ========================================
    // MENSAJE 2: PARA INSTAGRAM
    // ========================================
    const tiendaUrl = `https://${host}/tienda`;
    const instagramUrl = 'https://instagram.com/BJPRESTIGE_MEN';
    const mensajeMarketing = getMensajeSimple(producto.tipos);

    // Mensaje para Telegram con formato Instagram
    const mensajeTelegramInstagram =
      `📷 *PARA INSTAGRAM HISTORIA*\n\n` +
      `✨ *${nombre}*\n\n` +
      `${precio !== 'Sin precio' ? `💰 REF ${precio}\n\n` : ''}` +
      `${mensajeMarketing}\n\n` +
      `📦 Pide el catálogo digital para más modelos 📲\n\n` +
      `──────────────\n` +
      `💡 *Cómo publicar:*\n` +
      `1. Toca la foto para descargar\n` +
      `2. Abre Instagram\n` +
      `3. Crea una historia\n` +
      `4. Pega el texto y la foto`;

    // Botones para Instagram
    const keyboardInstagram = {
      inline_keyboard: [
        [
          {
            text: '📷 Ver Instagram',
            url: instagramUrl
          },
          {
            text: '🛒 Ver Tienda',
            url: tiendaUrl
          }
        ]
      ]
    };

    console.log('[Cron Marketing] Enviando mensaje 2: Instagram');

    // Enviar mensaje 2
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: fotoFileId,
        caption: mensajeTelegramInstagram,
        parse_mode: 'Markdown',
        reply_markup: keyboardInstagram
      })
    });

    // Registrar producto como enviado
    if (producto.id) {
      await registrarProductoEnviado(
        producto.id,
        'telegram_marketing',
        `${mensajeWhatsappCorto} | ${mensajeMarketing}`,
        producto.tipos
      );
    }

    console.log('[Cron Marketing] Mensajes enviados exitosamente');

    return res.json({
      ok: true,
      producto: producto.id,
      tipo: 'telegram_marketing',
      mensajes_enviados: 2
    });

  } catch (err: any) {
    console.error('[Cron Marketing] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}