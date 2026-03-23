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

  try {
    // Inicializar el bot si no está inicializado
    await bot.init();

    // Procesar el update directamente
    await bot.handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
