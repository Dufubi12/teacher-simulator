/**
 * Vercel Serverless Function - Analyze Message
 * Endpoint: /api/analyze-message
 */

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY?.trim()
});

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { teacherMessage, studentType, scenarioContext, conversationHistory = [] } = req.body;

        if (!teacherMessage) {
            return res.status(400).json({ error: 'teacherMessage is required' });
        }

        console.log('[AI] Analyzing message:', teacherMessage);

        const messages = [
            {
                role: 'system',
                content: getSystemPrompt(studentType, scenarioContext)
            },
            ...conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: `Учитель сказал: "${teacherMessage}"\n\nПроанализируй эту реплику и дай оценку.`
            }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 300,
            response_format: { type: "json_object" }
        });

        const response = JSON.parse(completion.choices[0].message.content);

        console.log('[AI] Response:', response);

        res.json({
            success: true,
            analysis: response,
            tokensUsed: completion.usage.total_tokens,
            cost: calculateCost(completion.usage)
        });

    } catch (error) {
        console.error('[AI] Error:', error);
        res.status(500).json({
            error: 'AI analysis failed',
            message: error.message
        });
    }
}

function getSystemPrompt(studentType, scenarioContext) {
    return `Ты - опытный педагог-психолог, который помогает молодым учителям развивать навыки общения с учениками.

Контекст сценария: ${scenarioContext || 'Стандартный урок'}
Тип ученика: ${studentType || 'Обычный ученик'}

Твоя задача - анализировать реплики учителя и давать конструктивную обратную связь в формате JSON:

{
  "score": <число 0-100>,
  "feedback": "<краткая оценка, 1-2 предложения>",
  "tone": "positive" | "neutral" | "negative",
  "skills": {
    "empathy": <0-100>,
    "assertiveness": <0-100>,
    "professionalism": <0-100>
  },
  "suggestions": ["<конкретное улучшение>"],
  "warning": "<предупреждение, если есть>" (опционально)
}

Оценивай:
1. Эмпатию (понимание чувств ученика)
2. Ассертивность (уверенность без агрессии)
3. Профессионализм (соблюдение границ)
4. Тон голоса (дружелюбный, нейтральный, агрессивный)

Будь конструктивным, но честным.`;
}

function calculateCost(usage) {
    const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;
    const outputCost = (usage.completion_tokens / 1_000_000) * 0.60;
    return {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCostUSD: (inputCost + outputCost).toFixed(6)
    };
}
