import OpenAI from 'openai';
import { env } from '../config/env.js';
import { getAvailableToolsDefinitions } from '../tools/index.js';

// Cliente principal (OpenRouter)
export const openRouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/OpenGravity',
    'X-Title': 'OpenGravity',
  }
});

// Modelo principal
const PRIMARY_MODEL = env.OPENROUTER_MODEL || 'google/gemma-3-27b-it:free';

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
    const response = await openRouterClient.chat.completions.create(requestConfig);
    console.log(`[LLM OpenRouter Response]`, JSON.stringify(response.choices[0].message));
    return response.choices[0].message;
  } catch (error: any) {
    console.error(`[LLM OpenRouter Error] ${error.message}`);
    throw error;
  }
};
