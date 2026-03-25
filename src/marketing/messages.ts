/**
 * Mensajes predefinidos para marketing automatizado
 * Usados en WhatsApp Status y Telegram Marketing
 */

// Mensajes para WhatsApp Status (cortos, persuasivos)
const MENSAJES_WHATSAPP_STATUS: Record<string, string[]> = {
  gorra: [
    'Estilo que te define ✨',
    'El complemento perfecto',
    'Destaca con estilo'
  ],
  franela: [
    'Comodidad premium, todo el día',
    'Diseño exclusivo que te hace brillar',
    'Tu nueva favorita'
  ],
  camisa: [
    'Elegancia en cada detalle',
    'Perfecta para cualquier ocasión',
    'Calidad que se nota'
  ],
  pantalon: [
    'Perfecto para cualquier ocasión',
    'La comodidad que buscabas',
    'Estilo y confort en uno'
  ],
  pantalón: [
    'Perfecto para cualquier ocasión',
    'La comodidad que buscabas',
    'Estilo y confort en uno'
  ],
  zapatillas: [
    'Cada paso cuenta',
    'Comodidad y estilo en cada movimiento',
    'El toque final de tu outfit'
  ],
  zapatos: [
    'Cada paso cuenta',
    'Comodidad y estilo en cada movimiento',
    'El toque final de tu outfit'
  ],
  cadena: [
    'El detalle que hace la diferencia',
    'Brilla con elegancia',
    'El accesorio que necesitabas'
  ],
  accesorio: [
    'El detalle que hace la diferencia',
    'Tu estilo, tu esencia',
    'Pequeño detalle, gran impacto'
  ],
  reloj: [
    'El tiempo es estilo',
    'Elegancia que marca la diferencia',
    'Precisión y belleza en tu muñeca'
  ],
  joya: [
    'Brilla con elegancia',
    'El lujo que mereces',
    'Detalles que enamoran'
  ],
  conjunto: [
    'El outfit completo que buscabas',
    'El combo perfecto para ti',
    'Luce increíble de pies a cabeza'
  ],
  set: [
    'El outfit completo que buscabas',
    'El combo perfecto para ti',
    'Luce increíble de pies a cabeza'
  ],
  default: [
    'Calidad premium, disponible ahora ✨',
    'Tu próximo favorito',
    'Diseño exclusivo, disponible'
  ]
};

// Mensajes para Telegram Marketing (más descriptivos)
const MENSAJES_TELEGRAM_MARKETING: Record<string, string[]> = {
  gorra: [
    'Ideal para complementar tu estilo y destacar en cualquier ocasión',
    'El accesorio que tu outfit necesita'
  ],
  franela: [
    'Diseño exclusivo que te hará destacar donde vayas',
    'Comodidad y estilo en una sola prenda'
  ],
  camisa: [
    'Elegancia versátil para cualquier momento del día',
    'La calidad que buscabas a tu alcance'
  ],
  pantalon: [
    'La comodidad que buscabas con el estilo que mereces',
    'Perfecto para cualquier ocasión, día o noche'
  ],
  pantalón: [
    'La comodidad que buscabas con el estilo que mereces',
    'Perfecto para cualquier ocasión, día o noche'
  ],
  zapatillas: [
    'Comodidad y estilo en cada paso que des',
    'El calzado perfecto para tu día a día'
  ],
  zapatos: [
    'Comodidad y estilo en cada paso que des',
    'El calzado perfecto para tu día a día'
  ],
  cadena: [
    'Brilla con elegancia y destaca tu estilo único',
    'El detalle que hace la diferencia'
  ],
  accesorio: [
    'El detalle que hace la diferencia en tu look',
    'Pequeño detalle, gran impacto'
  ],
  reloj: [
    'El tiempo es estilo, márcalo con elegancia',
    'Precisión y belleza en tu muñeca'
  ],
  joya: [
    'El lujo que mereces, al alcance de tu mano',
    'Detalles que enamoran y perduran'
  ],
  conjunto: [
    'El combo perfecto para lucir increíble',
    'Todo lo que necesitas en un solo set'
  ],
  set: [
    'El combo perfecto para lucir increíble',
    'Todo lo que necesitas en un solo set'
  ],
  default: [
    'Calidad premium disponible ahora',
    'Tu próximo favorito te espera'
  ]
};

// Call to action para WhatsApp Status
const CTA_CATALOGO = '\n\n📦 Pide el catálogo digital para más modelos 📲';

/**
 * Obtiene un mensaje aleatorio para WhatsApp Status
 */
export function getMensajeWhatsAppStatus(tipos: string[]): string {
  // Normalizar tipos a minúsculas
  const tiposNorm = tipos.map(t => t.toLowerCase().trim());

  // Buscar mensaje para el primer tipo conocido
  for (const tipo of tiposNorm) {
    if (MENSAJES_WHATSAPP_STATUS[tipo]) {
      const mensajes = MENSAJES_WHATSAPP_STATUS[tipo];
      const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)];
      return mensaje + CTA_CATALOGO;
    }
  }

  // Si es un conjunto (múltiples tipos)
  if (tiposNorm.length > 1) {
    const mensajes = MENSAJES_WHATSAPP_STATUS['conjunto'];
    const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)];
    return mensaje + CTA_CATALOGO;
  }

  // Mensaje por defecto
  const mensajes = MENSAJES_WHATSAPP_STATUS['default'];
  const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)];
  return mensaje + CTA_CATALOGO;
}

/**
 * Obtiene un mensaje aleatorio para Telegram Marketing
 */
export function getMensajeTelegramMarketing(tipos: string[], nombre: string, precio: string): string {
  // Normalizar tipos a minúsculas
  const tiposNorm = tipos.map(t => t.toLowerCase().trim());

  let mensajeBase = '';

  // Buscar mensaje para el primer tipo conocido
  for (const tipo of tiposNorm) {
    if (MENSAJES_TELEGRAM_MARKETING[tipo]) {
      const mensajes = MENSAJES_TELEGRAM_MARKETING[tipo];
      mensajeBase = mensajes[Math.floor(Math.random() * mensajes.length)];
      break;
    }
  }

  // Si es un conjunto (múltiples tipos)
  if (!mensajeBase && tiposNorm.length > 1) {
    const mensajes = MENSAJES_TELEGRAM_MARKETING['conjunto'];
    mensajeBase = mensajes[Math.floor(Math.random() * mensajes.length)];
  }

  // Mensaje por defecto
  if (!mensajeBase) {
    const mensajes = MENSAJES_TELEGRAM_MARKETING['default'];
    mensajeBase = mensajes[Math.floor(Math.random() * mensajes.length)];
  }

  // Construir mensaje completo
  const nombreProducto = nombre || tipos.join(' + ');
  const precioFormateado = precio && precio !== 'Sin precio' ? `REF ${precio}` : '';

  let mensaje = `✨ *${nombreProducto}*\n\n`;

  if (precioFormateado) {
    mensaje += `💰 ${precioFormateado}\n\n`;
  }

  mensaje += `${mensajeBase}\n\n`;
  mensaje += `📱 Consúltalo en la tienda o responde este mensaje`;

  return mensaje;
}

/**
 * Obtiene un mensaje simple para Telegram (sin formato Markdown)
 * Usado para productos sin mucho detalle
 */
export function getMensajeSimple(tipos: string[]): string {
  const tiposNorm = tipos.map(t => t.toLowerCase().trim());

  for (const tipo of tiposNorm) {
    if (MENSAJES_WHATSAPP_STATUS[tipo]) {
      const mensajes = MENSAJES_WHATSAPP_STATUS[tipo];
      return mensajes[Math.floor(Math.random() * mensajes.length)];
    }
  }

  if (tiposNorm.length > 1) {
    const mensajes = MENSAJES_WHATSAPP_STATUS['conjunto'];
    return mensajes[Math.floor(Math.random() * mensajes.length)];
  }

  const mensajes = MENSAJES_WHATSAPP_STATUS['default'];
  return mensajes[Math.floor(Math.random() * mensajes.length)];
}