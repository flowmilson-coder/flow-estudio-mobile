import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export async function getAIProducerFeedback(projectData: any) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `As a professional music producer, analyze this project and provide mixing/mastering advice.
    
    Project Context:
    - Title: ${projectData.title}
    - Genre: ${projectData.genre || 'Not specified'}
    - Target Production Style: ${projectData.producerStyle || 'AI Freedom'}
    - User Expectations: ${projectData.expectations || 'Professional quality'}
    
    Current Tracks: ${JSON.stringify(projectData.tracks)}
    
    Provide specific advice on:
    1. Volume balance (considering the ${projectData.genre} style)
    2. Vocal clarity and processing (based on ${projectData.producerStyle}'s typical sound)
    3. Background vocal placement
    4. Overall vibe and professional polish tips to meet the user's expectations.`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
    }
  });
  return response.text;
}

export async function generateLyrics(prompt: string) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate creative lyrics based on this prompt: ${prompt}`,
  });
  return response.text;
}
