// Enhanced intent detection service with AI-powered understanding
// File: src/services/intentDetection.js
// COMPLETE REPLACEMENT - Enhanced for strict profile completion and better search detection

const OpenAI = require('openai');
const { getConfig } = require('../config/environment');
const { logError, logAIOperation } = require('../middleware/logging');
const { sanitizeInput } = require('../utils/validation');

let openai;
try {
    const config = getConfig();
    if (config.ai.apiKey) {
        openai = new OpenAI({ 
            apiKey: config.ai.apiKey,
            timeout: 30000
        });
    }
} catch (error) {
    console.warn('⚠️ OpenAI not initialized for intent detection');
}

// Enhanced search keywords for better detection (expanded for global alumni)
const SEARCH_KEYWORDS = [
    // General help terms
    'help', 'need', 'looking', 'find', 'search', 'connect', 'assistance', 'support', 'want', 'require',
    
    // Technical skills & roles
    'developer', 'development', 'react', 'javascript', 'python', 'java', 'web development', 'app development',
    'frontend', 'backend', 'fullstack', 'devops', 'software', 'programming', 'coding', 'engineer',
    'mobile app', 'android', 'ios', 'flutter', 'nodejs', 'angular', 'vue', 'database', 'ai', 'ml',
    'data scientist', 'data analyst', 'machine learning', 'artificial intelligence', 'blockchain',
    'cybersecurity', 'cloud computing', 'aws', 'azure', 'docker', 'kubernetes',
    
    // Business & entrepreneurship
    'entrepreneur', 'startup', 'business', 'marketing', 'sales', 'finance', 'legal', 'accounting',
    'consultant', 'mentor', 'advisor', 'investor', 'funding', 'partnership', 'strategy', 'ceo', 'founder',
    'business development', 'product manager', 'project manager', 'operations', 'hr', 'recruitment',
    
    // Industries & domains
    'fintech', 'edtech', 'healthtech', 'agritech', 'manufacturing', 'healthcare', 'pharmaceutical',
    'education', 'agriculture', 'technology', 'media', 'entertainment', 'retail', 'ecommerce',
    'logistics', 'transportation', 'energy', 'renewable', 'sustainability', 'environment',
    'construction', 'real estate', 'hospitality', 'tourism', 'food', 'beverage', 'fashion',
    
    // Professional services
    'designer', 'ux', 'ui', 'graphic design', 'content writer', 'copywriter', 'researcher',
    'analyst', 'freelancer', 'specialist', 'expert', 'professional', 'architect', 'engineer',
    'manager', 'director', 'executive', 'lead', 'head', 'chief', 'senior', 'junior',
    
    // Locations (major cities worldwide)
    'mumbai', 'delhi', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'pune', 'ahmedabad',
    'new york', 'san francisco', 'london', 'toronto', 'sydney', 'singapore', 'dubai', 'berlin',
    'paris', 'tokyo', 'hong kong', 'amsterdam', 'stockholm', 'zurich', 'dublin', 'barcelona',
    
    // Support types & services
    'advice', 'guidance', 'mentorship', 'feedback', 'insights', 'experience', 'networking',
    'collaboration', 'partnership', 'consultation', 'coaching', 'training', 'workshop',
    'internship', 'job', 'opportunity', 'career', 'growth', 'learning'
];

// Profile completion and skip keywords
const SKIP_KEYWORDS = [
    'later', 'skip', 'not now', 'maybe later', 'later will do', 'stop', 'pause', 
    'cancel', 'exit', 'quit', 'pass', 'next time', 'not interested', 'hold on',
    'wait', 'postpone', 'defer', 'delay'
];

const PROFILE_KEYWORDS = [
    'profile', 'complete', 'update', 'edit', 'change', 'modify', 'fill', 'finish',
    'details', 'information', 'data', 'personal', 'professional', 'continue'
];

// Profile completion blocking keywords
const COMPLETION_REQUIRED_RESPONSES = [
    'complete your profile first',
    'profile completion required',
    'finish your profile to search',
    'need 100% completion',
    'search unlocked after profile'
];

// Main intent detection function with enhanced AI and strict profile enforcement
function detectUserIntent(message, userContext = {}) {
    const msg = message.toLowerCase().trim();
    const sanitizedMessage = sanitizeInput(message);
    
    console.log(`🧠 Analyzing intent for: "${sanitizedMessage.substring(0, 50)}${sanitizedMessage.length > 50 ? '...' : ''}"`);
    
    // 1. PRIORITY: Profile completion status check
    const isProfileComplete = userContext.authenticated && userContext.user_data?.enhancedProfile?.completed;
    const isInProfileUpdate = userContext.waiting_for?.startsWith('updating_');
    
    // 2. PRIORITY: Search Intent Detection (but check profile completion)
    const searchIntent = detectSearchIntent(msg, sanitizedMessage);
    if (searchIntent.detected) {
        // If search detected but profile incomplete, still return search intent
        // The controller will handle the profile completion requirement
        return {
            type: 'search',
            query: sanitizedMessage,
            confidence: searchIntent.confidence,
            keywords: searchIntent.keywords,
            profileComplete: isProfileComplete,
            blocked: !isProfileComplete
        };
    }
    
    // 3. Skip/Later Intent with Search Combination
    const skipIntent = detectSkipIntent(msg);
    if (skipIntent.detected) {
        // Check if there's search content after skip words
        const messageWithoutSkip = sanitizedMessage
            .replace(/\b(later|skip|stop|pause|cancel|quit|exit)\s*/gi, '')
            .trim();
            
        if (messageWithoutSkip.length > 8) {
            const hasSearchContent = SEARCH_KEYWORDS.some(keyword => 
                messageWithoutSkip.toLowerCase().includes(keyword)
            );
            
            if (hasSearchContent) {
                return {
                    type: 'skip_and_search',
                    query: messageWithoutSkip,
                    skipIntent: true,
                    confidence: 'high',
                    profileComplete: isProfileComplete,
                    blocked: !isProfileComplete
                };
            }
        }
        
        return { 
            type: 'skip_profile', 
            confidence: skipIntent.confidence,
            allowedDuringProfile: true
        };
    }
    
    // 4. Email Pattern Detection (during registration)
    if (msg.includes('@') && msg.includes('.')) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const emailMatch = sanitizedMessage.match(emailRegex);
        if (emailMatch) {
            return { 
                type: 'email_input', 
                email: emailMatch[0],
                confidence: 'high'
            };
        }
    }
    
    // 5. OTP Pattern Detection (6 digits)
    if (/^\s*\d{6}\s*$/.test(msg)) {
        return { 
            type: 'otp_verification', 
            otp: msg.replace(/\s/g, ''),
            confidence: 'high'
        };
    }
    
    // 6. Profile Update Intent
    if (detectProfileUpdateIntent(msg)) {
        return { 
            type: 'profile_update', 
            confidence: 'medium',
            allowedDuringProfile: true
        };
    }
    
    // 7. Yes/No Responses
    const yesNoIntent = detectYesNoIntent(msg);
    if (yesNoIntent.detected) {
        return {
            type: yesNoIntent.value ? 'affirmative' : 'negative',
            confidence: yesNoIntent.confidence,
            allowedDuringProfile: true
        };
    }
    
    // 8. Numeric Input (for multiple choice questions)
    if (/^\s*\d+(\s*,\s*\d+)*\s*$/.test(msg)) {
        return {
            type: 'numeric_input',
            numbers: msg.match(/\d+/g).map(n => parseInt(n)),
            confidence: 'high',
            allowedDuringProfile: true
        };
    }
    
    // 9. Help requests during profile completion
    if (msg.includes('help') && msg.length < 20 && isInProfileUpdate) {
        return {
            type: 'profile_help',
            confidence: 'high',
            allowedDuringProfile: true
        };
    }
    
    // 10. Simple Greetings/Casual
    const casualIntent = detectCasualIntent(msg);
    if (casualIntent.detected) {
        return {
            type: 'casual',
            subtype: casualIntent.subtype,
            message: sanitizedMessage,
            confidence: casualIntent.confidence,
            allowedDuringProfile: casualIntent.subtype === 'greeting'
        };
    }
    
    // 11. Default: Potential search for authenticated users with longer messages
    if (userContext.authenticated && sanitizedMessage.length > 8) {
        // Check if it contains any search-like content
        const hasSearchIndicators = SEARCH_KEYWORDS.some(keyword => 
            msg.includes(keyword)
        ) || msg.includes('?') || sanitizedMessage.length > 20;
        
        if (hasSearchIndicators) {
            return {
                type: 'search',
                query: sanitizedMessage,
                confidence: 'low',
                source: 'fallback',
                profileComplete: isProfileComplete,
                blocked: !isProfileComplete
            };
        }
    }
    
    // 12. Generic casual response
    return {
        type: 'casual',
        subtype: 'generic',
        message: sanitizedMessage,
        confidence: 'low',
        allowedDuringProfile: false
    };
}

// Enhanced search intent detection with better confidence scoring
function detectSearchIntent(msg, originalMessage) {
    let confidence = 'low';
    let matchedKeywords = [];
    
    // Check for direct keyword matches with variations
    const keywordMatches = SEARCH_KEYWORDS.filter(keyword => {
        const variations = [
            keyword,
            `${keyword}s`,
            `${keyword}er`,
            `${keyword}ing`,
            `${keyword}ed`,
            `${keyword}ist`
        ];
        
        return variations.some(variation => {
            if (msg.includes(variation)) {
                matchedKeywords.push(keyword);
                return true;
            }
            return false;
        });
    });
    
    // Enhanced search patterns with more variations
    const searchPatterns = [
        // Direct help requests
        /i\s+(need|want|require|looking for).*(help|support|assistance|expert|guidance)/,
        /looking\s+for.*(expert|developer|help|advice|mentor|professional)/,
        /(need|want)\s+.*(developer|expert|help|advice|mentor|consultant)/,
        /help.*(with|in|for|about)/,
        /(expert|specialist|professional).*(in|for|with)/,
        /(advice|guidance|mentorship).*(on|for|about|with)/,
        /connect.*(with|to|me with)/,
        /find.*(someone|expert|help|person|professional)/,
        
        // Industry specific patterns
        /(work|job|opportunity).*(in|with|for)/,
        /(startup|business|company).*(founder|entrepreneur|advisor)/,
        /(tech|technology|it).*(expert|professional|developer)/,
        /(marketing|sales|finance).*(expert|professional|specialist)/,
        
        // Location-based searches
        /(professional|expert|developer).*(in|from|near)/,
        /(mumbai|delhi|bangalore|london|new york).*(based|located)/,
        
        // Skill-based searches
        /(react|python|javascript|java|node).*(developer|expert)/,
        /(ui|ux|design).*(expert|professional)/,
        /(finance|accounting|legal).*(expert|advisor)/
    ];
    
    const hasSearchPattern = searchPatterns.some(pattern => pattern.test(msg));
    
    // Enhanced confidence determination
    if (hasSearchPattern && keywordMatches.length >= 2) {
        confidence = 'high';
    } else if (hasSearchPattern || keywordMatches.length >= 2) {
        confidence = 'medium';
    } else if (keywordMatches.length >= 1 && originalMessage.length > 15) {
        confidence = 'medium';
    } else if (keywordMatches.length >= 1) {
        confidence = 'low';
    }
    
    // Additional indicators for search intent
    const additionalIndicators = [
        msg.includes('?'),
        originalMessage.length > 30,
        /\b(who|what|where|how|when)\b/.test(msg),
        /\b(can|could|would|should)\b/.test(msg),
        /\b(anyone|somebody|someone)\b/.test(msg)
    ];
    
    const indicatorCount = additionalIndicators.filter(Boolean).length;
    if (indicatorCount >= 2) {
        confidence = confidence === 'low' ? 'medium' : 'high';
    }
    
    const detected = hasSearchPattern || keywordMatches.length > 0 || 
                   (originalMessage.length > 25 && indicatorCount >= 2);
    
    return {
        detected,
        confidence,
        keywords: matchedKeywords,
        patterns: hasSearchPattern,
        indicators: indicatorCount
    };
}

// Skip intent detection with better pattern recognition
function detectSkipIntent(msg) {
    const skipMatches = SKIP_KEYWORDS.filter(skip => msg.includes(skip));
    
    if (skipMatches.length > 0) {
        // Determine confidence based on skip word strength
        const strongSkipWords = ['stop', 'cancel', 'quit', 'exit'];
        const mediumSkipWords = ['skip', 'later', 'pause'];
        
        let confidence = 'low';
        if (skipMatches.some(skip => strongSkipWords.includes(skip))) {
            confidence = 'high';
        } else if (skipMatches.some(skip => mediumSkipWords.includes(skip))) {
            confidence = 'medium';
        }
        
        return { detected: true, confidence, keywords: skipMatches };
    }
    
    return { detected: false };
}

// Profile update intent detection
function detectProfileUpdateIntent(msg) {
    const profileKeywords = ['update', 'edit', 'change', 'modify', 'complete', 'finish'];
    const targetKeywords = ['profile', 'details', 'info', 'information', 'data'];
    
    const hasProfileKeyword = profileKeywords.some(keyword => msg.includes(keyword));
    const hasTargetKeyword = targetKeywords.some(keyword => msg.includes(keyword));
    
    // Direct commands
    if (msg === 'update profile' || msg === 'complete profile' || msg === 'edit profile') {
        return true;
    }
    
    return hasProfileKeyword && hasTargetKeyword;
}

// Enhanced Yes/No intent detection
function detectYesNoIntent(msg) {
    const yesVariations = ['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'alright', '1', 'correct', 'right'];
    const noVariations = ['no', 'n', 'nope', 'not', 'cancel', 'nah', '2', 'wrong', 'incorrect'];
    
    const isYes = yesVariations.some(variation => 
        msg === variation || msg.startsWith(variation + ' ') || msg.endsWith(' ' + variation)
    );
    const isNo = noVariations.some(variation => 
        msg === variation || msg.startsWith(variation + ' ') || msg.endsWith(' ' + variation)
    );
    
    if (isYes) {
        return { detected: true, value: true, confidence: 'high' };
    } else if (isNo) {
        return { detected: true, value: false, confidence: 'high' };
    }
    
    return { detected: false };
}

// Enhanced casual intent detection
function detectCasualIntent(msg) {
    const greetings = ['hi', 'hey', 'hello', 'good morning', 'good afternoon', 'good evening', 'namaste'];
    const gratitude = ['thanks', 'thank you', 'thankyou', 'thx', 'appreciate', 'grateful'];
    const farewells = ['bye', 'goodbye', 'see you', 'talk later', 'take care', 'farewell'];
    const simple = ['ok', 'okay', 'cool', 'nice', 'great', 'awesome', 'good', 'fine', 'alright'];
    
    const isGreeting = greetings.some(greeting => 
        msg.startsWith(greeting) || msg === greeting
    );
    const isGratitude = gratitude.some(thanks => msg.includes(thanks));
    const isFarewell = farewells.some(bye => msg.includes(bye));
    const isSimple = simple.some(word => 
        msg === word || msg === word + '!' || msg === word + '.'
    );
    
    if (isGreeting) {
        return { detected: true, subtype: 'greeting', confidence: 'high' };
    } else if (isGratitude) {
        return { detected: true, subtype: 'gratitude', confidence: 'high' };
    } else if (isFarewell) {
        return { detected: true, subtype: 'farewell', confidence: 'high' };
    } else if (isSimple) {
        return { detected: true, subtype: 'acknowledgment', confidence: 'medium' };
    } else if (msg.length < 8) {
        return { detected: true, subtype: 'short', confidence: 'low' };
    }
    
    return { detected: false };
}

// AI-powered intent enhancement (when available)
async function enhanceIntentWithAI(message, basicIntent, userContext = {}) {
    if (!openai || basicIntent.confidence === 'high') {
        return basicIntent; // Skip AI if confidence is already high
    }
    
    try {
        const startTime = Date.now();
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: "system",
                content: `You are an intent classification assistant for an alumni networking bot with STRICT profile completion requirements.

Analyze the user message and classify into ONE of these intents:
- SEARCH: User wants to find alumni/experts (looking for help, expertise, connections)
- PROFILE: User wants to update their profile  
- CASUAL: Greetings, thanks, simple responses
- SKIP: User wants to skip current process
- EMAIL: User is providing an email address
- OTP: User is providing a verification code
- NUMERIC: User is providing numbers/selections
- HELP: User needs help with current process

IMPORTANT: If user tries to search but has incomplete profile, still classify as SEARCH - the system will handle profile completion requirement.

Return only the intent name and confidence (HIGH/MEDIUM/LOW) separated by a comma.
Example: SEARCH,HIGH`
            }, {
                role: "user",
                content: `Message: "${message}"
User Context: ${JSON.stringify({
    authenticated: userContext.authenticated,
    profileComplete: userContext.user_data?.enhancedProfile?.completed,
    inProfileUpdate: userContext.waiting_for?.startsWith('updating_')
}, null, 2)}`
            }],
            max_tokens: 20,
            temperature: 0.1
        });
        
        const aiResponse = response.choices[0].message.content.trim();
        const [intentType, confidence] = aiResponse.split(',');
        const duration = Date.now() - startTime;
        
        logAIOperation('intent_enhancement', response.usage?.total_tokens || 0, 'gpt-4o-mini', duration);
        
        // Map AI response to our intent types
        const intentMap = {
            'SEARCH': 'search',
            'PROFILE': 'profile_update', 
            'CASUAL': 'casual',
            'SKIP': 'skip_profile',
            'EMAIL': 'email_input',
            'OTP': 'otp_verification',
            'NUMERIC': 'numeric_input',
            'HELP': 'profile_help'
        };
        
        const mappedIntent = intentMap[intentType] || basicIntent.type;
        const mappedConfidence = confidence?.toLowerCase() || basicIntent.confidence;
        
        return {
            ...basicIntent,
            type: mappedIntent,
            confidence: mappedConfidence,
            aiEnhanced: true
        };
        
    } catch (error) {
        logError(error, { operation: 'ai_intent_enhancement', message });
        return basicIntent; // Return original intent if AI fails
    }
}

// Validate intent against current user state
function validateIntentForUserState(intent, userContext) {
    const isInProfileUpdate = userContext.waiting_for?.startsWith('updating_');
    const isProfileComplete = userContext.authenticated && userContext.user_data?.enhancedProfile?.completed;
    
    // During profile updates, only allow specific intents
    if (isInProfileUpdate) {
        const allowedDuringProfile = [
            'numeric_input', 'affirmative', 'negative', 'skip_profile', 
            'profile_help', 'email_input', 'casual'
        ];
        
        if (!allowedDuringProfile.includes(intent.type) && !intent.allowedDuringProfile) {
            return {
                ...intent,
                blocked: true,
                blockReason: 'profile_update_in_progress'
            };
        }
    }
    
    // Block search if profile incomplete (but still return search intent for proper handling)
    if (intent.type === 'search' && !isProfileComplete) {
        return {
            ...intent,
            blocked: true,
            blockReason: 'profile_incomplete'
        };
    }
    
    return intent;
}

// Get intent confidence score
function getIntentConfidenceScore(intent) {
    const confidenceScores = {
        'high': 0.9,
        'medium': 0.7,
        'low': 0.5
    };
    
    return confidenceScores[intent.confidence] || 0.5;
}

// Get intent statistics for monitoring
function getIntentStatistics() {
    return {
        supportedIntents: [
            'search', 'profile_update', 'casual', 'skip_profile',
            'email_input', 'otp_verification', 'numeric_input',
            'affirmative', 'negative', 'profile_help'
        ],
        searchKeywords: SEARCH_KEYWORDS.length,
        skipKeywords: SKIP_KEYWORDS.length,
        profileKeywords: PROFILE_KEYWORDS.length,
        aiEnhancementEnabled: !!openai,
        strictProfileEnforcement: true,
        features: [
            'Multi-pattern search detection',
            'Profile completion enforcement',
            'AI-powered intent enhancement',
            'Context-aware validation',
            'Confidence scoring',
            'Search blocking for incomplete profiles'
        ]
    };
}

module.exports = {
    detectUserIntent,
    enhanceIntentWithAI,
    validateIntentForUserState,
    getIntentConfidenceScore,
    getIntentStatistics,
    SEARCH_KEYWORDS,
    SKIP_KEYWORDS,
    PROFILE_KEYWORDS
};