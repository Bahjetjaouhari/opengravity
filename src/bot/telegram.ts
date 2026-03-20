import { Bot, InputFile } from 'grammy';
import { env } from '../config/env.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudioUrl, generateSpeechElevenLabs } from '../audio/services.js';
import { inventarioDB, Modalidad } from '../inventory/db.js';
import { analizarFotoMercancia, generarTextoVenta } from '../inventory/vision.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// ── Estado temporal de sesiones de carga de fotos ─────────────────────────
interface PhotoSession {
  fileId: string;
  fileUrl: string;
  analisis?: { tipos: string[]; descripcion: string; confianza: string };
  proveedor?: string;
  precio?: string;
  modalidad?: Modalidad;
  esperandoCampo?: 'proveedor' | 'precio' | 'modalidad' | 'confirmar';
}
const pendingPhotoSessions: Record<number, PhotoSession> = {};

// ── Middleware de seguridad ────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  if (ctx.from && env.TELEGRAM_ALLOWED_USER_IDS.includes(ctx.from.id)) {
    await next();
  } else if (ctx.from) {
    await ctx.reply('No estás autorizado para hablar conmigo.');
  }
});

// ── /start ─────────────────────────────────────────────────────────────────
bot.command('start', ctx => {
  ctx.reply(
    `🤖 *OpenGravity activo, Bahjet.*\n\n` +
    `📦 *Inventario:*\n` +
    `• Envía una foto para guardar mercancía\n` +
    `• /inventario – Todo el stock\n` +
    `• /propio – Solo tu stock físico\n` +
    `• /pedido – Solo catálogo por pedido\n` +
    `• /proveedores – Lista de proveedores\n` +
    `• /tipos – Categorías con stock\n` +
    `• /franelas /gorras /zapatos /pantalones etc.\n` +
    `• /proveedor [nombre] – Stock de un proveedor\n` +
    `• /post – Generar publicación WhatsApp/IG\n\n` +
    `💬 También puedes escribirme cualquier cosa para chatear.`,
    { parse_mode: 'Markdown' }
  );
});

// ── Helper: enviar catálogo de fotos ──────────────────────────────────────
async function enviarCatalogo(ctx: any, productos: any[], titulo: string) {
  if (productos.length === 0) {
    return ctx.reply(`📭 ${titulo}: Sin productos disponibles.`);
  }
  await ctx.reply(`📦 *${titulo}* (${productos.length} fotos):`, { parse_mode: 'Markdown' });
  for (let i = 0; i < productos.length; i += 10) {
    const grupo = productos.slice(i, i + 10);
    const media = grupo.map((p: any, idx: number) => ({
      type: 'photo' as const,
      media: p.foto_file_id,
      ...(idx === 0 ? {
        caption: grupo.map((pr: any) =>
          `🏷️ ${pr.tipos.join(' + ')} | 👤 ${pr.proveedor} | 💰 ${pr.precio || 'Sin precio'} | ${pr.modalidad === 'propio' ? '✅ En stock' : '📦 Por pedido'}`
        ).join('\n')
      } : {})
    }));
    await ctx.replyWithMediaGroup(media);
  }
}

// ── Comandos de Inventario ─────────────────────────────────────────────────
bot.command('inventario', async ctx => {
  const productos = await inventarioDB.obtener();
  await enviarCatalogo(ctx, productos, 'Inventario completo');
});

bot.command('propio', async ctx => {
  const productos = await inventarioDB.obtener({ modalidad: 'propio' });
  await enviarCatalogo(ctx, productos, 'Mi stock propio');
});

bot.command('pedido', async ctx => {
  const productos = await inventarioDB.obtener({ modalidad: 'pedido' });
  await enviarCatalogo(ctx, productos, 'Catálogo por pedido');
});

bot.command('proveedores', async ctx => {
  const proveedores = await inventarioDB.listarProveedores();
  if (proveedores.length === 0) return ctx.reply('📭 No hay proveedores registrados.');
  await ctx.reply(
    `👥 *Proveedores disponibles:*\n\n${proveedores.map(p => `• ${p}`).join('\n')}\n\n_Usa /proveedor [nombre] para ver su catálogo_`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('tipos', async ctx => {
  const tipos = await inventarioDB.listarTipos();
  if (tipos.length === 0) return ctx.reply('📭 No hay categorías registradas.');
  await ctx.reply(
    `🗂️ *Categorías disponibles:*\n\n${tipos.map(t => `• /${t.replace(/\s+/g, '_')}`).join('\n')}\n\n_Usa /[categoría] para ver el catálogo_`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('proveedor', async ctx => {
  const nombre = ctx.match?.trim();
  if (!nombre) return ctx.reply('Usa: /proveedor [nombre]\nEj: /proveedor Maria');
  const productos = await inventarioDB.obtener({ proveedor: nombre });
  await enviarCatalogo(ctx, productos, `Mercancía de ${nombre}`);
});

bot.command('post', async ctx => {
  const tipo = ctx.match?.trim() || undefined;
  const productos = tipo ? await inventarioDB.obtener({ tipo }) : await inventarioDB.obtener();
  if (productos.length === 0) return ctx.reply('📭 No hay productos para el post.');

  const producto = productos[Math.floor(Math.random() * productos.length)];
  const texto = await generarTextoVenta(producto);

  await ctx.replyWithPhoto(producto.foto_file_id, {
    caption: `✅ *Post para WhatsApp/IG:*\n\n${texto}\n\n_📋 Copia y pega en tu estado_`,
    parse_mode: 'Markdown'
  });
});

// ── Mensajes de texto ──────────────────────────────────────────────────────
bot.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  const session = pendingPhotoSessions[userId];

  // ── Flujo de sesión pendiente de foto ────────────────────────────────────
  if (session) {
    if (session.esperandoCampo === 'proveedor') {
      session.proveedor = text;
      session.esperandoCampo = 'precio';
      await ctx.reply('💰 ¿Precio? (Escribe el precio o "sin precio")');
      return;
    }
    if (session.esperandoCampo === 'precio') {
      session.precio = /sin precio/i.test(text) ? undefined : text;
      session.esperandoCampo = 'modalidad';
      await ctx.reply(
        '📦 ¿Esta mercancía es:\n\n1️⃣ *Propia* – La tienes físicamente en stock\n2️⃣ *Por pedido* – Es del catálogo del proveedor\n\nResponde *1* o *2*',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    if (session.esperandoCampo === 'modalidad') {
      session.modalidad = text.includes('1') || /propio|propia/i.test(text) ? 'propio' : 'pedido';
      session.esperandoCampo = 'confirmar';

      const a = session.analisis;
      const tiposTexto = a?.tipos?.join(', ') || 'Sin detectar';
      await ctx.reply(
        `📋 *Resumen:*\n\n` +
        `🏷️ Tipos detectados: ${tiposTexto}\n` +
        `📝 ${a?.descripcion || 'N/A'}\n` +
        `👤 Proveedor: ${session.proveedor}\n` +
        `💰 Precio: ${session.precio || 'Sin precio'}\n` +
        `📦 Modalidad: ${session.modalidad === 'propio' ? '✅ Stock propio' : '📦 Por pedido'}\n\n` +
        `¿Guardar? Responde *sí* o *no*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    if (session.esperandoCampo === 'confirmar') {
      if (/^s[ií]|yes|ok|claro|dale|afirm/i.test(text)) {
        const a = session.analisis;
        await inventarioDB.agregar({
          proveedor: session.proveedor!,
          tipos: a?.tipos || ['artículo'],
          nombre: a?.descripcion || 'Producto',
          precio: session.precio,
          foto_url: session.fileUrl,
          foto_file_id: session.fileId,
          disponible: true,
          modalidad: session.modalidad!,
          fecha_carga: new Date().toISOString()
        });
        delete pendingPhotoSessions[userId];
        await ctx.reply('✅ *¡Guardado exitosamente!* 🎉', { parse_mode: 'Markdown' });
      } else {
        delete pendingPhotoSessions[userId];
        await ctx.reply('❌ Cancelado. Envía la foto de nuevo cuando quieras.');
      }
      return;
    }
  }

  // ── Catálogos dinámicos por tipo: /franelas, /gorras, /zapatos, etc. ─────
  if (text.startsWith('/')) {
    const knownCommands = ['start', 'inventario', 'propio', 'pedido', 'proveedores', 'tipos', 'proveedor', 'post'];
    const cmd = text.slice(1).split(' ')[0].replace(/_/g, ' ').trim();
    
    if (!knownCommands.includes(cmd)) {
      const productos = await inventarioDB.obtener({ tipo: cmd });
      if (productos.length > 0) {
        await enviarCatalogo(ctx, productos, `Catálogo de ${cmd}s`);
        return;
      }
      // Si no hay productos de ese tipo, dejamos caer al chat IA
    }
  }

  // ── Chat IA normal ────────────────────────────────────────────────────────
  try {
    const wantsVoice = /\bvoz\b|háblame|audio|en voz/i.test(text);
    const response = await processUserMessage(userId, text);
    const finalResp = response || 'No tengo respuesta para eso.';

    if (wantsVoice && env.ELEVENLABS_API_KEY) {
      const audioBuffer = await generateSpeechElevenLabs(finalResp);
      await ctx.replyWithVoice(new InputFile(audioBuffer, 'voice.mp3'), { caption: finalResp.substring(0, 1000) });
    } else {
      await ctx.reply(finalResp);
    }
  } catch (error: any) {
    await ctx.reply(`Oops: ${error.message}`);
  }
});

// ── MANEJO DE FOTOS ──────────────────────────────────────────────────────────
bot.on('message:photo', async ctx => {
  const userId = ctx.from.id;
  try {
    const foto = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = foto.file_id;
    const caption = ctx.message.caption?.trim() || '';

    // ── ¿El usuario envió la foto para eliminar? ─────────────────────────
    if (/elimina|ya no (est[áa]|tengo|hay)|borr[ao]|agotad/i.test(caption)) {
      const producto = await inventarioDB.obtenerPorFileId(fileId);
      if (!producto) return ctx.reply('⚠️ Esta foto no está en el inventario.');
      await inventarioDB.eliminar(producto.id!);
      return ctx.reply(`✅ *${producto.tipos.join(' + ')}* (${producto.proveedor}) eliminado del inventario.`, { parse_mode: 'Markdown' });
    }

    const fileInfo = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    const processingMsg = await ctx.reply('📸 Analizando la foto con IA de visión...');
    const analisis = await analizarFotoMercancia(fileUrl);

    // ── Extraer proveedor y precio del caption si los incluyeron ─────────
    let proveedor: string | undefined;
    let precio: string | undefined;
    let modalidadCaption: Modalidad | undefined;

    if (caption) {
      const precioMatch = caption.match(/\$[\d,.]+|[\d,.]+\s*(bs|bolivares|usd|\$)/i);
      precio = precioMatch ? precioMatch[0] : undefined;
      modalidadCaption = /pedido|pedirlo|encargo/i.test(caption) ? 'pedido' : /propio|disponible/i.test(caption) ? 'propio' : undefined;
      const textoSinPrecio = caption.replace(/\$[\d,.]+|[\d,.]+\s*(bs|bolivares|usd|\$)/gi, '').trim();
      proveedor = textoSinPrecio || undefined;
    }

    // Si tenemos todos los datos, guardamos sin preguntar
    if (proveedor && modalidadCaption !== undefined) {
      await inventarioDB.agregar({
        proveedor,
        tipos: analisis?.tipos || ['artículo'],
        nombre: analisis?.descripcion || 'Producto',
        precio,
        foto_url: fileUrl,
        foto_file_id: fileId,
        disponible: true,
        modalidad: modalidadCaption,
        fecha_carga: new Date().toISOString()
      });
      await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      const tiposTexto = analisis?.tipos.join(' + ') || 'artículo';
      return ctx.reply(
        `✅ *Guardado automáticamente:*\n🏷️ ${tiposTexto} | 👤 ${proveedor} | 💰 ${precio || 'Sin precio'} | ${modalidadCaption === 'propio' ? '✅ Propio' : '📦 Pedido'}`,
        { parse_mode: 'Markdown' }
      );
    }

    // Iniciamos el flujo interactivo de preguntas
    pendingPhotoSessions[userId] = {
      fileId,
      fileUrl,
      analisis: analisis || undefined,
      proveedor,
      precio,
      esperandoCampo: proveedor ? 'precio' : 'proveedor'
    };

    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);

    const tiposDetectados = analisis?.tipos?.length
      ? analisis.tipos.join(' + ')
      : 'No identificado';

    let mensajeDeteccion = analisis
      ? `🔍 *Detecté:* ${tiposDetectados}\n📝 ${analisis.descripcion} _(confianza: ${analisis.confianza})_\n\n`
      : '🔍 No pude identificar los artículos automáticamente.\n\n';

    if (!proveedor) {
      await ctx.reply(`${mensajeDeteccion}👤 ¿De qué proveedor es esta mercancía?`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`${mensajeDeteccion}💰 ¿Cuál es el precio?`, { parse_mode: 'Markdown' });
    }

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
    await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🎙️ Me dijiste:\n"${transcript}"\n\n🤔 Procesando...`);

    const response = await processUserMessage(userId, `(Nota de voz, responde en Español): ${transcript}`);
    const finalResp = response || 'Sin respuesta.';

    if (env.ELEVENLABS_API_KEY) {
      await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🗣️ Generando respuesta de voz...`);
      const audioBuffer = await generateSpeechElevenLabs(finalResp);
      await ctx.replyWithVoice(new InputFile(audioBuffer, 'voice.mp3'), { caption: finalResp.substring(0, 1000) });
      await ctx.api.deleteMessage(ctx.chat.id, pendingMsg.message_id);
    } else {
      await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, finalResp);
    }
  } catch (error: any) {
    await ctx.reply(`Error en nota de voz: ${error.message}`);
  }
});

bot.catch(err => console.error(`[Grammy Error]`, err));

export const startBot = async () => {
  console.log(`[Telegram] Iniciando bot con long-polling...`);
  await bot.start();
};
