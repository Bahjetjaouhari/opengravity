import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_ALLOWED_USER_IDS: (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id)),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'openrouter/free',
  DB_PATH: path.resolve(process.env.DB_PATH || './memory.db'),
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
  
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || '',
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || '',
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || '',
  
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',

  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || '',

  // PIN de seguridad para comando /vaciarbd
  WIPE_DB_PIN: process.env.WIPE_DB_PIN || '',

  // WhatsApp para tienda pública (sin el +)
  WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER || ''
};

// Basic Validation
if (!env.TELEGRAM_BOT_TOKEN) throw new Error('El TELEGRAM_BOT_TOKEN es necesario. Revisa tu .env.');
if (env.TELEGRAM_ALLOWED_USER_IDS.length === 0) throw new Error('TELEGRAM_ALLOWED_USER_IDS no es válido o está vacío.');
// DEEPGRAM_API_KEY es opcional - solo se necesita para transcripción de audio
if (!env.DEEPGRAM_API_KEY) console.warn('[Config] DEEPGRAM_API_KEY no configurado - transcripción de audio deshabilitada.');
if (!env.WIPE_DB_PIN) console.warn('[Config] WIPE_DB_PIN no configurado - comando /vaciarbd deshabilitado.');
