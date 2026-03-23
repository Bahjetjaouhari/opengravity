/**
 * Endpoint para verificar el estado del webhook en Telegram.
 *
 * Uso: GET /api/webhook-info
 */

export default async function handler(req: Request) {
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
          error: "TELEGRAM_BOT_TOKEN no está configurado",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Llamada directa a la API de Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );

    const result = await response.json();

    if (result.ok) {
      const info = result.result;
      return new Response(
        JSON.stringify({
          url: info.url || "No configurado",
          has_webhook: info.url && info.url.length > 0,
          pending_update_count: info.pending_update_count,
          last_error_date: info.last_error_date
            ? new Date(info.last_error_date * 1000).toISOString()
            : null,
          last_error_message: info.last_error_message || null,
          max_connections: info.max_connections,
          status:
            info.url && info.url.length > 0
              ? "✅ Webhook activo - El bot funcionará 24/7"
              : "❌ Sin webhook - El bot solo funciona con tu PC encendida",
          instructions:
            !info.url || info.url.length === 0
              ? "Visita /api/set-webhook para registrar el webhook"
              : "El webhook está configurado correctamente",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          error: "Error consultando Telegram",
          telegram_response: result,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Error obteniendo webhook info:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error desconocido",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}