/**
 * AI Client for Virtual Pedagogue Frontend
 * Connects to AI backend for psychological co-pilot features
 */

class AIClient {
    constructor(apiUrl) {
        // Auto-detect API URL: use production if on Vercel, otherwise localhost (or file://)
        if (!apiUrl) {
            const hostname = window.location.hostname;
            // Empty string hostname means file:// protocol
            apiUrl = (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '')
                ? 'http://localhost:3000/api' // Vercel dev runs on port 3000
                : '/api'; // Vercel handles /api automatically
        }
        // AI backend routes are /api/analyze-message, so base URL should be http://localhost:3002
        // But wait, the client appends /analyze-message.
        // Let's check: fetch(`${this.apiUrl}/analyze-message`)
        // So unexpected: if apiUrl is 'http://localhost:3002/api', then url is 'http://localhost:3002/api/analyze-message'
        // That is correct.

        this.apiUrl = apiUrl;
        this.conversationHistory = [];
        this.totalCost = 0;
        this.debugMode = true;
    }

    /**
     * Analyze teacher's message and get feedback
     * @param {string} teacherMessage - The message to analyze
     * @param {string} studentType - Type of student (e.g., 'Провокатор', 'Лидер')
     * @param {string} scenarioContext - Context of the scenario
     * @returns {Promise<Object>} Analysis result
     */
    async analyzeMessage(teacherMessage, studentType, scenarioContext) {
        try {
            this.log('Analyzing message:', teacherMessage);

            const response = await fetch(`${this.apiUrl}/analyze-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    teacherMessage,
                    studentType,
                    scenarioContext,
                    conversationHistory: this.conversationHistory
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Update conversation history
            this.conversationHistory.push({
                role: 'teacher',
                content: teacherMessage
            });

            // Track cost
            this.totalCost += parseFloat(data.cost.estimatedCostUSD);

            this.log('Analysis received:', data.analysis);
            this.log('Tokens used:', data.tokensUsed);
            this.log('Total cost so far: $' + this.totalCost.toFixed(6));

            return data.analysis;

        } catch (error) {
            console.error('[AIClient] Error analyzing message:', error);
            throw error;
        }
    }

    /**
     * Generate AI hint for a specific situation
     * @param {string} situation - Description of the situation
     * @param {string} studentType - Type of student
     * @param {string} urgency - 'low', 'medium', or 'high'
     * @returns {Promise<Object>} Hint object
     */
    async generateHint(situation, studentType, urgency = 'medium') {
        try {
            this.log('Generating hint for:', situation);

            const response = await fetch(`${this.apiUrl}/generate-hint`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    situation,
                    studentType,
                    urgency
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.totalCost += parseFloat(data.cost.estimatedCostUSD);

            this.log('Hint received:', data.hint);

            return data.hint;

        } catch (error) {
            console.error('[AIClient] Error generating hint:', error);
            throw error;
        }
    }

    /**
     * Get final session analysis
     * @param {string} scenarioId - ID of the scenario
     * @param {number} duration - Duration in milliseconds
     * @returns {Promise<Object>} Session analysis
     */
    async getSessionAnalysis(scenarioId, duration) {
        try {
            this.log('Getting session analysis...');

            const response = await fetch(`${this.apiUrl}/session-analysis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversationHistory: this.conversationHistory,
                    scenarioId,
                    duration
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.totalCost += parseFloat(data.cost.estimatedCostUSD);

            this.log('Session analysis received:', data);
            this.log('Total session cost: $' + this.totalCost.toFixed(6));

            // Return the full data object which contains overall_score, feedback, good_points, etc.
            return data;

        } catch (error) {
            console.error('[AIClient] Error getting session analysis:', error);
            throw error;
        }
    }

    /**
     * Add student response to conversation history
     * @param {string} studentMessage - The student's message
     */
    addStudentResponse(studentMessage) {
        this.conversationHistory.push({
            role: 'student',
            content: studentMessage
        });
    }

    /**
     * Record a message in conversation history
     * @param {string} type - 'teacher' or 'student'
     * @param {string} text - The message text
     */
    recordMessage(type, text) {
        this.conversationHistory.push({
            role: type === 'teacher' ? 'teacher' : 'student',
            content: text
        });
        this.log(`Recorded ${type} message:`, text.substring(0, 50) + '...');
    }

    /**
     * Reset conversation history (for new session)
     */
    reset() {
        this.conversationHistory = [];
        this.totalCost = 0;
        this.log('Conversation history reset');
    }

    /**
     * Check if AI backend is available
     */
    async checkHealth() {
        try {
            // For production (Vercel) we don't need health check, assume it's available
            if (this.apiUrl === '/api') {
                this.log('Running on production, skipping health check');
                return true;
            }

            // For local development
            const response = await fetch('http://localhost:3001/health');
            const data = await response.json();
            this.log('Backend health check:', data);
            return data.status === 'OK';
        } catch (error) {
            console.error('[AIClient] Backend not available:', error);
            return false;
        }
    }

    /**
     * Get total cost for current session
     */
    getTotalCost() {
        return this.totalCost;
    }

    /**
     * Log to console in debug mode
     */
    log(...args) {
        if (this.debugMode) {
            console.log('[AIClient]', ...args);
        }
    }
}

// Create singleton instance
const aiClient = new AIClient();

// Check backend availability on load
window.addEventListener('DOMContentLoaded', async () => {
    const isAvailable = await aiClient.checkHealth();
    if (!isAvailable) {
        console.warn('[AIClient] AI Backend is not running. Start it with: npm start in ai-backend folder');
    }
});
