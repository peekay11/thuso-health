const UserService = require('../services/userService');
const UserModel = require('../models/user.model');

class UserController {
  static async getProfile(req, res) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = await UserService.getUserById('user-123');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(200).json(user);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  static async register(req, res) {
    try {
      const { name, email, password } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }
      const newUser = await UserService.registerUser({ name, email, password });
      return res.status(201).json(newUser);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const result = await UserService.loginUser({ email, password });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(401).json({ error: error.message });
    }
  }

  // Used by practitioners to resolve patient email → patient ID
  static findByEmail(req, res) {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ success: false, error: 'email query param is required' });
      }
      const user = UserModel.findByEmail(email);
      if (!user || user.role !== 'patient') {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      return res.status(200).json({
        success: true,
        patient: {
          id: user.id,
          name: user.name,
          thuso_id_hash: user.thuso_id_hash || `TH-${user.id.toUpperCase()}`
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = UserController;
