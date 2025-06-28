// Enhanced profile controller for comprehensive user data collection
// Handles AI-powered validation, field prompts, and profile completion for JY Alumni Bot v3.0

const { ENHANCED_PROFILE_FIELDS } = require('../models/User');
const { 
    validateFullName, 
    validateGender, 
    validateDateOfBirth, 
    validateGeographicInput,
    validatePhoneNumber,
    validateEmail,
    validateLinkedInURL,
    validateInstagramURL,
    validateMultipleChoice,
    validateYesNo,
    sanitizeInput
} = require('../utils/validation');
const { logError, logSuccess } = require('../middleware/logging');

// Enhanced field prompts with examples and validation hints
async function getFieldPrompt(fieldName, userSession = {}) {
    try {
        const prompts = {
            fullName: `Please enter your **Full Name**:

Requirements:
- Only letters, spaces, hyphens, and apostrophes
- 2-100 characters long
- Real name only

Example: Rajesh Kumar Singh

Type "later" to skip and search alumni now.`,

            gender: `Please select your **Gender**:

1️⃣ Male
2️⃣ Female  
3️⃣ Others

Reply with the number (1, 2, or 3)

Type "later" to skip and search alumni now.`,

            professionalRole: `Please select your **Professional Role**:

${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.map((role, i) => `${i+1}️⃣ ${role}`).join('\n')}

Reply with the number (1-${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.length})

Type "later" to skip and search alumni now.`,

            dateOfBirth: `Please enter your **Date of Birth**:

Format: DD-MM-YYYY
Example: 15-08-1995

Requirements:
- Must be between 1960-2010
- Valid date only

Type "later" to skip and search alumni now.`,

            country: `Please enter your **Country**:

Example: India

Requirements:
- Real country name only
- AI validation will verify authenticity

Type "later" to skip and search alumni now.`,

            city: `Please enter your **City**:

Example: Mumbai

Requirements:
- Real city name only
- AI validation will verify authenticity

Type "later" to skip and search alumni now.`,

            state: `Please enter your **State/Province**:

Example: Maharashtra

Requirements:
- Real state/province name only
- AI validation will verify authenticity

Type "later" to skip and search alumni now.`,

            phone: `Please enter your **Phone Number**:

Format with country code:
Examples:
- +91 9876543210
- 919876543210
- +1 2025551234

Requirements:
- Include country code
- 10-15 digits total

Type "later" to skip and search alumni now.`,

            additionalEmail: `Do you have an **Additional Email** to link?

This helps other alumni find you through multiple email addresses.

Reply:
- **YES** - I want to add another email
- **NO** - Continue with current email only

Type "later" to skip and search alumni now.`,

            linkedin: `Please enter your **LinkedIn Profile URL**:

Example: https://linkedin.com/in/yourprofile

Requirements:
- Complete LinkedIn URL
- Must include linkedin.com

Type "later" to skip and search alumni now.`,

            instagram: `Do you have an **Instagram Profile** to share?

This is optional but helps with networking.

Reply:
- **YES** - I want to share my Instagram
- **NO** - Skip Instagram profile

Type "later" to skip and search alumni now.`,

            domain: `Please select your **Industry Domain**:

${ENHANCED_PROFILE_FIELDS.DOMAINS.map((domain, i) => `${i+1}️⃣ ${domain}`).slice(0, 10).join('\n')}
${ENHANCED_PROFILE_FIELDS.DOMAINS.length > 10 ? `\n...and ${ENHANCED_PROFILE_FIELDS.DOMAINS.length - 10} more options` : ''}

Reply with the number (1-${ENHANCED_PROFILE_FIELDS.DOMAINS.length})

Type "later" to skip and search alumni now.`,

            yatraImpact: `**How did Jagriti Yatra help you personally?**

You can select multiple options:

${ENHANCED_PROFILE_FIELDS.YATRA_IMPACT.map((impact, i) => `${i+1}️⃣ ${impact}`).join('\n')}

Reply with numbers separated by commas:
Examples: 1,2 or 1,3 or 2,3 or 1,2,3

Type "later" to skip and search alumni now.`,

            communityAsks: `**What are your primary 3 support needs from our community?**

Please select exactly 3 options:

${ENHANCED_PROFILE_FIELDS.COMMUNITY_ASKS.map((ask, i) => `${i+1}️⃣ ${ask}`).join('\n')}

Reply with exactly 3 numbers:
Example: 1,3,5

Type "later" to skip and search alumni now.`,

            communityGives: `**What can you contribute to our community?**

Select multiple options that apply:

${ENHANCED_PROFILE_FIELDS.COMMUNITY_GIVES.map((give, i) => `${i+1}️⃣ ${give}`).join('\n')}

Reply with numbers separated by commas:
Examples: 1,3,5,7 or 2,4,6

Type "later" to skip and search alumni now.`
        };

        const prompt = prompts[fieldName];
        if (!prompt) {
            logError(new Error('Unknown field prompt requested'), { fieldName });
            return `Please provide information for ${fieldName} or type "later" to skip:`;
        }

        return prompt;

    } catch (error) {
        logError(error, { operation: 'getFieldPrompt', fieldName });
        return `Please provide your ${fieldName} or type "later" to skip:`;
    }
}

// Enhanced field validation with AI integration
async function validateProfileField(fieldName, value, userSession = {}) {
    try {
        const cleanValue = sanitizeInput(value);
        
        logSuccess('profile_field_validation_started', { 
            field: fieldName, 
            valueLength: cleanValue.length 
        });

        switch (fieldName) {
            case 'fullName':
                return validateFullName(cleanValue);

            case 'gender':
                return validateGender(cleanValue);

            case 'professionalRole':
                const roleValidation = validateMultipleChoice(
                    cleanValue, 
                    ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES, 
                    1, 
                    1
                );
                if (roleValidation.valid) {
                    return { valid: true, value: roleValidation.value[0] };
                }
                return { 
                    valid: false, 
                    message: `❌ Please select a number from 1-${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.length}

${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.map((role, i) => `${i+1}️⃣ ${role}`).slice(0, 5).join('\n')}
${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.length > 5 ? '...' : ''}` 
                };

            case 'dateOfBirth':
                return validateDateOfBirth(cleanValue);

            case 'country':
                return await validateGeographicInput(cleanValue, 'country');

            case 'city':
                return await validateGeographicInput(cleanValue, 'city');

            case 'state':
                return await validateGeographicInput(cleanValue, 'state');

            case 'phone':
                return validatePhoneNumber(cleanValue);

            case 'additionalEmail':
                const emailChoice = validateYesNo(cleanValue);
                if (emailChoice.valid) {
                    userSession.needsAdditionalEmail = emailChoice.value;
                    return { valid: true, value: emailChoice.value };
                }
                return { 
                    valid: false, 
                    message: '❌ Please reply with YES, NO, Y, N, 1, or 2' 
                };

            case 'linkedin':
                return validateLinkedInURL(cleanValue);

            case 'instagram':
                if (userSession.instagramChoice === undefined) {
                    // First ask if they want to add Instagram
                    const instagramChoice = validateYesNo(cleanValue);
                    if (instagramChoice.valid) {
                        if (instagramChoice.value) {
                            userSession.instagramChoice = true;
                            return { 
                                valid: false, 
                                needsInstagramURL: true,
                                message: 'Please enter your Instagram profile URL:\n\nExample: https://instagram.com/yourprofile' 
                            };
                        } else {
                            return { valid: true, value: null };
                        }
                    }
                    return { 
                        valid: false, 
                        message: '❌ Please reply with YES or NO' 
                    };
                } else {
                    // They chose yes, now validate URL
                    return validateInstagramURL(cleanValue);
                }

            case 'domain':
                const domainValidation = validateMultipleChoice(
                    cleanValue, 
                    ENHANCED_PROFILE_FIELDS.DOMAINS, 
                    1, 
                    1
                );
                if (domainValidation.valid) {
                    return { valid: true, value: domainValidation.value[0] };
                }
                return { 
                    valid: false, 
                    message: `❌ Please select a number from 1-${ENHANCED_PROFILE_FIELDS.DOMAINS.length}

First 10 options:
${ENHANCED_PROFILE_FIELDS.DOMAINS.slice(0, 10).map((domain, i) => `${i+1}️⃣ ${domain}`).join('\n')}
...` 
                };

            case 'yatraImpact':
                const impactValidation = validateMultipleChoice(
                    cleanValue, 
                    ENHANCED_PROFILE_FIELDS.YATRA_IMPACT, 
                    1, 
                    3
                );
                if (impactValidation.valid) {
                    return { valid: true, value: impactValidation.value };
                }
                return { 
                    valid: false, 
                    message: `❌ Please select 1-3 numbers from the list

${ENHANCED_PROFILE_FIELDS.YATRA_IMPACT.map((impact, i) => `${i+1}️⃣ ${impact}`).join('\n')}

Examples: 1,2 or 1,3 or 2,3` 
                };

            case 'communityAsks':
                const asksValidation = validateMultipleChoice(
                    cleanValue, 
                    ENHANCED_PROFILE_FIELDS.COMMUNITY_ASKS, 
                    3, 
                    3
                );
                if (asksValidation.valid) {
                    return { valid: true, value: asksValidation.value };
                }
                return { 
                    valid: false, 
                    message: `❌ Please select exactly 3 numbers

${ENHANCED_PROFILE_FIELDS.COMMUNITY_ASKS.slice(0, 8).map((ask, i) => `${i+1}️⃣ ${ask}`).join('\n')}
...and ${ENHANCED_PROFILE_FIELDS.COMMUNITY_ASKS.length - 8} more

Example: 1,3,5` 
                };

            case 'communityGives':
                const givesValidation = validateMultipleChoice(
                    cleanValue, 
                    ENHANCED_PROFILE_FIELDS.COMMUNITY_GIVES, 
                    1, 
                    null
                );
                if (givesValidation.valid) {
                    return { valid: true, value: givesValidation.value };
                }
                return { 
                    valid: false, 
                    message: `❌ Please select at least 1 number from the list

${ENHANCED_PROFILE_FIELDS.COMMUNITY_GIVES.slice(0, 8).map((give, i) => `${i+1}️⃣ ${give}`).join('\n')}
...and ${ENHANCED_PROFILE_FIELDS.COMMUNITY_GIVES.length - 8} more

Examples: 1,3,5 or 2,4,6,8` 
                };

            default:
                return { 
                    valid: false, 
                    message: `❌ Unknown field: ${fieldName}. Please contact support.` 
                };
        }

    } catch (error) {
        logError(error, { operation: 'validateProfileField', fieldName, value });
        return { 
            valid: false, 
            message: '❌ Validation error occurred. Please try again or contact support.' 
        };
    }
}

// Get profile completion status and next steps
function getProfileCompletionStatus(user) {
    try {
        const { getIncompleteFields, getProfileCompletionPercentage } = require('../models/User');
        
        const incompleteFields = getIncompleteFields(user);
        const completionPercentage = getProfileCompletionPercentage(user);
        
        return {
            isComplete: incompleteFields.length === 0,
            completionPercentage: completionPercentage,
            incompleteFields: incompleteFields,
            totalFields: 15,
            completedFields: 15 - incompleteFields.length
        };

    } catch (error) {
        logError(error, { operation: 'getProfileCompletionStatus' });
        return {
            isComplete: false,
            completionPercentage: 0,
            incompleteFields: [],
            totalFields: 15,
            completedFields: 0
        };
    }
}

// Generate profile summary for user
function generateProfileSummary(user) {
    try {
        const enhanced = user.enhancedProfile || {};
        const basic = user.basicProfile || {};
        
        let summary = `📋 **Your Profile Summary:**\n\n`;
        
        // Basic Information
        if (enhanced.fullName) summary += `👤 **Name:** ${enhanced.fullName}\n`;
        if (enhanced.gender) summary += `⚧ **Gender:** ${enhanced.gender}\n`;
        if (enhanced.dateOfBirth) summary += `🎂 **Birth Date:** ${enhanced.dateOfBirth}\n`;
        
        // Professional Information
        if (enhanced.professionalRole) summary += `💼 **Role:** ${enhanced.professionalRole}\n`;
        if (enhanced.domain) summary += `🏢 **Domain:** ${enhanced.domain}\n`;
        
        // Location
        if (enhanced.city && enhanced.state && enhanced.country) {
            summary += `📍 **Location:** ${enhanced.city}, ${enhanced.state}, ${enhanced.country}\n`;
        }
        
        // Contact
        if (enhanced.phone) summary += `📱 **Phone:** ${enhanced.phone}\n`;
        if (basic.email) summary += `📧 **Email:** ${basic.email}\n`;
        if (basic.linkedEmails && basic.linkedEmails.length > 0) {
            summary += `📧 **Additional Emails:** ${basic.linkedEmails.length}\n`;
        }
        
        // Social Media
        if (enhanced.linkedin) summary += `🔗 **LinkedIn:** Added\n`;
        if (enhanced.instagram) summary += `📸 **Instagram:** Added\n`;
        
        // Community Engagement
        if (enhanced.yatraImpact && enhanced.yatraImpact.length > 0) {
            summary += `🚆 **Yatra Impact:** ${enhanced.yatraImpact.length} selected\n`;
        }
        if (enhanced.communityAsks && enhanced.communityAsks.length > 0) {
            summary += `🤝 **Support Needs:** ${enhanced.communityAsks.length} selected\n`;
        }
        if (enhanced.communityGives && enhanced.communityGives.length > 0) {
            summary += `🎁 **Contributions:** ${enhanced.communityGives.length} selected\n`;
        }
        
        const status = getProfileCompletionStatus(user);
        summary += `\n✅ **Completion:** ${status.completionPercentage}% (${status.completedFields}/${status.totalFields} fields)`;
        
        return summary;
        
    } catch (error) {
        logError(error, { operation: 'generateProfileSummary' });
        return 'Unable to generate profile summary at this time.';
    }
}

// Validate specific field combinations
function validateFieldCombination(fields) {
    try {
        const errors = [];
        
        // Location validation
        if (fields.city && fields.state && fields.country) {
            // Additional validation can be added here
        }
        
        // Professional role and domain compatibility
        if (fields.professionalRole && fields.domain) {
            // Could add logic to check if role matches domain
        }
        
        // Community asks vs gives balance
        if (fields.communityAsks && fields.communityGives) {
            const asksCount = fields.communityAsks.length;
            const givesCount = fields.communityGives.length;
            
            if (asksCount > 0 && givesCount === 0) {
                errors.push('Consider adding what you can contribute to the community');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            suggestions: generateFieldSuggestions(fields)
        };
        
    } catch (error) {
        logError(error, { operation: 'validateFieldCombination' });
        return { valid: true, errors: [], suggestions: [] };
    }
}

// Generate suggestions for field improvements
function generateFieldSuggestions(fields) {
    const suggestions = [];
    
    try {
        if (!fields.linkedin) {
            suggestions.push('Add LinkedIn profile for better professional networking');
        }
        
        if (!fields.instagram && fields.domain && 
            ['Media & Entertainment', 'Marketing', 'Design'].includes(fields.domain)) {
            suggestions.push('Consider adding Instagram for creative field networking');
        }
        
        if (fields.communityAsks && fields.communityAsks.length < 3) {
            suggestions.push('Select all 3 support needs for better matching');
        }
        
        if (fields.communityGives && fields.communityGives.length < 2) {
            suggestions.push('Add more contributions to help other alumni');
        }
        
    } catch (error) {
        logError(error, { operation: 'generateFieldSuggestions' });
    }
    
    return suggestions.slice(0, 3); // Max 3 suggestions
}

// Enhanced field display for admin/debugging
function getFieldDisplayInfo(fieldName, value) {
    try {
        const fieldInfo = {
            name: fieldName,
            displayName: getFieldDisplayName(fieldName),
            value: value,
            type: typeof value,
            isArray: Array.isArray(value),
            length: Array.isArray(value) ? value.length : (value ? value.toString().length : 0)
        };
        
        if (Array.isArray(value)) {
            fieldInfo.items = value;
        }
        
        return fieldInfo;
        
    } catch (error) {
        logError(error, { operation: 'getFieldDisplayInfo', fieldName });
        return { name: fieldName, error: 'Unable to process field info' };
    }
}

// Helper function to get field display names
function getFieldDisplayName(fieldName) {
    const displayNames = {
        fullName: 'Full Name',
        gender: 'Gender',
        professionalRole: 'Professional Role',
        dateOfBirth: 'Date of Birth',
        country: 'Country',
        city: 'City',
        state: 'State/Province',
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
    getFieldPrompt,
    validateProfileField,
    getProfileCompletionStatus,
    generateProfileSummary,
    validateFieldCombination,
    generateFieldSuggestions,
    getFieldDisplayInfo,
    getFieldDisplayName
};