/**
 * Vercel Serverless Function - Session Analysis
 * Endpoint: /api/session-analysis
 */

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY?.trim()
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

        console.log('[AI] Session Analysis request:', {
            scenarioId,
            duration,
            messagesCount: conversationHistory.length
        });

        const messages = [
            {
                role: 'system',
                content: `Ты эксперт-педагог и психолог. Проанализируй урок учителя с учениками и дай детальную оценку.`
            },
            {
                role: 'user',
                content: `История урока:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Длительность: ${Math.round(duration / 60000)} минут.

Проанализируй урок детально и верни JSON в формате:
{
  "overall_score": 75,
  "feedback": "Общий развернутый комментарий о том, как прошел урок (3-4 предложения)",
  "good_points": [
    "Что учитель сделал хорошо (минимум 3 пункта)",
    "Какие педагогические приемы были эффективны",
    "Положительные моменты коммуникации"
  ],
  "bad_points": [
    "Что можно было сделать лучше (минимум 2 пункта)",
    "Упущенные возможности",
    "Проблемные моменты"
  ],
  "recommendations": [
    "Конкретная рекомендация 1 для улучшения",
    "Конкретная рекомендация 2",
    "Конкретная рекомендация 3"
  ],
  "skills": {
    "empathy": 75,
    "conflictResolution": 80,
    "boundaryKeeping": 70,
    "patience": 85
  },
  "skillsExplanation": {
    "empathy": "Почему именно этот балл по эмпатии? Что учитель делал хорошо/плохо в плане понимания эмоций учеников?",
    "conflictResolution": "Как учитель справлялся с конфликтами? Какие методы использовал?",
    "boundaryKeeping": "Насколько четко учитель устанавливал границы? Примеры из урока",
    "patience": "Проявлял ли учитель терпение? Конкретные примеры"
  }
}

**Важно про навыки:**
- Эмпатия (0-100): Понимание эмоций учеников, сочувствие, эмоциональная поддержка
- Разрешение конфликтов (0-100): Умение находить компромиссы, деэскалация конфликтов
- Границы (0-100): Установка четких правил, контроль дисциплины
- Терпение (0-100): Спокойствие в сложных ситуациях, выдержка

Оценки от 0 до 100. Будь объективным но справедливым. В skillsExplanation дай конкретные примеры из урока.`
            }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 800,
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(completion.choices[0].message.content);
        const usage = completion.usage;
        const cost = ((usage.prompt_tokens / 1_000_000) * 0.15 + (usage.completion_tokens / 1_000_000) * 0.60).toFixed(6);

        console.log('[AI] Session Analysis generated:', JSON.stringify(analysis, null, 2));

        res.json({
            ...analysis,  // Spread the analysis directly (contains overall_score, feedback, etc.)
            tokensUsed: usage.total_tokens,
            cost: { estimatedCostUSD: cost }
        });

    } catch (error) {
        console.error('[AI] Session Analysis Error:', error);
        res.status(500).json({
            error: 'Session analysis failed',
            message: error.message
        });
    }
}
