const { db } = require('./db');

class UserModel {
  static getAll() {
    return db.users;
  }

  static findById(id) {
    return db.users.find(u => u.id === id);
  }

  static findByEmail(email) {
    return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  static create(userData) {
    const newUser = {
      id: `u${db.users.length + 1}`,
      name: userData.name,
      email: userData.email,
      phone: userData.phone || ""
    };
    db.users.push(newUser);
    return newUser;
  }
}

module.exports = UserModel;
