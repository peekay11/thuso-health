const UserModel = require('../models/user.model');
const ClinicModel = require('../models/clinic.model');

class AuthController {
  static login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required" });
      }

      const user = UserModel.findByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      let clinic = null;
      if (user.clinicId) {
        clinic = ClinicModel.findById(user.clinicId);
      }

      return res.status(200).json({ 
        success: true, 
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clinicId: user.clinicId,
          thuso_id_hash: user.thuso_id_hash || `TH-${user.id.toUpperCase()}`,
          consentPin: user.consentPin || '1234',
          isAccessGranted: user.isAccessGranted !== false,
          language: user.language || 'en'
        },
        clinic
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static register(req, res) {
    try {
      const { name, email, password, phone, role, clinicName, clinicAddress } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: "Name, email, and password are required" });
      }

      const existingUser = UserModel.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ success: false, message: "Email is already registered" });
      }

      let clinicId = null;

      // If healthcare role, create their clinic too
      if (role === 'healthcare') {
        if (!clinicName || !clinicAddress) {
          return res.status(400).json({ 
            success: false, 
            message: "Clinic name and clinic address are required for healthcare registration" 
          });
        }

        // Generate coordinates randomly or stub them in JHB area (e.g. around -26.19, 28.03)
        const lat = -26.19 + (Math.random() - 0.5) * 0.05;
        const lng = 28.03 + (Math.random() - 0.5) * 0.05;

        const newClinic = ClinicModel.create({
          name: clinicName,
          address: clinicAddress,
          lat,
          lng,
          baseWaitTimeMinutes: 30,
          services: ["General Practitioner"],
          capacityPerDay: 50,
          hasElectricity: true,
          hasSolar: false,
          openTime: "08:00",
          closeTime: "17:00"
        });

        clinicId = newClinic.id;
      }

      const newUser = UserModel.create({
        name,
        email,
        password,
        phone,
        role: role || 'patient',
        clinicId
      });

      return res.status(201).json({ 
        success: true, 
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          clinicId: newUser.clinicId,
          thuso_id_hash: newUser.thuso_id_hash,
          consentPin: newUser.consentPin,
          isAccessGranted: newUser.isAccessGranted,
          language: newUser.language
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = AuthController;
