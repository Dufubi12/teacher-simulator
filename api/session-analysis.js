/**
 * Vercel Serverless Function - Session Analysis
 * Endpoint: /api/session-analysis
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
        const { conversationHistory, scenarioId, duration } = req.body;

        if (!conversationHistory || conversationHistory.length === 0) {
            return res.status(400).json({ error: 'conversationHistory is required' });
        }

        const messages = [
            {
                role: 'system',
                content: getSessionAnalysisPrompt()
            },
            {
                role: 'user',
                content: `Проанализируй сессию тренировки:\n\nСценарий: ${scenarioId}\nПродолжительность: ${Math.round(duration / 60)} минут\n\nДиалог:\n${formatConversation(conversationHistory)}`
            }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.6,
            max_tokens: 600,
            response_format: { type: "json_object" }
        });

        const response = JSON.parse(completion.choices[0].message.content);

        res.json({
            success: true,
            analysis: response,
            tokensUsed: completion.usage.total_tokens,
            cost: calculateCost(completion.usage)
        });

    } catch (error) {
        console.error('[AI] Error:', error);
        res.status(500).json({
            error: 'Session analysis failed',
            message: error.message
        });
    }
}

function getSessionAnalysisPrompt() {
    return `Ты - AI-аналитик педагогических навыков.

Проанализируй всю сессию обучения и дай итоговую оценку в JSON:

{
  "overallScore": <0-100>,
  "strengths": ["<сильная сторона 1>", "<сильная сторона 2>"],
  "improvements": ["<что улучшить 1>", "<что улучшить 2>"],
  "skillsProgress": {
    "empathy": <0-100>,
    "conflictResolution": <0-100>,
    "boundaryKeeping": <0-100>,
    "patience": <0-100>
  },
  "achievements": ["<достижение>"] (если есть),
  "summary": "<краткий итог, 2-3 предложения>"
}

Будь подробным, но позитивным.`;
}

function formatConversation(history) {
    return history.map((msg, i) =>
        `${i + 1}. ${msg.role === 'teacher' ? 'Учитель' : 'Ученик'}: ${msg.content}`
    ).join('\n');
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
