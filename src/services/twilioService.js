// Twilio WhatsApp messaging service for JY Alumni Bot
// Handles message sending, retry logic, and delivery confirmation with enhanced error handling

const twilio = require('twilio');
const { getConfig } = require('../config/environment');
const { logError, logSuccess } = require('../middleware/logging');
const { twilioErrorHandler } = require('../middleware/errorHandlers');

let twilioClient;

// Initialize Twilio client
function initializeTwilioClient() {
    const config = getConfig();
    
    try {
        if (!config.twilio.accountSid || !config.twilio.authToken) {
            console.warn('⚠️ Twilio credentials not configured');
            return null;
        }
        
        twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
        console.log('✅ Twilio client initialized successfully');
        return twilioClient;
        
    } catch (error) {
        logError(error, { operation: 'twilio_initialization' });
        return null;
    }
}

// Initialize client on module load
twilioClient = initializeTwilioClient();

// Enhanced message sending with retry logic and optimization
async function sendTwilioMessage(whatsappNumber, messageText, options = {}) {
    const config = getConfig();
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 2000;
    
    if (!twilioClient) {
        logError(new Error('Twilio client not initialized'), { whatsappNumber });
        return false;
    }
    
    // Validate message length for WhatsApp
    if (messageText.length > 4096) {
        console.warn(`⚠️ Message too long (${messageText.length} chars), truncating...`);
        messageText = messageText.substring(0, 4000) + '\n\n...Message truncated due to length limit.';
    }
    
    // Format WhatsApp number
    const formattedNumber = whatsappNumber.startsWith('whatsapp:') 
        ? whatsappNumber 
        : `whatsapp:${whatsappNumber}`;
        
    const sanitizedNumber = whatsappNumber.replace(/[^\d]/g, '').slice(-4);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📤 Sending message to ***${sanitizedNumber} (Attempt ${attempt}/${maxRetries})`);
            
            const message = await twilioClient.messages.create({
                body: messageText,
                from: config.twilio.phoneNumber,
                to: formattedNumber,
                ...(options.mediaUrl && { mediaUrl: [options.mediaUrl] })
            });
            
            logSuccess('twilio_message_sent', {
                messageSid: message.sid,
                to: sanitizedNumber,
                messageLength: messageText.length,
                attempt: attempt,
                status: message.status
            });
            
            console.log(`✅ Message sent successfully: ${message.sid}`);
            return {
                success: true,
                messageSid: message.sid,
                status: message.status,
                attempt: attempt
            };
            
        } catch (error) {
            const errorInfo = twilioErrorHandler(error, whatsappNumber);
            
            console.error(`❌ Twilio attempt ${attempt} failed for ***${sanitizedNumber}:`, error.message);
            
            // Check if error is retryable
            const isRetryable = isRetryableError(error);
            
            if (attempt === maxRetries || !isRetryable) {
                logError(error, { 
                    operation: 'twilio_send_final_failure',
                    whatsappNumber: sanitizedNumber,
                    attempts: attempt,
                    isRetryable
                });
                
                return {
                    success: false,
                    error: errorInfo.error,
                    errorCode: error.code,
                    attempts: attempt,
                    isRetryable
                };
            }
            
            // Wait before retry with exponential backoff
            const delay = retryDelay * Math.pow(2, attempt - 1);
            console.log(`🔄 Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return {
        success: false,
        error: 'All retry attempts failed',
        attempts: maxRetries
    };
}

// Check if Twilio error is retryable
function isRetryableError(error) {
    const retryableCodes = [
        20429, // Rate limit exceeded
        21611, // Phone number not reachable
        30001, // Queue overflow
        30002, // Message body too large
        30003, // Message send failure
        30004, // Message failed to send
        30005, // Unknown destination handset
        30006, // Landline or unreachable carrier
        30007, // Carrier violation
        30008, // Unknown error
        63016, // Webhook timeout
        63017, // Webhook error
        63018, // Webhook authentication failed
    ];
    
    const nonRetryableCodes = [
        21211, // Invalid 'To' Phone Number
        21612, // The 'To' phone number is not currently reachable
        21614, // 'To' number is not a valid mobile number
        63007, // Sandbox phone number not verified
        63003, // Attempted to send to unverified number
    ];
    
    if (nonRetryableCodes.includes(error.code)) {
        return false;
    }
    
    return retryableCodes.includes(error.code) || 
           error.status >= 500 || 
           error.message.includes('timeout') ||
           error.message.includes('network');
}

// Send bulk messages with rate limiting
async function sendBulkMessages(recipients, messageText, options = {}) {
    const results = [];
    const rateLimit = options.rateLimit || 1000; // ms between messages
    const batchSize = options.batchSize || 5;
    
    console.log(`📨 Starting bulk message send to ${recipients.length} recipients`);
    
    for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const batchPromises = batch.map(async (recipient, index) => {
            // Add delay to respect rate limits
            if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, rateLimit));
            }
            
            const result = await sendTwilioMessage(recipient, messageText, options);
            return { recipient, ...result };
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        console.log(`📊 Batch ${Math.floor(i / batchSize) + 1} completed: ${batchResults.filter(r => r.success).length}/${batchResults.length} successful`);
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    logSuccess('bulk_message_completed', {
        total: recipients.length,
        successful,
        failed,
        successRate: Math.round((successful / recipients.length) * 100)
    });
    
    return {
        total: recipients.length,
        successful,
        failed,
        results,
        successRate: Math.round((successful / recipients.length) * 100)
    };
}

// Get message status
async function getMessageStatus(messageSid) {
    if (!twilioClient) {
        return { error: 'Twilio client not initialized' };
    }
    
    try {
        const message = await twilioClient.messages(messageSid).fetch();
        
        return {
            success: true,
            status: message.status,
            errorCode: message.errorCode,
            errorMessage: message.errorMessage,
            dateCreated: message.dateCreated,
            dateSent: message.dateSent,
            dateUpdated: message.dateUpdated,
            price: message.price,
            priceUnit: message.priceUnit
        };
        
    } catch (error) {
        logError(error, { operation: 'get_message_status', messageSid });
        return { error: error.message };
    }
}

// Validate WhatsApp number format
function validateWhatsAppNumber(phoneNumber) {
    // Remove all non-digit characters
    const digitsOnly = phoneNumber.replace(/[^\d]/g, '');
    
    // Check length (should be 10-15 digits)
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        return {
            valid: false,
            error: 'Phone number must be 10-15 digits long'
        };
    }
    
    // Format for WhatsApp
    const formattedNumber = `whatsapp:+${digitsOnly}`;
    
    return {
        valid: true,
        formatted: formattedNumber,
        digits: digitsOnly
    };
}

// Test Twilio connection
async function testTwilioConnection() {
    if (!twilioClient) {
        return {
            success: false,
            error: 'Twilio client not initialized'
        };
    }
    
    try {
        const account = await twilioClient.api.accounts.list({ limit: 1 });
        
        return {
            success: true,
            accountSid: account[0]?.sid,
            status: account[0]?.status,
            message: 'Twilio connection successful'
        };
        
    } catch (error) {
        logError(error, { operation: 'twilio_connection_test' });
        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

// Get Twilio service statistics
async function getTwilioStats() {
    if (!twilioClient) {
        return { error: 'Twilio client not initialized' };
    }
    
    try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const messages = await twilioClient.messages.list({
            dateSentAfter: yesterday,
            limit: 1000
        });
        
        const stats = {
            total_messages_24h: messages.length,
            successful: messages.filter(m => m.status === 'delivered').length,
            failed: messages.filter(m => m.status === 'failed').length,
            pending: messages.filter(m => ['queued', 'sending', 'sent'].includes(m.status)).length,
            by_status: {}
        };
        
        // Group by status
        messages.forEach(message => {
            stats.by_status[message.status] = (stats.by_status[message.status] || 0) + 1;
        });
        
        return stats;
        
    } catch (error) {
        logError(error, { operation: 'get_twilio_stats' });
        return { error: error.message };
    }
}

module.exports = {
    sendTwilioMessage,
    sendBulkMessages,
    getMessageStatus,
    validateWhatsAppNumber,
    testTwilioConnection,
    getTwilioStats,
    initializeTwilioClient
};