// Comprehensive validation utilities for JY Alumni Bot enhanced profile system
// Provides AI-powered validation for all profile fields with smart error handling

const OpenAI = require('openai');
const { getConfig } = require('../config/environment');
const { logError, logAIOperation } = require('../middleware/logging');

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
    console.warn('⚠️ OpenAI not initialized for validation');
}

// Basic input sanitization
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, 1000).replace(/[<>]/g, '');
}

// Enhanced email validation
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const cleanEmail = sanitizeInput(email);
    
    if (!emailRegex.test(cleanEmail)) {
        return { valid: false, message: '❌ Please enter a valid email address (example: yourname@domain.com)' };
    }
    
    if (cleanEmail.length > 254) {
        return { valid: false, message: '❌ Email address is too long' };
    }
    
    return { valid: true, value: cleanEmail.toLowerCase() };
}

// WhatsApp number validation
function validateWhatsAppNumber(phone) {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return { valid: false, message: '❌ Phone number must be 10-15 digits' };
    }
    
    return { valid: true, value: cleanPhone };
}

// AI-powered geographic validation
async function validateGeographicInput(input, type = 'city') {
    const cleanInput = sanitizeInput(input);
    
    // Basic validation first
    if (cleanInput.length < 2 || cleanInput.length > 50) {
        return { 
            valid: false, 
            message: `❌ ${type.charAt(0).toUpperCase() + type.slice(1)} must be 2-50 characters` 
        };
    }
    
    if (!/^[a-zA-Z\s\-.']+$/.test(cleanInput)) {
        return { 
            valid: false, 
            message: `❌ ${type.charAt(0).toUpperCase() + type.slice(1)} should only contain letters, spaces, hyphens, and apostrophes` 
        };
    }
    
    // AI validation for geographic names
    if (openai) {
        try {
            const startTime = Date.now();
            
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini', // Using faster model for validation
                messages: [{
                    role: "system",
                    content: `You are a geographic validation assistant. Validate if the input is a real ${type} name.

Rules:
- Return only "VALID" or "INVALID"
- VALID: Real ${type} names (including alternative spellings)
- INVALID: Names that are clearly not ${type} names (person names, random text, etc.)

Examples:
- Mumbai → VALID
- New York → VALID  
- John Smith → INVALID
- abc123 → INVALID`
                }, {
                    role: "user",
                    content: `Validate this ${type}: "${cleanInput}"`
                }],
                max_tokens: 10,
                temperature: 0.1
            });
            
            const aiResponse = response.choices[0].message.content.trim();
            const duration = Date.now() - startTime;
            
            logAIOperation(`geographic_validation_${type}`, response.usage?.total_tokens || 0, 'gpt-4o-mini', duration);
            
            if (aiResponse === 'VALID') {
                return { valid: true, value: cleanInput };
            } else {
                return { 
                    valid: false, 
                    message: `❌ "${cleanInput}" doesn't appear to be a valid ${type} name. Please enter a real ${type} name.` 
                };
            }
            
        } catch (error) {
            logError(error, { operation: 'ai_geographic_validation', input: cleanInput, type });
            // Fallback to basic validation if AI fails
            return { valid: true, value: cleanInput };
        }
    }
    
    // Fallback validation without AI
    return { valid: true, value: cleanInput };
}

// Name validation (characters only)
function validateFullName(name) {
    const cleanName = sanitizeInput(name);
    
    if (cleanName.length < 2 || cleanName.length > 100) {
        return { valid: false, message: '❌ Name should be 2-100 characters long' };
    }
    
    if (!/^[a-zA-Z\s\-.']+$/.test(cleanName)) {
        return { valid: false, message: '❌ Name should only contain letters, spaces, hyphens, and apostrophes' };
    }
    
    // Check for repeated characters (likely not a real name)
    if (/(.)\1{4,}/.test(cleanName)) {
        return { valid: false, message: '❌ Please enter your real name' };
    }
    
    return { valid: true, value: cleanName };
}

// Date of birth validation
function validateDateOfBirth(dateStr) {
    const cleanDate = sanitizeInput(dateStr);
    const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
    
    if (!dateRegex.test(cleanDate)) {
        return { 
            valid: false, 
            message: '❌ Please enter date in DD-MM-YYYY format\nExample: 15-08-1995' 
        };
    }
    
    const [, day, month, year] = cleanDate.match(dateRegex);
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    // Basic range validation
    if (yearNum < 1960 || yearNum > 2010) {
        return { valid: false, message: '❌ Birth year must be between 1960-2010' };
    }
    
    if (monthNum < 1 || monthNum > 12) {
        return { valid: false, message: '❌ Month must be between 01-12' };
    }
    
    if (dayNum < 1 || dayNum > 31) {
        return { valid: false, message: '❌ Day must be between 01-31' };
    }
    
    // Check if date is valid
    const testDate = new Date(yearNum, monthNum - 1, dayNum);
    if (testDate.getFullYear() !== yearNum || 
        testDate.getMonth() !== monthNum - 1 || 
        testDate.getDate() !== dayNum) {
        return { valid: false, message: '❌ Please enter a valid date' };
    }
    
    return { valid: true, value: cleanDate };
}

// Phone number validation with country code
function validatePhoneNumber(phone) {
    const cleanPhone = sanitizeInput(phone);
    
    // Remove all non-digit characters for validation
    const digitsOnly = cleanPhone.replace(/[^\d]/g, '');
    
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        return { 
            valid: false, 
            message: '❌ Phone number must be 10-15 digits\nExample: +91 9876543210 or 919876543210' 
        };
    }
    
    // Check if it starts with country code
    if (digitsOnly.length >= 12 && !digitsOnly.startsWith('91')) {
        return { 
            valid: false, 
            message: '❌ Please include country code\nExample: +91 9876543210' 
        };
    }
    
    return { valid: true, value: cleanPhone };
}

// LinkedIn URL validation
function validateLinkedInURL(url) {
    const cleanURL = sanitizeInput(url);
    
    if (!cleanURL.toLowerCase().includes('linkedin.com')) {
        return { 
            valid: false, 
            message: '❌ Please enter a valid LinkedIn URL\nExample: https://linkedin.com/in/yourprofile' 
        };
    }
    
    try {
        new URL(cleanURL);
    } catch {
        return { 
            valid: false, 
            message: '❌ Please enter a complete LinkedIn URL\nExample: https://linkedin.com/in/yourprofile' 
        };
    }
    
    return { valid: true, value: cleanURL };
}

// Instagram URL validation (optional)
function validateInstagramURL(url) {
    const cleanURL = sanitizeInput(url);
    
    if (!cleanURL.toLowerCase().includes('instagram.com')) {
        return { 
            valid: false, 
            message: '❌ Please enter a valid Instagram URL\nExample: https://instagram.com/yourprofile' 
        };
    }
    
    try {
        new URL(cleanURL);
    } catch {
        return { 
            valid: false, 
            message: '❌ Please enter a complete Instagram URL\nExample: https://instagram.com/yourprofile' 
        };
    }
    
    return { valid: true, value: cleanURL };
}

// Multiple choice validation
function validateMultipleChoice(input, options, minSelections = 1, maxSelections = null) {
    const cleanInput = sanitizeInput(input);
    const numbers = cleanInput.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    
    if (numbers.length < minSelections) {
        return { 
            valid: false, 
            message: `❌ Please select at least ${minSelections} option${minSelections > 1 ? 's' : ''}\nExample: 1,3,5` 
        };
    }
    
    if (maxSelections && numbers.length > maxSelections) {
        return { 
            valid: false, 
            message: `❌ Please select maximum ${maxSelections} option${maxSelections > 1 ? 's' : ''}\nExample: 1,3` 
        };
    }
    
    // Check if all numbers are valid options
    const invalidNumbers = numbers.filter(n => n < 1 || n > options.length);
    if (invalidNumbers.length > 0) {
        return { 
            valid: false, 
            message: `❌ Invalid option${invalidNumbers.length > 1 ? 's' : ''}: ${invalidNumbers.join(', ')}\nPlease choose from 1-${options.length}` 
        };
    }
    
    const selectedOptions = numbers.map(n => options[n - 1]);
    return { valid: true, value: selectedOptions, numbers: numbers };
}

// Gender validation
function validateGender(input) {
    const cleanInput = sanitizeInput(input);
    const genderMap = {
        '1': 'Male',
        '2': 'Female', 
        '3': 'Others'
    };
    
    if (!genderMap[cleanInput]) {
        return { 
            valid: false, 
            message: '❌ Please select 1, 2, or 3\n1️⃣ Male\n2️⃣ Female\n3️⃣ Others' 
        };
    }
    
    return { valid: true, value: genderMap[cleanInput] };
}

// Yes/No validation
function validateYesNo(input) {
    const cleanInput = sanitizeInput(input).toLowerCase();
    
    if (cleanInput === 'yes' || cleanInput === 'y' || cleanInput === '1') {
        return { valid: true, value: true };
    } else if (cleanInput === 'no' || cleanInput === 'n' || cleanInput === '2') {
        return { valid: true, value: false };
    }
    
    return { 
        valid: false, 
        message: '❌ Please reply with:\n• YES or NO\n• Y or N\n• 1 or 2' 
    };
}

module.exports = {
    sanitizeInput,
    validateEmail,
    validateWhatsAppNumber,
    validateGeographicInput,
    validateFullName,
    validateDateOfBirth,
    validatePhoneNumber,
    validateLinkedInURL,
    validateInstagramURL,
    validateMultipleChoice,
    validateGender,
    validateYesNo
};