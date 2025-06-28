// User model for enhanced profile management with comprehensive field validation
// Handles all database operations related to user profiles, authentication, and data management

const { getDatabase } = require('../config/database');
const { logError, logSuccess } = require('../middleware/logging');
const { validateEmail, validateWhatsAppNumber, sanitizeInput } = require('../utils/validation');

// Enhanced Profile Field Definitions
const ENHANCED_PROFILE_FIELDS = {
    PROFESSIONAL_ROLES: [
        'Entrepreneur',
        'Student', 
        'Working Professional',
        'Startup Founder',
        'NGO Founder',
        'Researcher',
        'Freelancer',
        'Consultant'
    ],
    
    DOMAINS: [
        'Agriculture',
        'Technology',
        'Healthcare',
        'Education',
        'Finance',
        'Manufacturing',
        'Energy & Sustainability',
        'Transportation & Logistics',
        'Retail & E-commerce',
        'Media & Entertainment',
        'Real Estate & Construction',
        'Telecommunications',
        'Automotive',
        'Aerospace & Defense',
        'Tourism & Hospitality',
        'Food & Beverage',
        'Legal & Compliance',
        'Human Resources & Workforce Development',
        'Social Impact & Nonprofit',
        'Cybersecurity'
    ],
    
    YATRA_IMPACT: [
        'Started Enterprise Post-Yatra',
        'Found Clarity in Journey',
        'Received Funding / Grant'
    ],
    
    COMMUNITY_ASKS: [
        'Mentorship & Guidance',
        'Funding & Investment Support',
        'Business Partnerships',
        'Job & Hiring Support',
        'Product Feedback & Testing',
        'Market & Customer Insights',
        'Legal & Compliance Help',
        'Technology Development & Support',
        'Publicity & Storytelling Help',
        'Emotional & Peer Support',
        'Other'
    ],
    
    COMMUNITY_GIVES: [
        'Mentorship & Guidance',
        'Industry Insights & Best Practices',
        'Community Building & Networking',
        'Legal & Compliance Advice',
        'Technology & Digital Support',
        'Amplification of Ideas & Stories',
        'Market Access & Collaborations',
        'Skill Development Workshops',
        'Job & Internship Opportunities',
        'Investment & Funding Opportunities'
    ]
};

// Find user by WhatsApp number (supports multiple numbers per user)
async function findUserByWhatsAppNumber(whatsappNumber) {
    try {
        const db = getDatabase();
        const cleanNumber = whatsappNumber.replace(/[^\d]/g, '');
        
        const user = await db.collection('users').findOne({ 
            $or: [
                { whatsappNumber: { $regex: cleanNumber, $options: 'i' } },
                { whatsappNumbers: { $elemMatch: { $regex: cleanNumber, $options: 'i' } } }
            ]
        });
        
        if (user) {
            logSuccess('user_found_by_whatsapp', { 
                userId: user._id,
                hasEnhancedProfile: !!user.enhancedProfile 
            });
        }
        
        return user;
    } catch (error) {
        logError(error, { operation: 'findUserByWhatsAppNumber', whatsappNumber });
        return null;
    }
}

// Find user by email address
async function findUserByEmail(email) {
    try {
        const db = getDatabase();
        const normalizedEmail = email.toLowerCase().trim();
        
        const user = await db.collection('users').findOne({ 
            $or: [
                { "basicProfile.email": normalizedEmail },
                { "basicProfile.linkedEmails": { $elemMatch: { $eq: normalizedEmail } } }
            ]
        });
        
        if (user) {
            logSuccess('user_found_by_email', { 
                userId: user._id,
                email: normalizedEmail 
            });
        }
        
        return user;
    } catch (error) {
        logError(error, { operation: 'findUserByEmail', email });
        return null;
    }
}

// Link WhatsApp number to existing user account
async function linkWhatsAppToUser(email, whatsappNumber) {
    try {
        const db = getDatabase();
        const user = await findUserByEmail(email);
        
        if (!user) {
            return { success: false, error: 'User not found with this email address' };
        }
        
        // Get existing WhatsApp numbers
        const existingNumbers = user.whatsappNumbers || [user.whatsappNumber].filter(Boolean) || [];
        const cleanNewNumber = whatsappNumber.replace(/[^\d]/g, '');
        
        // Check if number already exists
        const numberExists = existingNumbers.some(num => 
            num && num.replace(/[^\d]/g, '') === cleanNewNumber
        );
        
        if (numberExists) {
            logSuccess('whatsapp_already_linked', { email, whatsappNumber });
            return { 
                success: true, 
                message: 'WhatsApp number already linked to this account',
                count: existingNumbers.length 
            };
        }
        
        // Check maximum limit (3 WhatsApp numbers per account)
        if (existingNumbers.length >= 3) {
            return { 
                success: false, 
                error: 'Maximum 3 WhatsApp numbers allowed per account. Contact support to modify.' 
            };
        }
        
        // Add new number
        const updatedNumbers = [...existingNumbers, whatsappNumber];
        
        const result = await db.collection('users').updateOne(
            { "basicProfile.email": email.toLowerCase().trim() },
            { 
                $set: { 
                    whatsappNumbers: updatedNumbers,
                    whatsappNumber: whatsappNumber, // Keep primary for backward compatibility
                    "metadata.lastActive": new Date(),
                    "metadata.whatsappLinkedAt": new Date(),
                    "metadata.totalWhatsAppNumbers": updatedNumbers.length
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            logSuccess('whatsapp_linked_successfully', { 
                email, 
                whatsappNumber, 
                totalNumbers: updatedNumbers.length 
            });
            
            return { 
                success: true, 
                count: updatedNumbers.length, 
                message: `WhatsApp linked successfully (${updatedNumbers.length}/3)`
            };
        }
        
        return { success: false, error: 'Failed to link WhatsApp number' };
        
    } catch (error) {
        logError(error, { operation: 'linkWhatsAppToUser', email, whatsappNumber });
        return { success: false, error: 'Database error occurred while linking WhatsApp' };
    }
}

// Update specific profile field with enhanced validation
async function updateUserProfile(whatsappNumber, field, value) {
    try {
        const db = getDatabase();
        const cleanNumber = whatsappNumber.replace(/[^\d]/g, '');
        
        // Prepare update field path
        const updateField = `enhancedProfile.${field}`;
        const updateData = {
            [updateField]: value,
            "metadata.updatedAt": new Date(),
            "metadata.lastActive": new Date(),
            [`metadata.fieldUpdates.${field}`]: new Date()
        };
        
        // Special handling for array fields
        if (Array.isArray(value)) {
            updateData[`metadata.${field}Count`] = value.length;
        }
        
        const result = await db.collection('users').updateOne(
            { 
                $or: [
                    { whatsappNumber: { $regex: cleanNumber, $options: 'i' } },
                    { whatsappNumbers: { $elemMatch: { $regex: cleanNumber, $options: 'i' } } }
                ]
            },
            { $set: updateData }
        );
        
        if (result.modifiedCount > 0) {
            logSuccess('profile_field_updated', { 
                whatsappNumber, 
                field, 
                valueType: typeof value,
                isArray: Array.isArray(value)
            });
            return true;
        }
        
        return false;
    } catch (error) {
        logError(error, { operation: 'updateUserProfile', whatsappNumber, field });
        return false;
    }
}

// Mark profile as completed with comprehensive metadata
async function markProfileCompleted(whatsappNumber) {
    try {
        const db = getDatabase();
        const cleanNumber = whatsappNumber.replace(/[^\d]/g, '');
        
        const result = await db.collection('users').updateOne(
            { 
                $or: [
                    { whatsappNumber: { $regex: cleanNumber, $options: 'i' } },
                    { whatsappNumbers: { $elemMatch: { $regex: cleanNumber, $options: 'i' } } }
                ]
            },
            { 
                $set: { 
                    "enhancedProfile.completed": true,
                    "enhancedProfile.completedVersion": "v3.0",
                    "metadata.profileCompletedAt": new Date(),
                    "metadata.lastActive": new Date(),
                    "metadata.profileCompletionScore": 100
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            logSuccess('profile_completed', { whatsappNumber });
            return true;
        }
        
        return false;
    } catch (error) {
        logError(error, { operation: 'markProfileCompleted', whatsappNumber });
        return false;
    }
}

// Check if user has minimum profile completion for search
function hasMinimumProfileCompletion(user, minimumPercentage = 70) {
    const completionPercentage = getProfileCompletionPercentage(user);
    return completionPercentage >= minimumPercentage;
}

// Get incomplete profile fields for a user
function getIncompleteFields(user) {
    const enhanced = user.enhancedProfile || {};
    const incomplete = [];
    
    // Required enhanced fields
    const requiredFields = [
        'fullName', 'gender', 'professionalRole', 'dateOfBirth', 
        'country', 'city', 'state', 'phone', 'domain'
    ];
    
    requiredFields.forEach(field => {
        if (!enhanced[field] || enhanced[field] === '') {
            incomplete.push(field);
        }
    });
    
    // Check LinkedIn (required)
    if (!enhanced.linkedin || enhanced.linkedin === '') {
        incomplete.push('linkedin');
    }
    
    // Check arrays
    if (!enhanced.yatraImpact || !Array.isArray(enhanced.yatraImpact) || 
        enhanced.yatraImpact.length === 0) {
        incomplete.push('yatraImpact');
    }
    
    if (!enhanced.communityAsks || !Array.isArray(enhanced.communityAsks) || 
        enhanced.communityAsks.length !== 3) {
        incomplete.push('communityAsks');
    }
    
    if (!enhanced.communityGives || !Array.isArray(enhanced.communityGives) || 
        enhanced.communityGives.length === 0) {
        incomplete.push('communityGives');
    }
    
    return incomplete;
}

// Link additional email to user account
async function linkAdditionalEmail(whatsappNumber, newEmail) {
    try {
        const db = getDatabase();
        const cleanNumber = whatsappNumber.replace(/[^\d]/g, '');
        const normalizedEmail = newEmail.toLowerCase().trim();
        
        // Check if email is already linked to another user
        const existingUser = await findUserByEmail(normalizedEmail);
        if (existingUser) {
            const existingUserNumbers = existingUser.whatsappNumbers || [existingUser.whatsappNumber].filter(Boolean) || [];
            const isCurrentUser = existingUserNumbers.some(num => 
                num && num.replace(/[^\d]/g, '') === cleanNumber
            );
            
            if (!isCurrentUser) {
                return { success: false, error: 'Email already linked to another account' };
            }
        }
        
        const result = await db.collection('users').updateOne(
            { 
                $or: [
                    { whatsappNumber: { $regex: cleanNumber, $options: 'i' } },
                    { whatsappNumbers: { $elemMatch: { $regex: cleanNumber, $options: 'i' } } }
                ]
            },
            { 
                $addToSet: { "basicProfile.linkedEmails": normalizedEmail },
                $set: {
                    "metadata.updatedAt": new Date(),
                    "metadata.lastActive": new Date()
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            logSuccess('additional_email_linked', { whatsappNumber, newEmail: normalizedEmail });
            return { success: true, message: 'Additional email linked successfully' };
        }
        
        return { success: false, error: 'Failed to link additional email' };
        
    } catch (error) {
        logError(error, { operation: 'linkAdditionalEmail', whatsappNumber, newEmail });
        return { success: false, error: 'Database error occurred while linking email' };
    }
}

// Get user profile completion percentage
function getProfileCompletionPercentage(user) {
    const incompleteFields = getIncompleteFields(user);
    const totalFields = 15; // Total required fields in enhanced profile
    const completedFields = totalFields - incompleteFields.length;
    
    return Math.round((completedFields / totalFields) * 100);
}

module.exports = {
    ENHANCED_PROFILE_FIELDS,
    findUserByWhatsAppNumber,
    findUserByEmail,
    linkWhatsAppToUser,
    updateUserProfile,
    markProfileCompleted,
    getIncompleteFields,
    linkAdditionalEmail,
    getProfileCompletionPercentage,
    hasMinimumProfileCompletion
};