/**
 * Firebase Authentication and User Management
 * Handles login, registration, and user profile management
 */

// Firebase configuration will be initialized from environment
let firebaseApp = null;
let auth = null;
let db = null;

class UserManager {
    constructor() {
        this.currentUser = null;
        this.userDoc = null;
        this.isInitialized = false;
    }

    /**
     * Initialize Firebase
     * @param {Object} config - Firebase configuration object
     */
    async init(config) {
        if (this.isInitialized) return;

        // Initialize Firebase
        firebaseApp = firebase.initializeApp(config);
        auth = firebase.auth();
        db = firebase.firestore();

        // Listen for auth state changes
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('[UserManager] User logged in:', user.email);
                this.currentUser = user;
                await this.loadUserData(user.uid);
            } else {
                console.log('[UserManager] User logged out');
                this.currentUser = null;
                this.userDoc = null;
            }
        });

        this.isInitialized = true;
        console.log('[UserManager] Firebase initialized');
    }

    /**
     * Register new user with email and password
     */
    async register(email, password, displayName) {
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Update display name
            await user.updateProfile({ displayName });

            // Create initial user document in Firestore
            await this.createUserDocument(user.uid, email, displayName);

            console.log('[UserManager] User registered:', email);
            return { success: true, user };
        } catch (error) {
            console.error('[UserManager] Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Login with email and password
     */
    async login(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);

            // Update last login
            await db.collection('users').doc(userCredential.user.uid).update({
                'profile.lastLoginAt': firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('[UserManager] User logged in:', email);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('[UserManager] Login error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Logout current user
     */
    async logout() {
        try {
            await auth.signOut();
            console.log('[UserManager] User logged out');
            return { success: true };
        } catch (error) {
            console.error('[UserManager] Logout error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create initial user document in Firestore
     */
    async createUserDocument(userId, email, displayName) {
        const initialData = {
            profile: {
                email: email || null,
                displayName: displayName || (email ? email.split('@')[0] : `User_${userId.substr(0, 5)}`),
                photoURL: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                role: 'student'
            },
            progress: {
                totalSessions: 0,
                completedScenarios: 0,
                averageScore: 0,
                totalTimeSpent: 0,
                streak: 0,
                lastSessionDate: null
            },
            skills: {
                empathy: 0,
                conflictResolution: 0,
                boundaryKeeping: 0,
                patience: 0
            },
            achievements: {}
        };

        await db.collection('users').doc(userId).set(initialData);
        console.log('[UserManager] User document created');
    }

    /**
     * Load user data from Firestore
     */
    async loadUserData(userId) {
        try {
            const docRef = db.collection('users').doc(userId);
            const doc = await docRef.get();

            if (doc.exists) {
                this.userDoc = doc.data();
                console.log('[UserManager] User data loaded');
            } else {
                console.warn('[UserManager] User document not found, creating...');
                await this.createUserDocument(
                    userId,
                    this.currentUser.email,
                    this.currentUser.displayName
                );
                await this.loadUserData(userId);
            }
        } catch (error) {
            console.error('[UserManager] Error loading user data:', error);
            throw error;
        }
    }

    /**
     * Save session results and update user progress
     */
    async saveSessionResults(sessionData) {
        if (!this.currentUser) {
            throw new Error('User not logged in');
        }

        const userId = this.currentUser.uid;
        const userRef = db.collection('users').doc(userId);

        // Ensure user data is loaded
        if (!this.userDoc) {
            console.warn('[UserManager] userDoc missing during save, attempting reload...');
            try {
                await this.loadUserData(userId);
            } catch (e) {
                console.error('[UserManager] Failed to reload user data:', e);
                return { success: false, error: 'User profile not loaded: ' + e.message };
            }
        }

        if (!this.userDoc) {
            return { success: false, error: 'User profile not found after reload' };
        }

        try {
            // Add session to sessions subcollection
            const sessionRef = await userRef.collection('sessions').add({
                ...sessionData,
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update user progress
            const currentProgress = this.userDoc.progress;
            const newTotalSessions = currentProgress.totalSessions + 1;
            const newAverageScore = Math.round(
                (currentProgress.averageScore * currentProgress.totalSessions + sessionData.score) / newTotalSessions
            );

            // Calculate streak
            const streakUpdate = this.calculateStreak(currentProgress.lastSessionDate);
            const newStreak = streakUpdate === 'increment'
                ? currentProgress.streak + 1
                : streakUpdate === null
                    ? currentProgress.streak
                    : 1;

            // Update skills
            const newSkills = this.updateSkills(
                this.userDoc.skills,
                sessionData.skillsGained,
                newTotalSessions
            );

            // Perform update
            await userRef.update({
                'progress.totalSessions': newTotalSessions,
                'progress.completedScenarios': firebase.firestore.FieldValue.increment(1),
                'progress.averageScore': newAverageScore,
                'progress.totalTimeSpent': firebase.firestore.FieldValue.increment(sessionData.duration),
                'progress.streak': newStreak,
                'progress.lastSessionDate': firebase.firestore.FieldValue.serverTimestamp(),
                'skills': newSkills
            });

            // Check for new achievements
            await this.checkAchievements(sessionData);

            // Reload user data
            await this.loadUserData(userId);

            console.log('[UserManager] Session results saved');
            return { success: true, sessionId: sessionRef.id };
        } catch (error) {
            console.error('[UserManager] Error saving session:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update skills based on session results
     */
    updateSkills(currentSkills, sessionSkills, sessionCount) {
        const RECENT_WEIGHT = 0.3;
        const HISTORY_WEIGHT = 0.7;

        // Helper to safely get value
        const getVal = (val) => typeof val === 'number' && !isNaN(val) ? val : 0;

        // Helper to safely get current skill (default to 50 if missing)
        const getCur = (val) => typeof val === 'number' && !isNaN(val) ? val : 50;

        return {
            empathy: Math.min(100, Math.round(
                getCur(currentSkills.empathy) * HISTORY_WEIGHT + getVal(sessionSkills.empathy) * RECENT_WEIGHT
            )),
            conflictResolution: Math.min(100, Math.round(
                getCur(currentSkills.conflictResolution) * HISTORY_WEIGHT + getVal(sessionSkills.conflictResolution) * RECENT_WEIGHT
            )),
            boundaryKeeping: Math.min(100, Math.round(
                getCur(currentSkills.boundaryKeeping) * HISTORY_WEIGHT + getVal(sessionSkills.boundaryKeeping) * RECENT_WEIGHT
            )),
            patience: Math.min(100, Math.round(
                getCur(currentSkills.patience) * HISTORY_WEIGHT + getVal(sessionSkills.patience) * RECENT_WEIGHT
            ))
        };
    }

    /**
     * Calculate streak
     */
    calculateStreak(lastSessionDate) {
        if (!lastSessionDate) return 1;

        const now = new Date();
        const last = lastSessionDate.toDate();
        const daysDiff = Math.floor((now - last) / (1000 * 60 * 60 * 24));

        if (daysDiff === 0) return null; // Same day
        if (daysDiff === 1) return 'increment'; // Consecutive
        return 1; // Broke streak
    }

    /**
     * Check and unlock achievements
     */
    async checkAchievements(sessionData) {
        const userId = this.currentUser.uid;
        const userRef = db.collection('users').doc(userId);

        const achievements = this.getAchievementsToCheck(sessionData);
        const updates = {};

        for (const achievement of achievements) {
            const achievementId = achievement.id;

            // Check if already unlocked
            if (this.userDoc.achievements[achievementId]) continue;

            // Check requirement
            if (achievement.requirement(this.userDoc, sessionData)) {
                updates[`achievements.${achievementId}`] = {
                    unlockedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    title: achievement.title,
                    description: achievement.description,
                    icon: achievement.icon
                };

                console.log('[UserManager] Achievement unlocked:', achievementId);

                // Track with analytics
                if (typeof analytics !== 'undefined') {
                    analytics.trackAchievementUnlocked(achievementId, achievement.title);
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            await userRef.update(updates);
        }
    }

    /**
     * Get achievements to check
     */
    getAchievementsToCheck(sessionData) {
        return [
            {
                id: "first_session",
                title: "Первый шаг",
                description: "Завершите первую тренировку",
                icon: "🎓",
                requirement: (user) => user.progress.totalSessions >= 1
            },
            {
                id: "empathy_master",
                title: "Мастер эмпатии",
                description: "Достигните 80+ баллов в эмпатии",
                icon: "❤️",
                requirement: (user) => user.skills.empathy >= 80
            },
            {
                id: "patient_teacher",
                title: "Терпеливый педагог",
                description: "Достигните 90+ баллов в терпении",
                icon: "🧘",
                requirement: (user) => user.skills.patience >= 90
            },
            {
                id: "perfectionist",
                title: "Перфекционист",
                description: "Получите 95+ баллов в сценарии",
                icon: "⭐",
                requirement: (user, session) => session.score >= 95
            },
            {
                id: "week_streak",
                title: "Неделя подряд",
                description: "Тренируйтесь 7 дней подряд",
                icon: "🔥",
                requirement: (user) => user.progress.streak >= 7
            }
        ];
    }

    /**
     * Get session history
     */
    async getSessionHistory(limit = 10) {
        if (!this.currentUser) return [];

        try {
            const snapshot = await db.collection('users')
                .doc(this.currentUser.uid)
                .collection('sessions')
                .orderBy('completedAt', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('[UserManager] Error getting history:', error);

            // If index is missing, try without ordering first to avoid crash
            if (error.code === 'failed-precondition') {
                console.warn('⚠️ Firestore index missing for sorting. Returning unsorted results.');
                try {
                    const snapshot = await db.collection('users')
                        .doc(this.currentUser.uid)
                        .collection('sessions')
                        .limit(limit)
                        .get();
                    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                } catch (e) { return []; }
            }
            return [];
        }
    }

    /**
     * Get user profile
     */
    getProfile() {
        return this.currentUser ? {
            uid: this.currentUser.uid,
            email: this.currentUser.email,
            displayName: this.currentUser.displayName,
            ...this.userDoc
        } : null;
    }

    /**
     * Update user profile
     */
    async updateProfile(updates) {
        try {
            if (!this.currentUser) {
                throw new Error('No user logged in');
            }

            // Update Firebase Auth display name if provided
            if (updates.displayName) {
                await this.currentUser.updateProfile({ displayName: updates.displayName });
            }

            // Update Firestore document
            await db.collection('users').doc(this.currentUser.uid).update({
                'profile.displayName': updates.displayName || this.currentUser.displayName,
                'profile.updatedAt': firebase.firestore.FieldValue.serverTimestamp()
            });

            // Reload user data
            await this.loadUserData(this.currentUser.uid);

            console.log('[UserManager] Profile updated successfully');
            return { success: true };
        } catch (error) {
            console.error('[UserManager] Profile update error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId) {
        try {
            if (!this.currentUser) {
                throw new Error('No user logged in');
            }

            // Delete session document from Firestore
            await db.collection('sessions').doc(sessionId).delete();

            // Update user stats by recalculating from remaining sessions
            const sessionsSnapshot = await db.collection('sessions')
                .where('userId', '==', this.currentUser.uid)
                .get();

            const sessions = sessionsSnapshot.docs.map(doc => doc.data());

            // Recalculate stats
            const totalSessions = sessions.length;
            const totalScore = sessions.reduce((sum, s) => sum + (s.score || 0), 0);
            const averageScore = totalSessions > 0 ? Math.round(totalScore / totalSessions) : 0;
            const totalTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);

            // Update user profile
            await db.collection('users').doc(this.currentUser.uid).update({
                'progress.totalSessions': totalSessions,
                'progress.averageScore': averageScore,
                'progress.totalTimeSpent': Math.round(totalTime / 1000), // seconds
                'profile.updatedAt': firebase.firestore.FieldValue.serverTimestamp()
            });

            // Reload user data
            await this.loadUserData(this.currentUser.uid);

            console.log('[UserManager] Session deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('[UserManager] Session delete error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return this.currentUser !== null;
    }
}

// Create singleton instance
const userManager = new UserManager();
