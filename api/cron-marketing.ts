import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inventarioDB } from '../src/inventory/db.js';
import { getMensajeTelegramMarketing } from '../src/marketing/messages.js';
import { filtrarProductosDisponibles, registrarProductoEnviado } from '../src/marketing/tracking.js';

export const config = { maxDuration: 30 };

/**
 * Cron Job de Marketing para Telegram
 * Envía un post de marketing diario a Telegram (12:00 PM)
 * El usuario puede compartirlo en Instagram/Facebook
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar autenticación (solo Vercel cron puede llamar)
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

    // Generar mensaje de marketing
    const mensaje = getMensajeTelegramMarketing(producto.tipos, nombre, precio);

    console.log('[Cron Marketing] Enviando producto:', producto.id);

    // Enviar a Telegram
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: fotoPrincipal?.file_id || producto.foto_file_id,
        caption: mensaje,
        parse_mode: 'Markdown'
      })
    });

    if (!telegramResponse.ok) {
      const error = await telegramResponse.text();
      console.error('[Cron Marketing] Error de Telegram:', error);
      return res.status(500).json({ error: 'Error enviando a Telegram' });
    }

    // Registrar producto como enviado
    if (producto.id) {
      await registrarProductoEnviado(
        producto.id,
        'telegram_marketing',
        mensaje,
        producto.tipos
      );
    }

    console.log('[Cron Marketing] Producto enviado exitosamente');

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