/**
 * Analytics Module for Virtual Pedagogue
 * Centralized tracking for Google Analytics 4 and Yandex Metrika
 */

class Analytics {
    constructor() {
        this.isInitialized = false;
        this.debugMode = true; // Set to false in production
    }

    /**
     * Initialize analytics services
     * @param {Object} config - Configuration object
     * @param {string} config.ga4MeasurementId - Google Analytics 4 Measurement ID (G-XXXXXXXXXX)
     * @param {string} config.yandexMetrikaId - Yandex Metrika Counter ID
     */
    init(config) {
        if (this.isInitialized) {
            console.warn('[Analytics] Already initialized');
            return;
        }

        // Google Analytics 4
        if (config.ga4MeasurementId) {
            this.initGA4(config.ga4MeasurementId);
        }

        // Yandex Metrika
        if (config.yandexMetrikaId) {
            this.initYandexMetrika(config.yandexMetrikaId);
        }

        this.isInitialized = true;
        this.log('Analytics initialized successfully');
    }

    /**
     * Initialize Google Analytics 4
     */
    initGA4(measurementId) {
        // Load gtag.js script
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        document.head.appendChild(script);

        // Initialize dataLayer
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        window.gtag = gtag;

        gtag('js', new Date());
        gtag('config', measurementId, {
            send_page_view: true,
            anonymize_ip: true // GDPR compliance
        });

        this.log('GA4 initialized with ID:', measurementId);
    }

    /**
     * Initialize Yandex Metrika
     */
    initYandexMetrika(counterId) {
        // Load Yandex Metrika script
        (function (m, e, t, r, i, k, a) {
            m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) };
            m[i].l = 1 * new Date();
            k = e.createElement(t), a = e.getElementsByTagName(t)[0];
            k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
        })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

        window.ym = window.ym || function () { };
        ym(counterId, "init", {
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true,
            webvisor: true
        });

        this.yandexCounterId = counterId;
        this.log('Yandex Metrika initialized with ID:', counterId);
    }

    /**
     * Track custom event
     * @param {string} eventName - Name of the event
     * @param {Object} params - Event parameters
     */
    trackEvent(eventName, params = {}) {
        if (!this.isInitialized) {
            console.warn('[Analytics] Not initialized. Call init() first.');
            return;
        }

        // Google Analytics 4
        if (window.gtag) {
            gtag('event', eventName, params);
        }

        // Yandex Metrika
        if (window.ym && this.yandexCounterId) {
            ym(this.yandexCounterId, 'reachGoal', eventName, params);
        }

        this.log(`Event tracked: ${eventName}`, params);
    }

    // ==================== SCENARIO EVENTS ====================

    /**
     * Track when user selects a scenario
     */
    trackScenarioSelected(scenarioId, difficulty, studentCount) {
        this.trackEvent('scenario_selected', {
            scenario_id: scenarioId,
            difficulty: difficulty,
            student_count: studentCount
        });
    }

    /**
     * Track when scenario starts
     */
    trackScenarioStarted(scenarioId, studentTypes) {
        this.trackEvent('scenario_started', {
            scenario_id: scenarioId,
            student_types: studentTypes.join(','),
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Track when scenario is completed
     */
    trackScenarioCompleted(scenarioId, score, duration, mistakesCount) {
        this.trackEvent('scenario_completed', {
            scenario_id: scenarioId,
            score: score,
            duration_seconds: Math.round(duration / 1000),
            mistakes_count: mistakesCount,
            success: score >= 70 // Consider 70+ as success
        });
    }

    // ==================== AI HINT EVENTS ====================

    /**
     * Track when AI hint is shown
     */
    trackAIHintShown(hintType, triggerReason, context = {}) {
        this.trackEvent('ai_hint_shown', {
            hint_type: hintType, // 'warning', 'success', 'tip', 'error'
            trigger_reason: triggerReason,
            scenario_id: context.scenarioId,
            student_type: context.studentType
        });
    }

    /**
     * Track when user follows AI suggestion (clicks "rewind")
     */
    trackAIHintFollowed(hintType, originalMessage, correctedMessage) {
        this.trackEvent('ai_hint_followed', {
            hint_type: hintType,
            had_correction: originalMessage !== correctedMessage
        });
    }

    // ==================== VOICE EVENTS ====================

    /**
     * Track voice recording usage
     */
    trackVoiceRecordingUsed(duration, transcriptionSuccess, confidence) {
        this.trackEvent('voice_recording_used', {
            duration_ms: duration,
            success: transcriptionSuccess,
            confidence: Math.round(confidence * 100),
            browser: this.getBrowserName()
        });
    }

    /**
     * Track voice tone analysis
     */
    trackVoiceToneAnalyzed(toneType, volume, pitch, speed) {
        this.trackEvent('voice_tone_analyzed', {
            tone_type: toneType, // 'aggressive', 'calm', 'neutral'
            volume_db: volume,
            pitch_hz: pitch,
            speed_wpm: speed
        });
    }

    // ==================== USER EVENTS ====================

    /**
     * Track user registration
     */
    trackUserRegistered(method = 'email') {
        this.trackEvent('user_registered', {
            method: method,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Track user login
     */
    trackUserLogin(method = 'email') {
        this.trackEvent('user_login', {
            method: method
        });
    }

    /**
     * Track achievement unlocked
     */
    trackAchievementUnlocked(achievementId, achievementTitle) {
        this.trackEvent('achievement_unlocked', {
            achievement_id: achievementId,
            achievement_title: achievementTitle,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Track profile view
     */
    trackProfileViewed() {
        this.trackEvent('profile_viewed');
    }

    // ==================== NAVIGATION EVENTS ====================

    /**
     * Track page view manually (for SPAs)
     */
    trackPageView(pagePath, pageTitle) {
        if (window.gtag) {
            gtag('event', 'page_view', {
                page_path: pagePath,
                page_title: pageTitle
            });
        }

        if (window.ym && this.yandexCounterId) {
            ym(this.yandexCounterId, 'hit', pagePath, {
                title: pageTitle
            });
        }

        this.log(`Page view tracked: ${pagePath}`);
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get browser name for analytics
     */
    getBrowserName() {
        const userAgent = navigator.userAgent;
        if (userAgent.indexOf("Chrome") > -1) return "Chrome";
        if (userAgent.indexOf("Safari") > -1) return "Safari";
        if (userAgent.indexOf("Firefox") > -1) return "Firefox";
        if (userAgent.indexOf("Edge") > -1) return "Edge";
        return "Unknown";
    }

    /**
     * Log to console in debug mode
     */
    log(...args) {
        if (this.debugMode) {
            console.log('[Analytics]', ...args);
        }
    }
}

// Create singleton instance
const analytics = new Analytics();

// Auto-initialize if config is available in window
if (window.ANALYTICS_CONFIG) {
    analytics.init(window.ANALYTICS_CONFIG);
}
