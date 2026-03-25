import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inventarioDB } from '../src/inventory/db.js';
import { getMensajeWhatsAppStatus } from '../src/marketing/messages.js';
import { filtrarProductosDisponibles, registrarProductoEnviado } from '../src/marketing/tracking.js';
import { sendWhatsAppImage, isEvolutionConfigured } from '../src/whatsapp/evolution.js';
import { env } from '../src/config/env.js';

export const config = { maxDuration: 30 };

/**
 * Cron Job de WhatsApp Status
 * Envía un producto al WhatsApp del negocio 2 veces al día (9 AM y 6 PM)
 * El usuario lo comparte en su estado de WhatsApp
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar autenticación (solo Vercel cron puede llamar)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    console.log('[Cron WhatsApp Status] Iniciando...');

    // Verificar que Evolution API está configurado
    if (!isEvolutionConfigured()) {
      console.warn('[Cron WhatsApp Status] Evolution API no configurado, omitiendo');
      return res.json({
        ok: true,
        message: 'Evolution API no configurado',
        hint: 'Configura EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE en .env'
      });
    }

    // Obtener todos los productos disponibles
    const productos = await inventarioDB.obtener();

    if (productos.length === 0) {
      return res.json({ ok: true, message: 'No hay productos en el inventario' });
    }

    // Filtrar productos enviados en los últimos 7 días
    const productosDisponibles = await filtrarProductosDisponibles(productos);

    if (productosDisponibles.length === 0) {
      // Si todos fueron enviados, usar cualquier producto
      console.log('[Cron WhatsApp Status] Todos los productos fueron enviados recientemente, usando cualquiera');
      productosDisponibles.push(...productos);
    }

    // Seleccionar producto aleatorio
    const producto = productosDisponibles[Math.floor(Math.random() * productosDisponibles.length)];

    // Obtener datos del producto
    const fotoPrincipal = inventarioDB.getFotoPrincipal(producto);
    const fotoUrl = fotoPrincipal?.url || producto.foto_url;

    if (!fotoUrl) {
      return res.status(400).json({ error: 'Producto sin foto' });
    }

    // Generar mensaje para WhatsApp Status
    const mensaje = getMensajeWhatsAppStatus(producto.tipos);

    console.log('[Cron WhatsApp Status] Enviando producto:', producto.id);

    // Enviar a WhatsApp
    const whatsappNumber = env.WHATSAPP_NUMBER;
    const result = await sendWhatsAppImage(whatsappNumber, fotoUrl, mensaje);

    if (!result.success) {
      console.error('[Cron WhatsApp Status] Error de WhatsApp:', result.error);
      return res.status(500).json({
        error: 'Error enviando a WhatsApp',
        details: result.error
      });
    }

    // Registrar producto como enviado
    if (producto.id) {
      await registrarProductoEnviado(
        producto.id,
        'whatsapp_status',
        mensaje,
        producto.tipos
      );
    }

    console.log('[Cron WhatsApp Status] Producto enviado exitosamente');

    return res.json({
      ok: true,
      producto: producto.id,
      tipo: 'whatsapp_status',
      mensaje: mensaje
    });

  } catch (err: any) {
    console.error('[Cron WhatsApp Status] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}