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

    // Crear URL para compartir a WhatsApp
    const whatsappShareUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(mensajeWhatsappCorto)}`;

    // Mensaje para Telegram con formato WhatsApp
    const mensajeTelegramWhatsapp =
      `📱 *PARA WHATSAPP STATUS*\n\n` +
      `${mensajeWhatsappCorto}\n\n` +
      `──────────────\n` +
      `💡 Reenvía este mensaje a tu estado de WhatsApp`;

    // Botones para WhatsApp
    const keyboardWhatsapp = {
      inline_keyboard: [
        [
          {
            text: '📱 Abrir WhatsApp',
            url: whatsappShareUrl
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
    const mensajeMarketing = getMensajeSimple(producto.tipos);

    // Mensaje para Telegram con formato Instagram
    const mensajeTelegramInstagram =
      `📷 *PARA INSTAGRAM HISTORIA*\n\n` +
      `✨ *${nombre}*\n\n` +
      `${precio !== 'Sin precio' ? `💰 REF ${precio}\n\n` : ''}` +
      `${mensajeMarketing}\n\n` +
      `📦 Pide el catálogo digital para más modelos 📲\n\n` +
      `──────────────\n` +
      `💡 Copia el texto y pega en tu historia de Instagram`;

    // Botones para Instagram
    const keyboardInstagram = {
      inline_keyboard: [
        [
          {
            text: '🛒 Ver en Tienda',
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