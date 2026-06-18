const UserService = require('../services/userService');

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
}

module.exports = UserController;
