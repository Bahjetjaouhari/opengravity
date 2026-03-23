/**
 * Endpoint para registrar el webhook en Telegram.
 * Llamar una sola vez después de desplegar en Vercel.
 *
 * Uso: GET /api/set-webhook
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
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "TELEGRAM_BOT_TOKEN no está configurado en Vercel",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
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

    // Llamada directa a la API de Telegram (sin depender del bot)
    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullWebhookUrl,
          allowed_updates: ["message", "edited_message", "callback_query"],
        }),
      }
    );

    const result = await response.json();

    if (result.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "✅ Webhook registrado exitosamente",
          webhook_url: fullWebhookUrl,
          telegram_response: result,
          instructions:
            "Tu bot ahora funcionará 24/7. Apaga tu PC y prueba enviar un mensaje al bot.",
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
          telegram_response: result,
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