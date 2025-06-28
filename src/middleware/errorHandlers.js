// Error handling middleware for JY Alumni Bot
// Provides comprehensive error handling and user-friendly error responses

const { logError } = require('./logging');
const { getConfig } = require('../config/environment');

// Main error handler middleware
function errorHandler(err, req, res, next) {
    const config = getConfig();
    
    // Log the error with context
    logError(err, {
        method: req.method,
        path: req.path,
        body: req.body,
        headers: req.headers,
        timestamp: new Date().toISOString()
    });
    
    // Determine error type and response
    let statusCode = 500;
    let errorMessage = 'Internal server error occurred';
    let errorCode = 'INTERNAL_ERROR';
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        errorMessage = 'Invalid input provided';
        errorCode = 'VALIDATION_ERROR';
    } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
        statusCode = 503;
        errorMessage = 'Database temporarily unavailable';
        errorCode = 'DATABASE_ERROR';
    } else if (err.name === 'OpenAIError' || err.message.includes('OpenAI')) {
        statusCode = 503;
        errorMessage = 'AI service temporarily unavailable';
        errorCode = 'AI_SERVICE_ERROR';
    } else if (err.name === 'TwilioError' || err.message.includes('Twilio')) {
        statusCode = 503;
        errorMessage = 'Messaging service temporarily unavailable';
        errorCode = 'MESSAGING_ERROR';
    } else if (err.status) {
        statusCode = err.status;
        errorMessage = err.message || errorMessage;
    }
    
    // Send error response
    const errorResponse = {
        status: 'error',
        error: {
            code: errorCode,
            message: errorMessage,
            timestamp: new Date().toISOString()
        }
    };
    
    // Include stack trace in development
    if (config.nodeEnv === 'development') {
        errorResponse.error.stack = err.stack;
        errorResponse.error.details = err.message;
    }
    
    res.status(statusCode).json(errorResponse);
}

// 404 Not Found handler
function notFoundHandler(req, res) {
    const errorResponse = {
        status: 'not_found',
        error: {
            code: 'ENDPOINT_NOT_FOUND',
            message: `Endpoint ${req.method} ${req.path} not found`,
            timestamp: new Date().toISOString()
        },
        available_endpoints: {
            webhook: {
                path: '/webhook',
                method: 'POST',
                description: 'Twilio WhatsApp webhook endpoint'
            },
            health: {
                path: '/health',
                method: 'GET',
                description: 'System health check endpoint'
            }
        },
        version: 'v3.0.0-enhanced-profiles'
    };
    
    res.status(404).json(errorResponse);
}

// Async error wrapper for route handlers
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Rate limiting error handler
function rateLimitHandler(req, res) {
    const errorResponse = {
        status: 'rate_limited',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            timestamp: new Date().toISOString(),
            retryAfter: '3600' // 1 hour in seconds
        }
    };
    
    res.status(429).json(errorResponse);
}

// Database connection error handler
function databaseErrorHandler(error) {
    logError(error, { context: 'database_operation' });
    
    return {
        success: false,
        error: 'Database operation failed',
        message: 'Please try again in a moment',
        code: 'DATABASE_ERROR'
    };
}

// AI service error handler
function aiServiceErrorHandler(error, operation = 'AI operation') {
    logError(error, { context: 'ai_service', operation });
    
    return {
        success: false,
        error: 'AI service temporarily unavailable',
        message: 'Using fallback response',
        code: 'AI_SERVICE_ERROR'
    };
}

// Twilio service error handler
function twilioErrorHandler(error, whatsappNumber = '') {
    logError(error, { 
        context: 'twilio_service',
        whatsappNumber: whatsappNumber.replace(/[^\d]/g, '').slice(-4) 
    });
    
    return {
        success: false,
        error: 'Message delivery failed',
        message: 'Please try again',
        code: 'MESSAGING_ERROR'
    };
}

// Email service error handler  
function emailErrorHandler(error, email = '') {
    logError(error, { 
        context: 'email_service',
        email: email.replace(/(.{2}).*@/, '$1***@')
    });
    
    return {
        success: false,
        error: 'Email delivery failed',
        message: 'Please check your email address and try again',
        code: 'EMAIL_ERROR'
    };
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    rateLimitHandler,
    databaseErrorHandler,
    aiServiceErrorHandler,
    twilioErrorHandler,
    emailErrorHandler
};