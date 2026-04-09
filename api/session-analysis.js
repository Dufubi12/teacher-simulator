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

        // Handle very short sessions (< 30 seconds or < 3 messages)
        const durationSeconds = Math.round(duration / 1000);
        if (durationSeconds < 30 || conversationHistory.length < 3) {
            return res.json({
                overall_score: 0,
                feedback: 'Урок был слишком коротким для полноценного анализа. Проведите урок продолжительностью не менее 2–3 минут, чтобы получить объективную оценку.',
                good_points: ['Вы запустили симулятор — это первый шаг!'],
                bad_points: ['Урок завершён слишком рано — нет достаточно данных для анализа'],
                recommendations: [
                    'Проведите урок не менее 2–3 минут',
                    'Дайте ученикам время на реакцию и взаимодействие',
                    'Попробуйте обратиться к каждому ученику хотя бы раз'
                ],
                skills: { empathy: 0, conflictResolution: 0, boundaryKeeping: 0, patience: 0 },
                skillsExplanation: {
                    empathy: 'Данных недостаточно для оценки',
                    conflictResolution: 'Данных недостаточно для оценки',
                    boundaryKeeping: 'Данных недостаточно для оценки',
                    patience: 'Данных недостаточно для оценки'
                },
                tokensUsed: 0,
                cost: { estimatedCostUSD: '0.000000' }
            });
        }

        console.log('[AI] Session Analysis request:', {
            scenarioId,
            duration,
            messagesCount: conversationHistory.length
        });

        const messages = [
            {
                role: 'system',
                content: `Ты эксперт-педагог и психолог. Проанализируй урок учителя с учениками и дай детальную оценку.

ВАЖНО: Оценивай ЧЕСТНО и РАЗНООБРАЗНО. НЕ ставь 75 по умолчанию!
- Плохой урок (агрессия, игнорирование, грубость): 15-35 баллов
- Слабый урок (мало взаимодействия, пассивность): 35-50 баллов
- Средний урок (есть попытки, но много ошибок): 50-65 баллов
- Хороший урок (эмпатия, открытые вопросы, похвала): 65-82 баллов
- Отличный урок (всё сделано грамотно, разнообразные приемы): 82-95 баллов
- Идеальный урок (мастерский уровень): 95-100 баллов

Каждый навык оценивай НЕЗАВИСИМО. Разброс между навыками должен быть реалистичным (например: empathy=85, patience=40 — если учитель чуткий, но нетерпеливый).`
            },
            {
                role: 'user',
                content: `История урока:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Длительность: ${Math.round(duration / 60000)} минут.

Проанализируй урок детально и верни JSON в формате:
{
  "overall_score": 0,
  "feedback": "Общий развернутый комментарий о том, как прошел урок (3-4 предложения)",
  "good_points": [
    "Конкретный пример хорошего действия учителя",
    "Ещё один положительный момент",
    "Третий положительный момент"
  ],
  "bad_points": [
    "Конкретная ошибка или упущение",
    "Ещё одна проблема"
  ],
  "recommendations": [
    "Конкретная практическая рекомендация 1",
    "Конкретная практическая рекомендация 2",
    "Конкретная практическая рекомендация 3"
  ],
  "skills": {
    "empathy": 0,
    "conflictResolution": 0,
    "boundaryKeeping": 0,
    "patience": 0
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

Оценки от 0 до 100. Будь объективным но справедливым. В skillsExplanation дай конкретные примеры из урока.
Все числовые поля (overall_score, empathy и т.д.) — ЦЕЛЫЕ ЧИСЛА от 0 до 100. Нули в примере — это заглушки, замени их на реальные оценки этого конкретного урока.`
            }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 1500,
            response_format: { type: "json_object" }
        });

        let analysis;
        try {
            analysis = JSON.parse(completion.choices[0].message.content);
        } catch (parseError) {
            console.error('[AI] JSON parse failed, raw content:', completion.choices[0].message.content);
            // Attempt to fix truncated JSON by closing brackets
            const raw = completion.choices[0].message.content;
            try {
                const fixed = raw + (raw.includes('"skillsExplanation"') ? '}}' : '"}]}');
                analysis = JSON.parse(fixed);
            } catch {
                analysis = {
                    overall_score: 50,
                    feedback: 'Анализ не удалось обработать полностью. Попробуйте ещё раз.',
                    good_points: ['Урок завершён'],
                    bad_points: ['Анализ был обрезан из-за ограничений'],
                    recommendations: ['Попробуйте провести урок ещё раз для более точного анализа'],
                    skills: { empathy: 50, conflictResolution: 50, boundaryKeeping: 50, patience: 50 }
                };
            }
        }
        // Ensure overall_score is always a number
        if (typeof analysis.overall_score !== 'number') {
            analysis.overall_score = parseInt(analysis.overall_score) || 50;
        }

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
