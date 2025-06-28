// Session management service for JY Alumni Bot
// Handles user session persistence, state management, and cleanup with MongoDB TTL

const { getDatabase } = require('../config/database');
const { getConfig } = require('../config/environment');
const { logError, logSuccess } = require('../middleware/logging');

// Enhanced session state management
async function saveUserSession(whatsappNumber, sessionData) {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        // Enhance session data with metadata
        const enhancedSessionData = {
            ...sessionData,
            version: config.bot.version,
            lastUpdated: new Date().toISOString(),
            sessionId: generateSessionId(whatsappNumber)
        };
        
        const result = await db.collection('sessions').replaceOne(
            { whatsappNumber },
            { 
                whatsappNumber, 
                sessionData: enhancedSessionData, 
                lastActivity: new Date(),
                createdAt: sessionData.conversation_start ? 
                    new Date(sessionData.conversation_start) : new Date(),
                version: config.bot.version,
                metadata: {
                    totalInteractions: (sessionData.totalInteractions || 0) + 1,
                    currentState: sessionData.waiting_for || 'unknown',
                    profileProgress: sessionData.profile_completion_percentage || 0
                }
            },
            { upsert: true }
        );
        
        if (result.upsertedCount > 0 || result.modifiedCount > 0) {
            logSuccess('session_saved', { 
                whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4),
                state: sessionData.waiting_for,
                authenticated: !!sessionData.authenticated
            });
            return true;
        }
        
        return false;
    } catch (error) {
        logError(error, { operation: 'saveUserSession', whatsappNumber });
        return false;
    }
}

// Load user session with automatic cleanup
async function loadUserSession(whatsappNumber) {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        const session = await db.collection('sessions').findOne({ whatsappNumber });
        
        if (!session) {
            logSuccess('new_session_created', { whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4) });
            return createNewSession();
        }
        
        // Check session timeout
        const now = new Date();
        const lastActivity = new Date(session.lastActivity);
        const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
        
        if (hoursSinceActivity > config.bot.sessionTimeoutHours) {
            await db.collection('sessions').deleteOne({ whatsappNumber });
            logSuccess('expired_session_cleaned', { 
                whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4),
                hoursInactive: Math.round(hoursSinceActivity)
            });
            return createNewSession();
        }
        
        // Update last activity
        await db.collection('sessions').updateOne(
            { whatsappNumber },
            { $set: { lastActivity: now } }
        );
        
        logSuccess('session_loaded', { 
            whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4),
            state: session.sessionData?.waiting_for || 'unknown',
            age: Math.round(hoursSinceActivity * 60) // in minutes
        });
        
        return session.sessionData || createNewSession();
        
    } catch (error) {
        logError(error, { operation: 'loadUserSession', whatsappNumber });
        return createNewSession();
    }
}

// Create a new session with default state
function createNewSession() {
    return {
        conversation_start: new Date().toISOString(),
        waiting_for: null,
        authenticated: false,
        ready: false,
        profile_asked: false,
        profile_skipped: false,
        profile_completed: false,
        totalInteractions: 0,
        version: 'v3.0-enhanced'
    };
}

// Generate unique session ID
function generateSessionId(whatsappNumber) {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const phoneHash = whatsappNumber.replace(/[^\d]/g, '').slice(-4);
    return `${phoneHash}_${timestamp}_${randomStr}`;
}

// Clear user session (logout/reset)
async function clearUserSession(whatsappNumber) {
    try {
        const db = getDatabase();
        
        const result = await db.collection('sessions').deleteOne({ whatsappNumber });
        
        if (result.deletedCount > 0) {
            logSuccess('session_cleared', { 
                whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4)
            });
            return true;
        }
        
        return false;
    } catch (error) {
        logError(error, { operation: 'clearUserSession', whatsappNumber });
        return false;
    }
}

// Update specific session state
async function updateSessionState(whatsappNumber, stateUpdates) {
    try {
        const db = getDatabase();
        
        // Prepare update object
        const updateFields = {};
        Object.keys(stateUpdates).forEach(key => {
            updateFields[`sessionData.${key}`] = stateUpdates[key];
        });
        
        updateFields['lastActivity'] = new Date();
        updateFields['sessionData.lastUpdated'] = new Date().toISOString();
        
        const result = await db.collection('sessions').updateOne(
            { whatsappNumber },
            { $set: updateFields }
        );
        
        if (result.modifiedCount > 0) {
            logSuccess('session_state_updated', { 
                whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4),
                updates: Object.keys(stateUpdates)
            });
            return true;
        }
        
        return false;
    } catch (error) {
        logError(error, { operation: 'updateSessionState', whatsappNumber });
        return false;
    }
}

// Get session statistics for monitoring
async function getSessionStats() {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(now - 60 * 60 * 1000);
        
        const [
            totalSessions,
            activeSessions,
            recentSessions,
            authenticatedSessions
        ] = await Promise.all([
            db.collection('sessions').countDocuments(),
            db.collection('sessions').countDocuments({
                lastActivity: { $gte: oneHourAgo }
            }),
            db.collection('sessions').countDocuments({
                createdAt: { $gte: oneDayAgo }
            }),
            db.collection('sessions').countDocuments({
                'sessionData.authenticated': true
            })
        ]);
        
        return {
            total: totalSessions,
            active_last_hour: activeSessions,
            created_last_24h: recentSessions,
            authenticated: authenticatedSessions,
            session_timeout_hours: config.bot.sessionTimeoutHours,
            timestamp: now.toISOString()
        };
        
    } catch (error) {
        logError(error, { operation: 'getSessionStats' });
        return {
            error: 'Unable to fetch session statistics',
            timestamp: new Date().toISOString()
        };
    }
}

// Clean up expired sessions manually (useful for maintenance)
async function cleanupExpiredSessions() {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - config.bot.sessionTimeoutHours);
        
        const result = await db.collection('sessions').deleteMany({
            lastActivity: { $lt: cutoffTime }
        });
        
        logSuccess('expired_sessions_cleanup', { 
            deletedCount: result.deletedCount,
            cutoffTime: cutoffTime.toISOString()
        });
        
        return {
            success: true,
            deletedCount: result.deletedCount,
            cutoffTime: cutoffTime.toISOString()
        };
        
    } catch (error) {
        logError(error, { operation: 'cleanupExpiredSessions' });
        return {
            success: false,
            error: error.message
        };
    }
}

// Enhanced session data validation
function validateSessionData(sessionData) {
    const requiredFields = ['conversation_start', 'version'];
    const validStates = [
        null, 'email_input', 'otp_verification', 'profile_choice', 'ready',
        'updating_fullName', 'updating_gender', 'updating_professionalRole',
        'updating_dateOfBirth', 'updating_country', 'updating_city', 'updating_state',
        'updating_phone', 'updating_additionalEmail', 'updating_linkedin',
        'updating_instagram', 'updating_domain', 'updating_yatraImpact',
        'updating_communityAsks', 'updating_communityGives'
    ];
    
    // Check required fields
    for (const field of requiredFields) {
        if (!sessionData[field]) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }
    
    // Validate waiting_for state
    if (sessionData.waiting_for && !validStates.includes(sessionData.waiting_for)) {
        return { valid: false, error: `Invalid waiting_for state: ${sessionData.waiting_for}` };
    }
    
    return { valid: true };
}

module.exports = {
    saveUserSession,
    loadUserSession,
    clearUserSession,
    updateSessionState,
    getSessionStats,
    cleanupExpiredSessions,
    createNewSession,
    validateSessionData
};