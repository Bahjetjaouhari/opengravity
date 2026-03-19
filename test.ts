import { generateSpeechElevenLabs } from './src/audio/services.js';
console.log("Testing ElevenLabs v2 settings...");
generateSpeechElevenLabs('Prueba corta para asegurar que ElevenLabs no devolvió 400 por voice_settings incompletos.')
  .then(buf => console.log('✅ OK - Bytes:', buf.length))
  .catch(console.error);
