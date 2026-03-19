import { Bot, InputFile } from 'grammy';
import { env } from '../config/env.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudioUrl, generateSpeechElevenLabs } from '../audio/services.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Middleware para validar el usuario (seguridad)
bot.use(async (ctx, next) => {
  if (ctx.from) {
    if (env.TELEGRAM_ALLOWED_USER_IDS.includes(ctx.from.id)) {
      await next();
    } else {
      console.log(`[Seguridad] Usuario bloqueado: ${ctx.from.id}`);
      await ctx.reply('No estás autorizado para hablar conmigo. Mi dueño no te ha dado acceso.');
    }
  }
});

// Mensaje de arranque inicial
bot.command('start', (ctx) => {
  ctx.reply('Hola Bahjet, tu Cerebro Artificial OpenGravity está activo y operando localmente. /start procesado.');
});

// ===== MANEJO DE MENSAJES DE TEXTO =====
bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  try {
    const text = ctx.message.text;
    const response = await processUserMessage(userId, text);
    const finalResp = response || 'No tengo respuesta para eso.';

    // Detectamos si el usuario pidió nota de voz explícitamente en su texto
    const wantsVoice = /voz|audio|habla/i.test(text.toLowerCase());
    
    if (wantsVoice && env.ELEVENLABS_API_KEY) {
      await ctx.reply('⏳ Sintetizando voz muy realista...');
      const audioBuffer = await generateSpeechElevenLabs(finalResp);
      await ctx.replyWithVoice(new InputFile(audioBuffer, 'voice.mp3'), { caption: finalResp.substring(0, 1000) });
    } else {
      await ctx.reply(finalResp);
    }
  } catch (error) {
    console.error('[Error de Telegram]', error);
    await ctx.reply('Oops, ocurrió un error interno de mi lado. Revisa la consola o espera un momento.');
  }
});

// ===== MANEJO DE MENSAJES DE VOZ (NUEVA CARACTERÍSTICA) =====
bot.on('message:voice', async (ctx) => {
  const userId = ctx.from.id;
  try {
    const fileId = ctx.message.voice.file_id;
    const pendingMsg = await ctx.reply('🎧 Analizando tu nota de voz...');
    
    // 1. Descargar audio de Telegram
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    
    // 2. Transcribir el audio usando el Whisper de Groq
    const transcript = await transcribeAudioUrl(fileUrl);
    await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🎙️ Me dijiste:\n"${transcript}"\n\n🤔 Analizando mi respuesta...`);
    
    // 3. Procesar el texto transcrito con nuestro LLM Principal forzando Español
    const contextTranscript = `(Nota de voz del usuario, responde SIEMPRE en perfecto Español): ${transcript}`;
    const response = await processUserMessage(userId, contextTranscript);
    const finalResp = response || 'No detecté ninguna acción clara para decir al respecto.';

    // 4. Si tenemos ElevenLabs, respondemos siempre con Nota de Voz cuando nos hablan en audio
    if (env.ELEVENLABS_API_KEY) {
      await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🗣️ Grabando audios con voz ultra-realista...`);
      const audioBuffer = await generateSpeechElevenLabs(finalResp);
      
      // Enviamos la voz y eliminamos el mensaje de "proceso" temporal visual
      await ctx.replyWithVoice(new InputFile(audioBuffer, 'voice.mp3'), { caption: finalResp.substring(0, 1000) });
      await ctx.api.deleteMessage(ctx.chat.id, pendingMsg.message_id);
    } else {
      // Si de pronto el usuario quita la API Key, volvemos a enviar texto normal
      await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, finalResp);
    }
  } catch (error: any) {
    console.error('[Error de Voz]', error);
    const detail = error.message || error.toString();
    await ctx.reply(`Error procesando la nota de voz. Detalle técnico: ${detail}\n\nPor favor intenta enviando texto por ahora.`);
  }
});

// Iniciar el bot y el manejo de errores global
bot.catch((err) => {
  console.error(`[Grammy Error Global]`, err);
});

export const startBot = async () => {
  console.log(`[Telegram] Iniciando bot con long-polling...`);
  await bot.start();
};
