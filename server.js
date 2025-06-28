// Main server entry point - Express.js server with enhanced JY Alumni Bot
// Handles initialization, middleware setup, and route mounting

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

// Import configurations and services
const { connectDatabase } = require('./src/config/database');
const { validateEnvironment } = require('./src/config/environment');
const webhookRoutes = require('./src/routes/webhook');
const healthRoutes = require('./src/routes/health');
const { requestLogger } = require('./src/middleware/logging');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandlers');

const app = express();

// Validate environment variables on startup
validateEnvironment();

// Middleware setup
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());
app.use(requestLogger);

// Routes
app.use('/webhook', webhookRoutes);
app.use('/health', healthRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database connection
connectDatabase();

// Graceful shutdown handlers
process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received - shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 SIGINT received - shutting down gracefully...');
    process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🎉 ===============================================');
    console.log('🌟 JY ALUMNI NETWORK BOT v3.0 - ENHANCED PROFILE SYSTEM');
    console.log('🎉 ===============================================\n');
    
    console.log('🔧 NEW ENHANCED FEATURES:');
    console.log('   ✅ Comprehensive Profile Data Collection');
    console.log('   ✅ AI-Powered Input Validation');
    console.log('   ✅ Multiple Email Support & Linking');
    console.log('   ✅ Enhanced Professional Domains');
    console.log('   ✅ Community Give & Ask System');
    console.log('   ✅ Modular Architecture for Easy Maintenance\n');
    
    console.log('📊 Profile Fields Enhanced:');
    console.log('   📝 20+ Comprehensive Profile Fields');
    console.log('   🤖 AI Validation for Each Input');
    console.log('   📧 Multiple Email Linking Support');
    console.log('   🌍 Geographic Data Validation');
    console.log('   🎯 Community Contribution Mapping\n');
    
    console.log(`🌐 Server running on port ${PORT}`);
    console.log('🎯 Ready for enhanced user profile collection! 🎯\n');
});

module.exports = app;