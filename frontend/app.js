// Thuso Health Application State & Business Logic (Dual-Portal System)

const CONFIG = {
  API_BASE: 'http://localhost:5000/api',
  SERVER_PING_INTERVAL_MS: 5000,
  DEFAULT_USER: { id: 'u1', name: 'Paseka Moloi', email: 'paseka@thuso.health' }
};

// Application State
const state = {
  isOnline: true,
  userLocation: {
    lat: -26.1929,
    lng: 28.0328,
    name: 'Braamfontein'
  },
  clinics: [],
  bookings: [],
  activeBooking: null,
  
  // Auth state for Healthcare Managers
  loggedInUser: null,
  loggedInClinic: null,
  
  // Offline sync queues
  offlineQueue: [],        // Offline patient bookings
  offlineQueueUpdates: [], // Offline queue status actions (check-ins, completions)
  offlineClinicSettings: null, // Offline settings edits to sync
  
  sortBy: 'totalTime'
};

// Local Offline Fallback Database
const MOCK_CLINICS = [
  {
    id: "c1",
    name: "Thuso Health Central Clinic",
    address: "26 Jorissen St, Braamfontein, Johannesburg, 2001",
    lat: -26.1929,
    lng: 28.0328,
    baseWaitTimeMinutes: 45,
    currentQueueCount: 12,
    services: ["General Practitioner", "Dentistry", "Pediatrics", "Vaccinations"],
    operatingHours: "08:00 - 17:00",
    capacityPerDay: 80,
    hasElectricity: true,
    hasSolar: false,
    openTime: "08:00",
    closeTime: "17:00"
  },
  {
    id: "c2",
    name: "Hillbrow Community Health Centre",
    address: "Smith St & Klein St, Hillbrow, Johannesburg, 2001",
    lat: -26.1884,
    lng: 28.0443,
    baseWaitTimeMinutes: 90,
    currentQueueCount: 28,
    services: ["General Practitioner", "HIV/AIDS Care", "Maternity", "Pharmacy"],
    operatingHours: "24 Hours",
    capacityPerDay: 150,
    hasElectricity: false,
    hasSolar: false,
    openTime: "00:00",
    closeTime: "23:59"
  },
  {
    id: "c3",
    name: "Parktown Medical Centre",
    address: "15 Princess of Wales Terrace, Parktown, Johannesburg, 2193",
    lat: -26.1772,
    lng: 28.0308,
    baseWaitTimeMinutes: 20,
    currentQueueCount: 3,
    services: ["General Practitioner", "Physiotherapy", "Optometry"],
    operatingHours: "08:00 - 18:00",
    capacityPerDay: 40,
    hasElectricity: true,
    hasSolar: true,
    openTime: "08:00",
    closeTime: "18:00"
  },
  {
    id: "c4",
    name: "Rosebank Health Clinic",
    address: "50 Bath Ave, Rosebank, Johannesburg, 2196",
    lat: -26.1460,
    lng: 28.0371,
    baseWaitTimeMinutes: 15,
    currentQueueCount: 2,
    services: ["General Practitioner", "Travel Clinic", "Dermatology"],
    operatingHours: "09:00 - 17:00",
    capacityPerDay: 30,
    hasElectricity: true,
    hasSolar: true,
    openTime: "09:00",
    closeTime: "17:00"
  }
];

// Initialize UI Elements
document.addEventListener('DOMContentLoaded', () => {
  // Load initial bookings from LocalStorage
  loadLocalState();
  initSyncButton();
  
  const isPatientPortal = document.body.classList.contains('patient-portal');
  const isHealthcarePortal = document.body.classList.contains('healthcare-portal');

  if (isPatientPortal) {
    initLocationSelector();
    initSortingControls();
    initSearchInput();
    initModal();
    initPatientPassport();
  }

  if (isHealthcarePortal) {
    initHealthcareAuth();
    initHealthcareDashboard();
    initPractitionerPassport();
  }
  
  // Initial health check and fetch
  checkConnection().then(() => {
    fetchClinics().then(() => {
      if (isPatientPortal) {
        renderClinicsList();
      }
    });
    fetchBookings().then(() => {
      if (isPatientPortal) {
        updateActiveBookingUI();
        updateHistoryUI();
        fetchPatientPassport();
      }
      if (isHealthcarePortal) {
        updatePortalUI();
      }
    });
  });

  // Start polling to detect network transitions
  setInterval(() => {
    checkConnection().then(onlineChanged => {
      if (onlineChanged) {
        fetchClinics().then(() => {
          if (isPatientPortal) renderClinicsList();
        });
        fetchBookings().then(() => {
          if (isPatientPortal) {
            updateActiveBookingUI();
            updateHistoryUI();
            fetchPatientPassport();
          }
          if (isHealthcarePortal) {
            updatePortalUI();
          }
        });
      }
    });
  }, CONFIG.SERVER_PING_INTERVAL_MS);
});

// Toast Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close">&times;</button>
  `;
  container.appendChild(toast);
  
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ----------------------------------------------------
// NETWORK & OFFLINE RESILIENCE
// ----------------------------------------------------

async function checkConnection() {
  const wasOnline = state.isOnline;
  try {
    const response = await fetch(`${CONFIG.API_BASE.replace('/api', '')}/`, { 
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    state.isOnline = response.ok;
  } catch (err) {
    state.isOnline = false;
  }
  
  updateNetworkBadge();
  
  // Returns true if connection state flipped
  return wasOnline !== state.isOnline;
}

function updateNetworkBadge() {
  const badge = document.getElementById('connection-badge');
  const text = document.getElementById('connection-text');
  const syncBtn = document.getElementById('sync-btn');
  const syncCount = document.getElementById('sync-count');
  
  if (!badge) return;

  const pendingSyncs = state.offlineQueue.length + 
                       state.offlineQueueUpdates.length + 
                       (state.offlineClinicSettings ? 1 : 0);
  
  if (state.isOnline) {
    badge.className = 'badge online';
    text.innerText = 'Online';
    
    if (pendingSyncs > 0) {
      syncBtn.classList.remove('hidden');
      syncCount.innerText = pendingSyncs;
    } else {
      syncBtn.classList.add('hidden');
    }
  } else {
    badge.className = 'badge offline';
    text.innerText = 'Offline Mode';
    syncBtn.classList.add('hidden');
  }
}

// Save & load local storage state
function loadLocalState() {
  const localHistory = localStorage.getItem('thuso_bookings_history');
  const localQueue = localStorage.getItem('thuso_offline_queue');
  const localQueueUpdates = localStorage.getItem('thuso_offline_updates');
  const localClinics = localStorage.getItem('thuso_clinics');
  const localUser = localStorage.getItem('thuso_provider_user');
  const localClinic = localStorage.getItem('thuso_provider_clinic');
  const localOfflineSettings = localStorage.getItem('thuso_offline_settings');
  
  if (localHistory) state.bookings = JSON.parse(localHistory);
  if (localQueue) state.offlineQueue = JSON.parse(localQueue);
  if (localQueueUpdates) state.offlineQueueUpdates = JSON.parse(localQueueUpdates);
  
  if (localClinics) {
    state.clinics = JSON.parse(localClinics);
  } else {
    state.clinics = JSON.parse(JSON.stringify(MOCK_CLINICS));
  }
  
  if (localUser) state.loggedInUser = JSON.parse(localUser);
  if (localClinic) state.loggedInClinic = JSON.parse(localClinic);
  if (localOfflineSettings) state.offlineClinicSettings = JSON.parse(localOfflineSettings);
  
  // Set active patient booking
  const active = state.bookings.find(b => b.status === 'Confirmed' || b.status === 'CheckedIn');
  state.activeBooking = active || null;
}

function saveLocalState() {
  localStorage.setItem('thuso_bookings_history', JSON.stringify(state.bookings));
  localStorage.setItem('thuso_offline_queue', JSON.stringify(state.offlineQueue));
  localStorage.setItem('thuso_offline_updates', JSON.stringify(state.offlineQueueUpdates));
  localStorage.setItem('thuso_clinics', JSON.stringify(state.clinics));
  localStorage.setItem('thuso_offline_settings', JSON.stringify(state.offlineClinicSettings));
  
  if (state.loggedInUser) {
    localStorage.setItem('thuso_provider_user', JSON.stringify(state.loggedInUser));
  } else {
    localStorage.removeItem('thuso_provider_user');
  }
  
  if (state.loggedInClinic) {
    localStorage.setItem('thuso_provider_clinic', JSON.stringify(state.loggedInClinic));
  } else {
    localStorage.removeItem('thuso_provider_clinic');
  }
}

// ----------------------------------------------------
// HEALTHCARE PROVIDER PORTAL UI SYNC
// ----------------------------------------------------

function updatePortalUI() {
  const authPanel = document.getElementById('healthcare-auth');
  const dashboardPanel = document.getElementById('healthcare-dashboard');
  
  if (!authPanel || !dashboardPanel) return;

  if (state.loggedInUser && state.loggedInClinic) {
    authPanel.classList.add('hidden');
    dashboardPanel.classList.remove('hidden');
    
    // Set text fields
    document.getElementById('dashboard-provider-name').innerText = state.loggedInUser.name;
    document.getElementById('dashboard-clinic-title').innerText = state.loggedInClinic.name;
    
    // Populate form fields with current clinic configuration
    populateClinicSettingsForm();
    
    // Render the clinic's queue
    renderClinicQueueAdmin();
  } else {
    authPanel.classList.remove('hidden');
    dashboardPanel.classList.add('hidden');
  }
}

// ----------------------------------------------------
// HEALTHCARE PROVIDER AUTHENTICATION
// ----------------------------------------------------

function initHealthcareAuth() {
  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegister = document.getElementById('auth-tab-register');
  const formLogin = document.getElementById('healthcare-login-form');
  const formRegister = document.getElementById('healthcare-register-form');

  if (!tabLogin) return;

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
  });

  // Login submit
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (state.isOnline) {
      try {
        const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        
        if (data.success) {
          state.loggedInUser = data.user;
          state.loggedInClinic = data.clinic;
          saveLocalState();
          updatePortalUI();
          showToast(`Logged in successfully to ${data.clinic.name}`, 'success');
        } else {
          showToast(data.message, 'error');
        }
      } catch (err) {
        showToast("Authentication server error.", 'error');
      }
    } else {
      // Local check-in offline login for default seeded Sarah manager
      if (email === 'sarah@thuso.health' && password === 'password123') {
        state.loggedInUser = {
          id: 'u2',
          name: 'Dr. Sarah Dube',
          email: 'sarah@thuso.health',
          role: 'healthcare',
          clinicId: 'c3'
        };
        state.loggedInClinic = state.clinics.find(c => c.id === 'c3');
        saveLocalState();
        updatePortalUI();
        showToast("Logged in offline (Seeded profile)", "warning");
      } else {
        showToast("Authentication requires network connection.", "error");
      }
    }
  });

  // Register submit
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const clinicName = document.getElementById('register-clinic-name').value;
    const clinicAddress = document.getElementById('register-clinic-address').value;

    if (!state.isOnline) {
      showToast("Cannot register new clinics while offline.", "error");
      return;
    }

    try {
      const response = await fetch(`${CONFIG.API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role: 'healthcare',
          clinicName,
          clinicAddress
        })
      });
      const data = await response.json();

      if (data.success) {
        showToast("Registration completed! Please sign in.", "success");
        tabLogin.click();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast("Registration failed: connection error.", 'error');
    }
  });
}

function initHealthcareDashboard() {
  const logoutBtn = document.getElementById('btn-healthcare-logout');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {
    state.loggedInUser = null;
    state.loggedInClinic = null;
    saveLocalState();
    updatePortalUI();
    showToast("Signed out from clinic dashboard.", "info");
  });

  const settingsForm = document.getElementById('clinic-settings-form');
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.loggedInClinic) return;

    const capacity = parseInt(document.getElementById('setting-capacity').value, 10);
    const hasElectricity = document.querySelector('input[name="setting-electricity"]:checked').value === 'true';
    const hasSolar = document.querySelector('input[name="setting-solar"]:checked').value === 'true';
    const openTime = document.getElementById('setting-open-time').value;
    const closeTime = document.getElementById('setting-close-time').value;
    
    // Services checkboxes
    const serviceCheckboxes = document.querySelectorAll('input[name="setting-services"]:checked');
    const services = Array.from(serviceCheckboxes).map(cb => cb.value);

    const updatePayload = {
      capacityPerDay: capacity,
      hasElectricity,
      hasSolar,
      openTime,
      closeTime,
      services
    };

    // Save in local state immediately so UI updates
    const cId = state.loggedInClinic.id;
    const localClinicIndex = state.clinics.findIndex(c => c.id === cId);
    if (localClinicIndex !== -1) {
      state.clinics[localClinicIndex] = {
        ...state.clinics[localClinicIndex],
        ...updatePayload,
        operatingHours: `${openTime} - ${closeTime}`
      };
      state.loggedInClinic = state.clinics[localClinicIndex];
    }

    if (state.isOnline) {
      try {
        const response = await fetch(`${CONFIG.API_BASE}/clinics/${cId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        });
        const data = await response.json();
        
        if (data.success) {
          showToast("Operational settings saved online!", "success");
          fetchClinics();
        }
      } catch (err) {
        console.warn("Could not sync settings to server, queueing updates");
        queueOfflineSettings(updatePayload);
      }
    } else {
      queueOfflineSettings(updatePayload);
    }

    saveLocalState();
    updatePortalUI();
  });
}

function queueOfflineSettings(payload) {
  state.offlineClinicSettings = payload;
  saveLocalState();
  updateNetworkBadge();
  showToast("Saved settings locally. Will sync when server is online.", "warning");
}

function populateClinicSettingsForm() {
  const clinic = state.loggedInClinic;
  if (!clinic) return;

  document.getElementById('setting-capacity').value = clinic.capacityPerDay || 40;
  
  if (clinic.hasElectricity) {
    document.getElementById('elect-on').checked = true;
  } else {
    document.getElementById('elect-off').checked = true;
  }

  if (clinic.hasSolar) {
    document.getElementById('solar-on').checked = true;
  } else {
    document.getElementById('solar-off').checked = true;
  }

  document.getElementById('setting-open-time').value = clinic.openTime || "08:00";
  document.getElementById('setting-close-time').value = clinic.closeTime || "18:00";

  // Checkbox services
  const checkboxes = document.querySelectorAll('input[name="setting-services"]');
  checkboxes.forEach(cb => {
    cb.checked = clinic.services.includes(cb.value);
  });
}

// ----------------------------------------------------
// CLINIC QUEUE MANAGEMENT (HEALTHCARE PROVIDER SIDE)
// ----------------------------------------------------

function renderClinicQueueAdmin() {
  const container = document.getElementById('dashboard-queue-list');
  const countBadge = document.getElementById('dashboard-queue-badge');
  if (!container) return;

  const clinicId = state.loggedInClinic.id;

  // Filter bookings for this clinic that are not completed or cancelled
  const activeBookings = state.bookings.filter(b => 
    b.clinicId === clinicId && 
    (b.status === 'Confirmed' || b.status === 'CheckedIn')
  );

  countBadge.innerText = `${activeBookings.length} Patients`;

  if (activeBookings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-users-slash"></i>
        <h3>No Patients in Queue</h3>
        <p>Bookings at this clinic will appear here in real-time.</p>
      </div>
    `;
    return;
  }

  // Sort queue by booking/appointment time
  activeBookings.sort((a, b) => new Date(a.appointmentTime) - new Date(b.appointmentTime));

  container.innerHTML = activeBookings.map(b => {
    const appTime = new Date(b.appointmentTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const isCheckedIn = b.status === 'CheckedIn';
    const statusClass = isCheckedIn ? 'status-checkedin' : 'status-confirmed';

    return `
      <div class="queue-admin-item">
        <div class="patient-info-box">
          <h4>${b.patientName || 'Patient (Paseka Moloi)'}</h4>
          <p>
            Time: <strong>${appTime}</strong> • 
            Ticket: <span class="text-accent"><strong>${b.queueNumber}</strong></span> • 
            Status: <span class="history-status ${statusClass}">${b.status}</span>
          </p>
        </div>
        <div class="queue-admin-actions">
          ${!isCheckedIn ? `
            <button class="btn btn-checkin" onclick="adminCheckIn('${b.id}')">
              <i class="fa-solid fa-check"></i> Check In
            </button>
          ` : `
            <button class="btn btn-primary" onclick="adminComplete('${b.id}')">
              Complete
            </button>
          `}
          <button class="btn btn-cancel" onclick="adminCancel('${b.id}')">
            Cancel
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Admin queue operations (Offline support enabled)
async function adminCheckIn(bookingId) {
  const index = state.bookings.findIndex(b => b.id === bookingId);
  if (index !== -1) {
    state.bookings[index].status = 'CheckedIn';
  }

  if (state.isOnline && !bookingId.startsWith('off-')) {
    try {
      await fetch(`${CONFIG.API_BASE}/bookings/${bookingId}/checkin`, { method: 'PUT' });
      showToast("Patient checked in.", "success");
    } catch (err) {
      queueOfflineQueueUpdate(bookingId, 'checkin');
    }
  } else {
    queueOfflineQueueUpdate(bookingId, 'checkin');
  }

  saveLocalState();
  if (document.body.classList.contains('healthcare-portal')) {
    updatePortalUI();
  }
}

async function adminComplete(bookingId) {
  const booking = state.bookings.find(b => b.id === bookingId);
  const clinicId = booking ? booking.clinicId : null;

  // Remove from active lists
  if (booking) {
    booking.status = 'Completed';
  }

  // Decrement queue count at clinic
  if (clinicId) {
    const clinic = state.clinics.find(c => c.id === clinicId);
    if (clinic) {
      clinic.currentQueueCount = Math.max(0, clinic.currentQueueCount - 1);
    }
  }

  if (state.isOnline && !bookingId.startsWith('off-')) {
    try {
      await fetch(`${CONFIG.API_BASE}/bookings/${bookingId}/complete`, { method: 'PUT' });
      showToast("Treatment marked complete.", "success");
    } catch (err) {
      queueOfflineQueueUpdate(bookingId, 'complete');
    }
  } else {
    queueOfflineQueueUpdate(bookingId, 'complete');
  }

  saveLocalState();
  if (document.body.classList.contains('healthcare-portal')) {
    updatePortalUI();
  }
}

async function adminCancel(bookingId) {
  const booking = state.bookings.find(b => b.id === bookingId);
  const clinicId = booking ? booking.clinicId : null;

  if (booking) {
    booking.status = 'Cancelled';
  }

  if (clinicId) {
    const clinic = state.clinics.find(c => c.id === clinicId);
    if (clinic) {
      clinic.currentQueueCount = Math.max(0, clinic.currentQueueCount - 1);
    }
  }

  if (state.isOnline && !bookingId.startsWith('off-')) {
    try {
      await fetch(`${CONFIG.API_BASE}/bookings/${bookingId}`, { method: 'DELETE' });
      showToast("Booking cancelled.", "info");
    } catch (err) {
      queueOfflineQueueUpdate(bookingId, 'cancel');
    }
  } else {
    queueOfflineQueueUpdate(bookingId, 'cancel');
  }

  saveLocalState();
  if (document.body.classList.contains('healthcare-portal')) {
    updatePortalUI();
  }
}

function queueOfflineQueueUpdate(bookingId, action) {
  state.offlineQueueUpdates.push({ bookingId, action, timestamp: Date.now() });
  saveLocalState();
  updateNetworkBadge();
  showToast("Queue operation saved offline.", "warning");
}

// ----------------------------------------------------
// PATIENT DATA RETRIEVAL & API CONSUMPTION
// ----------------------------------------------------

async function fetchClinics() {
  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/clinics/nearby?lat=${state.userLocation.lat}&lng=${state.userLocation.lng}`);
      const data = await response.json();
      if (data.success) {
        state.clinics = data.clinics;
        
        // Also update our loggedInClinic status if we are logged in
        if (state.loggedInClinic) {
          state.loggedInClinic = state.clinics.find(c => c.id === state.loggedInClinic.id) || state.loggedInClinic;
        }
        
        saveLocalState();
        return;
      }
    } catch (err) {
      console.warn("Fetch clinics failed, falling back to local dataset");
    }
  }
  
  calculateOfflineClinics();
}

async function fetchBookings() {
  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings`);
      const data = await response.json();
      if (data.success) {
        state.bookings = data.bookings;
        
        // Update active patient booking
        const active = state.bookings.find(b => b.userId === CONFIG.DEFAULT_USER.id && (b.status === 'Confirmed' || b.status === 'CheckedIn'));
        state.activeBooking = active || null;
        
        saveLocalState();
      }
    } catch (err) {
      console.warn("Fetch bookings failed, using local history");
    }
  }
}

// ----------------------------------------------------
// LOCAL STORAGE SYNCHRONIZATION ENGINE
// ----------------------------------------------------

function initSyncButton() {
  const syncBtn = document.getElementById('sync-btn');
  if (!syncBtn) return;

  syncBtn.addEventListener('click', async () => {
    if (!state.isOnline) return;
    
    syncBtn.disabled = true;
    syncBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Syncing...`;
    
    try {
      let syncsSucceeded = 0;

      // 1. Sync offline bookings (Patient additions)
      if (state.offlineQueue.length > 0) {
        const response = await fetch(`${CONFIG.API_BASE}/bookings/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookings: state.offlineQueue })
        });
        const data = await response.json();
        if (data.success) {
          syncsSucceeded += state.offlineQueue.length;
          state.offlineQueue = [];
        }
      }

      // 2. Sync offline clinic settings (Healthcare updates)
      if (state.offlineClinicSettings && state.loggedInClinic) {
        const cId = state.loggedInClinic.id;
        const response = await fetch(`${CONFIG.API_BASE}/clinics/${cId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state.offlineClinicSettings)
        });
        const data = await response.json();
        if (data.success) {
          syncsSucceeded += 1;
          state.offlineClinicSettings = null;
        }
      }

      // 3. Sync offline queue state transitions (Check-ins, completions)
      if (state.offlineQueueUpdates.length > 0) {
        for (const update of state.offlineQueueUpdates) {
          const { bookingId, action } = update;
          if (bookingId.startsWith('off-')) continue; // Skip sync for patient slots that didn't upload yet
          
          let url = `${CONFIG.API_BASE}/bookings/${bookingId}`;
          let method = 'PUT';
          if (action === 'checkin') url += '/checkin';
          else if (action === 'complete') url += '/complete';
          else if (action === 'cancel') method = 'DELETE';

          await fetch(url, { method });
          syncsSucceeded += 1;
        }
        state.offlineQueueUpdates = [];
      }

      showToast(`Successfully synchronized ${syncsSucceeded} pending operations!`, 'success');
      
      saveLocalState();
      
      // Refresh full datasets
      await fetchClinics();
      await fetchBookings();

      const isPatientPortal = document.body.classList.contains('patient-portal');
      const isHealthcarePortal = document.body.classList.contains('healthcare-portal');

      if (isPatientPortal) {
        renderClinicsList();
        updateActiveBookingUI();
        updateHistoryUI();
      }
      if (isHealthcarePortal) {
        updatePortalUI();
      }
      
    } catch (err) {
      showToast("Sync was interrupted by network loss.", 'error');
    } finally {
      syncBtn.disabled = false;
      updateNetworkBadge();
    }
  });
}

// ----------------------------------------------------
// PATIENT PORTAL INTERACTION HANDLERS
// ----------------------------------------------------

function initLocationSelector() {
  const buttons = document.querySelectorAll('.btn-loc');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      state.userLocation.lat = parseFloat(btn.dataset.lat);
      state.userLocation.lng = parseFloat(btn.dataset.lng);
      state.userLocation.name = btn.dataset.name;
      
      showToast(`Simulating location: ${state.userLocation.name}`, 'info');
      fetchClinics().then(() => renderClinicsList());
    });
  });
}

function initSortingControls() {
  const sortTotal = document.getElementById('sort-total');
  const sortDistance = document.getElementById('sort-distance');
  const sortWait = document.getElementById('sort-wait');
  
  if (!sortTotal) return;

  const clearActiveSort = () => {
    sortTotal.classList.remove('active');
    sortDistance.classList.remove('active');
    sortWait.classList.remove('active');
  };

  sortTotal.addEventListener('click', () => {
    clearActiveSort();
    sortTotal.classList.add('active');
    state.sortBy = 'totalTime';
    sortAndRenderClinics();
  });

  sortDistance.addEventListener('click', () => {
    clearActiveSort();
    sortDistance.classList.add('active');
    state.sortBy = 'distance';
    sortAndRenderClinics();
  });

  sortWait.addEventListener('click', () => {
    clearActiveSort();
    sortWait.classList.add('active');
    state.sortBy = 'waitTime';
    sortAndRenderClinics();
  });
}

function initSearchInput() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      sortAndRenderClinics();
    });
  }
}

function renderClinicsList() {
  sortAndRenderClinics();
}

function sortAndRenderClinics() {
  const queryInput = document.getElementById('search-input');
  const query = queryInput ? queryInput.value.toLowerCase() : '';
  const listContainer = document.getElementById('clinics-list');
  if (!listContainer) return;
  
  // Filter
  let filtered = state.clinics.filter(c => {
    return c.name.toLowerCase().includes(query) || 
           c.services.some(s => s.toLowerCase().includes(query));
  });

  // Sort
  if (state.sortBy === 'totalTime') {
    filtered.sort((a, b) => a.totalTimeMinutes - b.totalTimeMinutes);
  } else if (state.sortBy === 'distance') {
    filtered.sort((a, b) => a.distanceKm - b.distanceKm);
  } else if (state.sortBy === 'waitTime') {
    filtered.sort((a, b) => a.estimatedWaitTimeMinutes - b.estimatedWaitTimeMinutes);
  }

  const countBadge = document.getElementById('clinics-count');
  if (countBadge) countBadge.innerText = filtered.length;

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-square-minus"></i>
        <h3>No Clinics Found</h3>
        <p>Try searching for a different keyword or service.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = filtered.map(c => {
    const totalTimeText = c.totalTimeMinutes >= 60 
      ? `${Math.floor(c.totalTimeMinutes / 60)}h ${c.totalTimeMinutes % 60}m` 
      : `${c.totalTimeMinutes} mins`;

    // Power status badges
    let powerBadgeHtml = '';
    if (c.hasElectricity) {
      powerBadgeHtml = `<span class="power-badge grid-online"><i class="fa-solid fa-bolt"></i> Grid Power On</span>`;
    } else if (c.hasSolar) {
      powerBadgeHtml = `<span class="power-badge solar-backup"><i class="fa-solid fa-sun"></i> Solar Backup</span>`;
    } else {
      powerBadgeHtml = `<span class="power-badge outage"><i class="fa-solid fa-triangle-exclamation"></i> Outage</span>`;
    }

    // Capacity Remaining slots calculations
    const todayBookingsCount = state.bookings.filter(b => 
      b.clinicId === c.id && 
      (b.status === 'Confirmed' || b.status === 'CheckedIn')
    ).length;
    const remainingSlots = Math.max(0, (c.capacityPerDay || 40) - todayBookingsCount);

    return `
      <div class="card clinic-card" onclick="openBookingModal('${c.id}')">
        <div class="clinic-card-header">
          <h3>${c.name}</h3>
          <span class="distance-tag">
            ${c.distanceKm} km
          </span>
        </div>
        
        <div class="clinic-meta-row">
          ${powerBadgeHtml}
          <span class="slots-badge">${remainingSlots} slots left</span>
          <span class="subtext"><i class="fa-regular fa-clock"></i> ${c.operatingHours}</span>
        </div>
        
        <p class="clinic-address"><i class="fa-solid fa-location-dot"></i> ${c.address}</p>
        <div class="clinic-services">
          ${c.services.map(s => `<span class="service-pill">${s}</span>`).join('')}
        </div>
        <div class="clinic-card-footer">
          <div class="time-metric">
            <span class="metric-label">Travel Time</span>
            <span class="metric-val">${c.travelTimeMinutes} mins</span>
          </div>
          <div class="time-metric highlight">
            <span class="metric-label">Wait Room</span>
            <span class="metric-val">${c.estimatedWaitTimeMinutes} mins</span>
          </div>
          <div class="time-metric highlight">
            <span class="metric-label">Total Time</span>
            <span class="metric-val">${totalTimeText}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateActiveBookingUI() {
  const panel = document.getElementById('active-booking-panel');
  if (!panel) return;
  
  // Find current user's active booking
  const booking = state.bookings.find(b => 
    b.userId === CONFIG.DEFAULT_USER.id && 
    (b.status === 'Confirmed' || b.status === 'CheckedIn')
  );

  if (!booking) {
    panel.className = 'card active-booking-card empty';
    panel.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-ticket-simple"></i>
        <h3>No Ticket Active</h3>
        <p>Please select a clinic on the left, check power status/wait time, and reserve your slot.</p>
      </div>
    `;
    return;
  }

  const clinic = state.clinics.find(c => c.id === booking.clinicId) || { name: 'Health Clinic', address: '' };
  
  panel.className = 'card active-booking-card';
  panel.innerHTML = `
    <div class="active-booking-header">
      <div>
        <h3>${clinic.name}</h3>
        <span class="subtext">${clinic.address.substring(0, 40)}...</span>
      </div>
      <span class="queue-badge-status">${booking.status}</span>
    </div>
    <div class="queue-display">
      <div class="queue-number-box">
        <span class="label">Queue Ticket</span>
        <span class="number">${booking.queueNumber}</span>
      </div>
      <div class="queue-timer-box">
        <span class="label">Est. Waiting Room</span>
        <span class="time">${booking.estimatedWaitTime} mins</span>
      </div>
    </div>
    
    <div class="booking-advice">
      <i class="fa-solid fa-bell"></i>
      <p>Please arrive at the clinic around ${formatTime(booking.appointmentTime)}.</p>
    </div>
    
    <div class="booking-actions">
      ${booking.status === 'Confirmed' ? `
        <button class="btn btn-checkin" onclick="patientCheckIn('${booking.id}')">
          Check In
        </button>
      ` : `
        <button class="btn btn-checkin" onclick="patientComplete('${booking.id}')">
          Complete
        </button>
      `}
      <button class="btn btn-cancel" onclick="patientCancel('${booking.id}')">
        Cancel
      </button>
    </div>
  `;
}

function updateHistoryUI() {
  const container = document.getElementById('bookings-history');
  if (!container) return;
  
  // Filter for patients bookings
  const patientBookings = state.bookings.filter(b => b.userId === CONFIG.DEFAULT_USER.id);

  if (patientBookings.length === 0) {
    container.innerHTML = `
      <div class="empty-history">
        <p>No recent bookings.</p>
      </div>
    `;
    return;
  }

  const sortedHistory = [...patientBookings].sort((a, b) => new Date(b.bookingTime) - new Date(a.bookingTime));

  container.innerHTML = sortedHistory.map(b => {
    const clinic = state.clinics.find(c => c.id === b.clinicId) || { name: 'Health Clinic' };
    const dateStr = new Date(b.bookingTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = new Date(b.bookingTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const statusClass = `status-${b.status.toLowerCase()}`;

    return `
      <div class="history-item">
        <div class="history-item-info">
          <h4>${clinic.name}</h4>
          <p>${dateStr} at ${timeStr} • Ticket: <strong>${b.queueNumber}</strong></p>
        </div>
        <span class="history-status ${statusClass}">${b.status}</span>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// PATIENT BOOKING MODAL & ACTIONS
// ----------------------------------------------------

function openBookingModal(clinicId) {
  const clinic = state.clinics.find(c => c.id === clinicId);
  if (!clinic) return;

  // Check if clinic is open
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeVal = currentHour * 60 + currentMinute;
  
  const [openH, openM] = clinic.openTime.split(':').map(Number);
  const [closeH, closeM] = clinic.closeTime.split(':').map(Number);
  const openTimeVal = openH * 60 + openM;
  const closeTimeVal = closeH * 60 + closeM;

  if (currentTimeVal < openTimeVal || currentTimeVal > closeTimeVal) {
    showToast(`Warning: Clinic is currently closed (Operating Hours: ${clinic.operatingHours})`, 'warning');
  }

  document.getElementById('booking-clinic-id').value = clinic.id;
  document.getElementById('modal-clinic-name').innerText = clinic.name;
  document.getElementById('modal-clinic-address').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${clinic.address}`;
  document.getElementById('modal-clinic-distance').innerText = `${clinic.distanceKm} km`;
  document.getElementById('modal-clinic-travel').innerText = `${clinic.travelTimeMinutes} mins`;
  document.getElementById('modal-clinic-wait').innerText = `${clinic.estimatedWaitTimeMinutes} mins`;

  const select = document.getElementById('booking-time');
  const advice = document.getElementById('booking-advice-text');
  
  const updateAdvice = () => {
    const val = select.value;
    const travelTime = clinic.travelTimeMinutes;
    if (val === 'now') {
      advice.innerHTML = `Leave now. You will arrive in approx. <strong>${travelTime} mins</strong>.`;
    } else {
      const waitMinutes = parseInt(val, 10);
      const leaveIn = waitMinutes - travelTime;
      if (leaveIn <= 0) {
        advice.innerHTML = `Leave immediately! Travel takes ${travelTime} mins.`;
      } else {
        advice.innerHTML = `Leave in <strong>${leaveIn} minutes</strong> to arrive on time.`;
      }
    }
  };
  
  select.onchange = updateAdvice;
  updateAdvice();

  document.getElementById('booking-modal').style.display = 'flex';
}

function initModal() {
  const modal = document.getElementById('booking-modal');
  const close = document.querySelector('.modal-close');
  if (!modal) return;
  
  close.onclick = () => modal.style.display = 'none';
  window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

  const form = document.getElementById('booking-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const clinicId = document.getElementById('booking-clinic-id').value;
    const timeSelection = document.getElementById('booking-time').value;
    
    let appointmentOffsetMinutes = 0;
    if (timeSelection !== 'now') {
      appointmentOffsetMinutes = parseInt(timeSelection, 10);
    }
    
    const appointmentTime = new Date(Date.now() + (appointmentOffsetMinutes * 60000)).toISOString();
    modal.style.display = 'none';
    
    // Check if patient already has active ticket
    const active = state.bookings.find(b => b.userId === CONFIG.DEFAULT_USER.id && (b.status === 'Confirmed' || b.status === 'CheckedIn'));
    if (active) {
      showToast("You already have an active ticket. Please cancel or complete it first.", "warning");
      return;
    }

    await createPatientBooking(clinicId, appointmentTime);
  };
}

async function createPatientBooking(clinicId, appointmentTime) {
  const clinic = state.clinics.find(c => c.id === clinicId);
  const estWait = clinic ? clinic.estimatedWaitTimeMinutes : 30;

  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: CONFIG.DEFAULT_USER.id,
          clinicId,
          appointmentTime
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast(`Ticket ${data.booking.queueNumber} reserved!`, 'success');
        state.bookings.push(data.booking);
        state.activeBooking = data.booking;
        
        saveLocalState();
        updateActiveBookingUI();
        updateHistoryUI();
        fetchClinics().then(() => renderClinicsList());
        return;
      }
    } catch (err) {
      console.warn("Connection error, queueing offline");
    }
  }

  // Local offline booking logic
  const queuePrefix = clinicId.toUpperCase();
  const count = state.bookings.filter(b => b.clinicId === clinicId).length + 101;
  const offlineBooking = {
    id: `off-${Date.now()}`,
    userId: CONFIG.DEFAULT_USER.id,
    patientName: CONFIG.DEFAULT_USER.name,
    patientPhone: '+27 82 123 4567',
    clinicId,
    bookingTime: new Date().toISOString(),
    appointmentTime,
    status: 'Confirmed',
    queueNumber: `${queuePrefix}-${count} (Offline)`,
    estimatedWaitTime: estWait
  };
  
  state.bookings.push(offlineBooking);
  state.activeBooking = offlineBooking;
  state.offlineQueue.push(offlineBooking);
  
  // Adjust local capacity immediately
  if (clinic) {
    clinic.currentQueueCount += 1;
    clinic.estimatedWaitTimeMinutes += 10;
    clinic.totalTimeMinutes += 10;
  }
  
  saveLocalState();
  updateActiveBookingUI();
  updateHistoryUI();
  renderClinicsList();
  showToast("Booking saved offline. Sync to upload to server.", "warning");
}

// Patient actions trigger identical logic to admin controllers (delegated helpers)
async function patientCheckIn(bookingId) {
  await adminCheckIn(bookingId);
  updateActiveBookingUI();
  updateHistoryUI();
}

async function patientComplete(bookingId) {
  await adminComplete(bookingId);
  state.activeBooking = null;
  updateActiveBookingUI();
  updateHistoryUI();
}

async function patientCancel(bookingId) {
  await adminCancel(bookingId);
  state.activeBooking = null;
  updateActiveBookingUI();
  updateHistoryUI();
  fetchClinics().then(() => renderClinicsList());
}

// ----------------------------------------------------
// LOCAL HAVERSINE & WAIT TIME CALCULATIONS (OFFLINE ENGINE)
// ----------------------------------------------------

function calculateOfflineClinics() {
  state.clinics = state.clinics.map(clinic => {
    // Local Haversine
    const { distanceKm, durationMinutes: travelTimeMinutes } = 
      calculateDistanceAndDuration(
        state.userLocation.lat, 
        state.userLocation.lng, 
        clinic.lat, 
        clinic.lng
      );
    
    // Count active bookings locally
    const activeCount = state.bookings.filter(b => 
      b.clinicId === clinic.id && 
      (b.status === 'Confirmed' || b.status === 'CheckedIn')
    ).length;
    
    const estimatedWaitTimeMinutes = clinic.baseWaitTimeMinutes + (activeCount * 10);
    const totalTimeMinutes = travelTimeMinutes + estimatedWaitTimeMinutes;
    
    return {
      ...clinic,
      currentQueueCount: activeCount,
      distanceKm,
      travelTimeMinutes,
      estimatedWaitTimeMinutes,
      totalTimeMinutes
    };
  });
}

function calculateDistanceAndDuration(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  const averageSpeedKmh = 40;
  const travelTimeHours = distanceKm / averageSpeedKmh;
  const durationMinutes = Math.round(travelTimeHours * 60);

  return {
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    durationMinutes: durationMinutes < 1 ? 1 : durationMinutes
  };
}

function deg2rad(deg) { return deg * (Math.PI / 180); }
function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ----------------------------------------------------
// DIGITAL HEALTH PASSPORT & CONSENT (PATIENT SIDE)
// ----------------------------------------------------

let currentLanguage = 'en';

function initPatientPassport() {
  const consentToggle = document.getElementById('consent-grant-access');
  const langSelect = document.getElementById('passport-lang-select');
  const toggleLogsBtn = document.getElementById('toggle-audit-logs');
  const downloadBtn = document.getElementById('download-passport-btn');

  if (consentToggle) {
    consentToggle.addEventListener('change', async () => {
      const isAccessGranted = consentToggle.checked;
      await updatePatientConsentSettings({ isAccessGranted });
    });
  }

  if (langSelect) {
    langSelect.addEventListener('change', async () => {
      currentLanguage = langSelect.value;
      await updatePatientConsentSettings({ language: currentLanguage });
      // Reload timeline with translations
      const cached = localStorage.getItem('thuso_patient_records');
      if (cached) {
        renderPatientTimeline(JSON.parse(cached));
      }
    });
  }

  if (toggleLogsBtn) {
    toggleLogsBtn.addEventListener('click', async () => {
      const container = document.getElementById('audit-logs-list');
      const isHidden = container.classList.toggle('hidden');
      toggleLogsBtn.innerHTML = isHidden 
        ? `<i class="fa-solid fa-angle-right"></i> View Access Audit Logs (POPIA)`
        : `<i class="fa-solid fa-angle-down"></i> Hide Access Audit Logs (POPIA)`;
      
      if (!isHidden) {
        await fetchAndRenderAuditLogs();
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      downloadHealthPassportPDF();
    });
  }
}

async function fetchPatientPassport() {
  const patientId = CONFIG.DEFAULT_USER.id;
  
  // 1. Fetch Consent Settings
  if (state.isOnline) {
    try {
      const consentRes = await fetch(`${CONFIG.API_BASE}/patients/${patientId}/consent`);
      const consentData = await consentRes.json();
      if (consentData.success) {
        updateConsentUI(consentData.consent);
      }
    } catch (err) {
      console.warn("Could not fetch consent from server, using local fallback");
    }
  }

  // 2. Fetch Medical Records
  let records = [];
  if (state.isOnline) {
    try {
      const recordsRes = await fetch(`${CONFIG.API_BASE}/patients/${patientId}/records`);
      const recordsData = await recordsRes.json();
      if (recordsData.success) {
        records = recordsData.records;
        localStorage.setItem('thuso_patient_records', JSON.stringify(records));
      }
    } catch (err) {
      console.warn("Could not fetch records from server, checking local cache");
    }
  }

  if (records.length === 0) {
    const cached = localStorage.getItem('thuso_patient_records');
    if (cached) {
      records = JSON.parse(cached);
    } else {
      // Seed fallback mock medical record for offline
      records = [{
        record_id: 1,
        patient_id: "u1",
        doctor_id: "u2",
        doctor_name: "Dr. Sarah Dube",
        clinic_name: "Parktown Medical Centre",
        diagnosis: "Mild respiratory infection",
        treatment_plan: "Bed rest and hydration",
        medication_prescribed: "Paracetamol 500mg, Vitamin C",
        file_url_r2: "https://r2.thuso.health/reports/u1-rec1.pdf",
        created_at: new Date(Date.now() - 86400000 * 2).toISOString()
      }];
      localStorage.setItem('thuso_patient_records', JSON.stringify(records));
    }
  }

  renderPatientTimeline(records);
}

function updateConsentUI(consent) {
  const consentToggle = document.getElementById('consent-grant-access');
  const pinDisplay = document.getElementById('consent-pin-code');
  const langSelect = document.getElementById('passport-lang-select');
  const thusoIdDisplay = document.getElementById('passport-thuso-id');

  if (consentToggle) consentToggle.checked = consent.isAccessGranted;
  if (pinDisplay) pinDisplay.innerText = consent.consentPin;
  if (langSelect) {
    langSelect.value = consent.language || 'en';
    currentLanguage = consent.language || 'en';
  }
  if (thusoIdDisplay && consent.thuso_id_hash) {
    thusoIdDisplay.innerText = consent.thuso_id_hash;
  }
}

async function updatePatientConsentSettings(payload) {
  const patientId = CONFIG.DEFAULT_USER.id;
  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/patients/${patientId}/consent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        showToast("Consent configurations synchronized online.", "success");
        updateConsentUI(data.consent);
        return;
      }
    } catch (err) {
      console.warn("Consent update failed to sync online, saving locally");
    }
  }
  
  // Local fallback update
  showToast("Consent updated locally (offline mode).", "warning");
}

async function renderPatientTimeline(records) {
  const container = document.getElementById('passport-records-timeline');
  if (!container) return;

  if (records.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 1rem 0;">
        <i class="fa-solid fa-notes-medical"></i>
        <h3>No Medical Records</h3>
        <p>Consultation logs will appear here once written by a practitioner.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  
  // Sort records descending
  const sorted = [...records].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  for (const rec of sorted) {
    const daysAgo = Math.round((Date.now() - new Date(rec.created_at)) / 86400000);
    const timeText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
    
    // Translate text dynamically using Cloudflare Mock translator
    const diagnosis = await translateMockText(rec.diagnosis, currentLanguage);
    const plan = await translateMockText(rec.treatment_plan, currentLanguage);
    const meds = await translateMockText(rec.medication_prescribed, currentLanguage);

    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="timeline-header">
        <span class="timeline-doctor">${rec.doctor_name} (${rec.clinic_name})</span>
        <span>${timeText}</span>
      </div>
      <div class="timeline-body">
        <p><strong>Diagnosis:</strong> ${diagnosis}</p>
        ${plan ? `<p><strong>Plan:</strong> ${plan}</p>` : ''}
        ${meds ? `<p><strong>Prescription:</strong> ${meds}</p>` : ''}
        ${rec.file_url_r2 ? `
          <a href="${rec.file_url_r2}" target="_blank" class="timeline-attachment">
            <i class="fa-solid fa-file-pdf"></i> View Attachment (Cloudflare R2)
          </a>
        ` : ''}
      </div>
    `;
    container.appendChild(item);
  }
}

async function translateMockText(text, targetLang) {
  if (!text || !targetLang || targetLang === 'en') return text;
  
  if (state.isOnline) {
    try {
      const res = await fetch(`${CONFIG.API_BASE}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage: targetLang })
      });
      const data = await res.json();
      if (data.success) {
        return data.translatedText;
      }
    } catch (err) {
      console.warn("Translation failed");
    }
  }

  // Offline fallback translation
  const dict = {
    'zulu': {
      'Mild respiratory infection': 'Ukwetheleleka okuncane kokuphefumula',
      'Bed rest and hydration': 'Ukuphumula embhedeni nokuphuza amanzi amaningi',
      'Paracetamol 500mg, Vitamin C': 'I-Paracetamol 500mg, i-Vitamin C'
    },
    'sesotho': {
      'Mild respiratory infection': 'Tšoaetso e bonolo ea ho hema',
      'Bed rest and hydration': 'Ho phomola betheng le ho nwa metsi a mangata',
      'Paracetamol 500mg, Vitamin C': 'Paracetamol 500mg, Vitamin C'
    }
  };
  const langKey = targetLang.toLowerCase();
  if (dict[langKey] && dict[langKey][text]) {
    return dict[langKey][text];
  }
  return `[${targetLang.toUpperCase()}] ${text}`;
}

async function fetchAndRenderAuditLogs() {
  const container = document.getElementById('audit-logs-list');
  if (!container) return;

  const patientId = CONFIG.DEFAULT_USER.id;
  let logs = [];

  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/patients/${patientId}/logs`);
      const data = await response.json();
      if (data.success) {
        logs = data.logs;
      }
    } catch (err) {
      console.warn("Could not load POPIA audit logs offline");
    }
  }

  if (logs.length === 0) {
    container.innerHTML = `<p style="font-size: 0.7rem; color: var(--text-muted); text-align: center; padding: 0.5rem 0;">No access audit records found.</p>`;
    return;
  }

  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  container.innerHTML = logs.map(l => {
    const timeStr = new Date(l.timestamp).toLocaleString();
    return `
      <div class="audit-log-item">
        <span>${timeStr}</span>
        <span>${l.practitioner_name}</span>
        <span class="action">${l.action}</span>
      </div>
    `;
  }).join('');
}

function downloadHealthPassportPDF() {
  const cached = localStorage.getItem('thuso_patient_records');
  const records = cached ? JSON.parse(cached) : [];
  
  if (records.length === 0) {
    showToast("No medical history available to download.", "warning");
    return;
  }

  // Generate simple text-based formatted document
  let docContent = `THUSO HEALTH PASSPORT - MEDICAL REPORT\n`;
  docContent += `==========================================\n`;
  docContent += `Patient Name: Paseka Moloi\n`;
  docContent += `Thuso ID: TH-u1\n`;
  docContent += `Generated At: ${new Date().toLocaleString()}\n`;
  docContent += `==========================================\n\n`;

  records.forEach((r, i) => {
    docContent += `CONSULTATION SUMMARY #${i+1}\n`;
    docContent += `Date: ${new Date(r.created_at).toLocaleDateString()}\n`;
    docContent += `Practitioner: ${r.doctor_name}\n`;
    docContent += `Facility: ${r.clinic_name}\n`;
    docContent += `Diagnosis: ${r.diagnosis}\n`;
    docContent += `Treatment Plan: ${r.treatment_plan || 'N/A'}\n`;
    docContent += `Prescription: ${r.medication_prescribed || 'N/A'}\n`;
    docContent += `File Link: ${r.file_url_r2 || 'N/A'}\n`;
    docContent += `------------------------------------------\n\n`;
  });

  const blob = new Blob([docContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `thuso-health-passport-u1.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast("Health Passport downloaded successfully! (Data-free offline storage saved)", "success");
}

// ----------------------------------------------------
// DIGITAL HEALTH PASSPORT (PRACTITIONER PORTAL SIDE)
// ----------------------------------------------------

let currentLookupPatientId = null;

function initPractitionerPassport() {
  const lookupBtn = document.getElementById('btn-lookup-passport');
  const consultForm = document.getElementById('consultation-form');

  if (lookupBtn) {
    lookupBtn.addEventListener('click', async () => {
      const patientInput = document.getElementById('lookup-patient-id').value.trim();
      const pin = document.getElementById('lookup-patient-pin').value.trim();
      const errorContainer = document.getElementById('lookup-error-container');
      const resultsContainer = document.getElementById('lookup-results-container');

      errorContainer.classList.add('hidden');
      resultsContainer.classList.add('hidden');

      if (!patientInput) {
        showToast("Please enter a valid Patient ID", "warning");
        return;
      }

      // Convert email to patient id if needed
      let patientId = patientInput;
      if (patientInput.includes('@')) {
        patientId = 'u1'; // Mock translation of email to patient ID for Paseka Moloi
      }

      if (!state.isOnline) {
        // Offline Mock Access Check
        if (patientId === 'u1' && pin === '1234') {
          currentLookupPatientId = 'u1';
          renderPractitionerRecordsList([{
            record_id: 1,
            patient_id: "u1",
            doctor_name: "Dr. Sarah Dube",
            clinic_name: "Parktown Medical Centre",
            diagnosis: "Mild respiratory infection",
            treatment_plan: "Bed rest and hydration",
            medication_prescribed: "Paracetamol 500mg, Vitamin C",
            created_at: new Date(Date.now() - 86400000 * 2).toISOString()
          }]);
          
          document.getElementById('practitioner-patient-name').innerText = 'Paseka Moloi';
          document.getElementById('practitioner-thuso-id').innerText = 'TH-u1';
          resultsContainer.classList.remove('hidden');
          showToast("Access granted offline (Validated via PIN)", "warning");
        } else {
          errorContainer.innerText = "Offline Lookup Error: PIN verification requires online connection or exact match.";
          errorContainer.classList.remove('hidden');
        }
        return;
      }

      // Online lookup
      try {
        const queryParams = new URLSearchParams({ doctorId: state.loggedInUser.id });
        if (pin) queryParams.append('pin', pin);

        const response = await fetch(`${CONFIG.API_BASE}/patients/${patientId}/records?${queryParams.toString()}`);
        const data = await response.json();

        if (data.success) {
          currentLookupPatientId = patientId;
          
          // Fetch patient profile to show name
          const consentRes = await fetch(`${CONFIG.API_BASE}/patients/${patientId}/consent`);
          const consentData = await consentRes.json();
          
          document.getElementById('practitioner-patient-name').innerText = patientId === 'u1' ? 'Paseka Moloi' : 'Patient Name';
          document.getElementById('practitioner-thuso-id').innerText = (consentData.success && consentData.consent.thuso_id_hash) ? consentData.consent.thuso_id_hash : `TH-${patientId}`;
          
          renderPractitionerRecordsList(data.records);
          resultsContainer.classList.remove('hidden');
          showToast("Authorized Passport access granted.", "success");
        } else {
          errorContainer.innerText = data.error || "Access Denied: Patient PIN or consent required.";
          errorContainer.classList.remove('hidden');
        }
      } catch (err) {
        errorContainer.innerText = "Error looking up patient medical history from server.";
        errorContainer.classList.remove('hidden');
      }
    });
  }

  if (consultForm) {
    consultForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentLookupPatientId) {
        showToast("No active patient lookup verified.", "error");
        return;
      }

      const diagnosis = document.getElementById('consult-diagnosis').value;
      const treatment_plan = document.getElementById('consult-treatment').value;
      const medication_prescribed = document.getElementById('consult-prescription').value;

      const payload = {
        doctorId: state.loggedInUser.id,
        diagnosis,
        treatment_plan,
        medication_prescribed
      };

      if (!state.isOnline) {
        showToast("Consultation summary must be saved while online.", "error");
        return;
      }

      try {
        const response = await fetch(`${CONFIG.API_BASE}/patients/${currentLookupPatientId}/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
          showToast("Consultation summary added and synced successfully!", "success");
          
          // Clear form fields
          document.getElementById('consult-diagnosis').value = '';
          document.getElementById('consult-treatment').value = '';
          document.getElementById('consult-prescription').value = '';
          
          // Re-trigger patient lookup to display updated timeline
          document.getElementById('btn-lookup-passport').click();
        } else {
          showToast(data.error || "Failed to save record.", "error");
        }
      } catch (err) {
        showToast("Server error writing to Patient Health Passport.", "error");
      }
    });
  }
}

function renderPractitionerRecordsList(records) {
  const container = document.getElementById('practitioner-records-timeline');
  if (!container) return;

  if (!records || records.length === 0) {
    container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem 0;">No medical history entries recorded.</p>`;
    return;
  }

  container.innerHTML = '';
  records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  records.forEach(rec => {
    const daysAgo = Math.round((Date.now() - new Date(rec.created_at)) / 86400000);
    const timeText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;

    const div = document.createElement('div');
    div.className = 'timeline-item';
    div.innerHTML = `
      <div class="timeline-header">
        <span class="timeline-doctor">${rec.doctor_name} (${rec.clinic_name})</span>
        <span>${timeText}</span>
      </div>
      <div class="timeline-body">
        <p><strong>Diagnosis:</strong> ${rec.diagnosis}</p>
        ${rec.treatment_plan ? `<p><strong>Plan:</strong> ${rec.treatment_plan}</p>` : ''}
        ${rec.medication_prescribed ? `<p><strong>Prescription:</strong> ${rec.medication_prescribed}</p>` : ''}
      </div>
    `;
    container.appendChild(div);
  });
}
