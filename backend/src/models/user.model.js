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
    const userId = `u${db.users.length + 1}`;
    const newUser = {
      id: userId,
      name: userData.name,
      email: userData.email,
      phone: userData.phone || '',
      role: userData.role || 'patient',
      clinicId: userData.clinicId || null,
      password: userData.password || 'password123',
      // Passport & POPIA fields (patient only)
      thuso_id_hash: `TH-${userId.toUpperCase()}`,
      consentPin: Math.floor(1000 + Math.random() * 9000).toString(), // 4-digit PIN
      isAccessGranted: true,
      language: 'en'
    };
    db.users.push(newUser);
    saveDb();
    return newUser;
  }
}

module.exports = UserModel;
