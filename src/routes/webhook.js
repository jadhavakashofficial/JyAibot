// Webhook route handler for Twilio WhatsApp integration
// File: src/routes/webhook.js
// FIXED VERSION - Corrected imports and removed canAccessSearch usage

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandlers');
const { logUserActivity, logError } = require('../middleware/logging');
const { sanitizeInput } = require('../utils/validation');
const { detectUserIntent, validateIntentForUserState } = require('../services/intentDetection');
const { findUserByWhatsAppNumber } = require('../models/User'); // FIXED: Removed canAccessSearch import
const { loadUserSession, saveUserSession } = require('../services/sessionManager');
const { sendTwilioMessage } = require('../services/twilioService');
const { handleAuthenticatedUser } = require('../controllers/authenticatedUserController');
const { handleNewUser } = require('../controllers/newUserController');
const { checkAdvancedRateLimit } = require('../services/rateLimiter');

// Main webhook endpoint for Twilio WhatsApp with enhanced processing
router.post('/', asyncHandler(async (req, res) => {
    const { Body, From, ProfileName, MessageSid } = req.body;
    
    // Validate required fields
    if (!Body || !From) {
        console.log('⚠️ Invalid webhook payload - missing Body or From');
        logError(new Error('Invalid webhook payload'), { 
            body: req.body,
            headers: req.headers 
        });
        return res.status(200).send('');
    }
    
    // Sanitize and prepare data
    const userMessage = sanitizeInput(Body);
    const whatsappNumber = From.replace('whatsapp:', '');
    const userName = ProfileName || 'User';
    const messageId = MessageSid || 'unknown';
    
    // Basic validation
    if (!userMessage || userMessage.length === 0) {
        console.log(`⚠️ Empty message received from ${whatsappNumber}`);
        return res.status(200).send('');
    }
    
    // Rate limiting check
    try {
        const rateLimitResult = await checkAdvancedRateLimit(whatsappNumber, 'message');
        if (!rateLimitResult.allowed) {
            const rateLimitMessage = generateRateLimitMessage(rateLimitResult);
            await sendTwilioMessage(From, rateLimitMessage);
            return res.status(200).send('');
        }
    } catch (rateLimitError) {
        console.log('⚠️ Rate limiting check failed, allowing request:', rateLimitError.message);
        // Continue processing if rate limiting fails
    }
    
    // Log user activity
    logUserActivity(whatsappNumber, 'message_received', {
        messageLength: userMessage.length,
        profileName: userName,
        messageId: messageId,
        ipAddress: req.ip || 'unknown'
    });
    
    console.log(`📱 Processing message from ${whatsappNumber.replace(/[^\d]/g, '').slice(-4)} (${userName}): ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`);
    
    try {
        // Load user session with enhanced error handling
        let userSession = await loadUserSession(whatsappNumber);
        if (!userSession) {
            console.log(`🆕 Creating new session for ${whatsappNumber.replace(/[^\d]/g, '').slice(-4)}`);
            userSession = createEmergencySession();
        }
        
        // Detect user intent using enhanced AI system
        const rawIntent = detectUserIntent(userMessage, userSession);
        console.log(`🧠 Raw intent detected: ${rawIntent.type} (confidence: ${rawIntent.confidence})`);
        
        // Validate intent against current user state
        const intent = validateIntentForUserState(rawIntent, userSession);
        console.log(`✅ Final intent: ${intent.type}${intent.blocked ? ' (BLOCKED)' : ''}`);
        
        // Check if user exists in database
        const existingUser = await findUserByWhatsAppNumber(whatsappNumber);
        
        let responseMessage = '';
        
        if (existingUser) {
            // Handle existing authenticated user
            console.log(`👤 Existing user found: ${existingUser.basicProfile?.name || 'Unknown'}`);
            
            userSession.authenticated = true;
            userSession.user_data = existingUser;
            userSession.whatsappNumber = whatsappNumber;
            
            // FIXED: Removed canAccessSearch call - let controller handle profile checks
            console.log(`🔍 Profile completion: ${existingUser.enhancedProfile?.completed ? 'COMPLETE' : 'INCOMPLETE'}`);
            
            responseMessage = await handleAuthenticatedUser(userMessage, intent, userSession, whatsappNumber);
        } else {
            // Handle new user registration flow
            console.log(`🆕 New user detected: ${whatsappNumber.replace(/[^\d]/g, '').slice(-4)}`);
            
            responseMessage = await handleNewUser(userMessage, intent, userSession, whatsappNumber);
        }
        
        // Enhanced response validation
        if (!responseMessage || responseMessage.trim().length === 0) {
            console.log(`⚠️ Empty response generated for ${whatsappNumber.replace(/[^\d]/g, '').slice(-4)}`);
            responseMessage = generateFallbackResponse(userSession);
        }
        
        // Save updated session with error handling
        const sessionSaved = await saveUserSession(whatsappNumber, userSession);
        if (!sessionSaved) {
            console.log(`⚠️ Failed to save session for ${whatsappNumber.replace(/[^\d]/g, '').slice(-4)}`);
        }
        
        // Send response via Twilio with retry logic
        if (responseMessage) {
            const messageSent = await sendTwilioMessage(From, responseMessage, { 
                maxRetries: 3,
                retryDelay: 1000 
            });
            
            if (messageSent && messageSent.success) {
                console.log(`✅ Response sent successfully to ${whatsappNumber.replace(/[^\d]/g, '').slice(-4)}`);
                logUserActivity(whatsappNumber, 'response_sent', {
                    responseLength: responseMessage.length,
                    intent: intent.type,
                    messageSid: messageSent.messageSid || 'unknown'
                });
            } else {
                console.log(`❌ Failed to send response to ${whatsappNumber.replace(/[^\d]/g, '').slice(-4)}: ${messageSent?.error || 'Unknown error'}`);
                logUserActivity(whatsappNumber, 'response_failed', {
                    intent: intent.type,
                    error: messageSent?.error || 'Unknown error',
                    attempts: messageSent?.attempts || 1
                });
                
                // Try to send a simple error message
                try {
                    await sendTwilioMessage(From, "⚠️ Message delivery failed. Please try again.", { maxRetries: 1 });
                } catch (fallbackError) {
                    console.log('❌ Fallback message also failed:', fallbackError.message);
                }
            }
        }
        
        res.status(200).send('');
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        
        // Enhanced error logging with context
        logError(error, {
            operation: 'webhook_processing',
            whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4),
            userMessage: userMessage.substring(0, 100),
            messageId: messageId,
            userName: userName,
            timestamp: new Date().toISOString()
        });
        
        // Send appropriate error message to user
        try {
            const errorMessage = generateErrorResponse(error, userMessage);
            await sendTwilioMessage(From, errorMessage, { maxRetries: 1 });
        } catch (twilioError) {
            console.error('❌ Failed to send error message:', twilioError);
            logError(twilioError, { 
                operation: 'error_message_send_failed',
                whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4)
            });
        }
        
        logUserActivity(whatsappNumber, 'processing_error', {
            error: error.message,
            intent: 'unknown',
            userMessage: userMessage.substring(0, 50)
        });
        
        res.status(200).send('');
    }
}));

// Enhanced webhook validation endpoint (for Twilio webhook verification)
router.get('/', (req, res) => {
    const response = {
        status: 'webhook_active',
        service: 'JY Alumni Network Bot',
        version: 'v3.0.0-strict-profile-enforcement',
        capabilities: [
            'Strict 100% profile completion enforcement',
            'AI-powered intent detection',
            'Enhanced geographic validation',
            'Advanced rate limiting',
            'Multi-WhatsApp support',
            'Comprehensive error handling'
        ],
        endpoints: {
            webhook: 'POST /webhook - Main webhook for WhatsApp messages',
            health: 'GET /health - System health check',
            webhook_status: 'GET /webhook - This status endpoint'
        },
        profile_requirements: {
            completion_required: '100%',
            total_fields: 13,
            search_unlocked_at: '100% completion',
            ai_validation_enabled: true
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    };
    
    res.json(response);
});

// Webhook health check endpoint
router.get('/health', asyncHandler(async (req, res) => {
    try {
        const { isDbConnected } = require('../config/database');
        const { getConfig } = require('../config/environment');
        
        const config = getConfig();
        const healthStatus = {
            webhook: 'operational',
            database: isDbConnected() ? 'connected' : 'disconnected',
            twilio: !!(config.twilio.accountSid && config.twilio.authToken) ? 'configured' : 'not_configured',
            ai_services: !!config.ai.apiKey ? 'available' : 'unavailable',
            profile_enforcement: 'strict_100_percent',
            last_check: new Date().toISOString()
        };
        
        const allHealthy = Object.values(healthStatus).every(status => 
            status === 'operational' || status === 'connected' || status === 'configured' || 
            status === 'available' || status === 'strict_100_percent'
        );
        
        res.status(allHealthy ? 200 : 503).json({
            status: allHealthy ? 'healthy' : 'degraded',
            checks: healthStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}));

// Generate rate limit message
function generateRateLimitMessage(rateLimitResult) {
    switch (rateLimitResult.reason) {
        case 'daily_limit_exceeded':
            return `🚫 **Daily Limit Reached**

You've used all 30 searches today. Limit resets at midnight.

Meanwhile, you can:
• Update your profile
• Ask general questions
• Come back tomorrow for more searches

Need help? Contact support@jagritiyatra.com`;

        case 'user_cooldown':
            const minutes = rateLimitResult.remainingMinutes;
            return `⏸️ **Account Temporarily Restricted**

Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.

This helps maintain fair access for all alumni.`;

        case 'suspicious_activity':
            return `🔒 **Unusual Activity Detected**

Your account has been temporarily restricted for security.

Wait ${rateLimitResult.cooldownMinutes} minutes and try again.

Contact support if this continues: support@jagritiyatra.com`;

        default:
            return `⚠️ **Request Temporarily Blocked**

Please try again in a few minutes.

Contact support if issues persist: support@jagritiyatra.com`;
    }
}

// Generate appropriate error response based on error type
function generateErrorResponse(error, userMessage) {
    // Database errors
    if (error.message.includes('database') || error.message.includes('MongoDB')) {
        return `⚠️ **Temporary Database Issue**

I'm having trouble accessing user data right now.

Please try again in a moment.`;
    }
    
    // AI service errors
    if (error.message.includes('OpenAI') || error.message.includes('AI')) {
        return `⚠️ **AI Service Temporarily Unavailable**

I'm using fallback processing for your request.

Please try again or rephrase your message.`;
    }
    
    // Validation errors
    if (error.message.includes('validation') || error.message.includes('Invalid')) {
        return `⚠️ **Input Validation Error**

There's an issue with your message format.

Please try again with different wording.`;
    }
    
    // Session errors
    if (error.message.includes('session')) {
        return `⚠️ **Session Issue**

Let me restart our conversation.

Please send your message again.`;
    }
    
    // Network/timeout errors
    if (error.message.includes('timeout') || error.message.includes('network')) {
        return `⚠️ **Connection Issue**

I'm experiencing network problems.

Please try again in a moment.`;
    }
    
    // Generic error
    return `⚠️ **Technical Issue**

I'm experiencing a temporary problem.

Please try again or contact support: support@jagritiyatra.com`;
}

// Create emergency session when session loading fails
function createEmergencySession() {
    return {
        conversation_start: new Date().toISOString(),
        waiting_for: null,
        authenticated: false,
        ready: false,
        profile_asked: false,
        profile_skipped: false,
        profile_completed: false,
        totalInteractions: 0,
        version: 'v3.0-emergency',
        emergency_session: true,
        created_at: new Date().toISOString()
    };
}

// Generate fallback response when main processing fails
function generateFallbackResponse(userSession) {
    if (userSession.authenticated) {
        const userName = userSession.user_data?.basicProfile?.name || 'there';
        return `Hi ${userName}! 👋

I'm here to help you connect with our alumni network.

What can I help you with today?`;
    } else {
        return `Hi there! 👋

Welcome to JY Alumni Network. I help connect you with 500+ changemakers and entrepreneurs.

To get started, please share your registered email address.`;
    }
}

// Enhanced message preprocessing for security
function preprocessMessage(message) {
    // Remove potentially harmful content
    const cleaned = message
        .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: URLs
        .trim();
    
    // Limit message length
    return cleaned.length > 1000 ? cleaned.substring(0, 1000) + '...' : cleaned;
}

// Log webhook statistics for monitoring
async function logWebhookStats(req, intent, processingTime) {
    try {
        const stats = {
            timestamp: new Date(),
            method: req.method,
            userAgent: req.get('User-Agent') || 'unknown',
            intent: intent.type,
            confidence: intent.confidence,
            processingTime: processingTime,
            blocked: !!intent.blocked,
            authenticated: !!req.userSession?.authenticated,
            profileComplete: !!req.userSession?.user_data?.enhancedProfile?.completed
        };
        
        console.log(`📊 Webhook stats: ${intent.type} (${processingTime}ms)`);
    } catch (error) {
        console.warn('⚠️ Failed to log webhook stats:', error.message);
    }
}

module.exports = router;