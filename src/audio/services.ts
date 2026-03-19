import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { env } from '../config/env.js';
import { groqClient } from '../agent/llm.js';

// Transcribe un archivo de audio descargado desde una URL de Telegram
export async function transcribeAudioUrl(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Error descargando audio: ${response.statusText}`);
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Guardamos temporalmente en /tmp (accesible en Vercel Serverless) porque Groq/OpenAI 
  // pide un ReadStream para subir el archivo.
  const tempFilePath = path.join(os.tmpdir(), `voice_in_${Date.now()}.ogg`);
  fs.writeFileSync(tempFilePath, buffer);
  
  try {
    console.log('[Audio] Transcribiendo nota de voz con Groq Whisper...');
    const transcription = await groqClient.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-large-v3-turbo',
      language: 'es', // Forzamos español por defecto para evitar traducciones indeseadas por ruido
    });
    
    return transcription.text;
  } finally {
    // Siempre borramos el archivo para no saturar la memoria de Vercel
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
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
