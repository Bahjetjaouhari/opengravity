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

  // Intentamos con modelos rápidos de visión. Si el primero se tarda o falla, usamos el segundo.
  // Limitar el tiempo es CRÍTICO para evitar que Vercel cancele la función (y que Telegram reintente)
  const MODELS_TO_TRY = [
    'google/gemini-2.0-flash-lite-preview-02-05:free', // Ultra rápido
    'mistralai/mistral-small-3.1-24b-instruct:free',   // Buen respaldo
  ];

  for (const model of MODELS_TO_TRY) {
    try {
      console.log(`[Vision] Intentando con modelo: ${model}`);

      // ✅ Timeout de 4.5 segundos por modelo (Max 9s total)
      // Vercel Hobby tiene límite de 10s por defecto; Telegram también reintenta rápido.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/OpenGravity',
          'X-Title': 'OpenGravity'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageUrl } },
                {
                  type: 'text',
                  text: `Eres experto en inventario de ropa. Analiza TODOS los artículos visibles en la foto.
Responde SOLO con JSON exactamente así (sin texto extra):
{"tipos": ["gorra"], "descripcion": "gorra snapback blanca logo Made", "confianza": "alta"}
Tipos posibles: franela, camisa, pantalon, short, vestido, zapato, tenis, sandalia, gorra, bolso, cartera, chaqueta, conjunto, accesorio, otro.`
                }
              ]
            }
          ],
          max_tokens: 150,
          temperature: 0.1
        })
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[Vision] ${model} respondió ${response.status}, intentando siguiente...`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`[Vision] ${model} no devolvió JSON válido, intentando siguiente...`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const tiposRaw = Array.isArray(parsed.tipos) ? parsed.tipos : [parsed.tipo || 'artículo'];

      console.log(`[Vision] ✅ Éxito con ${model}: ${tiposRaw.join(', ')}`);
      return {
        tipos: tiposRaw.map((t: string) => t.toLowerCase().trim()),
        descripcion: parsed.descripcion || 'Mercancía sin descripción',
        confianza: parsed.confianza || 'media'
      };

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error(`[Vision] ${model} expiró por timeout, intentando siguiente...`);
      } else {
        console.error(`[Vision] Error con ${model}:`, err.message);
      }
      // Continuamos con el siguiente modelo
    }
  }

  // Ningún modelo funcionó, devolvemos null para pedir los datos manualmente
  console.error('[Vision] Todos los modelos de visión fallaron. Pediremos datos manualmente.');
  return null;
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
