// New user registration controller for JY Alumni Bot
// Handles email verification, OTP validation, and initial profile setup flow

const { findUserByEmail, linkWhatsAppToUser } = require('../models/User');
const { generateAndSendOTP, verifyOTP } = require('../services/otpService');
const { validateEmail, validateYesNo } = require('../utils/validation');
const { logUserActivity, logError } = require('../middleware/logging');
const { handleCasualConversation } = require('./conversationController');

// Main handler for new user interactions
async function handleNewUser(userMessage, intent, userSession, whatsappNumber) {
    try {
        logUserActivity(whatsappNumber, 'new_user_interaction', {
            intent: intent.type,
            sessionState: userSession.waiting_for,
            messageLength: userMessage.length
        });
        
        // New user welcome flow
        if (!userSession.waiting_for) {
            return handleInitialWelcome(userSession);
        }
        
        // Email input stage
        if (userSession.waiting_for === 'email_input') {
            return await handleEmailInput(userMessage, intent, userSession, whatsappNumber);
        }
        
        // OTP verification stage
        if (userSession.waiting_for === 'otp_verification') {
            return await handleOTPVerification(userMessage, intent, userSession, whatsappNumber);
        }
        
        // Fallback for unexpected states
        logError(new Error('Unexpected session state for new user'), {
            whatsappNumber,
            sessionState: userSession.waiting_for,
            intent: intent.type
        });
        
        return handleInitialWelcome(userSession);
        
    } catch (error) {
        logError(error, { operation: 'handleNewUser', whatsappNumber, intent: intent.type });
        return "⚠️ I'm experiencing a technical issue. Let me restart our conversation.\n\nPlease share your registered email address:";
    }
}

// Handle initial welcome message
function handleInitialWelcome(userSession) {
    const welcomeMessage = `🚆 Welcome to JY Alumni Network!

I help you connect with 500+ changemakers and entrepreneurs from our community.

To get started, please share your registered email address:

Example: yourname@domain.com`;
    
    userSession.waiting_for = 'email_input';
    userSession.conversation_start = new Date().toISOString();
    userSession.onboarding_step = 'email_collection';
    
    return welcomeMessage;
}

// Handle email input and validation
async function handleEmailInput(userMessage, intent, userSession, whatsappNumber) {
    try {
        // Handle "change" command
        if (userMessage.toLowerCase() === 'change') {
            userSession.temp_email = null;
            userSession.temp_user_data = null;
            return "No problem! Please enter your correct email address:\n\nExample: yourname@domain.com";
        }
        
        // Validate email format
        let email;
        if (intent.type === 'email_input') {
            email = intent.email;
        } else {
            const emailValidation = validateEmail(userMessage);
            if (!emailValidation.valid) {
                return `${emailValidation.message}

Please enter a valid email address:
Example: yourname@domain.com

Type "change" if you want to start over.`;
            }
            email = emailValidation.value;
        }
        
        logUserActivity(whatsappNumber, 'email_submitted', {
            email: email.replace(/(.{2}).*@/, '$1***@')
        });
        
        // Check if user exists in database
        const user = await findUserByEmail(email);
        
        if (!user) {
            return `❌ Email "${email}" not found in our alumni database.

Please check:
- Spelling is correct
- You're using the same email from your JY application
- Try alternative email addresses you might have used

Type "change" to enter a different email

Need help? Contact support@jagritiyatra.com`;
        }
        
        // Check WhatsApp number limit
        const existingNumbers = user.whatsappNumbers || [user.whatsappNumber].filter(Boolean) || [];
        
        if (existingNumbers.length >= 3) {
            return `You've reached the maximum of 3 WhatsApp numbers per account.

Current linked numbers: ${existingNumbers.length}/3

To link this number:
- Contact support to remove an existing number first
- Or use one of your already linked numbers

Support: support@jagritiyatra.com`;
        }
        
        // Generate and send OTP
        const otpResult = await generateAndSendOTP(email, {
            ipAddress: 'whatsapp',
            userAgent: 'JY-Bot-v3.0'
        });
        
        if (!otpResult.success) {
            logError(new Error('OTP generation failed'), {
                email: email.replace(/(.{2}).*@/, '$1***@'),
                error: otpResult.error
            });
            
            return `❌ Failed to send verification code to ${email}

This might be due to:
- Temporary email service issue
- Invalid email address
- Email provider blocking automated emails

Please try again or type "change" for a different email.`;
        }
        
        // Update session with temporary data
        userSession.temp_email = email;
        userSession.temp_user_data = user;
        userSession.waiting_for = 'otp_verification';
        userSession.onboarding_step = 'otp_verification';
        userSession.otp_sent_at = new Date().toISOString();
        
        logUserActivity(whatsappNumber, 'otp_sent', {
            email: email.replace(/(.{2}).*@/, '$1***@'),
            existingNumbers: existingNumbers.length
        });
        
        return `✅ Verification code sent to ${email}

Please enter the 6-digit code from your email:

⏰ Code expires in ${otpResult.expiryMinutes || 10} minutes

Options:
- Type "resend" for a new code
- Type "change" for different email`;
        
    } catch (error) {
        logError(error, { operation: 'handleEmailInput', whatsappNumber });
        return `❌ Error processing your email. Please try again.

Enter your registered email address:
Example: yourname@domain.com`;
    }
}

// Handle OTP verification
async function handleOTPVerification(userMessage, intent, userSession, whatsappNumber) {
    try {
        const email = userSession.temp_email;
        const userData = userSession.temp_user_data;
        
        if (!email || !userData) {
            return "❌ Session expired. Let's start over.\n\nPlease enter your registered email address:";
        }
        
        // Handle special commands
        if (userMessage.toLowerCase() === 'change') {
            userSession.waiting_for = 'email_input';
            userSession.temp_email = null;
            userSession.temp_user_data = null;
            userSession.onboarding_step = 'email_collection';
            
            return "Enter your correct email address:\n\nExample: yourname@domain.com";
        }
        
        if (userMessage.toLowerCase() === 'resend' || userMessage.toLowerCase() === 'new otp') {
            const otpResult = await generateAndSendOTP(email, {
                ipAddress: 'whatsapp',
                userAgent: 'JY-Bot-v3.0-resend'
            });
            
            if (otpResult.success) {
                userSession.otp_sent_at = new Date().toISOString();
                logUserActivity(whatsappNumber, 'otp_resent', {
                    email: email.replace(/(.{2}).*@/, '$1***@')
                });
                
                return `✅ New verification code sent to ${email}

Please enter the 6-digit code:

⏰ Code expires in ${otpResult.expiryMinutes || 10} minutes

Type "change" for different email`;
            } else {
                return `❌ Failed to send new verification code.

Please try again or type "change" for different email.`;
            }
        }
        
        // Validate OTP format
        let otpCode;
        if (intent.type === 'otp_verification') {
            otpCode = intent.otp;
        } else {
            const cleanOTP = userMessage.replace(/\s/g, '');
            if (!/^\d{6}$/.test(cleanOTP)) {
                return `❌ Please enter a 6-digit verification code.

Format: 123456 (6 digits)

Options:
- Type "resend" for new code
- Type "change" for different email`;
            }
            otpCode = cleanOTP;
        }
        
        logUserActivity(whatsappNumber, 'otp_verification_attempt', {
            email: email.replace(/(.{2}).*@/, '$1***@'),
            otpLength: otpCode.length
        });
        
        // Verify OTP
        const verification = await verifyOTP(email, otpCode);
        
        if (!verification.valid) {
            let errorMessage = `❌ ${verification.error}`;
            
            if (verification.expired) {
                errorMessage += `\n\nType "resend" for new code or "change" for different email`;
            } else if (verification.tooManyAttempts) {
                errorMessage += `\n\nType "resend" to get a fresh code or "change" for different email`;
            } else if (verification.attemptsRemaining > 0) {
                errorMessage += `\n\nOptions:
- Try entering the code again
- Type "resend" for new code  
- Type "change" for different email`;
            }
            
            return errorMessage;
        }
        
        // Link WhatsApp number to user account
        const linkResult = await linkWhatsAppToUser(email, whatsappNumber);
        
        if (!linkResult.success) {
            logError(new Error('WhatsApp linking failed'), {
                email: email.replace(/(.{2}).*@/, '$1***@'),
                whatsappNumber,
                error: linkResult.error
            });
            
            return `❌ ${linkResult.error}

Contact support if you need help managing your WhatsApp numbers.
Support: support@jagritiyatra.com`;
        }
        
        // Successfully verified and linked
        const userName = userData.basicProfile?.name || 'there';
        
        userSession.authenticated = true;
        userSession.user_data = userData;
        userSession.whatsappNumber = whatsappNumber;
        userSession.waiting_for = 'profile_assessment';
        userSession.onboarding_step = 'profile_assessment';
        userSession.verification_completed_at = new Date().toISOString();
        
        // Clean up temporary data
        delete userSession.temp_email;
        delete userSession.temp_user_data;
        
        logUserActivity(whatsappNumber, 'verification_successful', {
            email: email.replace(/(.{2}).*@/, '$1***@'),
            userName: userName,
            linkedNumbers: linkResult.count
        });
        
        return `✅ Verification successful!

Welcome to JY Alumni Network, ${userName}! 🌟

You're now connected to our community of 500+ changemakers and entrepreneurs.

What can I help you find today?

Examples:
- "Need help with web development"
- "Looking for marketing experts"
- "Connect me with fintech entrepreneurs"`;
        
    } catch (error) {
        logError(error, { operation: 'handleOTPVerification', whatsappNumber });
        return `❌ Verification failed due to technical issue.

Please try again:
- Enter your 6-digit code
- Type "resend" for new code
- Type "change" for different email`;
    }
}

// Handle casual conversation for new users
async function handleNewUserCasualConversation(userMessage, userSession) {
    try {
        // If user is in middle of registration, guide them back
        if (userSession.waiting_for === 'email_input') {
            return `I'd love to help you! First, let's get you connected to our network.

Please share your registered email address:
Example: yourname@domain.com`;
        }
        
        if (userSession.waiting_for === 'otp_verification') {
            return `Almost there! Please enter the 6-digit verification code sent to ${userSession.temp_email}

Code format: 123456

Type "resend" if you need a new code.`;
        }
        
        // For completely new users, start the process
        const casualResponse = await handleCasualConversation(userMessage, {
            authenticated: false,
            newUser: true
        });
        
        return `${casualResponse}

To connect with our alumni network, please share your registered email address:`;
        
    } catch (error) {
        logError(error, { operation: 'handleNewUserCasualConversation' });
        return `Hi there! 👋

I help connect you with JY Alumni. Let's start by getting your registered email address:`;
    }
}

module.exports = {
    handleNewUser,
    handleNewUserCasualConversation
};