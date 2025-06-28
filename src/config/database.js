// Database configuration and connection management for MongoDB Atlas
// Handles connection, reconnection, indexing, and database operations

const { MongoClient } = require('mongodb');
const { getConfig } = require('./environment');

let db;
let client;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function connectDatabase() {
    const config = getConfig();
    
    try {
        client = new MongoClient(config.mongodb.uri, config.mongodb.options);
        await client.connect();
        db = client.db(config.mongodb.dbName);
        isConnected = true;
        reconnectAttempts = 0;
        
        console.log('✅ MongoDB Atlas connection established');
        await createEnhancedIndexes();
        
        return db;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        isConnected = false;
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`🔄 Retrying connection... Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
            setTimeout(connectDatabase, 5000 * reconnectAttempts);
        } else {
            console.error('💥 Max reconnection attempts reached. Please check MongoDB connection.');
        }
        
        throw error;
    }
}

async function createEnhancedIndexes() {
    try {
        // User collection indexes for enhanced profile system
        await db.collection('users').createIndex({ "whatsappNumbers": 1 });
        await db.collection('users').createIndex({ "whatsappNumber": 1 });
        await db.collection('users').createIndex({ "basicProfile.email": 1 }, { unique: true });
        await db.collection('users').createIndex({ "basicProfile.linkedEmails": 1 });
        
        // Enhanced profile indexes for new fields
        await db.collection('users').createIndex({ "enhancedProfile.fullName": 1 });
        await db.collection('users').createIndex({ "enhancedProfile.phone": 1 });
        await db.collection('users').createIndex({ "enhancedProfile.country": 1 });
        await db.collection('users').createIndex({ "enhancedProfile.city": 1 });
        await db.collection('users').createIndex({ "enhancedProfile.state": 1 });
        await db.collection('users').createIndex({ "enhancedProfile.domain": 1 });
        await db.collection('users').createIndex({ "enhancedProfile.professionalRole": 1 });
        
        // Text search index for comprehensive alumni search
        const existingIndexes = await db.collection('users').listIndexes().toArray();
        const hasTextIndex = existingIndexes.some(index => index.key && index.key._fts === 'text');
        
        if (!hasTextIndex) {
            await db.collection('users').createIndex({ 
                "basicProfile.about": "text",
                "basicProfile.name": "text", 
                "enhancedProfile.fullName": "text",
                "enhancedProfile.domain": "text",
                "enhancedProfile.professionalRole": "text",
                "enhancedProfile.city": "text",
                "enhancedProfile.state": "text",
                "enhancedProfile.country": "text",
                "enhancedProfile.communityAsks": "text",
                "enhancedProfile.communityGives": "text",
                "enhancedProfile.yatraImpact": "text"
            });
        }
        
        // Profile completion tracking
        await db.collection('users').createIndex({ "enhancedProfile.completed": 1 });
        await db.collection('users').createIndex({ "metadata.lastActive": 1 });
        await db.collection('users').createIndex({ "metadata.profileCompletedAt": 1 });
        
        // Session management with TTL
        const config = getConfig();
        await db.collection('sessions').createIndex({ "whatsappNumber": 1 }, { unique: true });
        await db.collection('sessions').createIndex({ 
            "lastActivity": 1 
        }, { expireAfterSeconds: config.bot.sessionTimeoutHours * 3600 });
        
        // OTP collection with TTL (10 minutes)
        await db.collection('otps').createIndex({ 
            "createdAt": 1 
        }, { expireAfterSeconds: 600 });
        await db.collection('otps').createIndex({ "email": 1 });
        
        // Query logging for analytics with enhanced tracking
        await db.collection('queries').createIndex({ "timestamp": 1 });
        await db.collection('queries').createIndex({ "whatsappNumber": 1, "timestamp": 1 });
        await db.collection('queries').createIndex({ "queryType": 1, "timestamp": 1 });
        
        console.log('✅ Enhanced database indexes created successfully');
    } catch (error) {
        console.log('⚠️ Index setup completed with some constraints handled:', error.message);
    }
}

function getDatabase() {
    if (!isConnected || !db) {
        throw new Error('Database not connected. Call connectDatabase() first.');
    }
    return db;
}

function isDbConnected() {
    return isConnected;
}

async function closeDatabase() {
    if (client) {
        await client.close();
        isConnected = false;
        console.log('🔌 Database connection closed');
    }
}

// Database health check
async function checkDatabaseHealth() {
    try {
        if (!isConnected) return false;
        
        await db.admin().ping();
        return true;
    } catch (error) {
        console.error('Database health check failed:', error.message);
        return false;
    }
}

module.exports = {
    connectDatabase,
    getDatabase,
    isDbConnected,
    closeDatabase,
    checkDatabaseHealth
};