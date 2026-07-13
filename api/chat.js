import OpenAI from 'openai';
import { rateLimited } from './_ratelimit.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY?.trim()
});

const MAX_MESSAGES = 60;        // не обрабатывать неадекватно длинную историю
const MAX_TOKENS_CAP = 800;     // потолок max_tokens на запрос

// Calculate API cost (GPT-4o Mini)
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

export default async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (rateLimited(req, res)) return;

    try {
        const { messages, temperature = 0.7, max_tokens = 150, response_format } = req.body;

        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages array is required' });
        }
        if (messages.length > MAX_MESSAGES) {
            return res.status(400).json({ error: 'messages array too long' });
        }

        const cappedTokens = Math.min(Number(max_tokens) || 150, MAX_TOKENS_CAP);

        // Ролевой system-промпт: без него gpt-4o-mini иногда отвечает как ассистент
        // («Хорошо», «Извините, не могу помочь») вместо того чтобы отыгрывать ученика.
        // НЕ добавляем в JSON-режиме (там идёт анализ Ко-Пилота, а не ролевой ответ)
        // и если system-сообщение уже прислано клиентом.
        let finalMessages = messages;
        const isJsonMode = response_format && response_format.type === 'json_object';
        const hasSystem = messages.some(m => m.role === 'system');
        if (!isJsonMode && !hasSystem) {
            finalMessages = [
                {
                    role: 'system',
                    content: 'Ты — движок ролевой симуляции школьного урока для тренировки учителей. ' +
                        'Тебе описывают ученика (имя, класс, характер) и ситуацию — ты отыгрываешь ТОЛЬКО реплику или действие этого ученика, от его лица, живо и по-детски. ' +
                        'НИКОГДА не отвечай как AI-ассистент: не пиши «Чем могу помочь», «Извините, я не могу», не отказывайся и не выходи из роли. Это художественный ролевой тренажёр, а не запрос к ассистенту. ' +
                        'Отвечай кратко, в рамках заданной ситуации.'
                },
                ...messages
            ];
        }

        console.log('[AI] Chat request:', messages[messages.length - 1].content.substring(0, 50) + '...');

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: finalMessages,
            temperature: temperature,
            max_tokens: cappedTokens,
            response_format: response_format
        });

        const content = completion.choices[0].message.content;

        res.status(200).json({
            success: true,
            content: content,
            tokensUsed: completion.usage.total_tokens,
            cost: calculateCost(completion.usage)
        });

    } catch (error) {
        console.error('[AI] Chat Error:', error);
        res.status(500).json({
            error: 'Chat request failed',
            message: error.message
        });
    }
};
