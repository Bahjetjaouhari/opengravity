import { transcribeAudioUrl } from './src/audio/services.js';
console.log("Testing Groq Whisper...");
transcribeAudioUrl('https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg')
  .then(text => console.log('✅ OK - Text:', text))
  .catch(console.error);
