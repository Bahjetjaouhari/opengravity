import { env } from '../config/env.js';

const VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';

export interface AnalisisFoto {
  // ✅ Ahora es un ARRAY para detectar múltiples artículos en la misma foto
  tipos: string[];
  descripcion: string;
  confianza: 'alta' | 'media' | 'baja';
}

/**
 * Analiza una foto de mercancía y detecta TODOS los tipos de artículos visibles.
 * Ejemplo: una foto con franela + gorra devuelve tipos: ["franela", "gorra"]
 */
export async function analizarFotoMercancia(imageUrl: string): Promise<AnalisisFoto | null> {
  if (!env.OPENROUTER_API_KEY) return null;

  try {
    console.log('[Vision] Analizando foto de mercancía con IA...');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/OpenGravity',
        'X-Title': 'OpenGravity'
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              {
                type: 'text',
                text: `Eres un experto en inventario de ropa y mercancía. Analiza TODOS los tipos de artículos visibles en esta foto.

Categorías posibles: franela, camiseta, camisa, pantalon, short, bermuda, vestido, falda, zapato, tenis, sandalia, gorra, gorra, bolso, cartera, correa, chaqueta, sueter, pijama, ropa interior, medias, accesorio, conjunto.

Responde SOLO con un JSON válido exactamente así:
{"tipos": ["tipo1", "tipo2"], "descripcion": "descripción breve en español de 5-10 palabras", "confianza": "alta/media/baja"}

Si hay varios artículos distintos, inclúyelos todos en el array "tipos".
Solo JSON, sin texto adicional ni markdown.`
              }
            ]
          }
        ],
        max_tokens: 200,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      console.error('[Vision] Error del modelo:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Normalizamos: si devolvió string en vez de array, lo convertimos
    const tiposRaw = Array.isArray(parsed.tipos) ? parsed.tipos : [parsed.tipo || 'artículo'];
    
    return {
      tipos: tiposRaw.map((t: string) => t.toLowerCase().trim()),
      descripcion: parsed.descripcion || 'Mercancía sin descripción',
      confianza: parsed.confianza || 'baja'
    };

  } catch (err) {
    console.error('[Vision] Error analizando foto:', err);
    return null;
  }
}

/**
 * Genera un texto de ventas para WhatsApp/Instagram
 */
export async function generarTextoVenta(producto: {
  nombre: string;
  tipos: string[];
  proveedor: string;
  precio?: string;
  modalidad: string;
}): Promise<string> {
  const tiposTexto = producto.tipos.join(', ');
  const modalidadTexto = producto.modalidad === 'propio' ? 'disponible ahora' : 'por pedido';

  if (!env.OPENROUTER_API_KEY) {
    return `🔥 ${tiposTexto.toUpperCase()} ${modalidadTexto.toUpperCase()}\n💰 ${producto.precio || 'Precio a consultar'}\n📲 Escríbenos`;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/OpenGravity',
        'X-Title': 'OpenGravity'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-27b-it:free',
        messages: [
          {
            role: 'user',
            content: `Crea un texto corto y atractivo para estado de WhatsApp o Instagram Stories. Máximo 5 líneas con emojis. En español venezolano natural y con energía de ventas.

Artículos: ${tiposTexto}
Descripción: ${producto.nombre}
Precio: ${producto.precio || 'Consultar'}
Disponibilidad: ${modalidadTexto}

Solo el texto del estado, nada más.`
          }
        ],
        max_tokens: 200,
        temperature: 0.8
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ||
      `🔥 ${tiposTexto.toUpperCase()}\n💰 ${producto.precio || 'Consultar precio'}\n${modalidadTexto === 'disponible ahora' ? '✅ En stock' : '📦 Por pedido'}\n📲 Escríbenos`;
  } catch {
    return `🔥 ${tiposTexto.toUpperCase()}\n💰 ${producto.precio || 'Consultar precio'}\n📲 Escríbenos`;
  }
}
