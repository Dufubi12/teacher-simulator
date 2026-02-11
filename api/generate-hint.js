/**
 * Vercel Serverless Function - Generate Hint
 * Endpoint: /api/generate-hint
 */

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
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
        const { situation, studentType, urgency = 'medium' } = req.body;

        if (!situation) {
            return res.status(400).json({ error: 'situation is required' });
        }

        const messages = [
            {
                role: 'system',
                content: getHintSystemPrompt(studentType, urgency)
            },
            {
                role: 'user',
                content: situation
            }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.8,
            max_tokens: 150,
            response_format: { type: "json_object" }
        });

        const response = JSON.parse(completion.choices[0].message.content);

        res.json({
            success: true,
            hint: response,
            tokensUsed: completion.usage.total_tokens,
            cost: calculateCost(completion.usage)
        });

    } catch (error) {
        console.error('[AI] Error:', error);
        res.status(500).json({
            error: 'Hint generation failed',
            message: error.message
        });
    }
}

function getHintSystemPrompt(studentType, urgency) {
    const urgencyMap = {
        'low': 'Дай легкий совет.',
        'medium': 'Дай конкретную рекомендацию.',
        'high': 'Дай срочное предупреждение!'
    };

    return `Ты - AI-помощник для учителей в реальном времени.

Тип ученика: ${studentType || 'Обычный'}
Уровень срочности: ${urgencyMap[urgency]}

Формат ответа JSON:
{
  "type": "tip" | "warning" | "success",
  "message": "<краткое сообщение для учителя>",
  "action": "<что сделать>" (опционально)
}

Будь кратким и конкретным (макс 2 предложения).`;
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
