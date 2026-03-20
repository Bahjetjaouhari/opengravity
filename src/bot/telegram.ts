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
  tiposManual?: string[];
  proveedor?: string;
  // Precio único si no se desglosaron: "$70"
  precio?: string;
  // Precios individuales: { gorra: "$20", franela: "$50" }
  precios?: Record<string, string>;
  precio_total?: string;
  modalidad?: Modalidad;
  esperandoCampo?: 'tipo' | 'proveedor' | 'precio' | 'modalidad' | 'confirmar';
}

// Limpia el texto del proveedor: "Es de Lubass" → "Lubass"
function limpiarProveedor(texto: string): string {
  return texto
    .replace(/^(es de|es del|del proveedor|de|del|proveedor|es)\s+/i, '')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Parsea el texto de precio y extrae precios individuales por tipo.
 * Ejemplos:
 *   "gorra 20$ franela 50$"  → { precios: {gorra:"$20", franela:"$50"}, total:"$70" }
 *   "75$" o "conjunto 75$"   → { precios: {}, precio: "$75" }
 *   "gorra $20"              → { precios: {gorra:"$20"}, total: "$20" }
 */
function parsearPrecios(texto: string, tipos: string[]): {
  precios: Record<string, string>;
  precio_total?: string;
  precio?: string;  // precio único si no se desglosaron
} {
  const precios: Record<string, string> = {};

  // Detectamos si el texto tiene precios por tipo
  for (const tipo of tipos) {
    // Busca "{tipo} {precio}" en cualquier orden con separadores
    const regex = new RegExp(
      `${tipo}[^\\d$]*([\\d,.]+\\s*\\$|\\$[\\d,.]+|[\\d,.]+)`,
      'i'
    );
    const match = texto.match(regex);
    if (match) {
      let val = match[1].trim();
      if (!val.includes('$')) val = '$' + val; // normalizar a formato $XX
      precios[tipo.toLowerCase()] = val;
    }
  }

  // Si encontramos precios individuales para todos los tipos, calculamos total
  if (Object.keys(precios).length === tipos.length && tipos.length > 1) {
    const total = Object.values(precios).reduce((sum, p) => {
      const num = parseFloat(p.replace(/[$,]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
    return { precios, precio_total: `$${total.toFixed(2).replace('.00', '')}` };
  }

  // Si solo hay un tipo o no se desglosaron, buscamos un precio general
  if (Object.keys(precios).length === 0 || tipos.length === 1) {
    const generalMatch = texto.match(/([\d,.]+\s*\$|\$[\d,.]+|[\d,.]+(?=\s|$))/);
    if (generalMatch) {
      let val = generalMatch[1].trim();
      if (!val.includes('$')) val = '$' + val;
      return { precios: {}, precio: val };
    }
  }

  // Return lo que tenemos aunque sea parcial
  return { precios, precio_total: undefined };
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
    `• /franelas /gorras /zapatos etc. – Catálogo\n` +
    `• /post – Generar publicación WhatsApp/IG\n` +
    `• /stats – Estadísticas del inventario\n` +
    `• /tienda – Link de la tienda pública + QR\n\n` +
    `❌ *Marcado como vendido:*\n` +
    `• Envía una foto + escribe *"vendido"* junto a ella\n\n` +
    `💬 También puedes escribirme cualquier cosa para chatear.`,
    { parse_mode: 'Markdown' }
  );
});

// ── /stats ─────────────────────────────────────────────────────────────────
bot.command('stats', async ctx => {
  const todos = await inventarioDB.obtener();
  const propios = todos.filter(p => p.modalidad === 'propio');
  const pedidos = todos.filter(p => p.modalidad === 'pedido');

  const conteoTipos: Record<string, number> = {};
  todos.forEach(p => p.tipos.forEach(t => {
    conteoTipos[t] = (conteoTipos[t] || 0) + 1;
  }));
  const tiposOrdenados = Object.entries(conteoTipos)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 6);

  const proveedores = await inventarioDB.listarProveedores();

  await ctx.reply(
    `📊 *Estadísticas del Inventario*\n\n` +
    `📦 Total en stock: *${todos.length} fotos*\n` +
    `✅ Disponibilidad inmediata: *${propios.length}*\n` +
    `📦 Por pedido: *${pedidos.length}*\n` +
    `👥 Proveedores activos: *${proveedores.length}*\n\n` +
    `🏷️ *Por tipo:*\n` +
    tiposOrdenados.map(([t, n]) => `• ${t.charAt(0).toUpperCase()+t.slice(1)}: ${n}`).join('\n') +
    `\n\nUsa /tienda para ver el link público.`,
    { parse_mode: 'Markdown' }
  );
});

// ── /tienda – Link + QR de la tienda pública ──────────────────────────────
bot.command('tienda', async ctx => {
  const vercelUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://opengravity.vercel.app';
  const tiendaUrl = `${vercelUrl}/api/tienda`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(tiendaUrl)}&color=7B5FFF&bgcolor=0D0D18&margin=20`;

  await ctx.reply(
    `🏪 *Tu tienda pública está lista:*\n\n` +
    `🌐 ${tiendaUrl}\n\n` +
    `📱 Compártela en tus estados de WhatsApp o Instagram con el QR de abajo.`,
    { parse_mode: 'Markdown' }
  );
  await ctx.replyWithPhoto(qrUrl, {
    caption: `🔳 *QR de tu tienda OpenGravity*\n📲 Escanea para ver el catálogo`,
    parse_mode: 'Markdown'
  });
});

// ── /vendido – Orientación (el marcado real ocurre en el handler de fotos) ─
bot.command('vendido', ctx => ctx.reply(
  '✅ Para marcar algo como vendido, envíame la *foto del producto* y escribe *vendido* en la descripción.',
  { parse_mode: 'Markdown' }
));

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
    // Paso 0: Preguntar tipo manualmente si la IA no lo detectó
    if (session.esperandoCampo === 'tipo') {
      session.tiposManual = text.split(/[,y&+]/i).map(t => t.trim().toLowerCase()).filter(Boolean);
      session.esperandoCampo = 'proveedor';
      await ctx.reply('👤 ¿De qué proveedor es esta mercancía?');
      return;
    }
    if (session.esperandoCampo === 'proveedor') {
      session.proveedor = limpiarProveedor(text);  // ✅ "Es de Lubass" → "Lubass"
      session.esperandoCampo = 'precio';
      await ctx.reply('💰 ¿Precio? (Escribe el precio o "sin precio")');
      return;
    }
    if (session.esperandoCampo === 'precio') {
      const tiposActivos = session.analisis?.tipos?.length
        ? session.analisis.tipos
        : (session.tiposManual || []);

      if (/sin precio/i.test(text)) {
        session.precio = undefined;
        session.precios = {};
        session.precio_total = undefined;
      } else {
        const parsed = parsearPrecios(text, tiposActivos);
        session.precios = parsed.precios;
        session.precio_total = parsed.precio_total;
        session.precio = parsed.precio; // precio único si no se desglosaron
      }
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
      const tiposFinales = a?.tipos?.length ? a.tipos : (session.tiposManual || ['artículo']);
      const tiposTexto = tiposFinales.join(', ');

      // Construir línea de precios del resumen
      let precioResumen = 'Sin precio';
      if (session.precios && Object.keys(session.precios).length > 0) {
        const desglose = Object.entries(session.precios).map(([t, p]) => `${t}: ${p}`).join(', ');
        precioResumen = session.precio_total
          ? `${session.precio_total} (${desglose})`
          : desglose;
      } else if (session.precio) {
        precioResumen = session.precio;
      }
      await ctx.reply(
        `📋 *Resumen:*\n\n` +
        `🏷️ Tipos: ${tiposTexto}\n` +
        `📝 ${a?.descripcion || tiposTexto}\n` +
        `👤 Proveedor: ${session.proveedor}\n` +
        `💰 Precio: ${precioResumen}\n` +
        `📦 Modalidad: ${session.modalidad === 'propio' ? '✅ Stock propio' : '📦 Por pedido'}\n\n` +
        `¿Guardar? Responde *sí* o *no*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    if (session.esperandoCampo === 'confirmar') {
      if (/^s[ií]|yes|ok|claro|dale|afirm/i.test(text)) {
        const a = session.analisis;
        const tiposFinales = a?.tipos?.length ? a.tipos : (session.tiposManual || ['artículo']);
        await inventarioDB.agregar({
          proveedor: session.proveedor!,
          tipos: tiposFinales,
          nombre: a?.descripcion || tiposFinales.join(' + '),
          precio: session.precio,
          precios: Object.keys(session.precios || {}).length > 0 ? session.precios : undefined,
          precio_total: session.precio_total,
          foto_url: session.fileUrl,
          foto_file_id: session.fileId,
          disponible: true,
          modalidad: session.modalidad!,
          fecha_carga: new Date().toISOString()
        });
        delete pendingPhotoSessions[userId];
        const emoji = session.modalidad === 'propio' ? '✅' : '📦';
        const precioFinal = session.precio_total || session.precio || 'Sin precio';
        await ctx.reply(`${emoji} *¡Guardado!*\n🏷️ ${tiposFinales.join(' + ')} | 👤 ${session.proveedor} | 💰 ${precioFinal}`, { parse_mode: 'Markdown' });
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
      proveedor = textoSinPrecio ? limpiarProveedor(textoSinPrecio) : undefined;
    }

    // Decidir desde qué campo arranca el flujo
    const visionDetecto = analisis?.tipos?.length;
    let campoInicial: PhotoSession['esperandoCampo'];
    if (!visionDetecto && !proveedor) campoInicial = 'tipo';        // Preguntar tipo primero
    else if (!proveedor) campoInicial = 'proveedor';                // Hay tipo pero no proveedor
    else if (modalidadCaption === undefined) campoInicial = 'precio'; // Hay proveedor, falta precio
    else campoInicial = 'confirmar';

    // Si tenemos todos los datos incluyendo modalidad, guardamos directamente
    if (proveedor && modalidadCaption !== undefined && visionDetecto) {
      await inventarioDB.agregar({
        proveedor,
        tipos: analisis!.tipos,
        nombre: analisis!.descripcion,
        precio,
        foto_url: fileUrl,
        foto_file_id: fileId,
        disponible: true,
        modalidad: modalidadCaption,
        fecha_carga: new Date().toISOString()
      });
      await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      return ctx.reply(
        `✅ *Guardado automáticamente:*\n🏷️ ${analisis!.tipos.join(' + ')} | 👤 ${proveedor} | 💰 ${precio || 'Sin precio'} | ${modalidadCaption === 'propio' ? '✅ Propio' : '📦 Pedido'}`,
        { parse_mode: 'Markdown' }
      );
    }

    // Iniciamos el flujo interactivo
    pendingPhotoSessions[userId] = {
      fileId,
      fileUrl,
      analisis: analisis || undefined,
      proveedor,
      precio,
      esperandoCampo: campoInicial
    };

    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);

    if (campoInicial === 'tipo') {
      // La IA no detectó nada → preguntamos qué tipo es. Aclaramos que puede poner varios.
      await ctx.reply(
        `🔍 No pude identificar los artículos en la foto.\n\n` +
        `🏷️ ¿Qué tipo(s) de artículo(s) hay?\n_Puedes escribir varios separados por coma o "y":_\n*Ej: gorra y franela* o *zapato, pantalon*`,
        { parse_mode: 'Markdown' }
      );
    } else if (campoInicial === 'proveedor') {
      const td = analisis!.tipos.join(' + ');
      await ctx.reply(
        `🔍 *Detecté:* ${td}\n📝 ${analisis!.descripcion} _(confianza: ${analisis!.confianza})_\n\n👤 ¿De qué proveedor es?`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(`💰 ¿Precio?`);
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
