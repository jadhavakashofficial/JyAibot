// Enhanced intent detection service with AI-powered understanding
// Analyzes user messages to determine intent and context for appropriate bot responses

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

// Enhanced search keywords for better detection
const SEARCH_KEYWORDS = [
    // General help terms
    'help', 'need', 'looking', 'find', 'search', 'connect', 'assistance', 'support',
    
    // Technical skills
    'developer', 'development', 'react', 'javascript', 'python', 'java', 'web development',
    'frontend', 'backend', 'fullstack', 'devops', 'software', 'programming', 'coding',
    'mobile app', 'android', 'ios', 'flutter', 'nodejs', 'angular', 'vue', 'database',
    
    // Business & entrepreneurship
    'entrepreneur', 'startup', 'business', 'marketing', 'sales', 'finance', 'legal',
    'consultant', 'mentor', 'advisor', 'investor', 'funding', 'partnership', 'strategy',
    
    // Industries
    'fintech', 'edtech', 'healthtech', 'agritech', 'manufacturing', 'healthcare',
    'education', 'agriculture', 'technology', 'media', 'entertainment', 'retail',
    
    // Roles
    'manager', 'analyst', 'designer', 'researcher', 'freelancer', 'expert', 'specialist',
    'founder', 'ceo', 'cto', 'product manager', 'data scientist',
    
    // Locations
    'mumbai', 'delhi', 'bangalore', 'pune', 'hyderabad', 'chennai', 'kolkata', 'gurgaon',
    
    // Support types
    'advice', 'guidance', 'mentorship', 'feedback', 'insights', 'experience', 'networking'
];

const SKIP_KEYWORDS = [
    'later', 'skip', 'not now', 'maybe later', 'later will do', 'stop', 'pause', 
    'cancel', 'exit', 'quit', 'pass', 'next time', 'not interested'
];



// Main intent detection function with AI enhancement
function detectUserIntent(message, userContext = {}) {
    const msg = message.toLowerCase().trim();
    const sanitizedMessage = sanitizeInput(message);
    
    console.log(`🧠 Analyzing intent for: "${sanitizedMessage.substring(0, 50)}${sanitizedMessage.length > 50 ? '...' : ''}"`);
    
    // 1. PRIORITY: Search Intent Detection (High Priority)
    const searchIntent = detectSearchIntent(msg, sanitizedMessage);
    if (searchIntent.detected) {
        return {
            type: 'search',
            query: sanitizedMessage,
            confidence: searchIntent.confidence,
            keywords: searchIntent.keywords
        };
    }
    
    // 2. Skip/Later Intent with Search Combination
    const skipIntent = detectSkipIntent(msg);
    if (skipIntent.detected) {
        // Check if there's search content after skip words
        const messageWithoutSkip = sanitizedMessage
            .replace(/\b(later|skip|stop|pause|cancel)\s*/gi, '')
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
                    confidence: 'high'
                };
            }
        }
        
        return { type: 'skip_profile', confidence: skipIntent.confidence };
    }
    
    // 3. Email Pattern Detection
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
    
    // 4. OTP Pattern Detection (6 digits)
    if (/^\s*\d{6}\s*$/.test(msg)) {
        return { 
            type: 'otp_verification', 
            otp: msg.replace(/\s/g, ''),
            confidence: 'high'
        };
    }
    
    // 5. Profile Update Intent
    if (detectProfileUpdateIntent(msg)) {
        return { type: 'profile_update', confidence: 'medium' };
    }
    
    // 6. Yes/No Responses
    const yesNoIntent = detectYesNoIntent(msg);
    if (yesNoIntent.detected) {
        return {
            type: yesNoIntent.value ? 'affirmative' : 'negative',
            confidence: yesNoIntent.confidence
        };
    }
    
    // 7. Numeric Input (for multiple choice questions)
    if (/^\s*\d+(\s*,\s*\d+)*\s*$/.test(msg)) {
        return {
            type: 'numeric_input',
            numbers: msg.match(/\d+/g).map(n => parseInt(n)),
            confidence: 'high'
        };
    }
    
    // 8. Simple Greetings/Casual
    const casualIntent = detectCasualIntent(msg);
    if (casualIntent.detected) {
        return {
            type: 'casual',
            subtype: casualIntent.subtype,
            message: sanitizedMessage,
            confidence: casualIntent.confidence
        };
    }
    
    // 9. Default: Search for authenticated users with longer messages
    if (userContext.authenticated && sanitizedMessage.length > 8) {
        return {
            type: 'search',
            query: sanitizedMessage,
            confidence: 'low',
            source: 'fallback'
        };
    }
    
    // 10. Generic casual response
    return {
        type: 'casual',
        subtype: 'generic',
        message: sanitizedMessage,
        confidence: 'low'
    };
}

// Enhanced search intent detection
function detectSearchIntent(msg, originalMessage) {
    let confidence = 'low';
    let matchedKeywords = [];
    
    // Check for direct keyword matches
    const keywordMatches = SEARCH_KEYWORDS.filter(keyword => {
        const variations = [
            keyword,
            `${keyword}s`,
            `${keyword}er`,
            `${keyword}ing`,
            `${keyword}ed`
        ];
        
        return variations.some(variation => {
            if (msg.includes(variation)) {
                matchedKeywords.push(keyword);
                return true;
            }
            return false;
        });
    });
    
    // Pattern-based detection
    const searchPatterns = [
        /i\s+(need|want|require).*(help|support|assistance)/,
        /looking\s+for.*(expert|developer|help|advice)/,
        /(need|want)\s+.*(developer|expert|help|advice)/,
        /help.*(with|in|for)/,
        /(expert|specialist).*(in|for)/,
        /(advice|guidance).*(on|for|about)/,
        /connect.*(with|to)/,
        /find.*(someone|expert|help)/
    ];
    
    const hasSearchPattern = searchPatterns.some(pattern => pattern.test(msg));
    
    // Determine confidence level
    if (hasSearchPattern) {
        confidence = 'high';
    } else if (keywordMatches.length >= 2) {
        confidence = 'medium';
    } else if (keywordMatches.length >= 1 && originalMessage.length > 15) {
        confidence = 'medium';
    } else if (keywordMatches.length >= 1) {
        confidence = 'low';
    }
    
    const detected = hasSearchPattern || keywordMatches.length > 0 || originalMessage.length > 20;
    
    return {
        detected,
        confidence,
        keywords: matchedKeywords
    };
}

// Skip intent detection
function detectSkipIntent(msg) {
    const skipMatches = SKIP_KEYWORDS.filter(skip => msg.includes(skip));
    
    if (skipMatches.length > 0) {
        const confidence = skipMatches.some(skip => 
            ['stop', 'cancel', 'quit', 'exit'].includes(skip)
        ) ? 'high' : 'medium';
        
        return { detected: true, confidence, keywords: skipMatches };
    }
    
    return { detected: false };
}

// Profile update intent detection
function detectProfileUpdateIntent(msg) {
    const profileKeywords = ['update', 'edit', 'change', 'modify'];
    const targetKeywords = ['profile', 'details', 'info', 'information'];
    
    const hasProfileKeyword = profileKeywords.some(keyword => msg.includes(keyword));
    const hasTargetKeyword = targetKeywords.some(keyword => msg.includes(keyword));
    
    return hasProfileKeyword && hasTargetKeyword;
}

// Yes/No intent detection
function detectYesNoIntent(msg) {
    const yesVariations = ['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', '1'];
    const noVariations = ['no', 'n', 'nope', 'not', 'cancel', '2'];
    
    const isYes = yesVariations.some(variation => msg === variation || msg.startsWith(variation + ' '));
    const isNo = noVariations.some(variation => msg === variation || msg.startsWith(variation + ' '));
    
    if (isYes) {
        return { detected: true, value: true, confidence: 'high' };
    } else if (isNo) {
        return { detected: true, value: false, confidence: 'high' };
    }
    
    return { detected: false };
}

// Casual intent detection
function detectCasualIntent(msg) {
    const greetings = ['hi', 'hey', 'hello', 'good morning', 'good afternoon', 'good evening'];
    const gratitude = ['thanks', 'thank you', 'thankyou', 'thx'];
    const simple = ['ok', 'okay', 'cool', 'nice', 'great', 'awesome', 'good'];
    
    const isGreeting = greetings.some(greeting => msg.startsWith(greeting));
    const isGratitude = gratitude.some(thanks => msg.includes(thanks));
    const isSimple = simple.some(word => msg === word || msg === word + '!');
    
    if (isGreeting) {
        return { detected: true, subtype: 'greeting', confidence: 'high' };
    } else if (isGratitude) {
        return { detected: true, subtype: 'gratitude', confidence: 'high' };
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
                content: `You are an intent classification assistant for an alumni networking bot.

Analyze the user message and classify into ONE of these intents:
- SEARCH: User wants to find alumni/experts (looking for help, expertise, connections)
- PROFILE: User wants to update their profile  
- CASUAL: Greetings, thanks, simple responses
- SKIP: User wants to skip current process
- EMAIL: User is providing an email address
- OTP: User is providing a verification code
- NUMERIC: User is providing numbers/selections

Return only the intent name and confidence (HIGH/MEDIUM/LOW) separated by a comma.
Example: SEARCH,HIGH`
            }, {
                role: "user",
                content: `Message: "${message}"
Context: ${JSON.stringify(userContext, null, 2)}`
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
            'NUMERIC': 'numeric_input'
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

module.exports = {
    detectUserIntent,
    enhanceIntentWithAI,
    SEARCH_KEYWORDS,
    SKIP_KEYWORDS
};