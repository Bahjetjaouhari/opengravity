import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint de prueba que simula un mensaje de Telegram para diagnosticar errores.
 */
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Use GET or POST' });
  }

  const logs: string[] = [];
  const startTime = Date.now();

  function log(msg: string) {
    const elapsed = Date.now() - startTime;
    logs.push(`[${elapsed}ms] ${msg}`);
    console.log(msg);
  }

  try {
    log('Iniciando prueba de webhook...');

    // 1. Importar env
    log('Importando configuración...');
    const { env } = await import('../src/config/env.js');
    log(`Env cargado: TOKEN=${env.TELEGRAM_BOT_TOKEN ? '✅' : '❌'}`);

    // 2. Importar bot
    log('Importando bot...');
    const { bot } = await import('../src/bot/telegram.js');
    log('Bot importado');

    // 3. Inicializar bot
    log('Inicializando bot...');
    await bot.init();
    log(`Bot inicializado: @${bot.botInfo?.username}`);

    // 4. Simular update
    const fakeUpdate = {
      update_id: 999999,
      message: {
        message_id: 1,
        from: {
          id: parseInt(process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',')[0] || '0'),
          first_name: 'Test',
          is_bot: false,
        },
        chat: {
          id: parseInt(process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',')[0] || '0'),
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
      },
    };

    log(`Enviando update de prueba: ${JSON.stringify(fakeUpdate)}`);
    log('Procesando con bot.handleUpdate...');

    // Usar handleUpdate directamente (sin webhookCallback)
    // Cast to any porque es un update parcial para testing
    await bot.handleUpdate(fakeUpdate as any);

    log('Handler completado exitosamente!');

    return res.status(200).json({
      success: true,
      logs,
    });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    log(`Stack: ${error.stack?.split('\n').slice(0, 5).join('\n')}`);

    return res.status(500).json({
      success: false,
      logs,
      error: {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 10).join('\n'),
        name: error.name,
      },
    });
  }
}