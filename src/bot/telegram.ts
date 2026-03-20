import { Bot, InputFile, InputMediaPhoto } from 'grammy';
import { env } from '../config/env.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudioUrl, generateSpeechElevenLabs } from '../audio/services.js';
import { inventarioDB } from '../inventory/db.js';
import { analizarFotoMercancia, generarTextoVenta } from '../inventory/vision.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// ── Sessión temporal para el flujo de carga de inventario ──────────────────
// Guardamos el estado de conversación pendiente de fotos
const pendingPhotoSessions: Record<number, {
  fileId: string;
  fileUrl: string;
  analisis?: { tipo: string; descripcion: string; confianza: string };
  proveedor?: string;
  precio?: string;
  esperandoCampo?: 'proveedor' | 'precio' | 'confirmar';
}> = {};

// ── Middleware de seguridad ────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  if (ctx.from && env.TELEGRAM_ALLOWED_USER_IDS.includes(ctx.from.id)) {
    await next();
  } else if (ctx.from) {
    console.log(`[Seguridad] Usuario bloqueado: ${ctx.from.id}`);
    await ctx.reply('No estás autorizado para hablar conmigo.');
  }
});

// ── /start ─────────────────────────────────────────────────────────────────
bot.command('start', ctx => {
  ctx.reply(
    `🤖 *Hola Bahjet, OpenGravity activo y listo.*\n\n` +
    `📦 *Sistema de Inventario disponible:*\n` +
    `• Envía una foto para guardar mercancía\n` +
    `• /inventario – Ver todo el stock\n` +
    `• /proveedores – Ver lista de proveedores\n` +
    `• /tipos – Ver categorías disponibles\n` +
    `• /franelas, /pantalones, /zapatos, etc. – Catálogo por tipo\n` +
    `• /proveedor [nombre] – Ver mercancía de un proveedor\n` +
    `• /post [tipo] – Generar publicación para WhatsApp/IG`,
    { parse_mode: 'Markdown' }
  );
});

// ── /inventario ─────────────────────────────────────────────────────────────
bot.command('inventario', async ctx => {
  const productos = await inventarioDB.obtener();
  if (productos.length === 0) return ctx.reply('📭 No hay productos en el inventario todavía.');
  await ctx.reply(`📦 *${productos.length} producto(s) en stock:*`, { parse_mode: 'Markdown' });

  // Mandamos las fotos en grupos de 10 (limit de Telegram)
  for (let i = 0; i < productos.length; i += 10) {
    const grupo = productos.slice(i, i + 10);
    const media = grupo.map((p, idx) => ({
      type: 'photo' as const,
      media: p.foto_file_id,
      ...(idx === 0 ? { caption: grupo.map(pr => `🏷️ ${pr.tipo} – ${pr.proveedor} – ${pr.precio || 'Sin precio'}`).join('\n') } : {})
    }));
    await ctx.replyWithMediaGroup(media);
  }
});

// ── /proveedores ─────────────────────────────────────────────────────────────
bot.command('proveedores', async ctx => {
  const proveedores = await inventarioDB.listarProveedores();
  if (proveedores.length === 0) return ctx.reply('📭 No hay proveedores registrados.');
  await ctx.reply(`👥 *Proveedores con stock:*\n\n${proveedores.map(p => `• ${p}`).join('\n')}`, { parse_mode: 'Markdown' });
});

// ── /tipos ─────────────────────────────────────────────────────────────────
bot.command('tipos', async ctx => {
  const tipos = await inventarioDB.listarTipos();
  if (tipos.length === 0) return ctx.reply('📭 No hay categorías registradas.');
  await ctx.reply(`🗂️ *Tipos de mercancía disponibles:*\n\n${tipos.map(t => `• /${t.replace(/\s+/g, '_')}`).join('\n')}\n\n_Usa /[tipo] para ver el catálogo_`, { parse_mode: 'Markdown' });
});

// ── /proveedor [nombre] ─────────────────────────────────────────────────────
bot.command('proveedor', async ctx => {
  const nombre = ctx.match?.trim();
  if (!nombre) return ctx.reply('Usa el formato: /proveedor [nombre]\nEj: /proveedor Maria');

  const productos = await inventarioDB.obtener({ proveedor: nombre });
  if (productos.length === 0) return ctx.reply(`📭 No hay stock del proveedor "${nombre}".`);

  await ctx.reply(`📦 *${productos.length} producto(s) de ${nombre}:*`, { parse_mode: 'Markdown' });
  for (let i = 0; i < productos.length; i += 10) {
    const grupo = productos.slice(i, i + 10);
    const media = grupo.map((p, idx) => ({
      type: 'photo' as const,
      media: p.foto_file_id,
      ...(idx === 0 ? { caption: grupo.map(pr => `🏷️ ${pr.tipo} – ${pr.precio || 'Sin precio'}\n${pr.nombre}`).join('\n\n') } : {})
    }));
    await ctx.replyWithMediaGroup(media);
  }
});

// ── /post [tipo] – Genera texto de venta para un producto aleatorio ──────────
bot.command('post', async ctx => {
  const tipo = ctx.match?.trim();
  const productos = tipo ? await inventarioDB.obtener({ tipo }) : await inventarioDB.obtener();
  if (productos.length === 0) return ctx.reply('📭 No hay productos para generar el post.');

  const producto = productos[Math.floor(Math.random() * productos.length)];
  const texto = await generarTextoVenta(producto);

  await ctx.replyWithPhoto(producto.foto_file_id, {
    caption: `✅ *Post generado para WhatsApp/IG:*\n\n${texto}\n\n_📋 Copia el texto y pégalo en tu estado_`,
    parse_mode: 'Markdown'
  });
});

// ── Comandos dinámicos por tipo: /franelas, /pantalones, etc. ─────────────────
bot.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.toLowerCase().trim();
  const session = pendingPhotoSessions[ctx.from.id];

  // ── Si hay una sesión de foto pendiente, manejamos la respuesta del usuario ──
  if (session) {
    if (session.esperandoCampo === 'proveedor') {
      session.proveedor = ctx.message.text.trim();
      session.esperandoCampo = 'precio';
      await ctx.reply('💰 ¿Cuál es el precio? (Escribe el precio o "sin precio" para omitirlo)');
      return;
    }

    if (session.esperandoCampo === 'precio') {
      const precioBruto = ctx.message.text.trim();
      session.precio = precioBruto.toLowerCase() === 'sin precio' ? undefined : precioBruto;
      session.esperandoCampo = 'confirmar';

      const analisis = session.analisis;
      await ctx.reply(
        `📋 *Resumen del producto:*\n\n` +
        `🏷️ Tipo: ${analisis?.tipo || 'Sin detectar'}\n` +
        `📝 Descripción: ${analisis?.descripcion || 'N/A'}\n` +
        `👤 Proveedor: ${session.proveedor}\n` +
        `💰 Precio: ${session.precio || 'Sin precio'}\n\n` +
        `¿Confirmo y guardo? Responde *sí* o *no*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (session.esperandoCampo === 'confirmar') {
      if (/^s[ií]|yes|ok|claro|dale|afirm/i.test(text)) {
        const analisis = session.analisis;
        await inventarioDB.agregar({
          proveedor: session.proveedor!,
          tipo: analisis?.tipo || 'otro',
          nombre: analisis?.descripcion || 'Producto sin clasificar',
          precio: session.precio,
          foto_url: session.fileUrl,
          foto_file_id: session.fileId,
          disponible: true,
          fecha_carga: new Date().toISOString()
        });
        delete pendingPhotoSessions[ctx.from.id];
        await ctx.reply('✅ *Producto guardado en el inventario exitosamente!* 🎉', { parse_mode: 'Markdown' });
      } else {
        delete pendingPhotoSessions[ctx.from.id];
        await ctx.reply('❌ Guardado cancelado. Puedes enviar la foto de nuevo cuando quieras.');
      }
      return;
    }
  }

  // ── Comandos de catálogo dinámico: /franelas, /pantalon, etc. ────────────────
  if (text.startsWith('/') && !['start', 'inventario', 'proveedores', 'tipos', 'proveedor', 'post'].some(c => text === `/${c}` || text.startsWith(`/${c} `))) {
    const tipoCmd = text.slice(1).replace(/_/g, ' ').trim();
    const productos = await inventarioDB.obtener({ tipo: tipoCmd });
    if (productos.length > 0) {
      await ctx.reply(`🗂️ *Catálogo de ${tipoCmd}s (${productos.length} disponibles):*`, { parse_mode: 'Markdown' });
      for (let i = 0; i < productos.length; i += 10) {
        const grupo = productos.slice(i, i + 10);
        const media = grupo.map((p, idx) => ({
          type: 'photo' as const,
          media: p.foto_file_id,
          ...(idx === 0 ? { caption: grupo.map(pr => `👤 ${pr.proveedor} – 💰 ${pr.precio || 'Sin precio'}`).join('\n') } : {})
        }));
        await ctx.replyWithMediaGroup(media);
      }
      return;
    }
  }

  // Detectar si el usuario dice que algo ya no está disponible (sin foto adjunta)
  if (/no (est[áa]|hay|tengo)|agotad|vendid|elimina/i.test(text)) {
    await ctx.reply('📸 Envíame la foto del producto que quieres marcar como no disponible y escríbeme "eliminar" junto a ella.');
    return;
  }

  // ── Flujo normal de chat IA ───────────────────────────────────────────────
  await next();
}, async ctx => {
  const userId = ctx.from.id;
  try {
    const text = ctx.message.text;
    const wantsVoice = /voz|audio|habla/i.test(text);
    const response = await processUserMessage(userId, text);
    const finalResp = response || 'No tengo respuesta para eso.';

    if (wantsVoice && env.ELEVENLABS_API_KEY) {
      const audioBuffer = await generateSpeechElevenLabs(finalResp);
      await ctx.replyWithVoice(new InputFile(audioBuffer, 'voice.mp3'), { caption: finalResp.substring(0, 1000) });
    } else {
      await ctx.reply(finalResp);
    }
  } catch (error: any) {
    console.error('[Error de Telegram]', error);
    await ctx.reply(`Oops, ocurrió un error: ${error.message}`);
  }
});

// ── MANEJO DE FOTOS ──────────────────────────────────────────────────────────
bot.on('message:photo', async ctx => {
  const userId = ctx.from.id;
  try {
    // La foto de mayor resolución siempre es la última del array
    const foto = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = foto.file_id;
    const caption = ctx.message.caption?.trim() || '';

    // ── ¿El usuario dijo "eliminar" junto a la foto? ─────────────────────────
    if (/elimina|ya no (est[áa]|tengo|hay)|borr[ao]/i.test(caption)) {
      const producto = await inventarioDB.obtenerPorFileId(fileId);
      if (!producto) {
        await ctx.reply('⚠️ No encontré este producto en el inventario. ¿Está guardado con otra foto?');
        return;
      }
      await inventarioDB.eliminar(producto.id!);
      await ctx.reply(`✅ *${producto.nombre}* (${producto.proveedor}) eliminado del inventario.`, { parse_mode: 'Markdown' });
      return;
    }

    // ── Obtenemos la URL pública de la foto ────────────────────────────────
    const fileInfo = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    // ── Analizamos la foto con IA de visión ────────────────────────────────
    const processingMsg = await ctx.reply('📸 Analizando la foto con IA...');
    const analisis = await analizarFotoMercancia(fileUrl);

    // ── Si el caption tiene info (proveedor/precio), la extraemos con IA ──
    let proveedor: string | undefined;
    let precio: string | undefined;

    if (caption) {
      // Intentamos extraer proveedor y precio del caption
      const precioMatch = caption.match(/\$[\d,.]+|[\d,.]+\s*(bs|bolivares|usd|\$)/i);
      precio = precioMatch ? precioMatch[0] : undefined;
      
      // El proveedor es el texto que no es precio
      const textoSinPrecio = caption.replace(/\$[\d,.]+|[\d,.]+\s*(bs|bolivares|usd|\$)/gi, '').trim();
      proveedor = textoSinPrecio || undefined;
    }

    // Si tenemos todos los datos, guardamos directamente
    if (proveedor) {
      await inventarioDB.agregar({
        proveedor,
        tipo: analisis?.tipo || 'otro',
        nombre: analisis?.descripcion || 'Producto',
        precio,
        foto_url: fileUrl,
        foto_file_id: fileId,
        disponible: true,
        fecha_carga: new Date().toISOString()
      });
      await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      await ctx.reply(
        `✅ *Producto guardado automáticamente:*\n\n` +
        `🏷️ Tipo: ${analisis?.tipo || 'otro'}\n` +
        `📝 ${analisis?.descripcion || 'Producto'}\n` +
        `👤 Proveedor: ${proveedor}\n` +
        `💰 Precio: ${precio || 'Sin precio'}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Si no hay datos suficientes, iniciamos el flujo de preguntas
    pendingPhotoSessions[userId] = {
      fileId,
      fileUrl,
      analisis: analisis || undefined,
      esperandoCampo: 'proveedor'
    };

    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);

    const detectado = analisis
      ? `🔍 Detecté: *${analisis.tipo}* – ${analisis.descripcion} (confianza: ${analisis.confianza})`
      : '🔍 No pude identificar el tipo de artículo automáticamente.';

    await ctx.reply(
      `${detectado}\n\n👤 ¿De qué proveedor es esta mercancía?`,
      { parse_mode: 'Markdown' }
    );

  } catch (error: any) {
    console.error('[Error Foto]', error);
    await ctx.reply(`Error procesando la foto: ${error.message}`);
  }
});

// ── MANEJO DE VOZ ─────────────────────────────────────────────────────────────
bot.on('message:voice', async ctx => {
  const userId = ctx.from.id;
  try {
    const fileId = ctx.message.voice.file_id;
    const pendingMsg = await ctx.reply('🎧 Analizando tu nota de voz...');

    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const transcript = await transcribeAudioUrl(fileUrl);
    await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🎙️ Me dijiste:\n"${transcript}"\n\n🤔 Analizando...`);

    const contextTranscript = `(Nota de voz, responde SIEMPRE en perfecto Español): ${transcript}`;
    const response = await processUserMessage(userId, contextTranscript);
    const finalResp = response || 'No detecté ninguna acción.';

    if (env.ELEVENLABS_API_KEY) {
      await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🗣️ Generando respuesta de voz...`);
      const audioBuffer = await generateSpeechElevenLabs(finalResp);
      await ctx.replyWithVoice(new InputFile(audioBuffer, 'voice.mp3'), { caption: finalResp.substring(0, 1000) });
      await ctx.api.deleteMessage(ctx.chat.id, pendingMsg.message_id);
    } else {
      await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, finalResp);
    }
  } catch (error: any) {
    console.error('[Error de Voz]', error);
    await ctx.reply(`Error en nota de voz: ${error.message}`);
  }
});

// ── Error global ──────────────────────────────────────────────────────────────
bot.catch(err => {
  console.error(`[Grammy Error Global]`, err);
});

export const startBot = async () => {
  console.log(`[Telegram] Iniciando bot con long-polling...`);
  await bot.start();
};
