const bcrypt = require('bcryptjs');

// User class for in-memory storage
class User {
  constructor(data) {
    this.id = data.id || Date.now().toString();
    this.name = data.name;
    this.email = data.email.toLowerCase();
    this.password = data.password;
    this.avatar = data.avatar || '';
    this.provider = data.provider;
    this.googleId = data.googleId;
    this.isVerified = data.isVerified || false;
    this.verificationToken = data.verificationToken;
    this.resetPasswordToken = data.resetPasswordToken;
    this.resetPasswordExpires = data.resetPasswordExpires;
    this.createdAt = data.createdAt || Date.now();
  }

  // Hash password
  async hashPassword() {
    if (this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  // Compare password
  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }
}

// User methods for in-memory database
const UserModel = {
  // Find user by email
  findOne: async function(db, query) {
    if (query.email) {
      return db.users.find(user => user.email === query.email.toLowerCase());
    }
    if (query._id) {
      return db.users.find(user => user.id === query._id);
    }
    return null;
  },

  // Create new user
  create: async function(db, data) {
    const user = new User(data);
    await user.hashPassword();
    db.users.push(user);
    return user;
  },

  // Update user
  update: async function(db, query, update) {
    const user = await this.findOne(db, query);
    if (user) {
      Object.assign(user, update);
      if (update.password) {
        await user.hashPassword();
      }
    }
    return user;
  },

  // Delete user
  delete: async function(db, query) {
    const index = db.users.findIndex(user => user.email === query.email.toLowerCase());
    if (index > -1) {
      db.users.splice(index, 1);
      return true;
    }
    return false;
  }
};

module.exports = UserModel;
