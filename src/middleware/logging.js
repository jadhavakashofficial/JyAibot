// Request logging middleware for JY Alumni Bot
// Provides detailed logging for debugging and monitoring webhook requests

const { getConfig } = require('../config/environment');

function requestLogger(req, res, next) {
    const config = getConfig();
    
    if (config.debugMode) {
        const timestamp = new Date().toISOString();
        const method = req.method;
        const path = req.path;
        const userAgent = req.get('User-Agent') || 'Unknown';
        
        console.log(`\n📝 [${timestamp}] ${method} ${path}`);
        console.log(`   👤 User-Agent: ${userAgent}`);
        
        // Log Twilio webhook data (sanitized)
        if (req.path === '/webhook' && req.body) {
            const { Body, From, ProfileName, MessageSid } = req.body;
            console.log(`   📱 From: ${From || 'Unknown'}`);
            console.log(`   👤 Profile: ${ProfileName || 'Unknown'}`);
            console.log(`   📄 Message: ${Body ? Body.substring(0, 100) : 'Empty'}${Body && Body.length > 100 ? '...' : ''}`);
            console.log(`   🆔 MessageSid: ${MessageSid || 'Unknown'}`);
        }
        
        // Enhanced response logging
        const originalSend = res.send;
        res.send = function(data) {
            const statusCode = res.statusCode;
            const statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' : 
                               statusCode >= 400 && statusCode < 500 ? '⚠️' : '❌';
            
            console.log(`   ${statusEmoji} Response: ${statusCode}`);
            
            if (config.debugMode && data && typeof data === 'string' && data.length < 500) {
                console.log(`   📤 Response Data: ${data}`);
            }
            
            originalSend.call(this, data);
        };
    }
    
    next();
}

// Enhanced error logging
function logError(error, context = {}) {
    const timestamp = new Date().toISOString();
    console.error(`\n❌ [${timestamp}] ERROR OCCURRED:`);
    console.error(`   🔍 Context: ${JSON.stringify(context, null, 2)}`);
    console.error(`   📋 Message: ${error.message}`);
    
    if (error.stack) {
        console.error(`   📚 Stack Trace:`);
        console.error(error.stack);
    }
    
    // Log additional error properties
    if (error.code) console.error(`   🔢 Error Code: ${error.code}`);
    if (error.status) console.error(`   📊 Status: ${error.status}`);
}

// Success operation logging
function logSuccess(operation, details = {}) {
    const config = getConfig();
    
    if (config.debugMode) {
        const timestamp = new Date().toISOString();
        console.log(`\n✅ [${timestamp}] SUCCESS: ${operation}`);
        
        if (Object.keys(details).length > 0) {
            console.log(`   📋 Details: ${JSON.stringify(details, null, 2)}`);
        }
    }
}

// User activity logging
function logUserActivity(whatsappNumber, activity, metadata = {}) {
    const timestamp = new Date().toISOString();
    const sanitizedNumber = whatsappNumber.replace(/[^\d]/g, '').slice(-4);
    
    console.log(`\n👤 [${timestamp}] USER ACTIVITY: ***${sanitizedNumber}`);
    console.log(`   🎯 Activity: ${activity}`);
    
    if (Object.keys(metadata).length > 0) {
        console.log(`   📊 Metadata: ${JSON.stringify(metadata, null, 2)}`);
    }
}

// AI operation logging
function logAIOperation(operation, tokens = 0, model = '', duration = 0) {
    const config = getConfig();
    
    if (config.debugMode) {
        const timestamp = new Date().toISOString();
        console.log(`\n🤖 [${timestamp}] AI OPERATION: ${operation}`);
        console.log(`   🧠 Model: ${model}`);
        console.log(`   🎯 Tokens: ${tokens}`);
        console.log(`   ⏱️ Duration: ${duration}ms`);
    }
}

module.exports = {
    requestLogger,
    logError,
    logSuccess,
    logUserActivity,
    logAIOperation
};