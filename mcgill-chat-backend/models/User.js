const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true // Allows null value for legacy users
  },
  email: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: v => v.endsWith('@mcgill.ca') || v.endsWith('@mail.mcgill.ca'),
      message: 'Must be a McGill email address'
    }
  },
  passwordHash: {
    type: String,
    // Only required if no Firebase UID exists
    required: function() {
      return !this.firebaseUid;
    }
  },
  yearOfStudy: String,
  faculty: String,
  emailVerified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);