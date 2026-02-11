/**
 * Simulator Analytics Integration
 * Add this script to simulator_v4_avatar.html to track key user interactions
 */

// Track when scenario starts
function trackScenarioStart() {
    const urlParams = new URLSearchParams(window.location.search);
    const scenarioId = urlParams.get('scenario') || 'custom';

    // Get selected students (you'll need to adapt this to your actual code)
    const selectedStudents = getSelectedStudents(); // Custom function in your simulator
    const studentTypes = selectedStudents.map(s => s.type);

    analytics.trackScenarioStarted(scenarioId, studentTypes);
}

// Track when scenario completes
function trackScenarioCompletion(finalScore, duration, mistakes) {
    const urlParams = new URLSearchParams(window.location.search);
    const scenarioId = urlParams.get('scenario') || 'custom';

    analytics.trackScenarioCompleted(scenarioId, finalScore, duration, mistakes);
}

// Track when AI hint is shown
function trackHintShown(hintType, message, context = {}) {
    analytics.trackAIHintShown(
        hintType, // 'warning', 'success', 'tip', 'error'
        message.substring(0, 50), // First 50 chars as trigger reason
        {
            scenarioId: context.scenarioId,
            studentType: context.studentType
        }
    );
}

// Track voice recording usage
function trackVoiceUsage(duration, success, confidence) {
    analytics.trackVoiceRecordingUsed(duration, success, confidence);
}

// Example integration points in your simulator code:

// 1. When "Start Lesson" button is clicked:
/*
document.querySelector('.start-lesson-btn').addEventListener('click', function() {
    // Your existing code...
    trackScenarioStart();
});
*/

// 2. When showing results modal:
/*
function showResultsModal(score, duration, mistakes) {
    // Your existing code to show modal...
    trackScenarioCompletion(score, duration, mistakes);
}
*/

// 3. When displaying AI hint:
/*
function showHint(type, message) {
    // Your existing code to display hint...
    trackHintShown(type, message, {
        scenarioId: currentScenario,
        studentType: currentStudent?.type
    });
}
*/

// 4. When voice recording completes:
/*
voiceBtn.addEventListener('click', async function() {
    const startTime = Date.now();
    try {
        const result = await recordVoice();
        const duration = Date.now() - startTime;
        trackVoiceUsage(duration, true, result.confidence);
    } catch (error) {
        const duration = Date.now() - startTime;
        trackVoiceUsage(duration, false, 0);
    }
});
*/
