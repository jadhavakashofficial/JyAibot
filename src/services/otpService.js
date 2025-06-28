// OTP generation, verification, and email delivery service for JY Alumni Bot
// Handles secure 6-digit OTP creation, validation, and beautiful email templates

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getDatabase } = require('../config/database');
const { getConfig } = require('../config/environment');
const { logError, logSuccess } = require('../middleware/logging');
const { emailErrorHandler } = require('../middleware/errorHandlers');

let emailTransporter;

// Initialize email transporter
function initializeEmailTransporter() {
    const config = getConfig();
    
    try {
        if (!config.email.user || !config.email.pass) {
            console.warn('⚠️ Email credentials not configured');
            return null;
        }
        
        emailTransporter = nodemailer.createTransport({  // ✅ Fixed: createTransport
            service: config.email.service,
            auth: {
                user: config.email.user,
                pass: config.email.pass
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100
        });
        
        console.log('✅ Email transporter initialized successfully');
        return emailTransporter;
        
    } catch (error) {
        logError(error, { operation: 'email_transporter_initialization' });
        return null;
    }
}

// Initialize transporter on module load
emailTransporter = initializeEmailTransporter();

// Generate and send OTP with enhanced email template
async function generateAndSendOTP(email, options = {}) {
    try {
        if (!emailTransporter) {
            console.error('❌ Email transporter not available');
            return { success: false, error: 'Email service not configured' };
        }
        
        const db = getDatabase();
        const otp = crypto.randomInt(100000, 999999).toString();
        const expiryMinutes = options.expiryMinutes || 10;
        
        // Store OTP in database with metadata
        await db.collection('otps').replaceOne(
            { email: email.toLowerCase() },
            { 
                email: email.toLowerCase(), 
                otp: otp, 
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
                attempts: 0,
                verified: false,
                ipAddress: options.ipAddress || 'unknown',
                userAgent: options.userAgent || 'unknown'
            },
            { upsert: true }
        );
        
        // Send enhanced email
        const emailSent = await sendOTPEmail(email, otp, expiryMinutes);
        
        if (emailSent.success) {
            logSuccess('otp_generated_and_sent', { 
                email: email.replace(/(.{2}).*@/, '$1***@'),
                otp: `***${otp.slice(-2)}`,
                expiryMinutes
            });
            
            return { 
                success: true, 
                message: `OTP sent to ${email}`,
                expiryMinutes
            };
        } else {
            return emailSent;
        }
        
    } catch (error) {
        logError(error, { operation: 'generateAndSendOTP', email });
        return { success: false, error: 'Failed to generate and send OTP' };
    }
}

// Send OTP email with professional template
async function sendOTPEmail(email, otp, expiryMinutes = 10) {
    try {
        const config = getConfig();
        
        const mailOptions = {
            from: `"JY Alumni Network" <${config.email.user}>`,
            to: email,
            subject: '🌟 JY Alumni Network - Your Verification Code',
            html: generateOTPEmailTemplate(otp, expiryMinutes)
        };
        
        const info = await emailTransporter.sendMail(mailOptions);
        
        logSuccess('otp_email_sent', { 
            email: email.replace(/(.{2}).*@/, '$1***@'),
            messageId: info.messageId,
            response: info.response
        });
        
        return { 
            success: true, 
            messageId: info.messageId,
            message: 'OTP email sent successfully'
        };
        
    } catch (error) {
        const errorInfo = emailErrorHandler(error, email);
        return { 
            success: false, 
            error: errorInfo.error,
            message: errorInfo.message 
        };
    }
}

// Enhanced OTP email template
function generateOTPEmailTemplate(otp, expiryMinutes) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>JY Alumni Network Verification</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.6;
                    color: #1a1a1a;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                    margin: 0;
                }
                
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: #ffffff;
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                }
                
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 40px 30px;
                    text-align: center;
                    color: white;
                }
                
                .logo {
                    width: 60px;
                    height: 60px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 50%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    margin-bottom: 20px;
                }
                
                .header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    margin-bottom: 8px;
                    letter-spacing: -0.5px;
                }
                
                .header p {
                    font-size: 16px;
                    opacity: 0.9;
                    font-weight: 400;
                }
                
                .content {
                    padding: 40px 30px;
                }
                
                .welcome-text {
                    text-align: center;
                    margin-bottom: 30px;
                }
                
                .welcome-text h2 {
                    font-size: 24px;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin-bottom: 8px;
                }
                
                .welcome-text p {
                    font-size: 16px;
                    color: #6b7280;
                }
                
                .otp-container {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px;
                    padding: 30px;
                    text-align: center;
                    margin: 30px 0;
                }
                
                .otp-label {
                    color: rgba(255,255,255,0.9);
                    font-size: 16px;
                    font-weight: 500;
                    margin-bottom: 15px;
                }
                
                .otp-code {
                    background: rgba(255,255,255,0.15);
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 12px;
                    padding: 20px 30px;
                    display: inline-block;
                    margin: 10px 0;
                }
                
                .otp-digits {
                    font-size: 36px;
                    font-weight: 700;
                    color: white;
                    letter-spacing: 8px;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .otp-timer {
                    color: rgba(255,255,255,0.8);
                    font-size: 14px;
                    font-weight: 500;
                    margin-top: 15px;
                }
                
                .instructions {
                    background: #f8fafc;
                    border-radius: 12px;
                    padding: 25px;
                    margin: 30px 0;
                    border-left: 4px solid #667eea;
                }
                
                .instructions h3 {
                    font-size: 18px;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin-bottom: 12px;
                }
                
                .instruction-step {
                    display: flex;
                    align-items: flex-start;
                    margin-bottom: 12px;
                    font-size: 14px;
                    color: #4b5563;
                }
                
                .step-number {
                    background: #667eea;
                    color: white;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 600;
                    margin-right: 12px;
                    flex-shrink: 0;
                }
                
                .security-notice {
                    background: #fffbeb;
                    border: 1px solid #fbbf24;
                    border-radius: 8px;
                    padding: 16px;
                    margin: 20px 0;
                }
                
                .security-notice p {
                    font-size: 14px;
                    color: #92400e;
                    margin: 0;
                }
                
                .footer {
                    background: #f8fafc;
                    padding: 25px 30px;
                    text-align: center;
                    border-top: 1px solid #e5e7eb;
                }
                
                .footer p {
                    font-size: 14px;
                    color: #6b7280;
                    margin-bottom: 8px;
                }
                
                .support-link {
                    color: #667eea;
                    text-decoration: none;
                    font-weight: 500;
                }
                
                @media (max-width: 480px) {
                    .container {
                        margin: 10px;
                        border-radius: 12px;
                    }
                    
                    .header {
                        padding: 30px 20px;
                    }
                    
                    .content {
                        padding: 30px 20px;
                    }
                    
                    .otp-digits {
                        font-size: 28px;
                        letter-spacing: 4px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">🚆</div>
                    <h1>JY Alumni Network</h1>
                    <p>Connecting 500+ Changemakers &amp; Entrepreneurs</p>
                </div>
                
                <div class="content">
                    <div class="welcome-text">
                        <h2>Welcome to Our Community! 🌟</h2>
                        <p>You're one step away from connecting with amazing alumni</p>
                    </div>
                    
                    <div class="otp-container">
                        <div class="otp-label">Your Verification Code</div>
                        <div class="otp-code">
                            <div class="otp-digits">${otp}</div>
                        </div>
                        <div class="otp-timer">⏰ Valid for ${expiryMinutes} minutes only</div>
                    </div>
                    
                    <div class="instructions">
                        <h3>How to verify:</h3>
                        <div class="instruction-step">
                            <div class="step-number">1</div>
                            <div>Go back to WhatsApp where you started verification</div>
                        </div>
                        <div class="instruction-step">
                            <div class="step-number">2</div>
                            <div>Type the 6-digit code: <strong>${otp}</strong></div>
                        </div>
                        <div class="instruction-step">
                            <div class="step-number">3</div>
                            <div>Start connecting with alumni! 🚀</div>
                        </div>
                    </div>
                    
                    <div class="security-notice">
                        <p><strong>🔒 Security:</strong> Never share this code. JY Alumni Network will never ask for your verification code.</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Need help? Contact support</p>
                    <p><a href="mailto:support@jagritiyatra.com" class="support-link">support@jagritiyatra.com</a></p>
                    <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                        © 2025 Jagriti Yatra Alumni Network. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Verify OTP with enhanced security and logging
async function verifyOTP(email, enteredOTP, options = {}) {
    try {
        const db = getDatabase();
        const normalizedEmail = email.toLowerCase();
        
        const otpRecord = await db.collection('otps').findOne({ 
            email: normalizedEmail 
        });
        
        if (!otpRecord) {
            logError(new Error('OTP record not found'), { email: normalizedEmail });
            return { 
                valid: false, 
                error: 'OTP not found. Please request a new one.',
                code: 'OTP_NOT_FOUND'
            };
        }
        
        const now = new Date();
        const otpAge = (now - otpRecord.createdAt) / 1000 / 60; // age in minutes
        
        // Check expiry
        if (now > otpRecord.expiresAt) {
            await db.collection('otps').deleteOne({ email: normalizedEmail });
            logError(new Error('OTP expired'), { 
                email: normalizedEmail, 
                ageMinutes: otpAge.toFixed(1) 
            });
            return { 
                valid: false, 
                error: 'OTP expired. Please request a new one.', 
                expired: true,
                code: 'OTP_EXPIRED'
            };
        }
        
        // Check attempt limit
        if (otpRecord.attempts >= 5) {
            await db.collection('otps').deleteOne({ email: normalizedEmail });
            logError(new Error('Too many OTP attempts'), { email: normalizedEmail });
            return { 
                valid: false, 
                error: 'Too many attempts. Please request a new OTP.', 
                tooManyAttempts: true,
                code: 'TOO_MANY_ATTEMPTS'
            };
        }
        
        // Clean and compare OTP
        const cleanEnteredOTP = enteredOTP.toString().trim().replace(/\s/g, '');
        const storedOTP = otpRecord.otp.toString().trim();
        
        // Increment attempt count
        await db.collection('otps').updateOne(
            { email: normalizedEmail },
            { 
                $inc: { attempts: 1 },
                $set: { lastAttemptAt: now }
            }
        );
        
        const isValid = storedOTP === cleanEnteredOTP;
        
        logSuccess('otp_verification_attempt', {
            email: normalizedEmail.replace(/(.{2}).*@/, '$1***@'),
            enteredLength: cleanEnteredOTP.length,
            storedLength: storedOTP.length,
            isValid: isValid,
            attempt: otpRecord.attempts + 1,
            ageMinutes: otpAge.toFixed(1)
        });
        
        if (isValid) {
            // Mark as verified and clean up
            await db.collection('otps').updateOne(
                { email: normalizedEmail },
                { $set: { verified: true, verifiedAt: now } }
            );
            
            setTimeout(async () => {
                await db.collection('otps').deleteOne({ email: normalizedEmail });
            }, 5000); // Clean up after 5 seconds
            
            logSuccess('otp_verified_successfully', { 
                email: normalizedEmail.replace(/(.{2}).*@/, '$1***@')
            });
            
            return { valid: true, code: 'OTP_VERIFIED' };
        } else {
            const remainingAttempts = 5 - (otpRecord.attempts + 1);
            
            if (remainingAttempts <= 0) {
                await db.collection('otps').deleteOne({ email: normalizedEmail });
                return { 
                    valid: false, 
                    error: 'Invalid OTP. No attempts remaining. Please request a new OTP.',
                    attemptsRemaining: 0,
                    tooManyAttempts: true,
                    code: 'TOO_MANY_ATTEMPTS'
                };
            }
            
            return { 
                valid: false, 
                error: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`,
                attemptsRemaining: remainingAttempts,
                code: 'INVALID_OTP'
            };
        }
        
    } catch (error) {
        logError(error, { operation: 'verifyOTP', email });
        return { 
            valid: false, 
            error: 'Verification failed. Please try again.',
            code: 'VERIFICATION_ERROR'
        };
    }
}

// Clean up expired OTPs (maintenance function)
async function cleanupExpiredOTPs() {
    try {
        const db = getDatabase();
        const now = new Date();
        
        const result = await db.collection('otps').deleteMany({
            expiresAt: { $lt: now }
        });
        
        logSuccess('expired_otps_cleanup', { 
            deletedCount: result.deletedCount 
        });
        
        return {
            success: true,
            deletedCount: result.deletedCount,
            timestamp: now.toISOString()
        };
        
    } catch (error) {
        logError(error, { operation: 'cleanupExpiredOTPs' });
        return {
            success: false,
            error: error.message
        };
    }
}

// Get OTP statistics for monitoring
async function getOTPStats() {
    try {
        const db = getDatabase();
        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        
        const [
            totalActive,
            generatedToday,
            verifiedToday,
            expiredToday
        ] = await Promise.all([
            db.collection('otps').countDocuments({ expiresAt: { $gt: now } }),
            db.collection('otps').countDocuments({ createdAt: { $gte: oneDayAgo } }),
            db.collection('otps').countDocuments({ 
                verifiedAt: { $gte: oneDayAgo },
                verified: true 
            }),
            db.collection('otps').countDocuments({ 
                expiresAt: { $lt: now, $gte: oneDayAgo }
            })
        ]);
        
        return {
            active_otps: totalActive,
            generated_24h: generatedToday,
            verified_24h: verifiedToday,
            expired_24h: expiredToday,
            success_rate: generatedToday > 0 ? Math.round((verifiedToday / generatedToday) * 100) : 0,
            timestamp: now.toISOString()
        };
        
    } catch (error) {
        logError(error, { operation: 'getOTPStats' });
        return {
            error: 'Unable to fetch OTP statistics',
            timestamp: new Date().toISOString()
        };
    }
}

// Test email service connection
async function testEmailConnection() {
    if (!emailTransporter) {
        return {
            success: false,
            error: 'Email transporter not initialized'
        };
    }
    
    try {
        await emailTransporter.verify();
        
        return {
            success: true,
            message: 'Email service connection successful'
        };
        
    } catch (error) {
        logError(error, { operation: 'email_connection_test' });
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    generateAndSendOTP,
    verifyOTP,
    cleanupExpiredOTPs,
    getOTPStats,
    testEmailConnection,
    initializeEmailTransporter
};