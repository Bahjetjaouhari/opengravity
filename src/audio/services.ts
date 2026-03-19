import { env } from '../config/env.js';
import { groqClient } from '../agent/llm.js';

// Transcribe un archivo de audio descargado desde una URL de Telegram usando Deepgram
export async function transcribeAudioUrl(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Error descargando audio: ${response.statusText}`);
  
  const arrayBuffer = await response.arrayBuffer();
  
  // Clave introducida de forma manual por orden expresa
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY || 'c970dc8a996021a26875b0819cd486a00b8d1d2d';

  console.log('[Audio] Transcribiendo nota de voz con Deepgram...');
  
  const dgResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=es', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${deepgramApiKey}`,
      'Content-Type': 'audio/ogg' // Formato nativo de Telegram Voice Notes
    },
    body: Buffer.from(arrayBuffer)
  });

  if (!dgResponse.ok) {
    const errorText = await dgResponse.text();
    throw new Error(`Error en Deepgram: ${dgResponse.status} - ${errorText}`);
  }

  const result = await dgResponse.json();
  const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  
  return transcript.trim();
}

// Genera un audio ultra realista usando ElevenLabs
export async function generateSpeechElevenLabs(text: string): Promise<Buffer> {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error('Falta la API Key de ElevenLabs para generar audio.');
  }

  // Usamos una voz estable. Si suena raro o como "borracho", suele ser por el 'style' en niveles altos.
  const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel (estándar hiper clara en español usando V2)

  console.log('[Audio] Generando voz hiperrealista con ElevenLabs...');
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en ElevenLabs: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
