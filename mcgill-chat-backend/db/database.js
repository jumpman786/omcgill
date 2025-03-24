const mongoose = require('mongoose');
const config = require('../config');

/**
 * Initialize database connection
 */
function setupDatabase() {
  console.log('Connecting to MongoDB...');
  
  mongoose.connect(config.database.uri, config.database.options)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => {
      console.error("❌ MongoDB connection error:", err);
      console.error("Please check your database connection and credentials");
    });
}

module.exports = setupDatabase;