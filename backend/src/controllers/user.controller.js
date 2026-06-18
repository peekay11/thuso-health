const UserModel = require('../models/user.model');

class UserController {
  static getProfile(req, res) {
    try {
      const user = UserModel.findById("u1"); // Using default seed user for simplicity
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      return res.status(200).json({ success: true, user });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static register(req, res) {
    try {
      const { name, email, phone } = req.body;
      if (!name || !email) {
        return res.status(400).json({ success: false, message: "Name and email are required" });
      }
      const existing = UserModel.findByEmail(email);
      if (existing) {
        return res.status(200).json({ success: true, user: existing, message: "User already exists, logged in" });
      }
      const newUser = UserModel.create({ name, email, phone });
      return res.status(201).json({ success: true, user: newUser });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = UserController;
