// Simple server to serve static files and proxy API requests
import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Parse JSON bodies
app.use(express.json());

// Serve static files from current directory
app.use(express.static(__dirname));

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
    try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        const { messages, temperature = 0.7, max_tokens = 150, response_format } = req.body;

        if (!messages) {
            return res.status(400).json({ error: 'messages array is required' });
        }

        console.log('[AI] Chat request:', messages[messages.length - 1].content.substring(0, 50) + '...');

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: temperature,
            max_tokens: max_tokens,
            response_format: response_format
        });

        const content = completion.choices[0].message.content;

        // Calculate cost
        const usage = completion.usage;
        const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;
        const outputCost = (usage.completion_tokens / 1_000_000) * 0.60;

        res.json({
            success: true,
            content: content,
            tokensUsed: usage.total_tokens,
            cost: {
                inputTokens: usage.prompt_tokens,
                outputTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
                estimatedCostUSD: (inputCost + outputCost).toFixed(6)
            }
        });

    } catch (error) {
        console.error('[AI] Chat Error:', error);
        res.status(500).json({
            error: 'Chat request failed',
            message: error.message
        });
    }
});

// API endpoint for analyzing teacher messages
app.post('/api/analyze-message', async (req, res) => {
    try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const { teacherMessage, studentType, scenarioContext, conversationHistory } = req.body;

        const messages = [
            {
                role: 'system',
                content: `Ты эксперт-педагог. Анализируй сообщения учителя и давай краткую обратную связь.`
            },
            {
                role: 'user',
                content: `Проанализируй фразу учителя: "${teacherMessage}"

Контекст: урок с учеником типа "${studentType}".

Дай краткий анализ в формате JSON:
{
  "effectiveness": "high|medium|low",
  "tone": "positive|neutral|negative",
  "suggestion": "краткий совет учителю"
}`
            }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 150,
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(completion.choices[0].message.content);
        const usage = completion.usage;
        const cost = ((usage.prompt_tokens / 1_000_000) * 0.15 + (usage.completion_tokens / 1_000_000) * 0.60).toFixed(6);

        res.json({
            analysis: analysis,
            tokensUsed: usage.total_tokens,
            cost: { estimatedCostUSD: cost }
        });

    } catch (error) {
        console.error('[AI] Analyze Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint for session analysis
app.post('/api/session-analysis', async (req, res) => {
    try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const { conversationHistory, scenarioId, duration } = req.body;

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
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'AI Backend is running' });
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log(`📄 Open: http://localhost:${PORT}/simulator_v4_avatar.html`);
});
