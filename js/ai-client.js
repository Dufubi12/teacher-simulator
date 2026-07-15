/**
 * AI Client for Virtual Pedagogue Frontend
 * Connects to AI backend for psychological co-pilot features.
 *
 * Error model:
 *   - Throws AIError with `.kind` field: 'rate_limit' | 'server' | 'network' | 'unknown'
 *   - Auto-retries 429 once after Retry-After (or 1s) before throwing
 */

class AIError extends Error {
    constructor(message, kind, status) {
        super(message);
        this.name = 'AIError';
        this.kind = kind; // 'rate_limit' | 'server' | 'network' | 'unknown'
        this.status = status;
    }
}

class AIClient {
    constructor(apiUrl) {
        if (!apiUrl) {
            const hostname = window.location.hostname;
            apiUrl = (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '')
                ? 'http://localhost:3000/api'
                : '/api';
        }

        this.apiUrl = apiUrl;
        this.conversationHistory = [];
        this.totalCost = 0;
        this.debugMode = true;
    }

    /**
     * Internal: fetch with retry on 429.
     * Retries once after Retry-After header (or 1s default).
     */
    async _fetchWithRetry(url, options) {
        let response;
        try {
            response = await fetch(url, options);
        } catch (networkError) {
            throw new AIError('Нет подключения к серверу', 'network', 0);
        }

        if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            const retryAfterSec = parseInt(retryAfterHeader, 10);
            const waitMs = Number.isFinite(retryAfterSec) ? Math.min(retryAfterSec * 1000, 4000) : 1000;
            this.log(`[AIClient] 429 received, retrying once after ${waitMs}ms`);
            await new Promise(r => setTimeout(r, waitMs));
            try {
                response = await fetch(url, options);
            } catch {
                throw new AIError('Нет подключения к серверу', 'network', 0);
            }
            if (response.status === 429) {
                throw new AIError('AI временно перегружен. Попробуйте через минуту.', 'rate_limit', 429);
            }
        }

        if (!response.ok) {
            const kind = response.status >= 500 ? 'server' : 'unknown';
            const msg = response.status >= 500
                ? 'AI сервис временно недоступен. Попробуйте через минуту.'
                : `Ошибка запроса (${response.status})`;
            throw new AIError(msg, kind, response.status);
        }

        return response;
    }

    /**
     * Analyze teacher's message and get feedback.
     * @param {string} teacherMessage
     * @param {string} studentType
     * @param {string} scenarioContext
     * @param {Array<{type: string, text: string}>} [hintsHistory] — previous hints in this session
     * @returns {Promise<Object>}
     */
    async analyzeMessage(teacherMessage, studentType, scenarioContext, hintsHistory) {
        this.log('Analyzing message:', teacherMessage);

        const response = await this._fetchWithRetry(`${this.apiUrl}/analyze-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacherMessage,
                studentType,
                scenarioContext,
                conversationHistory: this.conversationHistory,
                hintsHistory: hintsHistory || []
            })
        });

        const data = await response.json();

        this.conversationHistory.push({ role: 'teacher', content: teacherMessage });
        if (data.cost?.estimatedCostUSD) {
            this.totalCost += parseFloat(data.cost.estimatedCostUSD);
        }

        this.log('Analysis received, total cost so far: $' + this.totalCost.toFixed(6));
        return data.analysis;
    }

    /**
     * Generate AI hint for a specific situation.
     */
    async generateHint(situation, studentType, urgency = 'medium', hintsHistory) {
        this.log('Generating hint for:', situation);

        const response = await this._fetchWithRetry(`${this.apiUrl}/generate-hint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                situation,
                studentType,
                urgency,
                hintsHistory: hintsHistory || []
            })
        });

        const data = await response.json();
        if (data.cost?.estimatedCostUSD) {
            this.totalCost += parseFloat(data.cost.estimatedCostUSD);
        }
        return data.hint;
    }

    /**
     * Get final session analysis.
     * @param {string} scenarioId
     * @param {number} duration — ms
     * @param {Array} [hintsHistory] — hints that were issued during the session
     * @param {string|null} [drillId] — id микро-дрилла (цель хранится на сервере, allowlist)
     */
    async getSessionAnalysis(scenarioId, duration, hintsHistory, drillId) {
        this.log('Getting session analysis...');

        const response = await this._fetchWithRetry(`${this.apiUrl}/session-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversationHistory: this.conversationHistory,
                scenarioId,
                duration,
                hintsHistory: hintsHistory || [],
                drillId: drillId || null
            })
        });

        const data = await response.json();
        if (data.cost?.estimatedCostUSD) {
            this.totalCost += parseFloat(data.cost.estimatedCostUSD);
        }

        this.log('Session analysis received, total session cost: $' + this.totalCost.toFixed(6));
        return data;
    }

    /**
     * Get director hiring report (структурированные наблюдения методиста).
     * @param {Object} ctx — { duration(ms), grade, subject, topic, students, schoolName, schoolRules }
     */
    async getDirectorReport(ctx) {
        this.log('Getting director report...');

        const response = await this._fetchWithRetry(`${this.apiUrl}/director-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversationHistory: this.conversationHistory,
                ...ctx
            })
        });

        const data = await response.json();
        if (data.cost?.estimatedCostUSD) {
            this.totalCost += parseFloat(data.cost.estimatedCostUSD);
        }
        if (!data.success) throw new Error(data.message || data.error || 'Director report failed');
        return data;
    }

    addStudentResponse(studentMessage) {
        this.conversationHistory.push({ role: 'student', content: studentMessage });
    }

    recordMessage(type, text) {
        // Системные сообщения UI («Урок начался», цель дрилла) — не реплики участников,
        // в историю для анализа не попадают
        if (type === 'system') return;
        this.conversationHistory.push({
            role: type === 'teacher' ? 'teacher' : 'student',
            content: text
        });
    }

    reset() {
        this.conversationHistory = [];
        this.totalCost = 0;
    }

    async checkHealth() {
        try {
            if (this.apiUrl === '/api') return true;
            const response = await fetch('http://localhost:3000/health');
            const data = await response.json();
            return data.status === 'OK';
        } catch {
            return false;
        }
    }

    getTotalCost() {
        return this.totalCost;
    }

    log(...args) {
        if (this.debugMode) {
            // eslint-disable-next-line no-console
            console.log('[AIClient]', ...args);
        }
    }
}

const aiClient = new AIClient();
window.AIError = AIError;

window.addEventListener('DOMContentLoaded', async () => {
    const isAvailable = await aiClient.checkHealth();
    if (!isAvailable && aiClient.apiUrl !== '/api') {
        console.warn('[AIClient] AI Backend not running locally.');
    }
});
