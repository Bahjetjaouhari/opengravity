import { env } from '../config/env.js';

// Usamos un modelo de visión gratuito de NVIDIA en OpenRouter para analizar fotos de mercancía
const VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';

export interface AnalisisFoto {
  tipo: string;       // Ej: "franela", "pantalón", "zapato"
  descripcion: string; // Descripción breve del artículo
  confianza: 'alta' | 'media' | 'baja'; // Qué tan seguro está el modelo
}

/**
 * Analiza una foto de mercancía usando IA de visión gratuita
 * Devuelve el tipo de artículo y una descripción breve
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
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              },
              {
                type: 'text',
                text: `Eres un experto en comercio de ropa y mercancía. Analiza esta foto y responde SOLO con un JSON válido con este formato exacto:
{"tipo": "nombre del tipo de prenda/artículo en español singular (ej: franela, pantalón, zapato, vestido, short, camisa)", "descripcion": "descripción muy breve en español de 5-10 palabras máximo", "confianza": "alta/media/baja"}

Solo JSON, sin texto adicional, sin markdown.`
              }
            ]
          }
        ],
        max_tokens: 150,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      console.error('[Vision] Error del modelo:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Intentamos parsear el JSON que devolvió la IA
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      tipo: parsed.tipo || 'artículo',
      descripcion: parsed.descripcion || 'mercancía sin descripción',
      confianza: parsed.confianza || 'baja'
    };
  } catch (err) {
    console.error('[Vision] Error analizando foto:', err);
    return null;
  }
}

/**
 * Genera un texto de ventas para WhatsApp/Instagram basado en los datos del producto
 */
export async function generarTextoVenta(producto: {
  nombre: string;
  tipo: string;
  proveedor: string;
  precio?: string;
}): Promise<string> {
  if (!env.OPENROUTER_API_KEY) {
    return `🔥 ${producto.nombre}\n💰 Precio: ${producto.precio || 'Consultar'}\n📦 Disponible ahora\n✅ Interesados escribir al WhatsApp`;
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
            content: `Crea un texto corto y atractivo para publicar en estado de WhatsApp o Instagram Stories para vender este producto. Máximo 5 líneas con emojis llamativos. En español venezolano natural.

Producto: ${producto.tipo} - ${producto.nombre}
Precio: ${producto.precio || 'Consultar'}

Responde SOLO con el texto del estado, nada más.`
          }
        ],
        max_tokens: 200,
        temperature: 0.8
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 
      `🔥 ${producto.tipo.toUpperCase()} DISPONIBLE\n💰 ${producto.precio || 'Precio a consultar'}\n📲 Escríbenos para más info`;
  } catch {
    return `🔥 ${producto.tipo.toUpperCase()} DISPONIBLE\n💰 ${producto.precio || 'Precio a consultar'}\n📲 Escríbenos para más info`;
  }
}
