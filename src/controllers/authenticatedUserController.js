// Authenticated user controller for JY Alumni Bot with enhanced profile system
// Handles profile completion, updates, search, and all user interactions for verified users

const { getIncompleteFields, updateUserProfile, markProfileCompleted, getProfileCompletionPercentage, hasMinimumProfileCompletion, findUserByWhatsAppNumber, ENHANCED_PROFILE_FIELDS } = require('../models/User');
const { comprehensiveAlumniSearch } = require('../services/searchService');
const { checkDailyLimit } = require('../services/rateLimiter');
const { handleCasualConversation } = require('./conversationController');
const { validateProfileField, getFieldPrompt } = require('./profileController');
const { logUserActivity, logError } = require('../middleware/logging');

// Main handler for authenticated user interactions
async function handleAuthenticatedUser(userMessage, intent, userSession, whatsappNumber) {
    try {
        const user = userSession.user_data;
        const userName = user.basicProfile?.name || 'there';
        
        logUserActivity(whatsappNumber, 'authenticated_user_interaction', {
            intent: intent.type,
            sessionState: userSession.waiting_for,
            profileComplete: !!user.enhancedProfile?.completed,
            userName: userName
        });
        
        // PRIORITY 1: Handle profile updates in progress (NO SEARCH ALLOWED)
        if (userSession.waiting_for && userSession.waiting_for.startsWith('updating_')) {
            return await handleProfileFieldUpdate(userMessage, intent, userSession, whatsappNumber);
        }
        
        // PRIORITY 2: Handle profile completion choice
        if (userSession.waiting_for === 'profile_choice') {
            return await handleProfileChoice(userMessage, intent, userSession, whatsappNumber);
        }
        
        // PRIORITY 3: Handle additional email/instagram choices
        if (userSession.waiting_for === 'additional_email_choice') {
            return await handleAdditionalEmailChoice(userMessage, intent, userSession, whatsappNumber);
        }
        
        if (userSession.waiting_for === 'additional_email_input') {
            return await handleAdditionalEmailInput(userMessage, intent, userSession, whatsappNumber);
        }
        
        if (userSession.waiting_for === 'instagram_choice') {
            return await handleInstagramChoice(userMessage, intent, userSession, whatsappNumber);
        }
        
        // PRIORITY 4: Check profile completion for search
        if (intent.type === 'search' || intent.type === 'skip_and_search') {
            const hasMinCompletion = hasMinimumProfileCompletion(user, 70);
            
            if (!hasMinCompletion) {
                const completionPercentage = getProfileCompletionPercentage(user);
                const incompleteFields = getIncompleteFields(user);
                
                if (incompleteFields.length > 0) {
                    const firstField = incompleteFields[0];
                    const totalFields = incompleteFields.length;
                    
                    userSession.waiting_for = `updating_${firstField}`;
                    userSession.current_field = firstField;
                    userSession.remaining_fields = incompleteFields.slice(1);
                    userSession.incomplete_fields = incompleteFields;
                    
                    return `🚫 Profile completion required for search!

Your profile: ${completionPercentage}% complete
Required: 70% minimum

Let's complete it now:

Step 1/${totalFields}:

${await getFieldPrompt(firstField, userSession)}`;
                }
            }
            
            return await handleSearchRequest(intent, userSession, whatsappNumber, intent.type === 'skip_and_search');
        }
        
        // PRIORITY 5: Regular interaction handling - DIRECT PROFILE START
        return await handleRegularInteraction(userMessage, intent, userSession, whatsappNumber, user, userName);
        
    } catch (error) {
        logError(error, { operation: 'handleAuthenticatedUser', whatsappNumber, intent: intent.type });
        return "⚠️ I'm experiencing a technical issue. Please try your request again.";
    }
}

// Handle search requests with rate limiting
async function handleSearchRequest(intent, userSession, whatsappNumber, isSkipAndSearch = false) {
    try {
        const withinLimit = await checkDailyLimit(whatsappNumber);
        
        if (!withinLimit) {
            return `🚫 Daily search limit reached (30 searches per day).

Your searches reset at midnight. Meanwhile, you can:
- Update your profile
- Ask general questions
- Come back tomorrow for more searches`;
        }
        
        const searchQuery = intent.query;
        const searchResult = await comprehensiveAlumniSearch(searchQuery, whatsappNumber);
        
        if (isSkipAndSearch) {
            const skipMessage = userSession.waiting_for?.startsWith('updating_') 
                ? "Profile update paused! Here's your search result:"
                : "Here's what I found:";
                
            userSession.waiting_for = 'ready';
            userSession.ready = true;
            userSession.profile_skipped = true;
            
            return `${skipMessage}

${searchResult}

You can complete your profile anytime by saying "update profile".`;
        }
        
        userSession.waiting_for = 'ready';
        userSession.ready = true;
        
        return searchResult;
        
    } catch (error) {
        logError(error, { operation: 'handleSearchRequest', whatsappNumber });
        return "I'm having trouble with the search right now. Please try again or ask for something else.";
    }
}

// Handle profile field updates with enhanced validation - FIXED VERSION
async function handleProfileFieldUpdate(userMessage, intent, userSession, whatsappNumber) {
    try {
        const fieldName = userSession.waiting_for.replace('updating_', '');
        
        // Handle skip/stop/pause commands - NO SEARCH DURING PROFILE UPDATE
        if (intent.type === 'skip_profile' || userMessage.toLowerCase().includes('later') || userMessage.toLowerCase().includes('stop')) {
            userSession.waiting_for = 'ready';
            userSession.ready = true;
            userSession.profile_skipped = true;
            
            // Clear profile completion session data
            delete userSession.current_field;
            delete userSession.remaining_fields;
            delete userSession.incomplete_fields;
            
            return `Profile update stopped! 👍

You can complete your profile anytime by saying "update profile".

What can I help you with?`;
        }
        
        // Block search during profile updates
        if (intent.type === 'search' || intent.type === 'skip_and_search') {
            return `Please complete this profile field first, or type "later" to stop profile update.

Current field: ${getFieldDisplayName(fieldName)}

${await getFieldPrompt(fieldName, userSession)}`;
        }
        
        // Validate field input
        const validation = await validateProfileField(fieldName, userMessage, userSession);
        
        if (!validation.valid) {
            return `${validation.message}

Or type "later" to stop profile update.`;
        }
        
        // Update the field in database
        const success = await updateUserProfile(whatsappNumber, fieldName, validation.value);
        
        if (!success) {
            return `❌ Error updating your profile. Please try again.

Current field: ${getFieldDisplayName(fieldName)}

${await getFieldPrompt(fieldName, userSession)}`;
        }
        
        // Get fresh user data to calculate progress
        const updatedUser = await findUserByWhatsAppNumber(whatsappNumber);
        if (updatedUser) {
            userSession.user_data = updatedUser; // Update session with fresh data
        }
        
        // Calculate progress using session data (more reliable)
        const remainingFields = userSession.remaining_fields || [];
        const totalFields = userSession.incomplete_fields?.length || 1;
        const currentStep = totalFields - remainingFields.length;
        const progressPercentage = Math.round((currentStep / totalFields) * 100);
        
        let progressMessage = `✅ ${getFieldDisplayName(fieldName)} saved!

Progress: ${currentStep}/${totalFields} (${progressPercentage}%)`;
        
        // Move to next field or complete
        if (remainingFields.length > 0) {
            const nextField = remainingFields[0];
            
            // Update session for next field
            userSession.waiting_for = `updating_${nextField}`;
            userSession.current_field = nextField;
            userSession.remaining_fields = remainingFields.slice(1);
            
            progressMessage += `\n\nStep ${currentStep + 1}/${totalFields}:

${await getFieldPrompt(nextField, userSession)}`;
        } else {
            // Profile completion
            await markProfileCompleted(whatsappNumber);
            
            progressMessage += `\n\n🎉 Profile completed!

You're now fully connected to our alumni network!

What can I help you find today?

Examples:
- "Need help with React development"
- "Looking for fintech entrepreneurs"
- "Connect me with marketing experts"`;
            
            userSession.waiting_for = 'ready';
            userSession.ready = true;
            userSession.profile_completed = true;
            
            // Clear profile completion session data
            delete userSession.current_field;
            delete userSession.remaining_fields;
            delete userSession.incomplete_fields;
        }
        
        logUserActivity(whatsappNumber, 'profile_field_updated', {
            field: fieldName,
            progress: `${currentStep}/${totalFields}`,
            completed: remainingFields.length === 0
        });
        
        return progressMessage;
        
    } catch (error) {
        logError(error, { operation: 'handleProfileFieldUpdate', whatsappNumber });
        return "❌ Error updating your profile. Please try again.";
    }
}

// Handle profile completion choice
async function handleProfileChoice(userMessage, intent, userSession, whatsappNumber) {
    try {
        // Block search if profile completion is required
        if (intent.type === 'search') {
            const user = userSession.user_data;
            const hasMinCompletion = hasMinimumProfileCompletion(user, 70);
            
            if (!hasMinCompletion) {
                const completionPercentage = getProfileCompletionPercentage(user);
                return `🚫 Please complete your profile first!

Your profile: ${completionPercentage}% complete
Required: 70% minimum

Ready to continue your profile? Reply YES`;
            }
            
            return await handleSearchRequest(intent, userSession, whatsappNumber);
        }
        
        if (intent.type === 'affirmative' || userMessage.toLowerCase().includes('yes')) {
            const incompleteFields = userSession.incomplete_fields || getIncompleteFields(userSession.user_data);
            
            if (incompleteFields.length === 0) {
                userSession.waiting_for = 'ready';
                userSession.ready = true;
                return `Your profile is already complete! 🎉

What can I help you find today?`;
            }
            
            const firstField = incompleteFields[0];
            const totalFields = incompleteFields.length;
            
            userSession.waiting_for = `updating_${firstField}`;
            userSession.current_field = firstField;
            userSession.remaining_fields = incompleteFields.slice(1);
            userSession.incomplete_fields = incompleteFields;
            
            return `Great! Let's complete your profile with our enhanced system.

Step 1/${totalFields}:

${await getFieldPrompt(firstField, userSession)}`;
        } else {
            const user = userSession.user_data;
            const hasMinCompletion = hasMinimumProfileCompletion(user, 70);
            
            if (!hasMinCompletion) {
                const completionPercentage = getProfileCompletionPercentage(user);
                return `You need 70% profile completion to access alumni search.

Your profile: ${completionPercentage}% complete

Would you like to complete it now? Reply YES

Or you can ask general questions about our network.`;
            }
            
            userSession.waiting_for = 'ready';
            userSession.ready = true;
            userSession.profile_skipped = true;
            
            return `Perfect! I'm here to help you connect with amazing alumni. 🌟

What can I help you find today?

Examples:
- "Need help with web development"
- "Looking for startup mentors"
- "Connect me with healthcare professionals"`;
        }
        
    } catch (error) {
        logError(error, { operation: 'handleProfileChoice', whatsappNumber });
        return "Let's try that again. Would you like to complete your profile now? Reply YES or NO";
    }
}

// Handle additional email linking choice
async function handleAdditionalEmailChoice(userMessage, intent, userSession, whatsappNumber) {
    try {
        if (intent.type === 'affirmative' || userMessage.toLowerCase().includes('yes')) {
            userSession.waiting_for = 'additional_email_input';
            return `Please enter your additional email address:

Example: newemail@domain.com

This will be linked to your existing account for better connectivity.`;
        } else {
            // Move to next field
            return await moveToNextProfileField(userSession, whatsappNumber);
        }
        
    } catch (error) {
        logError(error, { operation: 'handleAdditionalEmailChoice', whatsappNumber });
        return "Let's try that again. Do you want to add an additional email? Reply YES or NO";
    }
}

// Handle additional email input
async function handleAdditionalEmailInput(userMessage, intent, userSession, whatsappNumber) {
    try {
        const { linkAdditionalEmail } = require('../models/User');
        const { validateEmail } = require('../utils/validation');
        
        const emailValidation = validateEmail(userMessage);
        if (!emailValidation.valid) {
            return `${emailValidation.message}

Please enter a valid email address:`;
        }
        
        const linkResult = await linkAdditionalEmail(whatsappNumber, emailValidation.value);
        
        if (!linkResult.success) {
            return `❌ ${linkResult.error}

Please try a different email or type "skip" to continue.`;
        }
        
        // Move to next field
        const nextMessage = await moveToNextProfileField(userSession, whatsappNumber);
        return `✅ Additional email linked successfully!

${nextMessage}`;
        
    } catch (error) {
        logError(error, { operation: 'handleAdditionalEmailInput', whatsappNumber });
        return "❌ Error linking email. Please try again or type 'skip' to continue.";
    }
}

// Handle Instagram profile choice
async function handleInstagramChoice(userMessage, intent, userSession, whatsappNumber) {
    try {
        if (intent.type === 'affirmative' || userMessage.toLowerCase().includes('yes')) {
            userSession.waiting_for = 'updating_instagram';
            userSession.current_field = 'instagram';
            
            return `Please enter your Instagram profile URL:

Example: https://instagram.com/yourprofile

Type "later" to skip this step.`;
        } else {
            // Move to next field
            return await moveToNextProfileField(userSession, whatsappNumber);
        }
        
    } catch (error) {
        logError(error, { operation: 'handleInstagramChoice', whatsappNumber });
        return "Let's try that again. Do you have an Instagram profile to share? Reply YES or NO";
    }
}

// Handle regular user interactions - DIRECT PROFILE START
async function handleRegularInteraction(userMessage, intent, userSession, whatsappNumber, user, userName) {
    try {
        const incompleteFields = getIncompleteFields(user);
        const isProfileComplete = incompleteFields.length === 0;
        const completionPercentage = getProfileCompletionPercentage(user);
        const hasMinCompletion = hasMinimumProfileCompletion(user, 70);
        
        if (intent.type === 'profile_update') {
            if (incompleteFields.length > 0) {
                const firstField = incompleteFields[0];
                const totalFields = incompleteFields.length;
                
                userSession.waiting_for = `updating_${firstField}`;
                userSession.current_field = firstField;
                userSession.remaining_fields = incompleteFields.slice(1);
                userSession.incomplete_fields = incompleteFields;
                
                return `Let's complete your profile!

Step 1/${totalFields}:

${await getFieldPrompt(firstField, userSession)}`;
            } else {
                return `Your profile is already complete! 🎉

Profile completion: 100%
All enhanced fields filled ✅

What can I help you find today?`;
            }
        }
        
        if (intent.type === 'casual') {
            return await handleCasualConversation(userMessage, {
                name: userName,
                profileComplete: isProfileComplete,
                authenticated: true,
                completionPercentage: completionPercentage
            });
        }
        
        // DIRECT PROFILE START - No asking, just start if <70%
        if (!hasMinCompletion && !userSession.profile_started) {
            const firstField = incompleteFields[0];
            const totalFields = incompleteFields.length;
            
            userSession.waiting_for = `updating_${firstField}`;
            userSession.current_field = firstField;
            userSession.remaining_fields = incompleteFields.slice(1);
            userSession.incomplete_fields = incompleteFields;
            userSession.profile_started = true;
            
            return `Welcome back, ${userName}! 👋

Your profile is ${completionPercentage}% complete.
Let's complete it to unlock alumni search (70% required).

Step 1/${totalFields}:

${await getFieldPrompt(firstField, userSession)}`;
        }
        
        // If profile is sufficient, show search options
        if (hasMinCompletion) {
            userSession.ready = true;
            userSession.waiting_for = 'ready';
            
            return `Hi ${userName}! 👋

Your profile: ${completionPercentage}% complete ✅

What expertise are you looking for today?

Examples:
- "Need help with React development"
- "Looking for fintech entrepreneurs" 
- "Connect me with marketing experts"
- "Find healthcare professionals in Mumbai"`;
        }
        
        // Fallback message
        return `Hi ${userName}! 👋

Let's get your profile ready for networking!`;
        
    } catch (error) {
        logError(error, { operation: 'handleRegularInteraction', whatsappNumber });
        return `Hi ${userName}! 👋

I'm here to help you connect with our alumni network. What can I help you find today?`;
    }
}

// Helper function to move to next profile field
async function moveToNextProfileField(userSession, whatsappNumber) {
    try {
        const remainingFields = userSession.remaining_fields || [];
        const totalFields = userSession.incomplete_fields?.length || 1;
        const currentStep = totalFields - remainingFields.length;
        
        if (remainingFields.length > 0) {
            const nextField = remainingFields[0];
            
            userSession.waiting_for = `updating_${nextField}`;
            userSession.current_field = nextField;
            userSession.remaining_fields = remainingFields.slice(1);
            
            return `Step ${currentStep + 1}/${totalFields}:

${await getFieldPrompt(nextField, userSession)}`;
        } else {
            await markProfileCompleted(whatsappNumber);
            
            userSession.waiting_for = 'ready';
            userSession.ready = true;
            userSession.profile_completed = true;
            
            // Clear profile completion session data
            delete userSession.current_field;
            delete userSession.remaining_fields;
            delete userSession.incomplete_fields;
            
            return `🎉 Profile completed!

You're now fully connected to our enhanced alumni network!

What can I help you find today?`;
        }
        
    } catch (error) {
        logError(error, { operation: 'moveToNextProfileField', whatsappNumber });
        return "Let's continue with your profile. What can I help you find today?";
    }
}

// Helper function to get display name for fields
function getFieldDisplayName(fieldName) {
    const displayNames = {
        fullName: 'Full Name',
        gender: 'Gender',
        professionalRole: 'Professional Role',
        dateOfBirth: 'Date of Birth',
        country: 'Country',
        city: 'City',
        state: 'State',
        phone: 'Phone Number',
        additionalEmail: 'Additional Email',
        linkedin: 'LinkedIn Profile',
        instagram: 'Instagram Profile',
        domain: 'Industry Domain',
        yatraImpact: 'Yatra Impact',
        communityAsks: 'Community Support Needs',
        communityGives: 'Community Contributions'
    };
    
    return displayNames[fieldName] || fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
}

module.exports = {
    handleAuthenticatedUser,
    handleSearchRequest,
    handleProfileFieldUpdate,
    moveToNextProfileField
};