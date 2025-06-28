// Conversation controller for handling casual and contextual conversations
// Provides AI-powered responses and natural language interaction for JY Alumni Bot

const OpenAI = require('openai');
const { getConfig } = require('../config/environment');
const { logError, logAIOperation } = require('../middleware/logging');
const { aiServiceErrorHandler } = require('../middleware/errorHandlers');

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
    console.warn('⚠️ OpenAI not initialized for conversation handling');
}

// Enhanced casual conversation handler with context awareness
async function handleCasualConversation(message, userContext = {}) {
    try {
        const config = getConfig();
        
        // Enhanced context for better responses
        const enhancedContext = {
            authenticated: userContext.authenticated || false,
            name: userContext.name || 'there',
            profileComplete: userContext.profileComplete || false,
            completionPercentage: userContext.completionPercentage || 0,
            newUser: userContext.newUser || false,
            botName: 'JY Alumni Network Assistant',
            networkSize: '500+ changemakers and entrepreneurs',
            version: config.bot.version
        };
        
        // Use AI for sophisticated responses if available
        if (openai) {
            return await generateAIResponse(message, enhancedContext);
        }
        
        // Fallback to pattern-based responses
        return generateFallbackResponse(message, enhancedContext);
        
    } catch (error) {
        logError(error, { operation: 'handleCasualConversation', message });
        return generateErrorFallbackResponse(userContext);
    }
}

// AI-powered conversation response
async function generateAIResponse(message, context) {
    try {
        const startTime = Date.now();
        const config = getConfig();
        
        const systemPrompt = createSystemPrompt(context);
        const userPrompt = createUserPrompt(message, context);
        
        const response = await openai.chat.completions.create({
            model: config.ai.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_tokens: config.ai.maxTokens * 0.3, // Use 30% of max tokens for casual conversation
            temperature: config.ai.temperature + 0.1, // Slightly more creative for conversation
            presence_penalty: 0.1,
            frequency_penalty: 0.1
        });
        
        const aiResponse = response.choices[0].message.content.trim();
        const duration = Date.now() - startTime;
        
        logAIOperation('casual_conversation', response.usage?.total_tokens || 0, config.ai.model, duration);
        
        return aiResponse;
        
    } catch (error) {
        const errorInfo = aiServiceErrorHandler(error, 'casual_conversation');
        return generateFallbackResponse(message, context);
    }
}

// Create system prompt based on context
function createSystemPrompt(context) {
    let systemPrompt = `You are the JY Alumni Network Assistant, helping connect ${context.networkSize} alumni from Jagriti Yatra.

Personality: Warm, helpful, professional, and encouraging
Tone: Friendly but professional, use emojis sparingly
Purpose: Help alumni connect, network, and support each other

Key Guidelines:
- Keep responses concise (2-3 sentences max for casual conversation)
- Always relate back to the alumni network and connecting people
- Be encouraging about profile completion and networking
- Don't use excessive formatting or bullet points in casual chat
- Include relevant call-to-actions when appropriate
- Never provide personal advice - focus on connecting with alumni who can help`;

    if (context.authenticated) {
        systemPrompt += `

User Context:
- Name: ${context.name}
- Authenticated: Yes
- Profile: ${context.profileComplete ? 'Complete' : `${context.completionPercentage}% complete`}
- Status: Verified alumni member`;
    } else if (context.newUser) {
        systemPrompt += `

User Context:
- Status: New user in registration process
- Guide them toward email verification and profile completion`;
    }

    return systemPrompt;
}

// Create user prompt with context
function createUserPrompt(message, context) {
    let userPrompt = `User message: "${message}"`;
    
    if (context.authenticated) {
        userPrompt += `

The user is authenticated as ${context.name}. Respond personally and warmly.`;
        
        if (!context.profileComplete) {
            userPrompt += ` They have a ${context.completionPercentage}% complete profile - gently encourage completion when relevant.`;
        }
    }
    
    return userPrompt;
}

// Fallback responses when AI is not available
function generateFallbackResponse(message, context) {
    const msg = message.toLowerCase().trim();
    const name = context.name || 'there';
    
    // Greeting responses
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('hey')) {
        if (context.authenticated) {
            return `Hi ${name}! 👋 

I help you connect with our network of ${context.networkSize}. What expertise are you looking for today?`;
        } else {
            return `Hello! 👋 

Welcome to JY Alumni Network. I help connect you with amazing alumni and changemakers. What brings you here today?`;
        }
    }
    
    // Gratitude responses
    if (msg.includes('thank') || msg.includes('thanks')) {
        const responses = [
            `You're welcome! 😊 Is there anything else I can help you find?`,
            `Happy to help! What other expertise can I connect you with?`,
            `Glad I could assist! Feel free to search for more alumni anytime.`
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Positive acknowledgments
    if (['ok', 'okay', 'cool', 'nice', 'great', 'awesome', 'good'].includes(msg)) {
        if (context.authenticated) {
            return `Great! What can I help you find in our alumni network today?`;
        } else {
            return `Wonderful! Let's get you connected to our amazing community.`;
        }
    }
    
    // Help requests
    if (msg.includes('help') && msg.length < 20) {
        return `I'm here to help you connect with JY alumni! 🌟

Try searching for:
- Specific skills: "web developers", "marketing experts"
- Industries: "fintech", "healthcare", "education"
- Roles: "entrepreneurs", "consultants", "mentors"
- Locations: "Mumbai", "Bangalore", "Delhi"

What expertise are you looking for?`;
    }
    
    // Profile related
    if (msg.includes('profile') && context.authenticated && !context.profileComplete) {
        return `Your profile is ${context.completionPercentage}% complete! 

Completing it helps other alumni find and connect with you better. Would you like to finish it now?`;
    }
    
    // Default response
    if (context.authenticated) {
        return `I'm here to help you connect with our alumni network, ${name}! 🌟

What specific expertise or type of professional are you looking for today?`;
    } else {
        return `I help you connect with JY Alumni Network - ${context.networkSize}! 

What brings you here today?`;
    }
}

// Error fallback response
function generateErrorFallbackResponse(context) {
    if (context.authenticated) {
        return `Hi ${context.name || 'there'}! I'm here to help connect you with alumni. What are you looking for today?`;
    } else {
        return `Hi there! Welcome to JY Alumni Network. I help connect you with amazing alumni and entrepreneurs. How can I assist you?`;
    }
}

// Generate contextual follow-up suggestions
function generateFollowUpSuggestions(context) {
    const suggestions = [];
    
    if (context.authenticated) {
        if (!context.profileComplete) {
            suggestions.push("Complete your profile to get better connections");
        }
        
        suggestions.push(
            "Search for specific expertise",
            "Find alumni in your city",
            "Connect with entrepreneurs in your field"
        );
    } else {
        suggestions.push(
            "Start by sharing your email to get verified",
            "Learn about our alumni network",
            "See what expertise is available"
        );
    }
    
    return suggestions.slice(0, 3); // Return max 3 suggestions
}

// Handle specific conversation types
async function handleSpecificConversationType(message, type, context = {}) {
    try {
        switch (type) {
            case 'greeting':
                return await handleGreeting(message, context);
            case 'gratitude':
                return await handleGratitude(message, context);
            case 'farewell':
                return await handleFarewell(message, context);
            case 'confusion':
                return await handleConfusion(message, context);
            case 'compliment':
                return await handleCompliment(message, context);
            default:
                return await handleCasualConversation(message, context);
        }
    } catch (error) {
        logError(error, { operation: 'handleSpecificConversationType', type });
        return generateErrorFallbackResponse(context);
    }
}

// Handle greeting specifically
async function handleGreeting(message, context) {
    const name = context.name || 'there';
    const timeOfDay = getTimeOfDay();
    
    if (context.authenticated) {
        return `Good ${timeOfDay}, ${name}! 👋

Ready to connect with our alumni network? What expertise are you looking for today?`;
    } else {
        return `Good ${timeOfDay}! 👋

Welcome to JY Alumni Network. I help you connect with 500+ changemakers and entrepreneurs. 

To get started, please share your registered email address.`;
    }
}

// Handle gratitude
async function handleGratitude(message, context) {
    const responses = [
        "You're very welcome! 😊 Happy to help you connect with our amazing alumni.",
        "My pleasure! That's what our community is all about - supporting each other.",
        "Glad I could help! Our alumni network is here to support your journey."
    ];
    
    const baseResponse = responses[Math.floor(Math.random() * responses.length)];
    
    if (context.authenticated) {
        return `${baseResponse}

What other expertise can I help you find?`;
    } else {
        return `${baseResponse}

Is there anything else I can help you with today?`;
    }
}

// Handle farewell
async function handleFarewell(message, context) {
    const name = context.name || 'there';
    
    return `Take care, ${name}! 👋

Feel free to return anytime to connect with our alumni. We're here whenever you need us!`;
}

// Handle confusion
async function handleConfusion(message, context) {
    return `I understand this might be confusing! Let me help clarify.

I'm here to connect you with JY alumni who can provide expertise, mentorship, or partnerships.

Simply tell me what you're looking for:
- "Need help with web development"
- "Looking for marketing experts"
- "Connect me with fintech entrepreneurs"

What specific help do you need?`;
}

// Handle compliments
async function handleCompliment(message, context) {
    return `Thank you for the kind words! 😊

I'm here to help you tap into the incredible knowledge and experience of our alumni network.

What can I help you find today?`;
}

// Utility function to get time of day
function getTimeOfDay() {
    const hour = new Date().getHours();
    
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

// Generate conversation insights for analytics
function generateConversationInsights(message, response, context) {
    return {
        messageLength: message.length,
        responseLength: response.length,
        authenticated: context.authenticated,
        profileComplete: context.profileComplete,
        conversationType: detectConversationType(message),
        timestamp: new Date().toISOString()
    };
}

// Detect conversation type for analytics
function detectConversationType(message) {
    const msg = message.toLowerCase();
    
    if (['hi', 'hey', 'hello'].some(greeting => msg.startsWith(greeting))) return 'greeting';
    if (msg.includes('thank')) return 'gratitude';
    if (['bye', 'goodbye', 'see you'].some(farewell => msg.includes(farewell))) return 'farewell';
    if (msg.includes('?')) return 'question';
    if (msg.length < 10) return 'short_response';
    
    return 'general';
}

module.exports = {
    handleCasualConversation,
    handleSpecificConversationType,
    generateFollowUpSuggestions,
    generateConversationInsights
};