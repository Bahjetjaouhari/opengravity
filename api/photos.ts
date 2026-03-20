import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 15 };

/**
 * Proxy seguro de fotos de Telegram.
 * Nunca expone el bot token al cliente - lo resuelve server-side.
 * Uso: /api/photos?id={file_id}
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = req.query.id as string;
  if (!fileId) return res.status(400).json({ error: 'Falta el file ID' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Bot no configurado' });

  try {
    // Paso 1: Obtener la ruta del archivo en Telegram
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const fileData = await getFileRes.json();

    if (!fileData.ok) return res.status(404).send('Foto no encontrada');

    // Paso 2: Descargar y retransmitir la imagen (el token nunca sale del servidor)
    const photoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    const imgRes = await fetch(photoUrl);

    if (!imgRes.ok) return res.status(502).send('Error descargando imagen');

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7 días de caché
    res.send(buffer);

  } catch (err: any) {
    console.error('[Photos API]', err);
    res.status(500).send('Error interno');
  }
}
