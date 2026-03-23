import { bot } from "../src/bot/telegram.js";

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
    const info = await bot.api.getWebhookInfo();

    return new Response(
      JSON.stringify({
        url: info.url || "No configurado",
        has_webhook: info.url.length > 0,
        pending_update_count: info.pending_update_count,
        last_error_date: info.last_error_date
          ? new Date(info.last_error_date * 1000).toISOString()
          : null,
        last_error_message: info.last_error_message || null,
        max_connections: info.max_connections,
        allowed_updates: info.allowed_updates || [],
        status: info.url.length > 0 ? "✅ Webhook activo" : "❌ Sin webhook (bot en modo polling local)",
        instructions:
          info.url.length === 0
            ? "Ejecuta /api/set-webhook para registrar el webhook"
            : "El webhook está configurado correctamente",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
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