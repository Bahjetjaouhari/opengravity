import { Bot } from 'grammy';
import { env } from '../config/env.js';
import { processUserMessage } from '../agent/loop.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Middleware de autenticación (Whitelist)
bot.use(async (ctx, next) => {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  if (!env.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
    console.warn(`[Seguridad] Acceso denegado al usuario: ${userId} (@${ctx.from.username})`);
    await ctx.reply("Lo siento, no tienes autorización para interactuar con este agente.");
    return;
  }

  await next();
});

// Comandos básicos
bot.command("start", async (ctx) => {
  await ctx.reply("¡Hola! Soy OpenGravity, tu agente de IA personal. ¿En qué te puedo ayudar hoy?");
});

// Manejador de mensajes de texto
bot.on("message:text", async (ctx) => {
  const userId = ctx.from!.id;
  const text = ctx.message.text;

  // Enviar acción de "escribiendo..."
  await ctx.replyWithChatAction("typing");

  try {
    const response = await processUserMessage(userId, text);
    
    const finalResponse = response ? response : "El agente no proporcionó una respuesta textual (posiblemente ejecutó una herramienta sin generar un comentario final).";
    
    await ctx.reply(finalResponse);
  } catch (err: any) {
    console.error(`[Telegram Error] error procesando mensaje:`, err);
    await ctx.reply(`Ocurrió un error procesando tu solicitud: ${err.message}`);
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
