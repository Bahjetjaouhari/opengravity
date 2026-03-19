import OpenAI from 'openai';
import { env } from '../config/env.js';
import { getAvailableToolsDefinitions } from '../tools/index.js';

// Cliente principal (Groq)
export const groqClient = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: env.GROQ_API_KEY,
});

// Cliente secundario (OpenRouter, por si falla)
const openRouterClient = env.OPENROUTER_API_KEY ? new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/OpenGravity',
    'X-Title': 'OpenGravity',
  }
}) : null;

// Modelo principal
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = env.OPENROUTER_MODEL;

export const chatCompletion = async (messages: any[]) => {
  const tools = getAvailableToolsDefinitions();
  const requestConfig: any = {
    model: PRIMARY_MODEL,
    messages,
    temperature: 0.3,
  };

  if (tools.length > 0) {
    requestConfig.tools = tools;
    requestConfig.tool_choice = "auto";
  }

  try {
    const response = await groqClient.chat.completions.create(requestConfig);
    return response.choices[0].message;
  } catch (error: any) {
    console.error(`[LLM Groq Error] ${error.message}`);
    if (openRouterClient) {
      console.log(`[LLM Fallback] Intentando con OpenRouter balancer mágico...`);
      // Eliminamos las dependencias avanzadas de herramientas para que CUALQUIER IA gratis funcione sin dar Error 404
      delete requestConfig.tools;
      delete requestConfig.tool_choice;
      
      // Usamos el 'openrouter/free' que es un balanceador de carga automático
      requestConfig.model = 'openrouter/free';
      const response = await openRouterClient.chat.completions.create(requestConfig);
      console.log(`[LLM OpenRouter Response]`, JSON.stringify(response.choices[0].message));
      return response.choices[0].message;
    }
    
    throw error;
  }
};
