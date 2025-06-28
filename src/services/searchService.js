// Comprehensive alumni search service with AI-powered relevance scoring
// Handles keyword extraction, database queries, and intelligent result ranking for JY Alumni Bot

const OpenAI = require('openai');
const { getDatabase } = require('../config/database');
const { getConfig } = require('../config/environment');
const { logError, logSuccess, logAIOperation } = require('../middleware/logging');
const { sanitizeInput } = require('../utils/validation');
const { logUserQuery } = require('./analyticsService');

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
    console.warn('⚠️ OpenAI not initialized for search service');
}

// Enhanced search keywords for better matching
const SEARCH_ENHANCEMENT_MAP = {
    'web dev': 'web development frontend backend javascript react nodejs',
    'web development': 'web development frontend backend javascript react nodejs',
    'devops': 'devops development operations infrastructure deployment automation cloud',
    'react': 'react javascript frontend development programming web ui',
    'marketing': 'marketing advertising digital promotion branding social media',
    'fintech': 'fintech financial technology banking payments digital finance',
    'healthtech': 'healthtech healthcare medical technology digital health',
    'edtech': 'edtech education technology learning digital education',
    'agritech': 'agritech agriculture technology farming digital agriculture',
    'startup': 'startup entrepreneur business founder venture',
    'ai': 'artificial intelligence machine learning data science AI ML',
    'blockchain': 'blockchain cryptocurrency crypto distributed ledger',
    'mobile': 'mobile app android ios flutter react native',
    'design': 'design UI UX user interface user experience graphic',
    'sales': 'sales business development customer acquisition revenue',
    'hr': 'human resources talent management recruitment hiring',
    'legal': 'legal compliance law regulatory corporate legal',
    'consulting': 'consulting advisory strategy business consulting',
    'finance': 'finance accounting financial analysis investment banking'
};

// Main comprehensive alumni search function
async function comprehensiveAlumniSearch(query, userWhatsApp = null) {
    try {
        const db = getDatabase();
        if (!db) {
            return generateErrorResponse('database_unavailable');
        }
        
        const sanitizedQuery = sanitizeInput(query);
        console.log(`🔍 Starting comprehensive search for: "${sanitizedQuery}"`);
        
        // Step 1: AI-powered keyword extraction
        const keywords = await extractSearchKeywords(sanitizedQuery);
        
        // Step 2: Database search with enhanced queries
        const searchResults = await performDatabaseSearch(keywords, userWhatsApp);
        
        if (searchResults.length === 0) {
            return generateNoResultsResponse(sanitizedQuery);
        }
        
        // Step 3: AI-powered relevance scoring and selection
        const topResults = await selectTopResults(searchResults, sanitizedQuery, keywords);
        
        // Step 4: Generate formatted response
        const response = await generateSearchResponse(topResults, sanitizedQuery, searchResults.length);
        
        // Step 5: Log search for analytics
        await logUserQuery(userWhatsApp, sanitizedQuery, 'alumni_search', searchResults.length, topResults.length);
        
        return response;
        
    } catch (error) {
        logError(error, { operation: 'comprehensiveAlumniSearch', query });
        await logUserQuery(userWhatsApp, query, 'search_error', 0, 0);
        return generateErrorResponse('search_failed');
    }
}

// AI-powered keyword extraction with fallback
async function extractSearchKeywords(query) {
    try {
        const config = getConfig();
        
        // Try AI extraction first
        if (openai) {
            const startTime = Date.now();
            
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini', // Use faster model for keyword extraction
                messages: [{
                    role: "system",
                    content: `Extract relevant search keywords from user queries for professional alumni networking.

Rules:
- Return 8-12 keywords/phrases that help find relevant professionals
- Include synonyms, related terms, and domain-specific language
- Focus on skills, roles, industries, and expertise areas
- Return as JSON array of strings only, no other text or formatting

Examples:
"web development help" → ["web development", "frontend", "backend", "javascript", "react", "nodejs", "programming", "developer", "software", "coding"]
"marketing expert" → ["marketing", "digital marketing", "advertising", "branding", "social media", "growth", "strategy", "promotion", "campaigns", "expert"]`
                }, {
                    role: "user",
                    content: `Extract keywords from: "${query}"`
                }],
                max_tokens: 300,
                temperature: 0.3
            });
            
            let aiResponse = response.choices[0].message.content.trim();
            
            // Clean up response - remove markdown code blocks if present  
            aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').replace(/`/g, '');
            
            const aiKeywords = JSON.parse(aiResponse);
            const duration = Date.now() - startTime;
            
            logAIOperation('keyword_extraction', response.usage?.total_tokens || 0, 'gpt-4o-mini', duration);
            
            if (Array.isArray(aiKeywords) && aiKeywords.length > 0) {
                console.log(`🎯 AI extracted keywords: ${aiKeywords.join(', ')}`);
                return aiKeywords;
            }
        }
        
        // Fallback to rule-based extraction
        return extractKeywordsFallback(query);
        
    } catch (error) {
        logError(error, { operation: 'extractSearchKeywords', query });
        return extractKeywordsFallback(query);
    }
}

// Fallback keyword extraction using predefined mappings
function extractKeywordsFallback(query) {
    const normalizedQuery = query.toLowerCase();
    let keywords = [];
    
    // Apply search enhancement mappings
    Object.entries(SEARCH_ENHANCEMENT_MAP).forEach(([key, value]) => {
        if (normalizedQuery.includes(key)) {
            keywords.push(...value.split(' '));
        }
    });
    
    // Extract direct keywords from query
    const directKeywords = normalizedQuery
        .replace(/\b(help|need|want|looking|find|search|connect|assistance|support|with|for|in)\b/g, '')
        .split(/[,\s]+/)
        .filter(word => word.length > 2)
        .slice(0, 8);
    
    keywords.push(...directKeywords);
    
    // Remove duplicates and limit
    keywords = [...new Set(keywords)].slice(0, 12);
    
    console.log(`🎯 Fallback extracted keywords: ${keywords.join(', ')}`);
    return keywords;
}

// Enhanced database search with multiple query strategies
async function performDatabaseSearch(keywords, userWhatsApp = null) {
    try {
        const db = getDatabase();
        const regexPattern = keywords.join('|');
        
        // Build search query
        const searchQuery = {
            $and: [
                {
                    $or: [
                        { "basicProfile.about": { $regex: regexPattern, $options: 'i' } },
                        { "basicProfile.name": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.fullName": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.domain": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.professionalRole": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.city": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.state": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.country": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.communityAsks": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.communityGives": { $regex: regexPattern, $options: 'i' } },
                        { "enhancedProfile.yatraImpact": { $regex: regexPattern, $options: 'i' } }
                    ]
                },
                // Exclude the searching user
                ...(userWhatsApp ? [{
                    $and: [
                        { 
                            $or: [
                                { whatsappNumber: { $ne: userWhatsApp } },
                                { whatsappNumber: { $exists: false } }
                            ]
                        },
                        {
                            $or: [
                                { whatsappNumbers: { $not: { $elemMatch: { $regex: userWhatsApp.replace(/[^\d]/g, ''), $options: 'i' } } } },
                                { whatsappNumbers: { $exists: false } }
                            ]
                        }
                    ]
                }] : [])
            ]
        };
        
        // Execute search with projection for efficiency
        const results = await db.collection('users')
            .find(searchQuery, {
                projection: {
                    'basicProfile.name': 1,
                    'basicProfile.email': 1,
                    'basicProfile.about': 1,
                    'basicProfile.linkedin': 1,
                    'enhancedProfile.fullName': 1,
                    'enhancedProfile.domain': 1,
                    'enhancedProfile.professionalRole': 1,
                    'enhancedProfile.city': 1,
                    'enhancedProfile.state': 1,
                    'enhancedProfile.country': 1,
                    'enhancedProfile.linkedin': 1,
                    'enhancedProfile.communityGives': 1,
                    'enhancedProfile.communityAsks': 1,
                    'enhancedProfile.yatraImpact': 1,
                    'metadata.lastActive': 1
                }
            })
            .limit(50) // Limit for performance
            .toArray();
        
        console.log(`📊 Database search completed: ${results.length} matches found`);
        return results;
        
    } catch (error) {
        logError(error, { operation: 'performDatabaseSearch', keywords });
        return [];
    }
}

// AI-powered selection of top results
// AI-powered selection of top results
async function selectTopResults(searchResults, originalQuery, keywords) {
    try {
        const config = getConfig();
        const maxResults = config.bot.maxSearchResults || 6;
        
        if (searchResults.length <= maxResults) {
            return searchResults;
        }
        
        // Use AI for intelligent selection if available
        if (openai && searchResults.length > 0) {
            const startTime = Date.now();
            
            // Prepare profiles for AI analysis (first 15 for token efficiency)
            const profilesForAI = searchResults.slice(0, 15).map(user => ({
                email: user.basicProfile?.email || 'no-email',
                name: user.enhancedProfile?.fullName || user.basicProfile?.name || 'Name not available',
                about: (user.basicProfile?.about || '').substring(0, 150),
                role: user.enhancedProfile?.professionalRole || 'Role not specified',
                domain: user.enhancedProfile?.domain || 'Domain not specified',
                location: `${user.enhancedProfile?.city || ''}, ${user.enhancedProfile?.state || ''}`.replace(', ,', '').trim() || 'Location not specified',
                gives: user.enhancedProfile?.communityGives || [],
                asks: user.enhancedProfile?.communityAsks || []
            }));
            
            const response = await openai.chat.completions.create({
                model: config.ai.model,
                messages: [{
                    role: "system",
                    content: `Select the TOP ${maxResults} MOST RELEVANT alumni profiles for the user's query.

Ranking Criteria:
1. Direct skill/expertise match
2. Professional role relevance
3. Industry domain alignment
4. Geographic relevance (if specified)
5. Community contributions that match needs
6. Profile completeness and activity

Return ONLY a JSON array of the ${maxResults} most relevant profile emails in order of relevance, no other text or formatting:
["email1@example.com", "email2@example.com", ...]`
                }, {
                    role: "user",
                    content: `User query: "${originalQuery}"
Keywords: ${keywords.join(', ')}

Profiles to rank:
${JSON.stringify(profilesForAI, null, 2)}`
                }],
                max_tokens: 300,
                temperature: 0.1
            });
            
            let aiResponse = response.choices[0].message.content.trim();
            
            // Clean up response - remove markdown code blocks if present
            aiResponse = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').replace(/`/g, '');
            
            const selectedEmails = JSON.parse(aiResponse);
            const duration = Date.now() - startTime;
            
            logAIOperation('result_selection', response.usage?.total_tokens || 0, config.ai.model, duration);
            
            if (Array.isArray(selectedEmails)) {
                const topResults = selectedEmails
                    .map(email => searchResults.find(user => user.basicProfile?.email === email))
                    .filter(Boolean)
                    .slice(0, maxResults);
                
                console.log(`🏆 AI selected ${topResults.length} top results`);
                return topResults;
            }
        }
        
        // Fallback to simple scoring
        return selectResultsFallback(searchResults, keywords, maxResults);
        
    } catch (error) {
        logError(error, { operation: 'selectTopResults' });
        const config = getConfig(); // Fix: Get config here for fallback
        return selectResultsFallback(searchResults, keywords, config.bot.maxSearchResults || 6);
    }
}

// Fallback result selection using simple scoring
function selectResultsFallback(searchResults, keywords, maxResults) {
    const scored = searchResults.map(user => {
        let score = 0;
        
        // Score based on keyword matches
        const searchableText = [
            user.basicProfile?.about || '',
            user.basicProfile?.name || '',
            user.enhancedProfile?.fullName || '',
            user.enhancedProfile?.domain || '',
            user.enhancedProfile?.professionalRole || '',
            user.enhancedProfile?.city || '',
            user.enhancedProfile?.state || '',
            ...(user.enhancedProfile?.communityGives || []),
            ...(user.enhancedProfile?.communityAsks || [])
        ].join(' ').toLowerCase();
        
        keywords.forEach(keyword => {
            if (searchableText.includes(keyword.toLowerCase())) {
                score += 1;
            }
        });
        
        // Bonus for profile completeness
        if (user.enhancedProfile?.completed) score += 2;
        if (user.enhancedProfile?.linkedin) score += 1;
        if (user.enhancedProfile?.communityGives?.length > 0) score += 1;
        
        // Recent activity bonus
        if (user.metadata?.lastActive) {
            const daysSinceActive = (Date.now() - new Date(user.metadata.lastActive)) / (1000 * 60 * 60 * 24);
            if (daysSinceActive < 30) score += 1;
        }
        
        return { user, score };
    });
    
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map(item => item.user);
}


// Generate formatted search response with rich bio information
async function generateSearchResponse(topResults, originalQuery, totalMatches) {
    try {
        if (topResults.length === 0) {
            return generateNoResultsResponse(originalQuery);
        }
        
        // Limit to top 3 results for better readability
        const top3Results = topResults.slice(0, 3);
        
        const profileSummaries = top3Results.map(user => {
            const basicProfile = user.basicProfile || {};
            const enhancedProfile = user.enhancedProfile || {};
            
            return {
                name: enhancedProfile.fullName || basicProfile.name || 'Name not available',
                email: basicProfile.email || 'Email not available',
                about: basicProfile.about || '',
                domain: enhancedProfile.domain || '',
                role: enhancedProfile.professionalRole || '',
                city: enhancedProfile.city || '',
                state: enhancedProfile.state || '',
                country: enhancedProfile.country || '',
                linkedin: enhancedProfile.linkedin || basicProfile.linkedin || '',
                phone: enhancedProfile.phone || '',
                yatraImpact: enhancedProfile.yatraImpact || [],
                communityGives: enhancedProfile.communityGives || [],
                communityAsks: enhancedProfile.communityAsks || []
            };
        });
        
        // Generate rich response with comprehensive bio
        let response = `🌟 Found ${totalMatches} expert${totalMatches > 1 ? 's' : ''} for "${originalQuery}"\n\nTop ${top3Results.length} profiles:\n\n`;
        
        response += top3Results.map((user, index) => {
            const profile = profileSummaries[index];
            let profileText = `${index + 1}. **${profile.name}**\n`;
            
            // Professional Information
            if (profile.role && profile.domain) {
                profileText += `💼 ${profile.role} in ${profile.domain}\n`;
            } else if (profile.role) {
                profileText += `💼 ${profile.role}\n`;
            } else if (profile.domain) {
                profileText += `🏢 ${profile.domain}\n`;
            }
            
            // Location (only if available)
            const locationParts = [profile.city, profile.state, profile.country].filter(Boolean);
            if (locationParts.length > 0) {
                profileText += `📍 ${locationParts.join(', ')}\n`;
            }
            
            // About/Bio (if available)
            if (profile.about && profile.about.length > 10) {
                const shortBio = profile.about.length > 150 ? 
                    profile.about.substring(0, 150) + '...' : 
                    profile.about;
                profileText += `📋 ${shortBio}\n`;
            }
            
            // Yatra Impact (if available)
            if (profile.yatraImpact && profile.yatraImpact.length > 0) {
                profileText += `🚆 Yatra Impact: ${profile.yatraImpact.slice(0, 2).join(', ')}\n`;
            }
            
            // Community Contributions (if available)
            if (profile.communityGives && profile.communityGives.length > 0) {
                profileText += `🎁 Offers: ${profile.communityGives.slice(0, 2).join(', ')}\n`;
            }
            
            // Contact Information
            profileText += `📧 ${profile.email}\n`;
            
            if (profile.linkedin) {
                profileText += `🔗 ${profile.linkedin}\n`;
            }
            
            if (profile.phone) {
                profileText += `📱 ${profile.phone}`;
            }
            
            return profileText.trim();
        }).join('\n\n');
        
        response += `\n\n🚀 Contact them directly for collaboration!`;
        
        if (totalMatches > 3) {
            response += `\n\n💡 ${totalMatches - 3} more experts available - try more specific keywords.`;
        }
        
        // Ensure response is under WhatsApp limit
        if (response.length > 4000) {
            response = `🌟 Found ${totalMatches} experts for "${originalQuery}"\n\nTop ${top3Results.length} matches:\n\n`;
            response += top3Results.map((user, index) => {
                const profile = profileSummaries[index];
                return `${index + 1}. ${profile.name}\n📧 ${profile.email}${profile.role ? `\n💼 ${profile.role}` : ''}`;
            }).join('\n\n');
            response += '\n\n🚀 Contact them directly!';
        }
        
        return response;
        
    } catch (error) {
        logError(error, { operation: 'generateSearchResponse' });
        return generateErrorResponse('response_generation_failed');
    }
}

// Generate no results response with suggestions
function generateNoResultsResponse(query) {
    return `I searched our network but couldn't find alumni matching "${query}". 🔍

Try these suggestions:
- Use broader terms: "technology", "business", "marketing"
- Search by role: "entrepreneur", "developer", "consultant"
- Search by industry: "fintech", "healthtech", "edtech"
- Search by location: "Mumbai", "Bangalore", "Delhi"
- Try different keywords: "web dev" instead of "programming"

What other expertise would be helpful?`;
}

// Generate error responses
function generateErrorResponse(errorType) {
    const responses = {
        database_unavailable: "😔 Database temporarily unavailable. Please try again in a moment.",
        search_failed: "I'm having a technical hiccup! 😅\n\nPlease try again, or try simpler terms like:\n• \"web developers\"\n• \"business mentors\"\n• \"marketing help\"",
        response_generation_failed: "I found matches but had trouble formatting the response. Please try again or contact support."
    };
    
    return responses[errorType] || "Something went wrong. Please try again.";
}

// Search analytics and insights
async function getSearchAnalytics(timeframe = '24h') {
    try {
        const db = getDatabase();
        const now = new Date();
        let startTime;
        
        switch (timeframe) {
            case '1h':
                startTime = new Date(now - 60 * 60 * 1000);
                break;
            case '24h':
                startTime = new Date(now - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now - 24 * 60 * 60 * 1000);
        }
        
        const analytics = await db.collection('queries').aggregate([
            { $match: { 
                timestamp: { $gte: startTime },
                queryType: 'alumni_search'
            }},
            { $group: {
                _id: null,
                totalSearches: { $sum: 1 },
                avgMatches: { $avg: '$totalMatches' },
                avgTopMatches: { $avg: '$topMatches' },
                uniqueUsers: { $addToSet: '$whatsappNumber' }
            }},
            { $addFields: {
                uniqueUserCount: { $size: '$uniqueUsers' }
            }}
        ]).toArray();
        
        return analytics[0] || {
            totalSearches: 0,
            avgMatches: 0,
            avgTopMatches: 0,
            uniqueUserCount: 0
        };
        
    } catch (error) {
        logError(error, { operation: 'getSearchAnalytics', timeframe });
        return { error: 'Unable to fetch search analytics' };
    }
}

module.exports = {
    comprehensiveAlumniSearch,
    extractSearchKeywords,
    performDatabaseSearch,
    selectTopResults,
    generateSearchResponse,
    getSearchAnalytics
};