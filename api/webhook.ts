import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bot } from "../src/bot/telegram.js";

// Amplía el tiempo de ejecución a 60 segundos (lo máximo en Hobby Vercel)
// para que el LLM tenga margen de pensar y usar tools sin que se corte.
export const config = {
  maxDuration: 60,
};

// Handler personalizado para Vercel que maneja el body ya parseado
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const updateId = req.body?.update_id || 'unknown';

  try {
    // Inicializar el bot si no está inicializado
    await bot.init();

    // Procesar el update directamente
    await bot.handleUpdate(req.body);

    const elapsed = Date.now() - startTime;
    console.log(`[Webhook] Update ${updateId} procesado en ${elapsed}ms`);

    return res.status(200).json({ ok: true });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';

    console.error(`[Webhook] ERROR en update ${updateId} (${elapsed}ms):`, errorMessage);
    console.error('[Webhook] Stack:', errorStack);

    // Retornar 200 para que Telegram NO reintente (los reintentos causan duplicados)
    // Pero loguear el error para debug
    return res.status(200).json({
      ok: true,
      error_logged: errorMessage,
      update_id: updateId
    });
  }
}
