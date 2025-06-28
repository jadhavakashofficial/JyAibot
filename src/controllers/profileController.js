// Enhanced profile controller for comprehensive user data collection
// File: src/controllers/profileController.js
// COMPLETE REPLACEMENT - Enhanced with better UX, AI validation, and comprehensive field prompts

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

// Enhanced field prompts with better UX, examples, and clear guidance
async function getFieldPrompt(fieldName, userSession = {}) {
    try {
        const prompts = {
            fullName: `**👤 Full Name Required**

Please enter your complete legal name:

**Requirements:**
• 2-100 characters
• Only letters, spaces, hyphens, apostrophes
• Your real name (no nicknames)

**Examples:**
• Rajesh Kumar Singh
• Mary O'Connor-Smith
• Priya Sharma

**Format:** First Middle Last`,

            gender: `**⚧ Gender Selection**

Please select your gender:

**1️⃣ Male**
**2️⃣ Female**
**3️⃣ Others**

Reply with the number (1, 2, or 3)

**Example:** 1`,

            professionalRole: `**💼 Professional Role**

Please select your current professional role:

${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.map((role, i) => `**${i+1}️⃣ ${role}**`).join('\n')}

Reply with the number (1-${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.length})

**Example:** 3`,

            dateOfBirth: `**🎂 Date of Birth Required**

Please enter your date of birth:

**Format:** DD-MM-YYYY

**Requirements:**
• Valid date between 1960-2010
• Use exact format shown

**Examples:**
• 15-08-1995
• 03-12-1988
• 25-06-1992

**Your format:** DD-MM-YYYY`,

            country: `**🌍 Country of Residence**

Please enter your current country:

**Requirements:**
• Real country name only
• AI validation ensures authenticity
• Use official country names

**Examples:**
• India
• United States
• United Kingdom
• Canada
• Australia

**Your country:**`,

            city: `**🏙️ City of Residence**

Please enter your current city:

**Requirements:**
• Real city name only
• AI validation for worldwide cities
• Use official city names

**Examples:**
• Mumbai
• New York
• London
• Toronto
• Sydney

**Your city:**`,

            state: `**📍 State/Province Required**

Please enter your state or province:

**Requirements:**
• Real state/province name only
• AI validation for worldwide regions
• Use official names

**Examples:**
• Maharashtra (India)
• California (USA)
• Ontario (Canada)
• New South Wales (Australia)

**Your state/province:**`,

            phone: `**📱 Phone Number Required**

Please enter your phone number with country code:

**Format Examples:**
• +91 9876543210 (India)
• +1 2025551234 (USA)
• +44 7911123456 (UK)
• +61 412345678 (Australia)

**Requirements:**
• Include country code
• 10-15 digits total
• No special characters needed

**Your phone:**`,

            linkedin: `**🔗 LinkedIn Profile Required**

Please enter your LinkedIn profile URL:

**Requirements:**
• Complete LinkedIn URL
• Must include linkedin.com/in/
• Your public profile link

**Examples:**
• https://linkedin.com/in/yourname
• https://www.linkedin.com/in/john-smith-123

**Tips:**
• Copy URL from your LinkedIn profile
• Make sure it's your public profile URL

**Your LinkedIn URL:**`,

            instagram: `**📸 Instagram Profile (Optional)**

Do you have an Instagram profile to share?

This helps with networking and personal branding.

**Reply:**
• **YES** - I want to add Instagram
• **NO** - Skip Instagram profile

**Example:** YES`,

            domain: `**🏢 Industry Domain**

Please select your primary industry domain:

${ENHANCED_PROFILE_FIELDS.DOMAINS.slice(0, 10).map((domain, i) => `**${i+1}️⃣ ${domain}**`).join('\n')}
${ENHANCED_PROFILE_FIELDS.DOMAINS.length > 10 ? `\n**...and ${ENHANCED_PROFILE_FIELDS.DOMAINS.length - 10} more options available**` : ''}

Reply with the number (1-${ENHANCED_PROFILE_FIELDS.DOMAINS.length})

**Example:** 2`,

            yatraImpact: `**🚆 Jagriti Yatra Impact Assessment**

How did Jagriti Yatra help you personally?

Select 1-3 options that apply:

${ENHANCED_PROFILE_FIELDS.YATRA_IMPACT.map((impact, i) => `**${i+1}️⃣ ${impact}**`).join('\n')}

**Reply with numbers separated by commas:**

**Examples:**
• Single: 1
• Multiple: 1,2
• All three: 1,2,3

**Your selections:**`,

            communityAsks: `**🤝 Community Support Needs**

What are your PRIMARY 3 support needs from our community?

**⚠️ Select EXACTLY 3 options:**

${ENHANCED_PROFILE_FIELDS.COMMUNITY_ASKS.map((ask, i) => `**${i+1}️⃣ ${ask}**`).join('\n')}

**Reply with exactly 3 numbers:**

**Examples:**
• 1,3,5
• 2,7,10
• 4,6,9

**Your 3 selections:**`,

            communityGives: `**🎁 Community Contributions**

What can you contribute to our community?

Select multiple options that apply:

${ENHANCED_PROFILE_FIELDS.COMMUNITY_GIVES.map((give, i) => `**${i+1}️⃣ ${give}**`).join('\n')}

**Reply with numbers separated by commas:**

**Examples:**
• Few: 1,3,5
• Many: 1,3,5,7,9
• Several: 2,4,6,8

**Your contributions:**`,

            additionalEmail: `**📧 Additional Email (Optional)**

Do you have another email address to link?

This helps other alumni find you through multiple emails.

**Reply:**
• **YES** - Add another email
• **NO** - Continue with current email only

**Example:** NO`
        };

        const prompt = prompts[fieldName];
        if (!prompt) {
            logError(new Error('Unknown field prompt requested'), { fieldName });
            return `Please provide information for ${fieldName}:`;
        }

        return prompt;

    } catch (error) {
        logError(error, { operation: 'getFieldPrompt', fieldName });
        return `Please provide your ${fieldName}:`;
    }
}

// Enhanced field validation with AI integration and better error handling
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
                    message: `❌ **Invalid Selection**

Please select a number from 1-${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.length}

**Options:**
${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.slice(0, 5).map((role, i) => `${i+1}️⃣ ${role}`).join('\n')}
${ENHANCED_PROFILE_FIELDS.PROFESSIONAL_ROLES.length > 5 ? '...' : ''}

**Example:** 3` 
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
                    message: '❌ **Invalid Response**\n\nPlease reply with:\n• YES or NO\n• Y or N\n• 1 or 2' 
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
                                message: '**Please enter your Instagram profile URL:**\n\n**Example:** https://instagram.com/yourprofile' 
                            };
                        } else {
                            return { valid: true, value: null };
                        }
                    }
                    return { 
                        valid: false, 
                        message: '❌ **Invalid Response**\n\nPlease reply with:\n• YES or NO\n• Y or N' 
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
                    message: `❌ **Invalid Selection**

Please select a number from 1-${ENHANCED_PROFILE_FIELDS.DOMAINS.length}

**First 10 options:**
${ENHANCED_PROFILE_FIELDS.DOMAINS.slice(0, 10).map((domain, i) => `${i+1}️⃣ ${domain}`).join('\n')}
...and ${ENHANCED_PROFILE_FIELDS.DOMAINS.length - 10} more

**Example:** 2` 
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
                    message: `❌ **Invalid Selection**

Please select 1-3 numbers from the list:

${ENHANCED_PROFILE_FIELDS.YATRA_IMPACT.map((impact, i) => `${i+1}️⃣ ${impact}`).join('\n')}

**Examples:**
• Single: 1
• Multiple: 1,2
• Maximum: 1,2,3` 
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
                    message: `❌ **Must Select Exactly 3 Options**

${ENHANCED_PROFILE_FIELDS.COMMUNITY_ASKS.slice(0, 8).map((ask, i) => `${i+1}️⃣ ${ask}`).join('\n')}
...and ${ENHANCED_PROFILE_FIELDS.COMMUNITY_ASKS.length - 8} more

**Examples:**
• 1,3,5
• 2,7,10
• 4,6,9

**Required:** Exactly 3 numbers` 
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
                    message: `❌ **Select At Least 1 Option**

${ENHANCED_PROFILE_FIELDS.COMMUNITY_GIVES.slice(0, 8).map((give, i) => `${i+1}️⃣ ${give}`).join('\n')}
...and ${ENHANCED_PROFILE_FIELDS.COMMUNITY_GIVES.length - 8} more

**Examples:**
• Single: 1
• Multiple: 1,3,5
• Many: 2,4,6,8,10` 
                };

            default:
                return { 
                    valid: false, 
                    message: `❌ **Unknown Field**\n\nField "${fieldName}" is not recognized. Please contact support.` 
                };
        }

    } catch (error) {
        logError(error, { operation: 'validateProfileField', fieldName, value });
        return { 
            valid: false, 
            message: '❌ **Validation Error**\n\nTechnical error occurred. Please try again or contact support.' 
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
            totalFields: 13,
            completedFields: 13 - incompleteFields.length,
            searchUnlocked: incompleteFields.length === 0
        };

    } catch (error) {
        logError(error, { operation: 'getProfileCompletionStatus' });
        return {
            isComplete: false,
            completionPercentage: 0,
            incompleteFields: [],
            totalFields: 13,
            completedFields: 0,
            searchUnlocked: false
        };
    }
}

// Generate comprehensive profile summary for user
function generateProfileSummary(user) {
    try {
        const enhanced = user.enhancedProfile || {};
        const basic = user.basicProfile || {};
        
        let summary = `📋 **Your Complete Profile Summary**\n\n`;
        
        // Basic Information
        summary += `**👤 Personal Information:**\n`;
        if (enhanced.fullName) summary += `• **Name:** ${enhanced.fullName}\n`;
        if (enhanced.gender) summary += `• **Gender:** ${enhanced.gender}\n`;
        if (enhanced.dateOfBirth) summary += `• **Birth Date:** ${enhanced.dateOfBirth}\n`;
        
        // Professional Information
        summary += `\n**💼 Professional Details:**\n`;
        if (enhanced.professionalRole) summary += `• **Role:** ${enhanced.professionalRole}\n`;
        if (enhanced.domain) summary += `• **Domain:** ${enhanced.domain}\n`;
        
        // Location
        summary += `\n**📍 Location Information:**\n`;
        if (enhanced.city && enhanced.state && enhanced.country) {
            summary += `• **Address:** ${enhanced.city}, ${enhanced.state}, ${enhanced.country}\n`;
        }
        
        // Contact Details
        summary += `\n**📞 Contact Information:**\n`;
        if (enhanced.phone) summary += `• **Phone:** ${enhanced.phone}\n`;
        if (basic.email) summary += `• **Primary Email:** ${basic.email}\n`;
        if (basic.linkedEmails && basic.linkedEmails.length > 0) {
            summary += `• **Additional Emails:** ${basic.linkedEmails.length} linked\n`;
        }
        
        // Social Media
        summary += `\n**🔗 Social Profiles:**\n`;
        if (enhanced.linkedin) summary += `• **LinkedIn:** ✅ Added\n`;
        if (enhanced.instagram) summary += `• **Instagram:** ✅ Added\n`;
        
        // Community Engagement
        summary += `\n**🤝 Community Engagement:**\n`;
        if (enhanced.yatraImpact && enhanced.yatraImpact.length > 0) {
            summary += `• **Yatra Impact:** ${enhanced.yatraImpact.length} selected\n`;
        }
        if (enhanced.communityAsks && enhanced.communityAsks.length > 0) {
            summary += `• **Support Needs:** ${enhanced.communityAsks.length} areas\n`;
        }
        if (enhanced.communityGives && enhanced.communityGives.length > 0) {
            summary += `• **Contributions:** ${enhanced.communityGives.length} offerings\n`;
        }
        
        const status = getProfileCompletionStatus(user);
        summary += `\n**✅ Profile Status:**\n`;
        summary += `• **Completion:** ${status.completionPercentage}% (${status.completedFields}/${status.totalFields} fields)\n`;
        summary += `• **Search Access:** ${status.searchUnlocked ? '🔓 Unlocked' : '🔒 Locked (100% required)'}\n`;
        
        return summary;
        
    } catch (error) {
        logError(error, { operation: 'generateProfileSummary' });
        return 'Unable to generate profile summary at this time.';
    }
}

// Enhanced field-specific help and guidance
function getFieldHelp(fieldName) {
    const helpInfo = {
        fullName: {
            title: "Full Name Help",
            tips: [
                "Use your complete legal name",
                "Include first, middle (if any), and last name",
                "Only letters, spaces, hyphens, and apostrophes allowed",
                "No nicknames, usernames, or special characters"
            ],
            examples: [
                "Rajesh Kumar Singh",
                "Mary O'Connor-Smith", 
                "Priya Sharma",
                "John William Smith"
            ],
            commonErrors: [
                "Using nicknames instead of real names",
                "Including numbers or special characters",
                "Using abbreviations"
            ]
        },
        
        city: {
            title: "City Name Help",
            tips: [
                "Enter your current city of residence",
                "Use official city names only",
                "AI validates against worldwide city database",
                "Avoid abbreviations or codes"
            ],
            examples: [
                "Mumbai (India)",
                "New York (USA)",
                "London (UK)",
                "Toronto (Canada)"
            ],
            commonErrors: [
                "Using state/country names instead of city",
                "Using abbreviations like 'NYC'",
                "Entering person names"
            ]
        },
        
        phone: {
            title: "Phone Number Help",
            tips: [
                "Always include country code",
                "Format: +[country code] [number]",
                "10-15 digits total length",
                "No special formatting needed"
            ],
            examples: [
                "+91 9876543210 (India)",
                "+1 2025551234 (USA)",
                "+44 7911123456 (UK)",
                "+61 412345678 (Australia)"
            ],
            commonErrors: [
                "Forgetting country code",
                "Using wrong country code",
                "Including extra symbols"
            ]
        },
        
        linkedin: {
            title: "LinkedIn Profile Help",
            tips: [
                "Use your complete LinkedIn profile URL",
                "Must include 'linkedin.com/in/'",
                "Copy directly from your LinkedIn profile",
                "Ensure it's your public profile URL"
            ],
            examples: [
                "https://linkedin.com/in/yourname",
                "https://www.linkedin.com/in/john-smith-123",
                "https://linkedin.com/in/priya-sharma-456"
            ],
            commonErrors: [
                "Using company LinkedIn page",
                "Incomplete or incorrect URLs",
                "Private profile URLs"
            ]
        }
    };
    
    return helpInfo[fieldName] || {
        title: `${fieldName} Help`,
        tips: ["Follow the format shown in the example"],
        examples: ["Please refer to the field prompt"],
        commonErrors: ["Check the field requirements"]
    };
}

// Generate field-specific error context
function getFieldErrorContext(fieldName, errorType) {
    const contexts = {
        validation_failed: `The ${fieldName} you entered doesn't meet our requirements.`,
        format_error: `The format for ${fieldName} is incorrect.`,
        ai_validation_failed: `Our AI validation couldn't verify your ${fieldName}.`,
        required_field: `${fieldName} is required for profile completion.`,
        invalid_selection: `Please select a valid option for ${fieldName}.`
    };
    
    return contexts[errorType] || `There's an issue with your ${fieldName}.`;
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
            length: Array.isArray(value) ? value.length : (value ? value.toString().length : 0),
            validation: {
                required: true,
                hasAIValidation: ['city', 'state', 'country'].includes(fieldName),
                hasFormatValidation: ['phone', 'linkedin', 'dateOfBirth', 'email'].includes(fieldName),
                isMultipleChoice: ['gender', 'professionalRole', 'domain', 'yatraImpact', 'communityAsks', 'communityGives'].includes(fieldName)
            }
        };
        
        if (Array.isArray(value)) {
            fieldInfo.items = value;
            fieldInfo.itemCount = value.length;
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

// Get validation statistics for monitoring
function getValidationStatistics() {
    return {
        totalFields: 13,
        requiredFields: 13,
        optionalFields: 0,
        aiValidatedFields: ['city', 'state', 'country'],
        formatValidatedFields: ['phone', 'linkedin', 'dateOfBirth', 'email', 'fullName'],
        multipleChoiceFields: ['gender', 'professionalRole', 'domain', 'yatraImpact', 'communityAsks', 'communityGives'],
        arrayFields: ['yatraImpact', 'communityAsks', 'communityGives'],
        strictValidationEnabled: true,
        completionRequirement: '100%'
    };
}

module.exports = {
    getFieldPrompt,
    validateProfileField,
    getProfileCompletionStatus,
    generateProfileSummary,
    getFieldHelp,
    getFieldErrorContext,
    getFieldDisplayInfo,
    getFieldDisplayName,
    getValidationStatistics
};