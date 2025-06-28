// Analytics and logging service for JY Alumni Bot
// Tracks user interactions, search patterns, and system performance for insights and optimization

const { getDatabase } = require('../config/database');
const { getConfig } = require('../config/environment');
const { logError, logSuccess } = require('../middleware/logging');

// Log user query with comprehensive metadata
async function logUserQuery(whatsappNumber, query, queryType = 'search', totalMatches = 0, topMatches = 0, metadata = {}) {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        const queryLog = {
            whatsappNumber: whatsappNumber,
            query: query.substring(0, 500), // Limit query length for storage
            queryType: queryType,
            totalMatches: totalMatches,
            topMatches: topMatches,
            timestamp: new Date(),
            metadata: {
                version: config.bot.version,
                aiModel: config.ai.model,
                sessionId: metadata.sessionId || null,
                userAgent: metadata.userAgent || 'whatsapp-bot',
                responseTime: metadata.responseTime || null,
                searchKeywords: metadata.searchKeywords || [],
                errorCode: metadata.errorCode || null,
                ...metadata
            }
        };
        
        await db.collection('queries').insertOne(queryLog);
        
        // Update user activity statistics
        await updateUserStats(whatsappNumber, queryType);
        
    } catch (error) {
        logError(error, { operation: 'logUserQuery', whatsappNumber, queryType });
    }
}

// Update user activity statistics
async function updateUserStats(whatsappNumber, activityType) {
    try {
        const db = getDatabase();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const statsUpdate = {
            $inc: {
                [`activities.${activityType}`]: 1,
                'activities.total': 1
            },
            $set: {
                lastActivity: new Date(),
                lastActivityType: activityType
            },
            $setOnInsert: {
                whatsappNumber: whatsappNumber,
                firstActivity: new Date(),
                createdAt: today
            }
        };
        
        await db.collection('user_stats').updateOne(
            { whatsappNumber: whatsappNumber, createdAt: today },
            statsUpdate,
            { upsert: true }
        );
        
    } catch (error) {
        logError(error, { operation: 'updateUserStats', whatsappNumber, activityType });
    }
}

// Log system events and errors
async function logSystemEvent(eventType, eventData = {}, severity = 'info') {
    try {
        const db = getDatabase();
        const config = getConfig();
        
        const systemLog = {
            eventType: eventType,
            severity: severity,
            timestamp: new Date(),
            version: config.bot.version,
            environment: config.nodeEnv,
            data: eventData,
            serverInfo: {
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                cpu: process.cpuUsage()
            }
        };
        
        await db.collection('system_logs').insertOne(systemLog);
        
        // Clean up old logs (keep 30 days)
        if (Math.random() < 0.01) { // 1% chance to trigger cleanup
            await cleanupOldLogs();
        }
        
    } catch (error) {
        logError(error, { operation: 'logSystemEvent', eventType, severity });
    }
}

// Get comprehensive analytics dashboard data
async function getAnalyticsDashboard(timeframe = '24h') {
    try {
        const db = getDatabase();
        const timeRanges = getTimeRanges(timeframe);
        
        const [
            userActivity,
            searchAnalytics,
            systemMetrics,
            errorAnalytics,
            topQueries,
            userGrowth
        ] = await Promise.all([
            getUserActivityMetrics(timeRanges),
            getSearchAnalyticsMetrics(timeRanges),
            getSystemMetrics(timeRanges),
            getErrorAnalytics(timeRanges),
            getTopQueries(timeRanges),
            getUserGrowthMetrics(timeRanges)
        ]);
        
        return {
            timeframe: timeframe,
            period: {
                start: timeRanges.start.toISOString(),
                end: timeRanges.end.toISOString()
            },
            summary: {
                totalUsers: userActivity.uniqueUsers || 0,
                totalQueries: searchAnalytics.totalSearches || 0,
                totalErrors: errorAnalytics.totalErrors || 0,
                avgResponseTime: systemMetrics.avgResponseTime || 0
            },
            userActivity: userActivity,
            searchAnalytics: searchAnalytics,
            systemMetrics: systemMetrics,
            errorAnalytics: errorAnalytics,
            topQueries: topQueries,
            userGrowth: userGrowth,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        logError(error, { operation: 'getAnalyticsDashboard', timeframe });
        return {
            error: 'Unable to fetch analytics dashboard',
            timestamp: new Date().toISOString()
        };
    }
}

// Get user activity metrics
async function getUserActivityMetrics(timeRanges) {
    try {
        const db = getDatabase();
        
        const [activityStats, sessionStats] = await Promise.all([
            // Query activity
            db.collection('queries').aggregate([
                { $match: { timestamp: { $gte: timeRanges.start, $lte: timeRanges.end } } },
                { $group: {
                    _id: null,
                    totalQueries: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$whatsappNumber' },
                    queryTypes: { $push: '$queryType' }
                }},
                { $addFields: {
                    uniqueUserCount: { $size: '$uniqueUsers' }
                }}
            ]).toArray(),
            
            // Session activity
            db.collection('sessions').aggregate([
                { $match: { lastActivity: { $gte: timeRanges.start, $lte: timeRanges.end } } },
                { $group: {
                    _id: null,
                    totalSessions: { $sum: 1 },
                    avgSessionDuration: { $avg: { $subtract: ['$lastActivity', '$createdAt'] } }
                }}
            ]).toArray()
        ]);
        
        const queryData = activityStats[0] || { totalQueries: 0, uniqueUserCount: 0, queryTypes: [] };
        const sessionData = sessionStats[0] || { totalSessions: 0, avgSessionDuration: 0 };
        
        // Analyze query types
        const queryTypeBreakdown = {};
        queryData.queryTypes.forEach(type => {
            queryTypeBreakdown[type] = (queryTypeBreakdown[type] || 0) + 1;
        });
        
        return {
            totalQueries: queryData.totalQueries,
            uniqueUsers: queryData.uniqueUserCount,
            totalSessions: sessionData.totalSessions,
            avgSessionDuration: Math.round(sessionData.avgSessionDuration / (1000 * 60)), // minutes
            queryTypeBreakdown: queryTypeBreakdown
        };
        
    } catch (error) {
        logError(error, { operation: 'getUserActivityMetrics' });
        return { error: 'Unable to fetch user activity metrics' };
    }
}

// Get search analytics metrics
async function getSearchAnalyticsMetrics(timeRanges) {
    try {
        const db = getDatabase();
        
        const searchStats = await db.collection('queries').aggregate([
            { $match: { 
                timestamp: { $gte: timeRanges.start, $lte: timeRanges.end },
                queryType: 'alumni_search'
            }},
            { $group: {
                _id: null,
                totalSearches: { $sum: 1 },
                avgMatches: { $avg: '$totalMatches' },
                avgTopMatches: { $avg: '$topMatches' },
                successfulSearches: { $sum: { $cond: [{ $gt: ['$totalMatches', 0] }, 1, 0] } },
                zeroResultSearches: { $sum: { $cond: [{ $eq: ['$totalMatches', 0] }, 1, 0] } }
            }}
        ]).toArray();
        
        const data = searchStats[0] || {
            totalSearches: 0,
            avgMatches: 0,
            avgTopMatches: 0,
            successfulSearches: 0,
            zeroResultSearches: 0
        };
        
        return {
            totalSearches: data.totalSearches,
            avgMatches: Math.round(data.avgMatches * 100) / 100,
            avgTopMatches: Math.round(data.avgTopMatches * 100) / 100,
            successRate: data.totalSearches > 0 ? Math.round((data.successfulSearches / data.totalSearches) * 100) : 0,
            zeroResultRate: data.totalSearches > 0 ? Math.round((data.zeroResultSearches / data.totalSearches) * 100) : 0
        };
        
    } catch (error) {
        logError(error, { operation: 'getSearchAnalyticsMetrics' });
        return { error: 'Unable to fetch search analytics' };
    }
}

// Get system performance metrics
async function getSystemMetrics(timeRanges) {
    try {
        const db = getDatabase();
        
        const systemStats = await db.collection('system_logs').aggregate([
            { $match: { timestamp: { $gte: timeRanges.start, $lte: timeRanges.end } } },
            { $group: {
                _id: '$severity',
                count: { $sum: 1 },
                avgResponseTime: { $avg: '$data.responseTime' }
            }}
        ]).toArray();
        
        const metrics = {
            info: 0,
            warning: 0,
            error: 0,
            avgResponseTime: 0
        };
        
        systemStats.forEach(stat => {
            metrics[stat._id] = stat.count;
            if (stat.avgResponseTime) {
                metrics.avgResponseTime = Math.round(stat.avgResponseTime);
            }
        });
        
        // Add current system status
        metrics.currentStatus = {
            memory: process.memoryUsage(),
            uptime: Math.round(process.uptime()),
            cpu: process.cpuUsage()
        };
        
        return metrics;
        
    } catch (error) {
        logError(error, { operation: 'getSystemMetrics' });
        return { error: 'Unable to fetch system metrics' };
    }
}

// Get error analytics
async function getErrorAnalytics(timeRanges) {
    try {
        const db = getDatabase();
        
        const [queryErrors, systemErrors] = await Promise.all([
            // Query-related errors
            db.collection('queries').aggregate([
                { $match: { 
                    timestamp: { $gte: timeRanges.start, $lte: timeRanges.end },
                    queryType: 'search_error'
                }},
                { $group: {
                    _id: '$metadata.errorCode',
                    count: { $sum: 1 }
                }}
            ]).toArray(),
            
            // System errors
            db.collection('system_logs').aggregate([
                { $match: { 
                    timestamp: { $gte: timeRanges.start, $lte: timeRanges.end },
                    severity: 'error'
                }},
                { $group: {
                    _id: '$eventType',
                    count: { $sum: 1 }
                }}
            ]).toArray()
        ]);
        
        return {
            totalErrors: queryErrors.reduce((sum, err) => sum + err.count, 0) + 
                        systemErrors.reduce((sum, err) => sum + err.count, 0),
            queryErrors: queryErrors.reduce((acc, err) => {
                acc[err._id || 'unknown'] = err.count;
                return acc;
            }, {}),
            systemErrors: systemErrors.reduce((acc, err) => {
                acc[err._id] = err.count;
                return acc;
            }, {})
        };
        
    } catch (error) {
        logError(error, { operation: 'getErrorAnalytics' });
        return { error: 'Unable to fetch error analytics' };
    }
}

// Get top queries for insights
async function getTopQueries(timeRanges, limit = 10) {
    try {
        const db = getDatabase();
        
        const topQueries = await db.collection('queries').aggregate([
            { $match: { 
                timestamp: { $gte: timeRanges.start, $lte: timeRanges.end },
                queryType: 'alumni_search'
            }},
            { $group: {
                _id: '$query',
                count: { $sum: 1 },
                avgMatches: { $avg: '$totalMatches' },
                lastUsed: { $max: '$timestamp' }
            }},
            { $sort: { count: -1 } },
            { $limit: limit }
        ]).toArray();
        
        return topQueries.map(query => ({
            query: query._id.substring(0, 100), // Limit length for display
            count: query.count,
            avgMatches: Math.round(query.avgMatches * 100) / 100,
            lastUsed: query.lastUsed
        }));
        
    } catch (error) {
        logError(error, { operation: 'getTopQueries' });
        return [];
    }
}

// Get user growth metrics
async function getUserGrowthMetrics(timeRanges) {
    try {
        const db = getDatabase();
        
        const [newUsers, returningUsers] = await Promise.all([
            // New users (first activity in timeframe)
            db.collection('user_stats').countDocuments({
                firstActivity: { $gte: timeRanges.start, $lte: timeRanges.end }
            }),
            
            // Returning users (had activity before timeframe but also in timeframe)
            db.collection('user_stats').countDocuments({
                firstActivity: { $lt: timeRanges.start },
                lastActivity: { $gte: timeRanges.start, $lte: timeRanges.end }
            })
        ]);
        
        return {
            newUsers: newUsers,
            returningUsers: returningUsers,
            totalActiveUsers: newUsers + returningUsers
        };
        
    } catch (error) {
        logError(error, { operation: 'getUserGrowthMetrics' });
        return { error: 'Unable to fetch user growth metrics' };
    }
}

// Helper function to get time ranges
function getTimeRanges(timeframe) {
    const end = new Date();
    let start;
    
    switch (timeframe) {
        case '1h':
            start = new Date(end - 60 * 60 * 1000);
            break;
        case '24h':
            start = new Date(end - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            start = new Date(end - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            start = new Date(end - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            start = new Date(end - 24 * 60 * 60 * 1000);
    }
    
    return { start, end };
}

// Clean up old logs to manage storage
async function cleanupOldLogs() {
    try {
        const db = getDatabase();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        // Clean up old queries (keep 30 days)
        const queryCleanup = await db.collection('queries').deleteMany({
            timestamp: { $lt: thirtyDaysAgo }
        });
        
        // Clean up old system logs (keep 7 days)
        const systemLogCleanup = await db.collection('system_logs').deleteMany({
            timestamp: { $lt: sevenDaysAgo }
        });
        
        // Clean up old user stats (keep 30 days)
        const userStatsCleanup = await db.collection('user_stats').deleteMany({
            createdAt: { $lt: thirtyDaysAgo }
        });
        
        logSuccess('analytics_cleanup', {
            queriesDeleted: queryCleanup.deletedCount,
            systemLogsDeleted: systemLogCleanup.deletedCount,
            userStatsDeleted: userStatsCleanup.deletedCount
        });
        
        return {
            success: true,
            queriesDeleted: queryCleanup.deletedCount,
            systemLogsDeleted: systemLogCleanup.deletedCount,
            userStatsDeleted: userStatsCleanup.deletedCount
        };
        
    } catch (error) {
        logError(error, { operation: 'cleanupOldLogs' });
        return { success: false, error: error.message };
    }
}

// Export user data for a specific user (GDPR compliance)
async function exportUserData(whatsappNumber) {
    try {
        const db = getDatabase();
        
        const [queries, sessions, stats] = await Promise.all([
            db.collection('queries').find({ whatsappNumber }).toArray(),
            db.collection('sessions').find({ whatsappNumber }).toArray(),
            db.collection('user_stats').find({ whatsappNumber }).toArray()
        ]);
        
        return {
            whatsappNumber: whatsappNumber,
            exportDate: new Date().toISOString(),
            data: {
                queries: queries.length,
                sessions: sessions.length,
                statistics: stats.length
            },
            details: {
                queries: queries,
                sessions: sessions,
                statistics: stats
            }
        };
        
    } catch (error) {
        logError(error, { operation: 'exportUserData', whatsappNumber });
        return { error: 'Unable to export user data' };
    }
}

// Delete user data (GDPR compliance)
async function deleteUserData(whatsappNumber) {
    try {
        const db = getDatabase();
        
        const [queryDeletion, sessionDeletion, statsDeletion] = await Promise.all([
            db.collection('queries').deleteMany({ whatsappNumber }),
            db.collection('sessions').deleteMany({ whatsappNumber }),
            db.collection('user_stats').deleteMany({ whatsappNumber })
        ]);
        
        logSuccess('user_data_deleted', {
            whatsappNumber,
            queriesDeleted: queryDeletion.deletedCount,
            sessionsDeleted: sessionDeletion.deletedCount,
            statsDeleted: statsDeletion.deletedCount
        });
        
        return {
            success: true,
            deletedRecords: {
                queries: queryDeletion.deletedCount,
                sessions: sessionDeletion.deletedCount,
                statistics: statsDeletion.deletedCount
            }
        };
        
    } catch (error) {
        logError(error, { operation: 'deleteUserData', whatsappNumber });
        return { success: false, error: error.message };
    }
}

module.exports = {
    logUserQuery,
    updateUserStats,
    logSystemEvent,
    getAnalyticsDashboard,
    getUserActivityMetrics,
    getSearchAnalyticsMetrics,
    getSystemMetrics,
    getErrorAnalytics,
    getTopQueries,
    getUserGrowthMetrics,
    cleanupOldLogs,
    exportUserData,
    deleteUserData
};