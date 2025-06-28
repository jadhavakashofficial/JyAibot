// Webhook route handler for Twilio WhatsApp integration
// Main entry point for processing incoming WhatsApp messages and orchestrating bot responses

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandlers');
const { logUserActivity } = require('../middleware/logging');
const { sanitizeInput } = require('../utils/validation');
const { detectUserIntent } = require('../services/intentDetection');
const { findUserByWhatsAppNumber } = require('../models/User');
const { loadUserSession, saveUserSession } = require('../services/sessionManager');
const { sendTwilioMessage } = require('../services/twilioService');
const { handleAuthenticatedUser } = require('../controllers/authenticatedUserController');
const { handleNewUser } = require('../controllers/newUserController');

// Main webhook endpoint for Twilio WhatsApp
router.post('/', asyncHandler(async (req, res) => {
    const { Body, From, ProfileName, MessageSid } = req.body;
    
    // Validate required fields
    if (!Body || !From) {
        console.log('⚠️ Invalid webhook payload - missing Body or From');
        return res.status(200).send('');
    }
    
    // Sanitize and prepare data
    const userMessage = sanitizeInput(Body);
    const whatsappNumber = From.replace('whatsapp:', '');
    const userName = ProfileName || 'User';
    const messageId = MessageSid || 'unknown';
    
    // Log user activity
    logUserActivity(whatsappNumber, 'message_received', {
        messageLength: userMessage.length,
        profileName: userName,
        messageId: messageId
    });
    
    console.log(`📱 Processing message from ${whatsappNumber} (${userName}): ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`);
    
    try {
        // Load user session
        let userSession = await loadUserSession(whatsappNumber);
        
        // Detect user intent using AI
        const intent = detectUserIntent(userMessage, userSession);
        console.log(`🧠 Detected intent: ${intent.type}${intent.confidence ? ` (${intent.confidence})` : ''}`);
        
        // Check if user exists in database
        const existingUser = await findUserByWhatsAppNumber(whatsappNumber);
        
        let responseMessage = '';
        
        if (existingUser) {
            // Handle existing authenticated user
            console.log(`👤 Existing user found: ${existingUser.basicProfile?.name || 'Unknown'}`);
            
            userSession.authenticated = true;
            userSession.user_data = existingUser;
            userSession.whatsappNumber = whatsappNumber;
            
            responseMessage = await handleAuthenticatedUser(userMessage, intent, userSession, whatsappNumber);
        } else {
            // Handle new user registration flow
            console.log(`🆕 New user detected: ${whatsappNumber}`);
            
            responseMessage = await handleNewUser(userMessage, intent, userSession, whatsappNumber);
        }
        
        // Save updated session
        await saveUserSession(whatsappNumber, userSession);
        
        // Send response via Twilio
        if (responseMessage) {
            const messageSent = await sendTwilioMessage(From, responseMessage);
            
            if (messageSent) {
                console.log(`✅ Response sent successfully to ${whatsappNumber}`);
                logUserActivity(whatsappNumber, 'response_sent', {
                    responseLength: responseMessage.length,
                    intent: intent.type
                });
            } else {
                console.log(`❌ Failed to send response to ${whatsappNumber}`);
                logUserActivity(whatsappNumber, 'response_failed', {
                    intent: intent.type,
                    error: 'twilio_send_failed'
                });
            }
        }
        
        res.status(200).send('');
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        
        // Send error message to user
        try {
            await sendTwilioMessage(From, 
                "⚠️ I'm experiencing a technical issue. Please try again in a moment.");
        } catch (twilioError) {
            console.error('❌ Failed to send error message:', twilioError);
        }
        
        logUserActivity(whatsappNumber, 'processing_error', {
            error: error.message,
            intent: 'unknown'
        });
        
        res.status(200).send('');
    }
}));

// Webhook validation endpoint (for Twilio webhook verification)
router.get('/', (req, res) => {
    const response = {
        status: 'webhook_active',
        service: 'JY Alumni Network Bot',
        version: 'v3.0.0-enhanced-profiles',
        endpoints: {
            webhook: 'POST /webhook - Main webhook for WhatsApp messages',
            health: 'GET /health - System health check'
        },
        timestamp: new Date().toISOString()
    };
    
    res.json(response);
});

module.exports = router;