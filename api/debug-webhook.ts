import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint de diagnóstico para ver qué está fallando al importar el bot.
 */
export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'local',
    node_version: process.version,
  };

  // Check environment variables
  diagnostics.env_vars = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? '✅ configurado' : '❌ NO configurado',
    TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS ? '✅ configurado' : '❌ NO configurado',
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ? '✅ configurado' : '❌ NO configurado',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? '✅ configurado' : '❌ NO configurado',
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ? '✅ configurado' : '❌ NO configurado',
  };

  // Try to import the bot
  try {
    const { bot } = await import('../src/bot/telegram.js');
    await bot.init(); // Necesario para obtener botInfo en grammy
    diagnostics.bot_import = '✅ Importado correctamente';
    diagnostics.bot_info = {
      username: bot.botInfo?.username ?? 'desconocido',
      id: bot.botInfo?.id ?? 'desconocido',
    };
  } catch (error: any) {
    diagnostics.bot_import = '❌ Error al importar';
    diagnostics.bot_error = {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      code: error.code,
    };
  }

  // Try to import env
  try {
    const { env } = await import('../src/config/env.js');
    diagnostics.env_import = '✅ Importado correctamente';
  } catch (error: any) {
    diagnostics.env_import = '❌ Error al importar';
    diagnostics.env_error = {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    };
  }

  return res.status(200).json(diagnostics);
}