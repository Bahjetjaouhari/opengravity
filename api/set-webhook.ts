import { bot } from "../src/bot/telegram.js";

/**
 * Endpoint para registrar el webhook en Telegram.
 * Llamar una sola vez después de desplegar en Vercel.
 *
 * Uso: GET /api/set-webhook
 *
 * En producción, usa VERCEL_URL (automáticamente seteada por Vercel)
 * o WEBHOOK_URL si necesitas especificar una URL personalizada.
 */
export default async function handler(req: Request) {
  // Verificar que sea un GET request
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Obtener la URL del webhook
    // VERCEL_URL es seteada automáticamente por Vercel en producción
    // WEBHOOK_URL puede usarse para override manual
    const vercelUrl = process.env.VERCEL_URL;
    const webhookUrl = process.env.WEBHOOK_URL;

    let baseUrl: string;

    if (webhookUrl) {
      // URL manual especificada
      baseUrl = webhookUrl;
    } else if (vercelUrl) {
      // URL automática de Vercel (ya incluye https://)
      baseUrl = `https://${vercelUrl}`;
    } else {
      return new Response(
        JSON.stringify({
          error: "No se puede determinar la URL del webhook",
          hint: "Agrega WEBHOOK_URL en las variables de entorno de Vercel",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const fullWebhookUrl = `${baseUrl}/api/webhook`;

    // Registrar el webhook en Telegram
    const result = await bot.api.setWebhook(fullWebhookUrl, {
      allowed_updates: ["message", "edited_message", "callback_query"],
    });

    if (result) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Webhook registrado exitosamente",
          webhook_url: fullWebhookUrl,
          instructions:
            "Tu bot ahora funcionará 24/7. Puedes verificar el estado en /api/webhook-info",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Telegram rechazó el registro del webhook",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Error registrando webhook:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}