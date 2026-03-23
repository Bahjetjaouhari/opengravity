import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint para registrar el webhook en Telegram.
 * Uso: GET /api/set-webhook
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
        error: 'TELEGRAM_BOT_TOKEN no está configurado en Vercel',
      });
    }

    // Obtener la URL del webhook
    const vercelUrl = process.env.VERCEL_URL;
    const webhookUrl = process.env.WEBHOOK_URL;

    let baseUrl: string;

    if (webhookUrl) {
      baseUrl = webhookUrl;
    } else if (vercelUrl) {
      baseUrl = `https://${vercelUrl}`;
    } else {
      return res.status(500).json({
        error: 'No se puede determinar la URL del webhook',
        hint: 'Agrega WEBHOOK_URL en las variables de entorno de Vercel',
      });
    }

    const fullWebhookUrl = `${baseUrl}/api/webhook`;

    // Llamada directa a la API de Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: fullWebhookUrl,
          allowed_updates: ['message', 'edited_message', 'callback_query'],
        }),
      }
    );

    const result = await response.json();

    if (result.ok) {
      return res.status(200).json({
        success: true,
        message: '✅ Webhook registrado exitosamente',
        webhook_url: fullWebhookUrl,
        telegram_response: result,
        instructions: 'Tu bot ahora funcionará 24/7. Apaga tu PC y prueba enviar un mensaje al bot.',
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Telegram rechazó el registro del webhook',
        telegram_response: result,
      });
    }
  } catch (error) {
    console.error('Error registrando webhook:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}