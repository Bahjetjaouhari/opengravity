import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint para verificar el estado del webhook en Telegram.
 * Uso: GET /api/webhook-info
 */
export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN no está configurado',
      });
    }

    // Llamada directa a la API de Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );

    const result = await response.json();

    if (result.ok) {
      const info = result.result;
      return res.status(200).json({
        url: info.url || 'No configurado',
        has_webhook: info.url && info.url.length > 0,
        pending_update_count: info.pending_update_count,
        last_error_date: info.last_error_date
          ? new Date(info.last_error_date * 1000).toISOString()
          : null,
        last_error_message: info.last_error_message || null,
        max_connections: info.max_connections,
        status:
          info.url && info.url.length > 0
            ? '✅ Webhook activo - El bot funcionará 24/7'
            : '❌ Sin webhook - El bot solo funciona con tu PC encendida',
        instructions:
          !info.url || info.url.length === 0
            ? 'Visita /api/set-webhook para registrar el webhook'
            : 'El webhook está configurado correctamente',
      });
    } else {
      return res.status(500).json({
        error: 'Error consultando Telegram',
        telegram_response: result,
      });
    }
  } catch (error) {
    console.error('Error obteniendo webhook info:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}