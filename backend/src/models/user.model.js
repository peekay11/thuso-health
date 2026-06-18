const { db, saveDb } = require('./db');

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

  static findByClinicId(clinicId) {
    return db.users.find(u => u.clinicId === clinicId);
  }

  static create(userData) {
    const newUser = {
      id: `u${db.users.length + 1}`,
      name: userData.name,
      email: userData.email,
      phone: userData.phone || "",
      role: userData.role || "patient",
      clinicId: userData.clinicId || null,
      password: userData.password || "password123" // Simplified password storage for MVP
    };
    db.users.push(newUser);
    saveDb();
    return newUser;
  }
}

module.exports = UserModel;
