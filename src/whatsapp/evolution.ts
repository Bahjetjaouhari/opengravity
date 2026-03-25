/**
 * Evolution API Client
 * Envía mensajes de WhatsApp a través de Evolution API
 * Documentación: https://doc.evolution-api.com/
 */

import { env } from '../config/env.js';

interface SendMessageOptions {
  to: string;           // Número de WhatsApp (sin +, ej: "584121882008")
  text?: string;        // Mensaje de texto
  media?: string;       // URL o base64 de la imagen
  caption?: string;     // Pie de foto (para medios)
}

interface EvolutionResponse {
  success: boolean;
  error?: string;
}

/**
 * Verifica si Evolution API está configurado
 */
export function isEvolutionConfigured(): boolean {
  return !!(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE);
}

/**
 * Envía un mensaje de texto por WhatsApp
 */
export async function sendWhatsAppText(
  to: string,
  text: string
): Promise<EvolutionResponse> {
  if (!isEvolutionConfigured()) {
    return { success: false, error: 'Evolution API no está configurado' };
  }

  try {
    const response = await fetch(
      `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.EVOLUTION_API_KEY
        },
        body: JSON.stringify({
          number: to,
          text: text
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Evolution API] Error sending text:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('[Evolution API] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Envía una imagen por WhatsApp
 */
export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<EvolutionResponse> {
  if (!isEvolutionConfigured()) {
    return { success: false, error: 'Evolution API no está configurado' };
  }

  try {
    const response = await fetch(
      `${env.EVOLUTION_API_URL}/message/sendMedia/${env.EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.EVOLUTION_API_KEY
        },
        body: JSON.stringify({
          number: to,
          media: imageUrl,
          caption: caption || ''
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Evolution API] Error sending image:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('[Evolution API] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Envía un mensaje de WhatsApp Status
 * (Imagen con mensaje para compartir en estado)
 */
export async function sendWhatsAppStatus(
  imageUrl: string,
  caption: string
): Promise<EvolutionResponse> {
  // El número al que enviar es el propio número de WhatsApp del negocio
  const whatsappNumber = env.WHATSAPP_NUMBER;

  if (!whatsappNumber) {
    return { success: false, error: 'WHATSAPP_NUMBER no está configurado' };
  }

  return sendWhatsAppImage(whatsappNumber, imageUrl, caption);
}

/**
 * Envía un producto como mensaje de WhatsApp Status
 */
export async function sendProductoStatus(
  productoId: string,
  imageUrl: string,
  tipos: string[],
  mensaje: string
): Promise<EvolutionResponse> {
  // Construir el mensaje completo
  const caption = `${mensaje}\n\n📦 Pide el catálogo digital para más modelos 📲`;

  return sendWhatsAppStatus(imageUrl, caption);
}