import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { env } from '../config/env.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudioUrl, generateSpeechElevenLabs } from '../audio/services.js';
import { inventarioDB, Modalidad, proveedoresDB, adminDB, FotoProducto, Producto } from '../inventory/db.js';

// Helper para crear array de fotos a partir de sesión legacy o nueva
function crearFotosDeSession(session: any): FotoProducto[] {
  // Si ya tiene array de fotos (nuevo formato)
  if (session.fotos && session.fotos.length > 0) {
    return session.fotos;
  }
  // Fallback a formato legacy (foto_url/foto_file_id)
  if (session.fileId && session.fileUrl) {
    return [{
      file_id: session.fileId,
      url: session.fileUrl,
      orden: 0,
      principal: true
    }];
  }
  return [];
}
import { analizarFotoMercancia, generarTextoVenta } from '../inventory/vision.js';
import { sessionsDB } from '../inventory/sessions.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Escapa caracteres especiales de MarkdownV2 para evitar errores de parseo
function escapeMd(text: string): string {
  if (!text) return '';
  return text.replace(/[_*[\]()~>#+\-=|{}.!\\]/g, '\\$&');
}

// Formatea un precio para mostrar: $70 → REF 70
function formatearPrecio(precio: string | undefined): string {
  if (!precio || precio === 'Sin precio') return 'Sin precio';
  const num = precio.replace(/[$,]/g, '');
  return `REF ${num}`;
}

const processedUpdates = new Set<number>();

// ── Sistema de agrupación de fotos (media groups) ─────────────────────────────
// Cuando el usuario envía múltiples fotos juntas, Telegram las manda como
// mensajes separados con el mismo media_group_id. Este sistema las agrupa.
const pendingMediaGroups: Map<string, {
  fotos: { file_id: string; url: string }[];
  timer: NodeJS.Timeout;
  userId: number;
  caption: string;
}> = new Map();

const MEDIA_GROUP_TIMEOUT = 2000; // 2 segundos para agrupar fotos

// Función para procesar fotos agrupadas (álbumes)
async function procesarFotosAgrupadas(
  ctx: any,
  fotos: { file_id: string; url: string }[],
  caption: string
) {
  const userId = ctx.from.id;

  // Verificar si es para eliminar
  if (/\b(vendido|vendida|elimina|eliminar|borrar|agotad[oa])\b/i.test(caption)) {
    const producto = await inventarioDB.obtenerPorFileId(fotos[0].file_id);
    if (!producto) return ctx.reply('⚠️ Esta foto no está en el inventario.');
    await inventarioDB.eliminar(producto.id!);
    return ctx.reply(`✅ *${producto.tipos.join(' + ')}* (${producto.proveedor}) marcado como VENDIDO y eliminado del inventario.`, { parse_mode: 'Markdown' });
  }

  const processingMsg = await ctx.reply(
    fotos.length > 1
      ? `📸 Analizando ${fotos.length} fotos con IA de visión...`
      : '📸 Analizando la foto con IA de visión...'
  );

  // Analizar solo la primera foto para determinar tipo
  const analisis = await analizarFotoMercancia(fotos[0].url);

  // Extraer proveedor y precio del caption
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

  // Crear array de fotos para guardar
  const fotosParaGuardar: FotoProducto[] = fotos.map((f, i) => ({
    file_id: f.file_id,
    url: f.url,
    orden: i,
    principal: i === 0
  }));

  // Decidir desde qué campo arranca el flujo
  const visionDetecto = analisis?.tipos?.length;
  let campoInicial: 'tipo'|'proveedor'|'proveedor_nuevo_confirmar'|'precio'|'modalidad'|'confirmar';
  let esNuevoProveedor = false;

  if (!visionDetecto && !proveedor) campoInicial = 'tipo';
  else if (!proveedor) campoInicial = 'proveedor';
  else {
    const existeProv = await proveedoresDB.obtenerPorNombre(proveedor);
    if (!existeProv) {
      esNuevoProveedor = true;
      campoInicial = 'proveedor_nuevo_confirmar';
    } else if (modalidadCaption === undefined) {
      campoInicial = 'precio';
    } else {
      campoInicial = 'confirmar';
    }
  }

  // Si tenemos todos los datos incluyendo modalidad, guardamos directamente
  if (!esNuevoProveedor && proveedor && modalidadCaption !== undefined && visionDetecto) {
    await inventarioDB.agregar({
      proveedor,
      tipos: analisis!.tipos,
      nombre: analisis!.descripcion,
      precio,
      fotos: fotosParaGuardar,
      disponible: true,
      modalidad: modalidadCaption,
      fecha_carga: new Date().toISOString()
    });
    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
    const fotosInfo = fotos.length > 1 ? ` (${fotos.length} fotos)` : '';
    return ctx.reply(
      `✅ *Guardado automáticamente:*${fotosInfo}\n🏷️ ${analisis!.tipos.join(' + ')} | 👤 ${proveedor} | 💰 ${precio || 'Sin precio'} | ${modalidadCaption === 'propio' ? '✅ Propio' : '📦 Pedido'}`,
      { parse_mode: 'Markdown' }
    );
  }

  // Iniciamos el flujo interactivo
  await sessionsDB.set(userId, {
    fotos: fotosParaGuardar,
    analisis: analisis || undefined,
    proveedor,
    precio,
    esperandoCampo: campoInicial
  });

  await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);

  if (campoInicial === 'tipo') {
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
  } else if (campoInicial === 'proveedor_nuevo_confirmar') {
    await ctx.reply(
      `🆕 *${proveedor}* parece ser un proveedor nuevo.\n\n¿Quieres registrarlo ahora?`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text("Sí, pedir contacto", "prov_si").text("No, continuar", "prov_no")
      }
    );
  } else {
    await askPrecio(ctx, analisis?.tipos);
  }
}
bot.use(async (ctx, next) => {
  if (ctx.update.update_id && processedUpdates.has(ctx.update.update_id)) {
    console.log(`[Deduplicator] Ignorando update duplicado: ${ctx.update.update_id}`);
    return;
  }
  if (ctx.update.update_id) {
    processedUpdates.add(ctx.update.update_id);
    if (processedUpdates.size > 2000) processedUpdates.clear();
  }
  await next();
});

// Limpia el texto del proveedor: "Es de Lubass" → "Lubass"
function limpiarProveedor(texto: string): string {
  return texto
    .replace(/^(es de|es del|del proveedor|de|del|proveedor|es)\s+/i, '')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function askPrecio(ctx: any, tiposA?: string[], tiposM?: string[]) {
  const tipos = tiposA?.length ? tiposA : (tiposM || []);
  const hint = tipos.length > 1
    ? `_(Ej: ${tipos.map((t,i) => `${t} ${20+i*30}$`).join(' ')}, o el conjunto en 70$)_\n\n`
    : '';
  await ctx.reply(`💰 ¿Precio?\n${hint}(Escribe el precio o "sin precio")`, { parse_mode: 'Markdown' });
}

/**
 * Parsea el texto de precio y extrae precios individuales por tipo.
 * Ejemplos:
 *   "gorra 20$ franela 50$"  → { precios: {gorra:"$20", franela:"$50"}, precio_total:"$70" }
 *   "75$" o "conjunto 75$"   → { precios: {}, precio: "$75" }
 *   "gorra $20"              → { precios: {gorra:"$20"}, precio_total: "$20" }
 *   "gorra 40 franela 50 conjunto 80" → { precios: {gorra:"$40", franela:"$50"}, precio_total: "$80" }
 */
function parsearPrecios(texto: string, tipos: string[]): {
  precios: Record<string, string>;
  precio_total?: string;
  precio?: string;  // precio único si no se desglosaron
} {
  const precios: Record<string, string> = {};
  let precioConjunto: string | undefined;

  // Detectar precio de conjunto explícito (conjunto X, total X, todo X)
  const conjuntoMatch = texto.match(/(?:conjunto|total|todo)\s*[,:]?\s*(\$?[\d,.]+|[\d,.]+\s*\$?)/i);
  if (conjuntoMatch) {
    let val = conjuntoMatch[1].trim();
    if (!val.includes('$')) val = '$' + val;
    precioConjunto = val;
  }

  // Detectamos si el texto tiene precios por tipo
  for (const tipo of tipos) {
    // Intentar con el tipo exacto primero
    let regex = new RegExp(
      `${tipo}[^\\d$]*([\\d,.]+\\s*\\$|\\$[\\d,.]+|[\\d,.]+)`,
      'i'
    );
    let match = texto.match(regex);

    // Si no encuentra, intentar con la primera parte del tipo (ej: shortdeplaya → short)
    if (!match && tipo.length > 4) {
      const tipoCorto = tipo.replace(/deplaya| playa|deplaya$/i, '').trim();
      if (tipoCorto && tipoCorto !== tipo) {
        regex = new RegExp(
          `${tipoCorto}[^\\d$]*([\\d,.]+\\s*\\$|\\$[\\d,.]+|[\\d,.]+)`,
          'i'
        );
        match = texto.match(regex);
      }
    }

    // Si aún no encuentra, buscar cualquier coincidencia parcial
    if (!match) {
      // Buscar si hay alguna palabra en el texto que coincida con el inicio del tipo
      const palabrasTipo = tipo.split(/(?=[A-Z])/).join('|'); // shortdeplaya → short|de|playa
      regex = new RegExp(
        `(${palabrasTipo})[^\\d$]*([\\d,.]+\\s*\\$|\\$[\\d,.]+|[\\d,.]+)`,
        'i'
      );
      match = texto.match(regex);
    }

    if (match) {
      let val = match[match.length - 1].trim();
      if (!val.includes('$')) val = '$' + val; // normalizar a formato $XX
      precios[tipo.toLowerCase()] = val;
    }
  }

  // Si encontramos precios individuales
  if (Object.keys(precios).length > 0) {
    // Si hay precio de conjunto explícito, usarlo
    if (precioConjunto) {
      return { precios, precio_total: precioConjunto };
    }
    // Si hay precios para todos los tipos, calcular total
    if (Object.keys(precios).length === tipos.length && tipos.length > 1) {
      const total = Object.values(precios).reduce((sum, p) => {
        const num = parseFloat(p.replace(/[$,]/g, ''));
        return sum + (isNaN(num) ? 0 : num);
      }, 0);
      return { precios, precio_total: `$${total.toFixed(2).replace('.00', '')}` };
    }
    // Precios parciales
    return { precios, precio_total: undefined };
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

async function mostrarResumen(ctx: any, session: any) {
  console.log('[mostrarResumen] Iniciando con sesión:', JSON.stringify(session, null, 2));
  const a = session.analisis;
  const tiposStr = (a?.tipos?.length ? a.tipos : (session.tiposManual || ['artículo']))
    .map((t: string) => `#${t.replace(/\s+/g, '')}`)
    .join(' ');
  const pCommand = session.proveedor ? `/p_${session.proveedor.replace(/\s+/g, '_').toLowerCase()}` : 'Desconocido';
  const desc = a?.descripcion || session.descripcionManual || (session.tiposManual || ['artículo']).join(' + ');

  const precios = session.precios || {};
  let precioResumen = 'Sin precio';
  if (Object.keys(precios).length > 0) {
    const desglose = Object.entries(precios).map(([t, p]) => `${t}: ${formatearPrecio(p as string)}`).join(', ');
    precioResumen = session.precio_total ? `${formatearPrecio(session.precio_total)} (${desglose})` : desglose;
  } else if (session.precio) {
    precioResumen = formatearPrecio(session.precio);
  }

  console.log('[mostrarResumen] pCommand:', pCommand, 'desc:', desc, 'precioResumen:', precioResumen);

  // Enviar sin Markdown para evitar errores de parseo
  await ctx.reply(
    `📋 *Resumen:*\n\n` +
    `🏷️ Tipos: ${tiposStr}\n` +
    `📝 ${desc}\n` +
    `👤 Proveedor: ${pCommand}\n` +
    `💰 Precio: ${precioResumen}\n` +
    `📦 Modalidad: ${session.modalidad === 'propio' ? '✅ Propia (stock)' : '📦 Pedido (proveedor)'}`,
    {
      reply_markup: new InlineKeyboard()
        .text("💾 Guardar", "res_guardar")
        .text("🗑️ Descartar", "res_descartar")
        .row()
        .text("✏️ Editar", "res_editar")
    }
  );
}

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
    `• /p\\_nombre – Ver contacto y catálogo del proveedor\n` +
    `• /tipos – Categorías con stock\n` +
    `• /franelas /gorras /zapatos etc. – Catálogo\n` +
    `• /post – Generar publicación WhatsApp/IG\n` +
    `• /stats – Estadísticas del inventario\n` +
    `• /tienda – Link de la tienda pública + QR\n\n` +
    `❌ *Marcado como vendido:*\n` +
    `• Envía una foto + escribe "vendido" junto a ella\n\n` +
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

// ── /vaciarbd – Borrar base de datos por completo ────────────────────────
bot.command('vaciarbd', async ctx => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  await sessionsDB.set(userId, {
    fileId: '',
    fileUrl: '',
    esperandoCampo: 'codigo_wipe'
  });
  
  await ctx.reply('⚠️ ATENCIÓN: Estás a punto de borrar todo el inventario.\n\nPor favor, ingresa el código de seguridad para confirmar:', { parse_mode: 'Markdown' });
});

// ── /tienda – Link + QR de la tienda pública ──────────────────────────────
bot.command('tienda', async ctx => {
  // Usar URL fija para evitar URLs de deployment que cambian
  const tiendaUrl = 'https://opengravity-three.vercel.app/api/tienda';
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
  await ctx.reply(`📦 *${titulo}* (${productos.length} productos):`, { parse_mode: 'Markdown' });
  for (let i = 0; i < productos.length; i += 10) {
    const grupo = productos.slice(i, i + 10);
    const media = grupo.map((p: any) => {
      const pCommand = `/p_${p.proveedor.replace(/\s+/g, '_').toLowerCase()}`;
      const fotoPrincipal = inventarioDB.getFotoPrincipal(p);
      const fotoId = fotoPrincipal?.file_id || p.foto_file_id;
      return {
        type: 'photo' as const,
        media: fotoId,
        caption: `*${p.nombre || p.tipos.join(' + ')}*\n🏷️ ${p.tipos.map((t: string) => `#${t.replace(/\s+/g, '')}`).join(' ')} \n👤 ${pCommand} | 💰 ${p.precio || 'Sin precio'} | ${p.modalidad === 'propio' ? '✅ En stock' : '📦 Por pedido'}`,
        parse_mode: 'Markdown' as const
      };
    });
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
  const lista = proveedores.map(p => `• /p\\_${p.replace(/\s+/g, '\\_').toLowerCase()} - ${p}`).join('\n');
  await ctx.reply(
    `👥 *Proveedores disponibles:*\n\n${lista}\n\nPisa un proveedor para ver su info`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('tipos', async ctx => {
  const tipos = await inventarioDB.listarTipos();
  if (tipos.length === 0) return ctx.reply('📭 No hay categorías registradas.');
  const lista = tipos.map(t => `• /${t.replace(/\s+/g, '\\_')}`).join('\n');
  await ctx.reply(
    `🗂️ *Categorías disponibles:*\n\n${lista}\n\nUsa /[categoría] para ver el catálogo`,
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
  const fotoPrincipal = inventarioDB.getFotoPrincipal(producto);
  const fotoId = fotoPrincipal?.file_id || producto.foto_file_id;

  if (!fotoId) {
    return ctx.reply('⚠️ Este producto no tiene fotos.');
  }

  await ctx.replyWithPhoto(fotoId, {
    caption: `✅ *Post para WhatsApp/IG:*\n\n${texto}\n\n_📋 Copia y pega en tu estado_`,
    parse_mode: 'Markdown'
  });
});

// ── /editar – Editar productos existentes ─────────────────────────────────────
bot.command('editar', async ctx => {
  const productos = await inventarioDB.obtener();
  if (productos.length === 0) return ctx.reply('📭 No hay productos en el inventario.');

  // Mostrar los últimos 8 productos con botones
  const ultimos = productos.slice(-8).reverse();
  const botones = ultimos.map(p => {
    const tipos = p.tipos.join(' + ');
    const precio = formatearPrecio(p.precio_total || p.precio);
    const texto = `${tipos.slice(0, 20)}${tipos.length > 20 ? '...' : ''} | ${precio}`;
    return [InlineKeyboard.text(texto, `edit_${p.id}`)];
  });

  await ctx.reply(
    `✏️ *Editar producto*\n\nSelecciona el producto que quieres editar:`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard(botones as any)
    }
  );
});

// ── Mensajes de texto ──────────────────────────────────────────────────────
bot.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;

  // ✅ Sesión en Firestore — persiste entre invocaciones serverless de Vercel
  const session = await sessionsDB.get(userId);

  // ── Flujo de sesión pendiente de foto ────────────────────────────────────
  if (session) {
    // ✅ Si mandan un comando mientras hay sesión activa, ignoramos el flujo
    // y dejamos que grammy lo maneje — pero le recordamos la sesión pendiente
    if (text.startsWith('/') && session.esperandoCampo !== undefined) {
      const cmdsInventario = ['stats','tienda','inventario','propio','pedido','proveedores','tipos','post','vaciarbd','vendido'];
      const cmd = text.slice(1).split(' ')[0].toLowerCase();
      if (cmdsInventario.includes(cmd)) {
        // Ejecutar el comando normalmente pasando al siguiente handler
        return next();
      }
      // Para el confirmar, si envían otro texto que no es sí/no mostramos ayuda
    }

    // ── Edición de productos existentes ────────────────────────────────────────
    if (session.productoEditandoId && session.campoEditando) {
      const producto = await inventarioDB.obtener().then(ps => ps.find(p => p.id === session.productoEditandoId));
      if (!producto) {
        await ctx.reply('❌ Producto no encontrado. Usa /editar para comenzar de nuevo.');
        await sessionsDB.delete(userId);
        return;
      }

      const campo = session.campoEditando;
      let actualizaciones: Partial<Producto> = {};

      if (campo === 'tipos') {
        const partes = text.replace(/\s+(y|e)\s+/gi, ',').split(/[,&+]/).map(t => t.trim().toLowerCase()).filter(Boolean);
        const tipos = partes.map(t => t.replace(/\s+/g, ''));
        actualizaciones.tipos = tipos;
        actualizaciones.nombre = tipos.join(' + ');
      } else if (campo === 'precio') {
        if (/sin precio/i.test(text)) {
          actualizaciones.precio = undefined;
          actualizaciones.precios = undefined;
          actualizaciones.precio_total = undefined;
        } else {
          const tiposActuales = producto.tipos;
          const parsed = parsearPrecios(text, tiposActuales);
          actualizaciones.precios = Object.keys(parsed.precios || {}).length > 0 ? parsed.precios : undefined;
          actualizaciones.precio_total = parsed.precio_total;
          actualizaciones.precio = parsed.precio;
        }
      } else if (campo === 'proveedor') {
        actualizaciones.proveedor = limpiarProveedor(text);
      }

      await inventarioDB.actualizar(producto.id!, actualizaciones);
      await sessionsDB.delete(userId);

      const tiposActualizados = actualizaciones.tipos || producto.tipos;
      const precioActualizado = actualizaciones.precio_total || actualizaciones.precio || producto.precio_total || producto.precio;
      const precioFinal = formatearPrecio(precioActualizado);

      await ctx.reply(
        `✅ *Producto actualizado*\n\n` +
        `🏷️ Tipos: ${tiposActualizados.join(' + ')}\n` +
        `💰 Precio: ${precioFinal}\n\n` +
        `Usa /editar para hacer más cambios.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (session.esperandoCampo === 'codigo_wipe') {
      if (!env.WIPE_DB_PIN) {
        await ctx.reply('❌ El comando /vaciarbd está deshabilitado. Configura WIPE_DB_PIN en el entorno.');
        await sessionsDB.delete(userId);
        return;
      }
      if (text === env.WIPE_DB_PIN) {
        const msg = await ctx.reply('⚙️ Vaciando almacén...');
        try {
          await adminDB.vaciarBaseDeDatos();
          await ctx.api.editMessageText(ctx.chat.id, msg.message_id, '✅ El almacén fue vaciado.');
        } catch (err: any) {
          await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `❌ Error al vaciar el almacén: ${err.message}`);
        }
      } else {
        await ctx.reply('❌ Código incorrecto. Operación cancelada.');
      }
      await sessionsDB.delete(userId);
      return;
    }

    if (session.esperandoCampo === 'tipo') {
      const tiposStr = text;
      // Reemplaza los separadores por comas y luego split
      const partes = tiposStr.replace(/\s+(y|e)\s+/gi, ',').split(/[,&+]/).map(t => t.trim().toLowerCase()).filter(Boolean);
      const tiposManual = partes.map(t => t.replace(/\s+/g, ''));
      const descripcionManual = partes.join(' + ');
      await sessionsDB.set(userId, { ...session, tiposManual, descripcionManual, esperandoCampo: 'proveedor' });
      await ctx.reply('👤 ¿De qué proveedor es esta mercancía?');
      return;
    }

    if (session.esperandoCampo === 'proveedor') {
      const proveedor = limpiarProveedor(text);
      const existe = await proveedoresDB.obtenerPorNombre(proveedor);

      if (!existe) {
        await sessionsDB.set(userId, { ...session, proveedor, esperandoCampo: 'proveedor_nuevo_confirmar' });
        await ctx.reply(`🆕 *${proveedor}* parece ser un proveedor nuevo.\n\n¿Quieres registrarlo ahora?`, {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text("Sí, pedir contacto", "prov_si").text("No, continuar", "prov_no")
        });
      } else {
        await sessionsDB.set(userId, { ...session, proveedor, esperandoCampo: 'precio' });
        await askPrecio(ctx, session.analisis?.tipos, session.tiposManual);
      }
      return;
    }

    if (session.esperandoCampo === 'proveedor_nuevo_confirmar') {
      // Ignoramos si escriben en vez de usar el botón, o podemos manejarlo
      if (/^s[ií]|yes|claro|dale|afirm/i.test(text)) {
        await sessionsDB.set(userId, { ...session, esperandoCampo: 'proveedor_contacto' });
        await ctx.reply(`📱 ¡Perfecto! Escribe su método de contacto\n(Ej: número de WhatsApp o link de Instagram):`, { parse_mode: 'Markdown' });
      } else if (/^no|cancel/i.test(text)) {
        await sessionsDB.set(userId, { ...session, esperandoCampo: 'precio' });
        await askPrecio(ctx, session.analisis?.tipos, session.tiposManual);
      } else {
        await ctx.reply('☝️ Por favor, usa los botones arriba o responde *sí* o *no*.', { parse_mode: 'Markdown' });
      }
      return;
    }

    if (session.esperandoCampo === 'proveedor_contacto') {
      await sessionsDB.set(userId, { ...session, proveedorNuevoContacto: text, esperandoCampo: 'precio' });
      await ctx.reply(`✅ Contacto temporalmente guardado. Se registrará al confirmar.\n\n💰 ¿Cuál es el precio? (ej. 15 o "Por talla: S=10, M=15")`, { parse_mode: 'Markdown' });
      return;
    }

    if (session.esperandoCampo === 'precio') {
      const tiposActivos = session.analisis?.tipos?.length
        ? session.analisis.tipos : (session.tiposManual || []);

      let patchPrecio: { precio?: string; precios?: Record<string, string>; precio_total?: string };
      if (/sin precio/i.test(text)) {
        patchPrecio = { precio: undefined, precios: {}, precio_total: undefined };
      } else {
        const parsed = parsearPrecios(text, tiposActivos);
        patchPrecio = { precios: parsed.precios, precio_total: parsed.precio_total, precio: parsed.precio };
      }
      await sessionsDB.set(userId, { ...session, ...patchPrecio, esperandoCampo: 'modalidad' });
      await ctx.reply(
        '📦 ¿Esta mercancía es propia o por pedido?',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text("📦 Propia (stock)", "mod_propia")
            .text("🚚 Pedido (proveedor)", "mod_pedido")
        }
      );
      return;
    }

    if (session.esperandoCampo === 'modalidad') {
      const modalidad: Modalidad = text.includes('1') || /propio|propia/i.test(text) ? 'propio' : 'pedido';
      const updated = { ...session, modalidad, esperandoCampo: 'confirmar' as const };
      await sessionsDB.set(userId, updated);
      await mostrarResumen(ctx, updated);
      return;
    }

    if (session.esperandoCampo === 'editando_campo') {
      // El usuario acaba de enviar el nuevo valor
      if (session.campoAEditar === 'tipo') {
        const partes = text.replace(/\s+(y|e)\s+/gi, ',').split(/[,&+]/).map(t => t.trim().toLowerCase()).filter(Boolean);
        const tiposManual = partes.map(t => t.replace(/\s+/g, ''));
        if (session.analisis) session.analisis.tipos = tiposManual;
        session.tiposManual = tiposManual;
        session.descripcionManual = partes.join(' + ');
      } else if (session.campoAEditar === 'proveedor') {
        session.proveedor = limpiarProveedor(text);
      } else if (session.campoAEditar === 'precio') {
        const tiposActivos = session.analisis?.tipos?.length ? session.analisis.tipos : (session.tiposManual || []);
        if (/sin precio/i.test(text)) {
           session.precio = undefined; session.precios = {}; session.precio_total = undefined;
        } else {
           const parsed = parsearPrecios(text, tiposActivos);
           session.precios = parsed.precios; session.precio_total = parsed.precio_total; session.precio = parsed.precio;
        }
      } else if (session.campoAEditar === 'modalidad') {
        session.modalidad = text.includes('1') || /propio|propia/i.test(text) ? 'propio' : 'pedido';
      }
      
      session.esperandoCampo = 'confirmar';
      await sessionsDB.set(userId, session);
      await mostrarResumen(ctx, session);
      return;
    }

    if (session.esperandoCampo === 'confirmar') {
      // ✅ Si envió un comando, NO cancelamos — le recordamos que tiene algo pendiente
      if (text.startsWith('/')) {
        await ctx.reply(
          `⚠️ Tienes una foto pendiente de guardar.\nResponde *sí* para guardar o *no* para cancelar.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (/^s[ií]|yes|ok|claro|dale|afirm|listo|guarda/i.test(text)) {
        const a = session.analisis;
        const tiposFinales = a?.tipos?.length ? a.tipos : (session.tiposManual || ['artículo']);
        const tiposStr = (a?.tipos?.length ? a.tipos : (session.tiposManual || ['artículo']))
    .map(t => `#${t.replace(/\s+/g, '')}`)
    .join(' ');
  const pCommand = session.proveedor ? `/p_${session.proveedor.replace(/\s+/g, '_').toLowerCase()}` : '';
  const desc = a?.descripcion || session.descripcionManual || (session.tiposManual || ['artículo']).join(' + ');

  const resume = `📋 *Resumen:*\n\n` +
    `🏷️ Tipos: ${tiposStr}\n` +
    `📝 ${desc}\n` +
    `👤 Proveedor: ${pCommand}\n` +
    `💰 Precio: ${formatearPrecio(session.precio_total || session.precio)}\n`;
        await inventarioDB.agregar({
          proveedor: session.proveedor!,
          tipos: tiposFinales,
          nombre: a?.descripcion || tiposFinales.join(' + '),
          precio: session.precio,
          precios: Object.keys(session.precios || {}).length > 0 ? session.precios : undefined,
          precio_total: session.precio_total,
          fotos: crearFotosDeSession(session),
          disponible: true,
          modalidad: session.modalidad!,
          fecha_carga: new Date().toISOString()
        });
        await sessionsDB.delete(userId);
        const emoji = session.modalidad === 'propio' ? '✅' : '📦';
        const precioFinal = formatearPrecio(session.precio_total || session.precio);
        await ctx.reply(
          `${emoji} ¡Mercancía Almacenada!\n🏷️ ${tiposFinales.join(' + ')} | 👤 ${session.proveedor} | 💰 ${precioFinal}`
        );
      } else if (/^no|cancel|nope|descarta/i.test(text)) {
        await sessionsDB.delete(userId);
        await ctx.reply('❌ Descartado. Envía la foto de nuevo cuando quieras.');
      } else {
        // Respuesta ambigua — recordamos las opciones
        await ctx.reply('☝️ Usa los botones del resumen o responde *sí* para guardar o *no* para descartar.', { parse_mode: 'Markdown' });
      }
      return;
    }
  }

  // ── Catálogos dinámicos por tipo (/franelas) y proveedor (/p_nombre) ─────
  if (text.startsWith('/')) {
    const knownCommands = ['start', 'inventario', 'propio', 'pedido', 'proveedores', 'tipos', 'proveedor', 'post', 'vaciarbd', 'stats', 'tienda', 'vendido'];
    if (text.startsWith('/p_')) {
      const pName = text.slice(3).replace(/_/g, ' ').trim();
      const infoProv = await proveedoresDB.obtenerPorNombre(pName);
      if (infoProv) {
        await ctx.reply(`👤 *Proveedor:* ${infoProv.nombre}\n📱 *Contacto:* ${infoProv.contacto || 'Sin contacto registrado'}\n\n👇 Catálogo de sus productos:`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`👤 *Proveedor:* ${pName.toUpperCase()}\n📱 *Contacto:* Sin contacto registrado\n\n👇 Catálogo de sus productos:`, { parse_mode: 'Markdown' });
      }
      const productos = await inventarioDB.obtener({ proveedor: pName });
      await enviarCatalogo(ctx, productos, `Catálogo de ${pName}`);
      return;
    }

    const cmd = text.slice(1).split(' ')[0].replace(/_/g, ' ').trim();
    if (!knownCommands.includes(cmd)) {
      const productos = await inventarioDB.obtener({ tipo: cmd });
      if (productos.length > 0) {
        await enviarCatalogo(ctx, productos, `Catálogo de ${cmd}s`);
        return;
      }
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

// ── MANEJO DE BOTONES (Callback Queries) ──────────────────────────────────
bot.on('callback_query:data', async ctx => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  console.log('[Callback] Data recibida:', data);

  // ── Selección de producto para editar (desde /editar) ───────────────────────
  if (data.startsWith('editprod_')) {
    console.log('[Edit] Seleccionando producto:', data);
    const productoId = data.replace('editprod_', '');
    const producto = await inventarioDB.obtener().then(ps => ps.find(p => p.id === productoId));
    if (!producto) {
      await ctx.answerCallbackQuery({ text: 'Producto no encontrado', show_alert: true });
      return;
    }

    const tipos = producto.tipos.join(' + ');
    const precio = formatearPrecio(producto.precio_total || producto.precio);
    const modalidad = producto.modalidad === 'propio' ? '✅ Propio' : '📦 Pedido';

    await ctx.editMessageText(
      `✏️ *Editando:*\n\n` +
      `🏷️ Tipos: ${tipos}\n` +
      `👤 Proveedor: ${producto.proveedor}\n` +
      `💰 Precio: ${precio}\n` +
      `📦 Modalidad: ${modalidad}\n\n` +
      `¿Qué quieres editar?`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text("🏷️ Tipos", `editcampo_${productoId}_tipos`)
          .text("💰 Precio", `editcampo_${productoId}_precio`)
          .row()
          .text("👤 Proveedor", `editcampo_${productoId}_proveedor`)
          .text("📦 Modalidad", `editcampo_${productoId}_modalidad`)
          .row()
          .text("❌ Cancelar", "edit_cancelar")
      }
    );
    await ctx.answerCallbackQuery();
    return;
  }

  // ── Selección de campo a editar ────────────────────────────────────────────
  if (data.startsWith('editcampo_')) {
    console.log('[Edit] Seleccionando campo:', data);
    const [_, productoId, campo] = data.split('_');
    const campoValido = ['tipos', 'precio', 'proveedor', 'modalidad'].includes(campo)
      ? campo as 'tipos' | 'precio' | 'proveedor' | 'modalidad'
      : undefined;

    if (!campoValido) {
      await ctx.answerCallbackQuery({ text: 'Campo no válido', show_alert: true });
      return;
    }

    console.log('[Edit] Guardando sesión:', { productoId, campoValido });
    await sessionsDB.set(userId, { productoEditandoId: productoId, campoEditando: campoValido });

    let mensaje = '';
    if (campo === 'tipos') mensaje = '🏷️ Escribe los nuevos tipos (separados por coma):';
    else if (campo === 'precio') mensaje = '💰 Escribe el nuevo precio (ej: "gorra 40 franela 50 conjunto 140" o "50"):';
    else if (campo === 'proveedor') mensaje = '👤 Escribe el nuevo proveedor:';
    else if (campo === 'modalidad') mensaje = '📦 Selecciona la modalidad:';

    if (campo === 'modalidad') {
      await ctx.editMessageText(mensaje, {
        reply_markup: new InlineKeyboard()
          .text("✅ Propio (stock)", `editmod_${productoId}_propio`)
          .text("📦 Por pedido", `editmod_${productoId}_pedido`)
          .row()
          .text("❌ Cancelar", "edit_cancelar")
      });
    } else {
      await ctx.editMessageText(mensaje);
    }
    await ctx.answerCallbackQuery();
    return;
  }

  // ── Cambiar modalidad directamente ─────────────────────────────────────────
  if (data.startsWith('editmod_')) {
    const [_, productoId, modalidad] = data.split('_');
    await inventarioDB.actualizar(productoId, { modalidad: modalidad as Modalidad });
    await ctx.editMessageText(`✅ Modalidad actualizada a *${modalidad === 'propio' ? 'Propio' : 'Por pedido'}*`, { parse_mode: 'Markdown' });
    await sessionsDB.delete(userId);
    await ctx.answerCallbackQuery('Actualizado');
    return;
  }

  // ── Cancelar edición ────────────────────────────────────────────────────────
  if (data === 'edit_cancelar') {
    await sessionsDB.delete(userId);
    await ctx.editMessageText('❌ Edición cancelada.');
    await ctx.answerCallbackQuery();
    return;
  }

  // ── Flujo normal de sesión (para subir fotos) ────────────────────────────────
  const session = await sessionsDB.get(userId);

  if (!session) {
    await ctx.answerCallbackQuery({ text: '⏳ La sesión expiró o ya fue completada.', show_alert: true });
    return;
  }

  if (session.esperandoCampo === 'proveedor_nuevo_confirmar') {
    if (data === 'prov_si') {
      await sessionsDB.set(userId, { ...session, esperandoCampo: 'proveedor_contacto' });
      await ctx.editMessageText(`📱 ¡Perfecto! Escribe el método de contacto para *${escapeMd(session.proveedor || 'proveedor')}*\n(Ej: número de WhatsApp o link de Instagram):`, { parse_mode: 'MarkdownV2' });
      await ctx.answerCallbackQuery();
    } else if (data === 'prov_no') {
      await sessionsDB.set(userId, { ...session, esperandoCampo: 'precio' });
      await ctx.editMessageText(`⏭️ Omitido. Proveedor no formalizado.`, { parse_mode: 'Markdown' });
      await askPrecio(ctx, session.analisis?.tipos, session.tiposManual);
      await ctx.answerCallbackQuery();
    }
  } else if (session.esperandoCampo === 'modalidad' && (data === 'mod_propia' || data === 'mod_pedido')) {
    console.log('[Callback] Modalidad seleccionada:', data);
    const modalidad: Modalidad = data === 'mod_propia' ? 'propio' : 'pedido';
    const updated = { ...session, modalidad, esperandoCampo: 'confirmar' as const };
    console.log('[Callback] Guardando sesión:', JSON.stringify(updated, null, 2));
    await sessionsDB.set(userId, updated);
    console.log('[Callback] Sesión guardada, editando mensaje...');
    await ctx.editMessageText(`⏭️ Modalidad seleccionada: ${modalidad === 'propio' ? '📦 Propia (stock)' : '🚚 Pedido (proveedor)'}`);
    console.log('[Callback] Llamando mostrarResumen...');
    try {
      await mostrarResumen(ctx, updated);
      console.log('[Callback] mostrarResumen completado');
    } catch (err: any) {
      console.error('[Callback ERROR en mostrarResumen]:', err);
      await ctx.reply(`❌ Error al mostrar resumen: ${err.message}`);
    }
    await ctx.answerCallbackQuery();
  } else if (session.esperandoCampo === 'confirmar') {
    if (data === 'res_guardar') {
      try {
        if (session.proveedorNuevoContacto && session.proveedor) {
          const existe = await proveedoresDB.obtenerPorNombre(session.proveedor);
          if (!existe) {
            await proveedoresDB.agregar({ nombre: session.proveedor, contacto: session.proveedorNuevoContacto });
          }
        }
        const a = session.analisis;
        const tiposFinales = a?.tipos?.length ? a.tipos : (session.tiposManual || ['artículo']);
        await inventarioDB.agregar({
          proveedor: session.proveedor!,
          tipos: tiposFinales,
          nombre: a?.descripcion || session.descripcionManual || tiposFinales.join(' + '),
          precio: session.precio,
          precios: Object.keys(session.precios || {}).length > 0 ? session.precios : undefined,
          precio_total: session.precio_total,
          fotos: crearFotosDeSession(session),
          disponible: true,
          modalidad: session.modalidad!,
          fecha_carga: new Date().toISOString()
        });
        await sessionsDB.delete(userId);
        const emoji = session.modalidad === 'propio' ? '✅' : '📦';
        const precioFinal = formatearPrecio(session.precio_total || session.precio);
        await ctx.editMessageText(`✅ Resumen aprobado.`);
        const pCommand = `/p_${session.proveedor!.replace(/\s+/g, '_').toLowerCase()}`;
        const descripcion = a?.descripcion || session.descripcionManual || tiposFinales.join(' + ');
        await ctx.reply(
          `${emoji} ¡Mercancía Almacenada!\n📝 ${descripcion}\n👤 ${pCommand} | 💰 ${precioFinal}\n\nHa sido guardada correctamente en el inventario.`
        );
        await ctx.answerCallbackQuery('Guardado exitosamente');
      } catch (err: any) {
        console.error('[Error Guardando]', err);
        await ctx.reply(`❌ Fallo al guardar en la base de datos: ${err.message}`);
        await ctx.answerCallbackQuery('Error guardando');
      }
    } else if (data === 'res_descartar') {
      await sessionsDB.delete(userId);
      await ctx.editMessageText(`❌ Descartado. Envía la foto de nuevo cuando quieras.`);
      await ctx.answerCallbackQuery('Descartado');
    } else if (data === 'res_editar') {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(
        `✏️ ¿Qué campo deseas editar?`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text("🏷️ Tipos", "edit_tipo")
            .text("👤 Proveedor", "edit_proveedor")
            .row()
            .text("💰 Precio", "edit_precio")
            .text("📦 Modalidad", "edit_modalidad")
        }
      );
      await ctx.answerCallbackQuery();
    } else if (data.startsWith('edit_')) {
      const campo = data.replace('edit_', '');
      await sessionsDB.set(userId, { ...session, esperandoCampo: 'editando_campo', campoAEditar: campo });
      await ctx.editMessageText(`Elegiste editar: *${campo.toUpperCase()}*`, { parse_mode: 'Markdown' });
      if (campo === 'tipo') await ctx.reply(`🏷️ Escribe los nuevos tipos separados por comas:`);
      else if (campo === 'proveedor') await ctx.reply(`👤 Escribe el nombre del nuevo proveedor:`);
      else if (campo === 'precio') await ctx.reply(`💰 Escribe el nuevo precio (o "sin precio"):`);
      else if (campo === 'modalidad') await ctx.reply(`📦 Escribe 1 para Propia o 2 para Por pedido:`);
      await ctx.answerCallbackQuery();
    }
  } else {
    await ctx.answerCallbackQuery('Acción no válida en este punto.');
  }
});

// ── MANEJO DE FOTOS ──────────────────────────────────────────────────────────
bot.on('message:photo', async ctx => {
  const userId = ctx.from.id;
  try {
    const foto = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = foto.file_id;
    const caption = ctx.message.caption?.trim() || '';
    const mediaGroupId = ctx.message.media_group_id;

    // ── Detectar si es parte de un álbum de fotos (media_group) ─────────────
    if (mediaGroupId) {
      const fileInfo = await ctx.api.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

      // Si ya existe un grupo pendiente, agregar la foto
      if (pendingMediaGroups.has(mediaGroupId)) {
        const group = pendingMediaGroups.get(mediaGroupId)!;
        group.fotos.push({ file_id: fileId, url: fileUrl });
        // Resetear el timer
        clearTimeout(group.timer);
        group.timer = setTimeout(() => {
          procesarFotosAgrupadas(ctx, group.fotos, group.caption);
          pendingMediaGroups.delete(mediaGroupId);
        }, MEDIA_GROUP_TIMEOUT);
        return; // Esperar a que lleguen todas las fotos
      }

      // Crear nuevo grupo pendiente
      const timer = setTimeout(() => {
        const group = pendingMediaGroups.get(mediaGroupId);
        if (group) {
          procesarFotosAgrupadas(ctx, group.fotos, group.caption);
          pendingMediaGroups.delete(mediaGroupId);
        }
      }, MEDIA_GROUP_TIMEOUT);

      pendingMediaGroups.set(mediaGroupId, {
        fotos: [{ file_id: fileId, url: fileUrl }],
        timer,
        userId,
        caption
      });
      return; // Esperar a ver si llegan más fotos
    }

    // ── Foto individual (no es parte de un álbum) ─────────────────────────────
    // Procesar normalmente
    const fotos = [{ file_id: fileId, url: '' }];
    const fileInfo = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
    fotos[0].url = fileUrl;

    // ── ¿El usuario envió la foto para eliminar? ─────────────────────────
    if (/\b(vendido|vendida|elimina|eliminar|borrar|agotad[oa])\b/i.test(caption)) {
      const producto = await inventarioDB.obtenerPorFileId(fileId);
      if (!producto) return ctx.reply('⚠️ Esta foto no está en el inventario.');
      await inventarioDB.eliminar(producto.id!);
      return ctx.reply(`✅ *${producto.tipos.join(' + ')}* (${producto.proveedor}) marcado como VENDIDO y eliminado del inventario.`, { parse_mode: 'Markdown' });
    }

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
    let campoInicial: 'tipo'|'proveedor'|'proveedor_nuevo_confirmar'|'precio'|'modalidad'|'confirmar';
    let esNuevoProveedor = false;

    if (!visionDetecto && !proveedor) campoInicial = 'tipo';        // Preguntar tipo primero
    else if (!proveedor) campoInicial = 'proveedor';                // Hay tipo pero no proveedor
    else {
      const existeProv = await proveedoresDB.obtenerPorNombre(proveedor);
      if (!existeProv) {
        esNuevoProveedor = true;
        campoInicial = 'proveedor_nuevo_confirmar';
      } else if (modalidadCaption === undefined) {
        campoInicial = 'precio';
      } else {
        campoInicial = 'confirmar';
      }
    }

    // Si tenemos todos los datos incluyendo modalidad, guardamos directamente
    if (!esNuevoProveedor && proveedor && modalidadCaption !== undefined && visionDetecto) {
      await inventarioDB.agregar({
        proveedor,
        tipos: analisis!.tipos,
        nombre: analisis!.descripcion,
        precio,
        fotos: [{ file_id: fileId, url: fileUrl, orden: 0, principal: true }],
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

    // Iniciamos el flujo interactivo guardando en Firestore
    await sessionsDB.set(userId, {
      fileId,
      fileUrl,
      fotos: [{ file_id: fileId, url: fileUrl, orden: 0, principal: true }],
      analisis: analisis || undefined,
      proveedor,
      precio,
      esperandoCampo: await (async () => {
        // Fix TS narrow matching
        return campoInicial as any;
      })()
    });

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
    } else if (campoInicial === 'proveedor_nuevo_confirmar') {
      await ctx.reply(
        `🆕 *${proveedor}* parece ser un proveedor nuevo.\n\n¿Quieres registrarlo ahora?`, 
        { 
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text("Sí, pedir contacto", "prov_si").text("No, continuar", "prov_no")
        }
      );
    } else {
      await askPrecio(ctx, analisis?.tipos);
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

    let transcript = await transcribeAudioUrl(fileUrl);
    if (!transcript || transcript.trim() === '') {
      transcript = "*[Nota de voz ininteligible o en silencio]*";
    }
    await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🎙️ Me dijiste:\n"${transcript}"\n\n🤔 Procesando...`);

    const response = await processUserMessage(userId, transcript);
    const finalResp = response || 'Sin respuesta.';

    if (env.ELEVENLABS_API_KEY) {
      try {
        await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `🗣️ Generando respuesta de voz...`);
        const audioBuffer = await generateSpeechElevenLabs(finalResp);
        await ctx.replyWithVoice(new InputFile(audioBuffer, 'voice.mp3'), { caption: finalResp.substring(0, 1000) });
        await ctx.api.deleteMessage(ctx.chat.id, pendingMsg.message_id);
      } catch (err: any) {
        console.error('[Error ElevenLabs]', err);
        // Fallback a texto mostrando el error si falla el audio
        await ctx.api.editMessageText(ctx.chat.id, pendingMsg.message_id, `(El audio falló: ${err.message})\n\n${finalResp}`);
      }
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
