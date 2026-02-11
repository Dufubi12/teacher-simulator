/**
 * Voice Recognition Module for Virtual Pedagogue
 * Uses Web Speech API for speech-to-text and basic tone analysis
 */

class VoiceRecognition {
    constructor() {
        // Check browser support
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!this.SpeechRecognition) {
            console.warn('[VoiceRecognition] Web Speech API not supported in this browser');
            this.isSupported = false;
            return;
        }

        this.isSupported = true;
        this.isRecording = false;
        this.recognition = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.analyser = null;

        this.debugMode = true;
    }

    /**
     * Initialize recognition instance with configuration
     */
    initRecognition() {
        this.recognition = new this.SpeechRecognition();

        // Configuration
        this.recognition.lang = 'ru-RU'; // Russian language
        this.recognition.continuous = false; // Stop after user stops speaking
        this.recognition.interimResults = true; // Get partial results while speaking
        this.recognition.maxAlternatives = 1; // Number of alternative transcriptions

        this.log('Speech recognition initialized');
    }

    /**
     * Start voice recording and transcription
     * @returns {Promise<Object>} { transcript, confidence, duration }
     */
    async start() {
        if (!this.isSupported) {
            throw new Error('Speech recognition not supported');
        }

        if (this.isRecording) {
            throw new Error('Already recording');
        }

        this.initRecognition();
        this.isRecording = true;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            let finalTranscript = '';
            let interimTranscript = '';

            // Event: Result received
            this.recognition.onresult = (event) => {
                interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;

                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                        this.log('Final transcript:', transcript);
                    } else {
                        interimTranscript += transcript;
                        this.log('Interim transcript:', transcript);

                        // Emit interim result for UI updates
                        if (this.onInterimResult) {
                            this.onInterimResult(interimTranscript);
                        }
                    }
                }
            };

            // Event: Recognition ended
            this.recognition.onend = () => {
                this.isRecording = false;
                const duration = Date.now() - startTime;

                if (finalTranscript.trim()) {
                    resolve({
                        transcript: finalTranscript.trim(),
                        confidence: 0.9, // Web Speech API doesn't provide confidence in all browsers
                        duration: duration,
                        success: true
                    });
                } else {
                    reject(new Error('No speech detected'));
                }

                this.cleanup();
            };

            // Event: Error
            this.recognition.onerror = (event) => {
                this.isRecording = false;
                this.log('Recognition error:', event.error);

                const duration = Date.now() - startTime;

                reject({
                    error: event.error,
                    message: this.getErrorMessage(event.error),
                    duration: duration,
                    success: false
                });

                this.cleanup();
            };

            // Start recognition
            try {
                this.recognition.start();
                this.log('Recording started');
            } catch (error) {
                this.isRecording = false;
                reject(error);
            }
        });
    }

    /**
     * Stop recording manually
     */
    stop() {
        if (this.recognition && this.isRecording) {
            this.recognition.stop();
            this.log('Recording stopped manually');
        }
    }

    /**
     * Analyze audio tone (volume, pitch)
     * Requires microphone permission
     */
    async analyzeTone() {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Create analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            source.connect(this.analyser);

            // Analyze
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            const timeDataArray = new Uint8Array(this.analyser.fftSize);

            this.analyser.getByteFrequencyData(dataArray);
            this.analyser.getByteTimeDomainData(timeDataArray);

            // Calculate volume (RMS)
            let sum = 0;
            for (let i = 0; i < timeDataArray.length; i++) {
                const normalized = (timeDataArray[i] - 128) / 128;
                sum += normalized * normalized;
            }
            const rms = Math.sqrt(sum / timeDataArray.length);
            const volume = Math.round(rms * 100);

            // Estimate pitch (find dominant frequency)
            let maxAmplitude = 0;
            let maxIndex = 0;
            for (let i = 0; i < dataArray.length; i++) {
                if (dataArray[i] > maxAmplitude) {
                    maxAmplitude = dataArray[i];
                    maxIndex = i;
                }
            }
            const pitch = Math.round((maxIndex * this.audioContext.sampleRate) / this.analyser.fftSize);

            return {
                volume: volume, // 0-100
                pitch: pitch, // Hz (80-400 for human voice)
                timestamp: Date.now()
            };

        } catch (error) {
            this.log('Error analyzing tone:', error);
            return null;
        }
    }

    /**
     * Determine tone type based on analysis
     * @param {Object} toneData - { volume, pitch }
     * @returns {string} - 'calm', 'aggressive', 'neutral'
     */
    getToneType(toneData) {
        if (!toneData) return 'neutral';

        // Aggressive: High volume (>70) + High pitch (>250Hz)
        if (toneData.volume > 70 && toneData.pitch > 250) {
            return 'aggressive';
        }

        // Calm: Low-medium volume (<50) + Normal pitch (150-220Hz)
        if (toneData.volume < 50 && toneData.pitch >= 150 && toneData.pitch <= 220) {
            return 'calm';
        }

        return 'neutral';
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
    }

    /**
     * Get user-friendly error message
     */
    getErrorMessage(errorType) {
        const messages = {
            'no-speech': 'Речь не обнаружена. Попробуйте говорить громче.',
            'audio-capture': 'Не удалось получить доступ к микрофону. Проверьте разрешения.',
            'not-allowed': 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.',
            'network': 'Проблема с сетью. Проверьте подключение к интернету.',
            'aborted': 'Запись отменена.',
            'service-not-allowed': 'Сервис распознавания речи недоступен.'
        };

        return messages[errorType] || 'Произошла ошибка. Попробуйте снова или используйте текстовый ввод.';
    }

    /**
     * Check if voice recognition is supported
     */
    static isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    /**
     * Log to console in debug mode
     */
    log(...args) {
        if (this.debugMode) {
            console.log('[VoiceRecognition]', ...args);
        }
    }
}

// Create singleton instance
const voiceRecognition = new VoiceRecognition();
