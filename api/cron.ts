import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inventarioDB } from '../src/inventory/db.js';

export const config = { maxDuration: 30 };

/**
 * Cron Job diario — Vercel lo llama automáticamente según vercel.json
 * Elige una foto aleatoria del inventario y la manda al bot como recordatorio
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificamos que solo Vercel cron lo puede llamar (no usuarios externos)
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
    // Elegir un producto aleatorio (preferimos los propios para vender primero)
    const propios = await inventarioDB.obtener({ modalidad: 'propio' });
    const todos = await inventarioDB.obtener();
    const pool = propios.length > 0 ? propios : todos;

    if (pool.length === 0) {
      return res.json({ ok: true, message: 'No hay productos en el inventario' });
    }

    const producto = pool[Math.floor(Math.random() * pool.length)];
    const precio = inventarioDB.getPrecioParaTipo(producto);
    const tipos = producto.tipos.join(' y ');
    const esPropio = producto.modalidad === 'propio';

    const texto =
      `📸 *Recordatorio diario de publicación*\n\n` +
      `🏷️ *${tipos.toUpperCase()}*\n` +
      `💰 ${precio}\n` +
      `${esPropio ? '✅ Disponible inmediatamente' : '📦 Por pedido'}\n\n` +
      `📱 *Texto para tu estado:*\n` +
      `_"🔥 ${tipos} disponible${esPropio ? '' : ' por pedido'}${precio !== 'Sin precio' ? ` • ${precio}` : ''} • Escríbeme para más info ✨"_\n\n` +
      `💡 Usa /post para generar un texto más elaborado con IA.`;

    // Enviar la foto con el recordatorio
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: producto.foto_file_id,
        caption: texto,
        parse_mode: 'Markdown'
      })
    });

    return res.json({ ok: true, producto: producto.id });
  } catch (err: any) {
    console.error('[Cron Diario]', err);
    return res.status(500).json({ error: err.message });
  }
}
