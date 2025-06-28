// Health check route for JY Alumni Bot
// Provides comprehensive system status and diagnostics for monitoring and debugging

const express = require('express');
const router = express.Router();
const { getConfig } = require('../config/environment');
const { isDbConnected, checkDatabaseHealth } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandlers');

// Main health check endpoint
router.get('/', asyncHandler(async (req, res) => {
    const config = getConfig();
    const startTime = Date.now();
    
    // Check database health
    const databaseHealthy = await checkDatabaseHealth();
    const databaseStatus = isDbConnected() && databaseHealthy ? '✅ Connected' : '❌ Disconnected';
    
    // Check environment variables
    const envChecks = {
        openai: !!config.ai.apiKey,
        twilio: !!(config.twilio.accountSid && config.twilio.authToken),
        email: !!(config.email.user && config.email.pass),
        mongodb: !!config.mongodb.uri
    };
    
    const healthStatus = {
        status: '🚀 JY Alumni Network Bot v3.0 - Enhanced Profile System',
        version: config.bot.version,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${Date.now() - startTime}ms`,
        
        // Enhanced Features
        enhanced_features: [
            '🧠 AI-Powered Intent Detection',
            '📋 Comprehensive Profile Collection (20+ Fields)',
            '🤖 Smart Input Validation with AI',
            '📧 Multiple Email Support & Linking',
            '🌍 Geographic Data Validation',
            '🎯 Community Give & Ask Mapping',
            '🔍 Enhanced Alumni Search with AI Scoring',
            '💬 Natural Language Understanding',
            '📱 Multi-WhatsApp Support (Max 3 per user)',
            '🛡️ Production-Grade Error Handling'
        ],
        
        // New Profile Fields Added
        new_profile_fields: [
            'Full Name (Character validation)',
            'Gender (Male/Female/Others)',
            'Enhanced Professional Roles (8 options)',
            'Date of Birth (DD-MM-YYYY format)',
            'Country (AI validated)',
            'City & State (AI validated)',
            'Phone Number (with country code)',
            'Additional Email Linking',
            'LinkedIn Profile URL',
            'Instagram Profile (Optional)',
            'Enhanced Domains (20 categories)',
            'Yatra Impact Assessment',
            'Community Asks (3 selections)',
            'Community Gives (Multiple selections)'
        ],
        
        // System Status
        system: {
            database: databaseStatus,
            node_env: config.nodeEnv,
            debug_mode: config.debugMode,
            session_timeout: `${config.bot.sessionTimeoutHours} hours`,
            daily_query_limit: config.bot.dailyQueryLimit,
            max_search_results: config.bot.maxSearchResults
        },
        
        // Service Health Checks
        services: {
            openai: envChecks.openai ? '✅ API Key Present' : '❌ API Key Missing',
            twilio: envChecks.twilio ? '✅ Credentials Present' : '❌ Credentials Missing',
            email: envChecks.email ? '✅ SMTP Configured' : '❌ SMTP Not Configured',
            mongodb: envChecks.mongodb ? databaseStatus : '❌ URI Missing'
        },
        
        // AI Configuration
        ai_config: {
            model: config.ai.model,
            max_tokens: config.ai.maxTokens,
            temperature: config.ai.temperature,
            validation_enabled: true,
            intent_detection: 'Enhanced with confidence scoring'
        },
        
        // Enhanced User Flow
        user_flows: {
            new_user: 'Email → OTP → Enhanced Profile (20+ fields) → Search',
            existing_user: 'Greeting → Profile Completion Check → Search',
            profile_update: 'AI-validated input for each field with smart retry',
            search: 'AI-powered keyword extraction → Relevance scoring → Top results'
        },
        
        // Profile Validation Features
        validation_features: [
            '✅ Name: Character-only validation',
            '✅ Email: Format + multiple email linking',
            '✅ Phone: Country code + format validation',
            '✅ Geographic: AI-powered city/country validation',
            '✅ Professional: Enhanced role categorization',
            '✅ Social: LinkedIn URL validation',
            '✅ Community: Multi-select with number validation'
        ],
        
        // Performance Metrics
        performance: {
            webhook_response_time: 'Optimized for <2s response',
            ai_operations: 'Cached and optimized',
            database_queries: 'Indexed for fast retrieval',
            session_management: 'MongoDB TTL with auto-cleanup'
        }
    };
    
    // Determine overall health status
    const allServicesHealthy = Object.values(envChecks).every(check => check) && 
                              isDbConnected() && 
                              databaseHealthy;
    
    const statusCode = allServicesHealthy ? 200 : 503;
    
    if (!allServicesHealthy) {
        healthStatus.warnings = [];
        
        if (!envChecks.openai) healthStatus.warnings.push('OpenAI API key missing - Using fallback responses');
        if (!envChecks.twilio) healthStatus.warnings.push('Twilio credentials missing - Cannot send messages');
        if (!envChecks.email) healthStatus.warnings.push('Email configuration missing - OTP verification disabled');
        if (!isDbConnected()) healthStatus.warnings.push('Database disconnected - Core features disabled');
    }
    
    res.status(statusCode).json(healthStatus);
}));

// Detailed diagnostics endpoint
router.get('/diagnostics', asyncHandler(async (req, res) => {
    const config = getConfig();
    
    const diagnostics = {
        timestamp: new Date().toISOString(),
        system_info: {
            node_version: process.version,
            platform: process.platform,
            architecture: process.arch,
            memory_usage: process.memoryUsage(),
            cpu_usage: process.cpuUsage()
        },
        
        configuration: {
            environment: config.nodeEnv,
            debug_mode: config.debugMode,
            port: config.port,
            session_timeout: config.bot.sessionTimeoutHours,
            daily_limit: config.bot.dailyQueryLimit
        },
        
        database_stats: {
            connected: isDbConnected(),
            uri_configured: !!config.mongodb.uri,
            db_name: config.mongodb.dbName,
            connection_options: config.mongodb.options
        },
        
        ai_configuration: {
            model: config.ai.model,
            max_tokens: config.ai.maxTokens,
            temperature: config.ai.temperature,
            api_key_present: !!config.ai.apiKey
        }
    };
    
    res.json(diagnostics);
}));

// Quick status endpoint for load balancers
router.get('/status', (req, res) => {
    const isHealthy = isDbConnected();
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

module.exports = router;