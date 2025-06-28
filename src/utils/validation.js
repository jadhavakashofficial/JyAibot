// Comprehensive validation utilities for JY Alumni Bot enhanced profile system
// File: src/utils/validation.js
// COMPLETE REPLACEMENT - Enhanced with strict AI-powered validation and worldwide geographic data

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

// Comprehensive worldwide geographic database for validation
const GEOGRAPHIC_DATABASE = {
    // Major countries worldwide
    countries: [
        'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
        'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Cambodia',
        'Cameroon', 'Canada', 'Chile', 'China', 'Colombia', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark',
        'Ecuador', 'Egypt', 'Estonia', 'Ethiopia', 'Finland', 'France', 'Georgia', 'Germany', 'Ghana', 'Greece',
        'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Japan',
        'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Latvia', 'Lebanon', 'Lithuania', 'Malaysia', 'Mexico', 'Morocco',
        'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Pakistan', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania',
        'Russia', 'Saudi Arabia', 'Singapore', 'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland',
        'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Vietnam', 'Zimbabwe'
    ],
    
    // Major cities worldwide
    cities: [
        // India
        'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Surat', 'Jaipur',
        'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna',
        'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivali',
        'Vasai-Virar', 'Varanasi', 'Srinagar', 'Dhanbad', 'Jodhpur', 'Amritsar', 'Raipur', 'Allahabad', 'Coimbatore',
        
        // USA
        'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas',
        'San Jose', 'Austin', 'Jacksonville', 'San Francisco', 'Columbus', 'Charlotte', 'Fort Worth', 'Indianapolis',
        'Seattle', 'Denver', 'Washington', 'Boston', 'El Paso', 'Nashville', 'Detroit', 'Oklahoma City', 'Portland',
        'Las Vegas', 'Memphis', 'Louisville', 'Baltimore', 'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Sacramento',
        
        // International
        'London', 'Paris', 'Tokyo', 'Sydney', 'Toronto', 'Singapore', 'Dubai', 'Hong Kong', 'Berlin', 'Madrid',
        'Rome', 'Amsterdam', 'Stockholm', 'Copenhagen', 'Oslo', 'Helsinki', 'Zurich', 'Geneva', 'Vienna', 'Brussels',
        'Dublin', 'Edinburgh', 'Barcelona', 'Milan', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne', 'Stuttgart',
        'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Winnipeg', 'Quebec City', 'Melbourne', 'Brisbane', 'Perth',
        'Adelaide', 'Auckland', 'Wellington', 'Christchurch', 'Seoul', 'Busan', 'Bangkok', 'Manila', 'Jakarta',
        'Kuala Lumpur', 'Ho Chi Minh City', 'Hanoi', 'Taipei', 'Shanghai', 'Beijing', 'Guangzhou', 'Shenzhen'
    ],
    
    // States/Provinces worldwide
    states: [
        // India
        'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
        'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
        'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
        'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
        
        // USA
        'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida',
        'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
        'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska',
        'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
        'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
        'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
        
        // Canada
        'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories',
        'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon',
        
        // Australia
        'New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia', 'Tasmania',
        'Australian Capital Territory', 'Northern Territory',
        
        // Other major regions
        'England', 'Scotland', 'Wales', 'Northern Ireland', 'Bavaria', 'North Rhine-Westphalia', 'Baden-Württemberg'
    ]
};

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
        return { 
            valid: false, 
            message: '❌ **Invalid Email Format**\n\nPlease enter a valid email address.\n\n**Examples:**\n• yourname@gmail.com\n• john.smith@company.com\n• user123@domain.co.in' 
        };
    }
    
    if (cleanEmail.length > 254) {
        return { 
            valid: false, 
            message: '❌ **Email Too Long**\n\nEmail address is too long (max 254 characters).' 
        };
    }
    
    return { valid: true, value: cleanEmail.toLowerCase() };
}

// WhatsApp number validation
function validateWhatsAppNumber(phone) {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return { 
            valid: false, 
            message: '❌ **Invalid Phone Length**\n\nPhone number must be 10-15 digits.\n\n**Example:** +91 9876543210' 
        };
    }
    
    return { valid: true, value: cleanPhone };
}

// Enhanced AI-powered geographic validation with strict checking
async function validateGeographicInput(input, type = 'city') {
    const cleanInput = sanitizeInput(input);
    
    // Basic validation first
    if (cleanInput.length < 2 || cleanInput.length > 50) {
        return { 
            valid: false, 
            message: `❌ **Invalid ${type.charAt(0).toUpperCase() + type.slice(1)} Length**

${type.charAt(0).toUpperCase() + type.slice(1)} must be 2-50 characters long.

**Examples:**
${getExamplesForType(type)}` 
        };
    }
    
    if (!/^[a-zA-Z\s\-.'()]+$/.test(cleanInput)) {
        return { 
            valid: false, 
            message: `❌ **Invalid Characters**

${type.charAt(0).toUpperCase() + type.slice(1)} should only contain:
• Letters (a-z, A-Z)
• Spaces
• Hyphens (-)
• Apostrophes (')
• Parentheses ()

**Examples:**
${getExamplesForType(type)}` 
        };
    }
    
    // Check against known database first (quick validation)
    const knownEntries = GEOGRAPHIC_DATABASE[type === 'country' ? 'countries' : type === 'state' ? 'states' : 'cities'];
    const isKnown = knownEntries.some(entry => 
        entry.toLowerCase() === cleanInput.toLowerCase() ||
        entry.toLowerCase().includes(cleanInput.toLowerCase()) ||
        cleanInput.toLowerCase().includes(entry.toLowerCase())
    );
    
    if (isKnown) {
        return { valid: true, value: cleanInput };
    }
    
    // AI validation for unknown entries (strict checking)
    if (openai) {
        try {
            const startTime = Date.now();
            
            const response = await openai.chat.completions.create({
                model: 'gpt-4o', // Use more powerful model for better accuracy
                messages: [{
                    role: "system",
                    content: `You are a strict geographic validation expert with access to comprehensive worldwide geographic data.

Your job is to validate if the input is a REAL, EXISTING ${type} name from anywhere in the world.

STRICT VALIDATION RULES:
- Return "VALID" ONLY for real, existing ${type} names
- Return "INVALID" for anything that is NOT a real ${type}

INVALID examples:
- Person names (John, Smith, etc.)
- Random text (abc, 123, test, etc.) 
- Company names
- Non-geographic terms
- Misspellings that are too far from real names
- Fictional places

VALID examples:
- Real ${type} names from any country
- Alternative spellings if they're commonly used
- Historical names if still in use
- ${type} names in local languages if real

Be STRICT but fair. When in doubt about borderline cases, prefer INVALID to maintain data quality.`
                }, {
                    role: "user",
                    content: `Validate this ${type}: "${cleanInput}"`
                }],
                max_tokens: 20,
                temperature: 0.1
            });
            
            const aiResponse = response.choices[0].message.content.trim().toUpperCase();
            const duration = Date.now() - startTime;
            
            logAIOperation(`strict_geographic_validation_${type}`, response.usage?.total_tokens || 0, 'gpt-4o', duration);
            
            if (aiResponse === 'VALID') {
                return { valid: true, value: cleanInput };
            } else {
                return { 
                    valid: false, 
                    message: `❌ **"${cleanInput}" is not a valid ${type}**

Please enter a real ${type} name.

**Examples:**
${getExamplesForType(type)}

**Tips:**
• Check spelling carefully
• Use official ${type} names
• Avoid abbreviations` 
                };
            }
            
        } catch (error) {
            logError(error, { operation: 'ai_strict_geographic_validation', input: cleanInput, type });
            
            // Fallback: Check if it looks like a person name or obvious invalid input
            if (isProbablyPersonName(cleanInput) || isProbablyInvalid(cleanInput)) {
                return { 
                    valid: false, 
                    message: `❌ **"${cleanInput}" doesn't appear to be a ${type}**

Please enter a real ${type} name.

**Examples:**
${getExamplesForType(type)}` 
                };
            }
            
            // If AI fails and it passes basic checks, allow it but warn
            return { 
                valid: true, 
                value: cleanInput,
                warning: `⚠️ Unable to verify "${cleanInput}" - please ensure it's correct`
            };
        }
    }
    
    // Fallback validation without AI (more conservative)
    if (isProbablyPersonName(cleanInput) || isProbablyInvalid(cleanInput)) {
        return { 
            valid: false, 
            message: `❌ **"${cleanInput}" doesn't appear to be a valid ${type}**

Please enter a real ${type} name.

**Examples:**
${getExamplesForType(type)}` 
        };
    }
    
    return { valid: true, value: cleanInput };
}

// Enhanced name validation with better error messages
function validateFullName(name) {
    const cleanName = sanitizeInput(name);
    
    if (cleanName.length < 2 || cleanName.length > 100) {
        return { 
            valid: false, 
            message: '❌ **Invalid Name Length**\n\nName should be 2-100 characters long.\n\n**Example:** Rajesh Kumar Singh' 
        };
    }
    
    if (!/^[a-zA-Z\s\-.']+$/.test(cleanName)) {
        return { 
            valid: false, 
            message: '❌ **Invalid Characters**\n\nName should only contain:\n• Letters (a-z, A-Z)\n• Spaces\n• Hyphens (-)\n• Apostrophes (\')\n\n**Example:** Mary O\'Connor-Smith' 
        };
    }
    
    // Check for repeated characters (likely not a real name)
    if (/(.)\1{4,}/.test(cleanName)) {
        return { 
            valid: false, 
            message: '❌ **Invalid Name Pattern**\n\nPlease enter your real name.\n\n**Example:** Rajesh Kumar Singh' 
        };
    }
    
    // Check for obviously fake names
    if (/^(test|example|sample|dummy|user)/i.test(cleanName)) {
        return { 
            valid: false, 
            message: '❌ **Please Enter Real Name**\n\nTest names are not allowed.\n\n**Example:** Your actual full name' 
        };
    }
    
    return { valid: true, value: cleanName };
}

// Enhanced date of birth validation with better error messages
function validateDateOfBirth(dateStr) {
    const cleanDate = sanitizeInput(dateStr);
    const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
    
    if (!dateRegex.test(cleanDate)) {
        return { 
            valid: false, 
            message: '❌ **Invalid Date Format**\n\nRequired format: DD-MM-YYYY\n\n**Examples:**\n• 15-08-1995\n• 03-12-1988\n• 25-06-1992' 
        };
    }
    
    const [, day, month, year] = cleanDate.match(dateRegex);
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    // Basic range validation
    if (yearNum < 1960 || yearNum > 2010) {
        return { 
            valid: false, 
            message: '❌ **Invalid Birth Year**\n\nYear must be between 1960-2010\n\n**Example:** 15-08-1995' 
        };
    }
    
    if (monthNum < 1 || monthNum > 12) {
        return { 
            valid: false, 
            message: '❌ **Invalid Month**\n\nMonth must be between 01-12\n\n**Examples:**\n• 15-01-1995 (January)\n• 15-12-1995 (December)' 
        };
    }
    
    if (dayNum < 1 || dayNum > 31) {
        return { 
            valid: false, 
            message: '❌ **Invalid Day**\n\nDay must be between 01-31\n\n**Examples:**\n• 01-08-1995\n• 31-12-1995' 
        };
    }
    
    // Check if date is valid
    const testDate = new Date(yearNum, monthNum - 1, dayNum);
    if (testDate.getFullYear() !== yearNum || 
        testDate.getMonth() !== monthNum - 1 || 
        testDate.getDate() !== dayNum) {
        return { 
            valid: false, 
            message: '❌ **Invalid Date**\n\nThis date doesn\'t exist.\n\n**Examples of valid dates:**\n• 28-02-1995 (Feb 28)\n• 29-02-1996 (Leap year)\n• 30-04-1995 (Apr 30)' 
        };
    }
    
    return { valid: true, value: cleanDate };
}

// Enhanced phone number validation with better international support
function validatePhoneNumber(phone) {
    const cleanPhone = sanitizeInput(phone);
    
    // Remove all non-digit characters for validation
    const digitsOnly = cleanPhone.replace(/[^\d]/g, '');
    
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        return { 
            valid: false, 
            message: '❌ **Invalid Phone Number Length**\n\nPhone number must be 10-15 digits\n\n**Examples:**\n• +91 9876543210 (India)\n• +1 2025551234 (USA)\n• +44 7911123456 (UK)' 
        };
    }
    
    // Check for valid country codes (major ones)
    const validCountryCodes = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '684', '685', '686', '687', '688', '689', '690', '691', '692', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998'];
    
    // For numbers longer than 10 digits, check if they start with a valid country code
    if (digitsOnly.length > 10) {
        const possibleCountryCode1 = digitsOnly.substring(0, 1);
        const possibleCountryCode2 = digitsOnly.substring(0, 2);
        const possibleCountryCode3 = digitsOnly.substring(0, 3);
        
        if (!validCountryCodes.includes(possibleCountryCode1) && 
            !validCountryCodes.includes(possibleCountryCode2) && 
            !validCountryCodes.includes(possibleCountryCode3)) {
            return { 
                valid: false, 
                message: '❌ **Invalid Country Code**\n\nPlease include a valid country code.\n\n**Examples:**\n• +91 9876543210 (India)\n• +1 2025551234 (USA)\n• +44 7911123456 (UK)\n• +61 412345678 (Australia)' 
            };
        }
    }
    
    return { valid: true, value: cleanPhone };
}

// Enhanced LinkedIn URL validation
function validateLinkedInURL(url) {
    const cleanURL = sanitizeInput(url);
    
    if (!cleanURL.toLowerCase().includes('linkedin.com')) {
        return { 
            valid: false, 
            message: '❌ **Not a LinkedIn URL**\n\nPlease enter a valid LinkedIn profile URL.\n\n**Examples:**\n• https://linkedin.com/in/yourname\n• https://www.linkedin.com/in/john-smith-123' 
        };
    }
    
    try {
        const urlObj = new URL(cleanURL);
        
        if (!urlObj.hostname.includes('linkedin.com')) {
            return { 
                valid: false, 
                message: '❌ **Invalid LinkedIn Domain**\n\nURL must be from linkedin.com\n\n**Example:** https://linkedin.com/in/yourprofile' 
            };
        }
        
        if (!urlObj.pathname.includes('/in/')) {
            return { 
                valid: false, 
                message: '❌ **Invalid LinkedIn Profile URL**\n\nPlease use your LinkedIn profile URL.\n\n**Examples:**\n• https://linkedin.com/in/yourname\n• https://www.linkedin.com/in/john-smith-123' 
            };
        }
        
    } catch {
        return { 
            valid: false, 
            message: '❌ **Invalid URL Format**\n\nPlease enter a complete LinkedIn URL.\n\n**Examples:**\n• https://linkedin.com/in/yourname\n• https://www.linkedin.com/in/john-smith-123\n\n**Tips:**\n• Copy the URL from your LinkedIn profile\n• Make sure it starts with https://' 
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
            message: '❌ **Not an Instagram URL**\n\nPlease enter a valid Instagram profile URL.\n\n**Examples:**\n• https://instagram.com/yourprofile\n• https://www.instagram.com/username' 
        };
    }
    
    try {
        const urlObj = new URL(cleanURL);
        
        if (!urlObj.hostname.includes('instagram.com')) {
            return { 
                valid: false, 
                message: '❌ **Invalid Instagram Domain**\n\nURL must be from instagram.com\n\n**Example:** https://instagram.com/yourprofile' 
            };
        }
        
    } catch {
        return { 
            valid: false, 
            message: '❌ **Invalid URL Format**\n\nPlease enter a complete Instagram URL.\n\n**Examples:**\n• https://instagram.com/yourprofile\n• https://www.instagram.com/username\n\n**Tips:**\n• Copy the URL from your Instagram profile\n• Make sure it starts with https://' 
        };
    }
    
    return { valid: true, value: cleanURL };
}

// Enhanced multiple choice validation with better error messages
function validateMultipleChoice(input, options, minSelections = 1, maxSelections = null) {
    const cleanInput = sanitizeInput(input);
    
    if (!cleanInput || cleanInput.trim() === '') {
        return { 
            valid: false, 
            message: `❌ **No Selection Made**\n\nPlease select ${minSelections === maxSelections ? 'exactly' : 'at least'} ${minSelections} option${minSelections > 1 ? 's' : ''}.\n\n**Format:** 1,3,5 (numbers separated by commas)` 
        };
    }
    
    const numbers = cleanInput.split(',')
        .map(n => parseInt(n.trim()))
        .filter(n => !isNaN(n));
    
    if (numbers.length === 0) {
        return { 
            valid: false, 
            message: `❌ **Invalid Format**\n\nPlease use numbers separated by commas.\n\n**Examples:**\n• Single: 3\n• Multiple: 1,4,7\n• Range: 2,5,8,10` 
        };
    }
    
    if (numbers.length < minSelections) {
        return { 
            valid: false, 
            message: `❌ **Too Few Selections**\n\nPlease select ${minSelections === maxSelections ? 'exactly' : 'at least'} ${minSelections} option${minSelections > 1 ? 's' : ''}.\n\nYou selected: ${numbers.length}\nRequired: ${minSelections}${maxSelections ? ` to ${maxSelections}` : '+'}\n\n**Example:** ${Array.from({length: minSelections}, (_, i) => i + 1).join(',')}` 
        };
    }
    
    if (maxSelections && numbers.length > maxSelections) {
        return { 
            valid: false, 
            message: `❌ **Too Many Selections**\n\nPlease select maximum ${maxSelections} option${maxSelections > 1 ? 's' : ''}.\n\nYou selected: ${numbers.length}\nMaximum allowed: ${maxSelections}\n\n**Example:** ${Array.from({length: maxSelections}, (_, i) => i + 1).join(',')}` 
        };
    }
    
    // Check for duplicates
    const uniqueNumbers = [...new Set(numbers)];
    if (uniqueNumbers.length !== numbers.length) {
        return { 
            valid: false, 
            message: `❌ **Duplicate Selections**\n\nPlease don't repeat the same option.\n\n**Example:** 1,3,5 (not 1,1,3,5)` 
        };
    }
    
    // Check if all numbers are valid options
    const invalidNumbers = numbers.filter(n => n < 1 || n > options.length);
    if (invalidNumbers.length > 0) {
        return { 
            valid: false, 
            message: `❌ **Invalid Option${invalidNumbers.length > 1 ? 's' : ''}**\n\nInvalid: ${invalidNumbers.join(', ')}\nValid range: 1 to ${options.length}\n\n**Available options:** 1, 2, 3, ..., ${options.length}` 
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
            message: '❌ **Invalid Selection**\n\nPlease select 1, 2, or 3:\n\n1️⃣ Male\n2️⃣ Female\n3️⃣ Others' 
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
        message: '❌ **Invalid Response**\n\nPlease reply with:\n• YES or NO\n• Y or N\n• 1 or 2' 
    };
}

// Helper function to detect person names
function isProbablyPersonName(input) {
    const personNamePatterns = [
        /^[A-Z][a-z]+ [A-Z][a-z]+$/, // FirstName LastName
        /^[A-Z][a-z]+ [A-Z]\.$/, // FirstName L.
        /^Mr\.?\s|Ms\.?\s|Mrs\.?\s|Dr\.?\s/, // Titles
    ];
    
    const commonFirstNames = [
        'john', 'jane', 'michael', 'sarah', 'david', 'lisa', 'robert', 'mary',
        'james', 'patricia', 'william', 'jennifer', 'richard', 'elizabeth',
        'raj', 'priya', 'amit', 'neha', 'rohit', 'kavya', 'arun', 'meera',
        'rahul', 'anjali', 'vikram', 'pooja', 'suresh', 'deepika', 'ravi', 'anita'
    ];
    
    const words = input.toLowerCase().split(' ');
    
    return personNamePatterns.some(pattern => pattern.test(input)) ||
           commonFirstNames.some(name => words.includes(name));
}

// Helper function to detect obviously invalid input
function isProbablyInvalid(input) {
    const invalidPatterns = [
        /^(test|example|sample|dummy)$/i,
        /^[0-9]+$/, // Only numbers
        /^[^a-zA-Z]*$/, // No letters
        /^.{1}$/, // Single character
        /^(na|n\/a|nil|none|null)$/i,
        /^(abc|xyz|def)$/i,
        /^(asdf|qwerty|1234)$/i
    ];
    
    return invalidPatterns.some(pattern => pattern.test(input.trim()));
}

// Helper function to get examples for each type
function getExamplesForType(type) {
    const examples = {
        city: '• Mumbai, Delhi, New York\n• London, Tokyo, Sydney\n• Paris, Toronto, Singapore',
        state: '• Maharashtra, California, Ontario\n• New York, Queensland, Bavaria\n• Texas, Victoria, Quebec',
        country: '• India, United States, Canada\n• United Kingdom, Australia, Germany\n• France, Japan, Brazil'
    };
    
    return examples[type] || 'Please use a real geographic name';
}

// Helper function to get single example for type
function getExampleForType(type) {
    const examples = {
        city: 'Mumbai',
        state: 'Maharashtra', 
        country: 'India'
    };
    
    return examples[type] || 'Valid name';
}

// Enhanced validation for specific field combinations
function validateFieldCombination(fields) {
    const errors = [];
    const warnings = [];
    
    // Location consistency check
    if (fields.city && fields.state && fields.country) {
        // India-specific validation
        if (fields.country.toLowerCase() === 'india') {
            const indianStates = GEOGRAPHIC_DATABASE.states.slice(0, 29); // First 29 are Indian states
            const isValidIndianState = indianStates.some(state => 
                state.toLowerCase() === fields.state.toLowerCase()
            );
            
            if (!isValidIndianState) {
                warnings.push(`"${fields.state}" may not be a valid Indian state`);
            }
        }
        
        // USA-specific validation
        if (fields.country.toLowerCase().includes('united states') || fields.country.toLowerCase() === 'usa') {
            const usStates = GEOGRAPHIC_DATABASE.states.slice(29, 79); // US states
            const isValidUSState = usStates.some(state => 
                state.toLowerCase() === fields.state.toLowerCase()
            );
            
            if (!isValidUSState) {
                warnings.push(`"${fields.state}" may not be a valid US state`);
            }
        }
    }
    
    // Phone number and country consistency
    if (fields.phone && fields.country) {
        const digitsOnly = fields.phone.replace(/[^\d]/g, '');
        
        if (fields.country.toLowerCase() === 'india' && !digitsOnly.startsWith('91')) {
            warnings.push('Phone number should start with +91 for India');
        }
        
        if ((fields.country.toLowerCase().includes('united states') || fields.country.toLowerCase() === 'usa') && !digitsOnly.startsWith('1')) {
            warnings.push('Phone number should start with +1 for USA');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings
    };
}

// Comprehensive input validation summary
function getValidationSummary(fieldName, input, validationResult) {
    const summary = {
        field: fieldName,
        input: input,
        isValid: validationResult.valid,
        processedValue: validationResult.value || null,
        errorMessage: validationResult.message || null,
        warning: validationResult.warning || null,
        suggestions: [],
        timestamp: new Date().toISOString()
    };
    
    // Add field-specific suggestions
    if (!validationResult.valid) {
        switch (fieldName) {
            case 'city':
            case 'state':
            case 'country':
                summary.suggestions = [
                    'Check spelling carefully',
                    'Use official geographic names',
                    'Avoid abbreviations',
                    'Try alternative spellings'
                ];
                break;
            case 'fullName':
                summary.suggestions = [
                    'Use your real legal name',
                    'Include first and last name',
                    'Only use letters, spaces, hyphens',
                    'Avoid nicknames or usernames'
                ];
                break;
            case 'phone':
                summary.suggestions = [
                    'Include country code',
                    'Use format: +91 9876543210',
                    'Remove spaces and special characters',
                    'Ensure 10-15 digits total'
                ];
                break;
            case 'linkedin':
                summary.suggestions = [
                    'Copy URL from your LinkedIn profile',
                    'Ensure it starts with https://',
                    'Must contain linkedin.com/in/',
                    'Use your public profile URL'
                ];
                break;
            default:
                summary.suggestions = ['Follow the format shown in the example'];
        }
    }
    
    return summary;
}

// Export validation metrics for monitoring
function getValidationMetrics() {
    return {
        supportedFields: [
            'fullName', 'gender', 'dateOfBirth', 'country', 'state', 'city',
            'phone', 'email', 'linkedin', 'instagram', 'professionalRole',
            'domain', 'yatraImpact', 'communityAsks', 'communityGives'
        ],
        geographicDatabase: {
            countries: GEOGRAPHIC_DATABASE.countries.length,
            cities: GEOGRAPHIC_DATABASE.cities.length,
            states: GEOGRAPHIC_DATABASE.states.length
        },
        aiValidationEnabled: !!openai,
        validationFeatures: [
            'AI-powered geographic validation',
            'Person name detection',
            'Invalid input detection',
            'Country-specific phone validation',
            'LinkedIn URL format validation',
            'Multiple choice validation',
            'Date format validation',
            'Email format validation'
        ]
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
    validateYesNo,
    isProbablyPersonName,
    isProbablyInvalid,
    getExamplesForType,
    getExampleForType,
    validateFieldCombination,
    getValidationSummary,
    getValidationMetrics,
    GEOGRAPHIC_DATABASE
};