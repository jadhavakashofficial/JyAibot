// Rate limiting service for JY Alumni Bot
// Implements daily query limits, user throttling, and abuse prevention with MongoDB storage

const { getDatabase } = require('../config/database');
const { getConfig } = require('../config/environment');
const { logError, logSuccess, logUserActivity } = require('../middleware/logging');

// Check if user is within daily search limit
async function checkDailyLimit(whatsappNumber) {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        // Get current date (start of day)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Count user's searches today
        const searchCount = await db.collection('queries').countDocuments({
            whatsappNumber: whatsappNumber,
            timestamp: { $gte: today },
            queryType: 'alumni_search'
        });
        
        const withinLimit = searchCount < config.bot.dailyQueryLimit;
        
        logUserActivity(whatsappNumber, 'daily_limit_check', {
            searchCount: searchCount,
            limit: config.bot.dailyQueryLimit,
            withinLimit: withinLimit,
            remainingSearches: Math.max(0, config.bot.dailyQueryLimit - searchCount)
        });
        
        return withinLimit;
        
    } catch (error) {
        logError(error, { operation: 'checkDailyLimit', whatsappNumber });
        // Allow search on error to prevent service disruption
        return true;
    }
}

// Get user's remaining daily searches
async function getRemainingSearches(whatsappNumber) {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const searchCount = await db.collection('queries').countDocuments({
            whatsappNumber: whatsappNumber,
            timestamp: { $gte: today },
            queryType: 'alumni_search'
        });
        
        const remaining = Math.max(0, config.bot.dailyQueryLimit - searchCount);
        
        return {
            used: searchCount,
            remaining: remaining,
            limit: config.bot.dailyQueryLimit,
            resetTime: getNextResetTime()
        };
        
    } catch (error) {
        logError(error, { operation: 'getRemainingSearches', whatsappNumber });
        return {
            used: 0,
            remaining: 30,
            limit: 30,
            resetTime: getNextResetTime(),
            error: 'Unable to check search count'
        };
    }
}

// Check for suspicious activity patterns
async function checkSuspiciousActivity(whatsappNumber) {
    try {
        const db = getDatabase();
        const now = new Date();
        const oneHourAgo = new Date(now - 60 * 60 * 1000);
        const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
        
        // Check for rapid-fire searches (more than 10 in 5 minutes)
        const recentSearches = await db.collection('queries').countDocuments({
            whatsappNumber: whatsappNumber,
            timestamp: { $gte: fiveMinutesAgo },
            queryType: 'alumni_search'
        });
        
        if (recentSearches > 10) {
            logUserActivity(whatsappNumber, 'suspicious_rapid_fire', {
                searchesIn5Min: recentSearches
            });
            return {
                suspicious: true,
                reason: 'rapid_fire_searches',
                count: recentSearches,
                cooldownMinutes: 15
            };
        }
        
        // Check for identical queries (more than 5 identical in 1 hour)
        const pipeline = [
            {
                $match: {
                    whatsappNumber: whatsappNumber,
                    timestamp: { $gte: oneHourAgo },
                    queryType: 'alumni_search'
                }
            },
            {
                $group: {
                    _id: '$query',
                    count: { $sum: 1 }
                }
            },
            {
                $match: { count: { $gt: 5 } }
            }
        ];
        
        const duplicateQueries = await db.collection('queries').aggregate(pipeline).toArray();
        
        if (duplicateQueries.length > 0) {
            logUserActivity(whatsappNumber, 'suspicious_duplicate_queries', {
                duplicateQueries: duplicateQueries.length,
                maxCount: Math.max(...duplicateQueries.map(q => q.count))
            });
            return {
                suspicious: true,
                reason: 'duplicate_queries',
                duplicates: duplicateQueries.length,
                cooldownMinutes: 10
            };
        }
        
        return { suspicious: false };
        
    } catch (error) {
        logError(error, { operation: 'checkSuspiciousActivity', whatsappNumber });
        return { suspicious: false, error: 'Unable to check activity' };
    }
}

// Implement temporary user cooldown
async function setCooldown(whatsappNumber, minutes = 15, reason = 'suspicious_activity') {
    try {
        const db = getDatabase();
        const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
        
        await db.collection('cooldowns').replaceOne(
            { whatsappNumber: whatsappNumber },
            {
                whatsappNumber: whatsappNumber,
                reason: reason,
                createdAt: new Date(),
                expiresAt: expiresAt,
                minutes: minutes
            },
            { upsert: true }
        );
        
        // Set TTL index if not exists
        try {
            await db.collection('cooldowns').createIndex(
                { "expiresAt": 1 },
                { expireAfterSeconds: 0 }
            );
        } catch (indexError) {
            // Index might already exist
        }
        
        logUserActivity(whatsappNumber, 'cooldown_applied', {
            reason: reason,
            minutes: minutes,
            expiresAt: expiresAt.toISOString()
        });
        
        return {
            success: true,
            expiresAt: expiresAt,
            minutes: minutes
        };
        
    } catch (error) {
        logError(error, { operation: 'setCooldown', whatsappNumber, reason });
        return { success: false, error: error.message };
    }
}

// Check if user is currently in cooldown
async function checkCooldown(whatsappNumber) {
    try {
        const db = getDatabase();
        const now = new Date();
        
        const cooldown = await db.collection('cooldowns').findOne({
            whatsappNumber: whatsappNumber,
            expiresAt: { $gt: now }
        });
        
        if (cooldown) {
            const remainingMinutes = Math.ceil((cooldown.expiresAt - now) / (1000 * 60));
            
            return {
                active: true,
                reason: cooldown.reason,
                remainingMinutes: remainingMinutes,
                expiresAt: cooldown.expiresAt
            };
        }
        
        return { active: false };
        
    } catch (error) {
        logError(error, { operation: 'checkCooldown', whatsappNumber });
        return { active: false, error: 'Unable to check cooldown status' };
    }
}

// Advanced rate limiting with user behavior analysis
async function checkAdvancedRateLimit(whatsappNumber, requestType = 'search') {
    try {
        // Check basic daily limit first
        const basicCheck = await checkDailyLimit(whatsappNumber);
        if (!basicCheck) {
            return {
                allowed: false,
                reason: 'daily_limit_exceeded',
                resetTime: getNextResetTime()
            };
        }
        
        // Check for active cooldowns
        const cooldownCheck = await checkCooldown(whatsappNumber);
        if (cooldownCheck.active) {
            return {
                allowed: false,
                reason: 'user_cooldown',
                cooldownReason: cooldownCheck.reason,
                remainingMinutes: cooldownCheck.remainingMinutes
            };
        }
        
        // Check for suspicious activity
        const suspiciousCheck = await checkSuspiciousActivity(whatsappNumber);
        if (suspiciousCheck.suspicious) {
            // Apply automatic cooldown
            await setCooldown(whatsappNumber, suspiciousCheck.cooldownMinutes, suspiciousCheck.reason);
            
            return {
                allowed: false,
                reason: 'suspicious_activity',
                activityReason: suspiciousCheck.reason,
                cooldownMinutes: suspiciousCheck.cooldownMinutes
            };
        }
        
        return { allowed: true };
        
    } catch (error) {
        logError(error, { operation: 'checkAdvancedRateLimit', whatsappNumber, requestType });
        // Allow request on error to prevent service disruption
        return { allowed: true, error: 'Rate limit check failed' };
    }
}

// Get comprehensive rate limit status for user
async function getRateLimitStatus(whatsappNumber) {
    try {
        const [remainingSearches, cooldownStatus] = await Promise.all([
            getRemainingSearches(whatsappNumber),
            checkCooldown(whatsappNumber)
        ]);
        
        const status = {
            searches: remainingSearches,
            cooldown: cooldownStatus,
            nextReset: getNextResetTime(),
            timestamp: new Date().toISOString()
        };
        
        // Add warnings if approaching limits
        if (remainingSearches.remaining <= 5) {
            status.warning = `Only ${remainingSearches.remaining} searches remaining today`;
        }
        
        if (remainingSearches.remaining === 0) {
            status.blocked = true;
            status.message = 'Daily search limit reached';
        }
        
        if (cooldownStatus.active) {
            status.blocked = true;
            status.message = `Account temporarily restricted: ${cooldownStatus.reason}`;
        }
        
        return status;
        
    } catch (error) {
        logError(error, { operation: 'getRateLimitStatus', whatsappNumber });
        return {
            error: 'Unable to fetch rate limit status',
            timestamp: new Date().toISOString()
        };
    }
}

// Generate rate limit violation message
function generateRateLimitMessage(limitResult, userContext = {}) {
    const name = userContext.name || 'there';
    
    switch (limitResult.reason) {
        case 'daily_limit_exceeded':
            return `🚫 Daily search limit reached (30 searches per day), ${name}.

Your searches reset at midnight. Meanwhile, you can:
- Update your profile
- Ask general questions about the network
- Come back tomorrow for more searches

Need immediate help? Contact support@jagritiyatra.com`;

        case 'user_cooldown':
            const remainingTime = limitResult.remainingMinutes;
            const timeUnit = remainingTime === 1 ? 'minute' : 'minutes';
            
            return `⏸️ Account temporarily restricted, ${name}.

Reason: ${formatCooldownReason(limitResult.cooldownReason)}
Time remaining: ${remainingTime} ${timeUnit}

This helps maintain fair access for all alumni. Please try again later.`;

        case 'suspicious_activity':
            return `🔒 Unusual activity detected, ${name}.

For security, your account has been temporarily restricted for ${limitResult.cooldownMinutes} minutes.

This protects our alumni network from automated abuse. Please try again later.

Need help? Contact support@jagritiyatra.com`;

        default:
            return `⚠️ Request temporarily blocked, ${name}.

Please try again in a few minutes.

Contact support if this continues: support@jagritiyatra.com`;
    }
}

// Format cooldown reason for user display
function formatCooldownReason(reason) {
    const reasonMap = {
        'rapid_fire_searches': 'Too many searches in a short time',
        'duplicate_queries': 'Repeated identical searches',
        'suspicious_activity': 'Unusual usage patterns detected',
        'manual_restriction': 'Manual moderation action',
        'system_protection': 'System protection measure'
    };
    
    return reasonMap[reason] || 'Security measure';
}

// Get next reset time (midnight)
function getNextResetTime() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
}

// Clean up expired cooldowns and old queries (maintenance function)
async function cleanupRateLimitData() {
    try {
        const db = getDatabase();
        const now = new Date();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        // Clean up expired cooldowns (should be automatic with TTL, but backup)
        const cooldownCleanup = await db.collection('cooldowns').deleteMany({
            expiresAt: { $lt: now }
        });
        
        // Clean up old queries (keep 7 days for analytics)
        const queryCleanup = await db.collection('queries').deleteMany({
            timestamp: { $lt: sevenDaysAgo }
        });
        
        logSuccess('rate_limit_cleanup', {
            expiredCooldowns: cooldownCleanup.deletedCount,
            oldQueries: queryCleanup.deletedCount
        });
        
        return {
            success: true,
            expiredCooldowns: cooldownCleanup.deletedCount,
            oldQueries: queryCleanup.deletedCount,
            timestamp: now.toISOString()
        };
        
    } catch (error) {
        logError(error, { operation: 'cleanupRateLimitData' });
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Get rate limiting statistics for monitoring
async function getRateLimitStats(timeframe = '24h') {
    try {
        const db = getDatabase();
        const now = new Date();
        let startTime;
        
        switch (timeframe) {
            case '1h':
                startTime = new Date(now - 60 * 60 * 1000);
                break;
            case '24h':
                startTime = new Date(now - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now - 24 * 60 * 60 * 1000);
        }
        
        const [searchStats, cooldownStats] = await Promise.all([
            // Search statistics
            db.collection('queries').aggregate([
                { $match: { 
                    timestamp: { $gte: startTime },
                    queryType: 'alumni_search'
                }},
                { $group: {
                    _id: '$whatsappNumber',
                    searchCount: { $sum: 1 }
                }},
                { $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    totalSearches: { $sum: '$searchCount' },
                    avgSearchesPerUser: { $avg: '$searchCount' },
                    maxSearchesPerUser: { $max: '$searchCount' }
                }}
            ]).toArray(),
            
            // Cooldown statistics
            db.collection('cooldowns').aggregate([
                { $match: { createdAt: { $gte: startTime } }},
                { $group: {
                    _id: '$reason',
                    count: { $sum: 1 }
                }}
            ]).toArray()
        ]);
        
        return {
            timeframe: timeframe,
            searches: searchStats[0] || {
                totalUsers: 0,
                totalSearches: 0,
                avgSearchesPerUser: 0,
                maxSearchesPerUser: 0
            },
            cooldowns: cooldownStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            timestamp: now.toISOString()
        };
        
    } catch (error) {
        logError(error, { operation: 'getRateLimitStats', timeframe });
        return {
            error: 'Unable to fetch rate limit statistics',
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    checkDailyLimit,
    getRemainingSearches,
    checkSuspiciousActivity,
    setCooldown,
    checkCooldown,
    checkAdvancedRateLimit,
    getRateLimitStatus,
    generateRateLimitMessage,
    cleanupRateLimitData,
    getRateLimitStats
};