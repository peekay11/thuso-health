// Thuso Health Application State & Business Logic

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
  offlineQueue: [], // Stores bookings created while offline
  sortBy: 'totalTime' // totalTime, distance, waitTime
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
    operatingHours: "08:00 - 17:00"
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
    operatingHours: "24 Hours"
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
    operatingHours: "08:00 - 18:00"
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
    operatingHours: "09:00 - 17:00"
  }
];

// Initialize UI Elements
document.addEventListener('DOMContentLoaded', () => {
  initLocationSelector();
  initSortingControls();
  initSearchInput();
  initModal();
  initSyncButton();
  
  // Load initial bookings from LocalStorage
  loadLocalBookings();
  
  // Initial health check and fetch
  checkConnection().then(() => {
    fetchClinics();
    fetchBookings();
  });

  // Start polling to detect network transitions
  setInterval(() => {
    checkConnection().then(onlineChanged => {
      if (onlineChanged) {
        fetchClinics();
        fetchBookings();
      }
    });
  }, CONFIG.SERVER_PING_INTERVAL_MS);
});

// Toast Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
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
  
  if (state.isOnline) {
    badge.className = 'badge online';
    text.innerText = 'Online';
    
    if (state.offlineQueue.length > 0) {
      syncBtn.classList.remove('hidden');
      syncCount.innerText = state.offlineQueue.length;
    } else {
      syncBtn.classList.add('hidden');
    }
  } else {
    badge.className = 'badge offline';
    text.innerText = 'Offline Mode';
    syncBtn.classList.add('hidden'); // Cannot sync while still offline
  }
}

// Save & load local storage bookings (Offline database)
function loadLocalBookings() {
  const localHistory = localStorage.getItem('thuso_bookings_history');
  const localQueue = localStorage.getItem('thuso_offline_queue');
  
  if (localHistory) {
    state.bookings = JSON.parse(localHistory);
  }
  if (localQueue) {
    state.offlineQueue = JSON.parse(localQueue);
  }
  
  // Set active booking if there is an uncompleted one
  const active = state.bookings.find(b => b.status === 'Confirmed' || b.status === 'CheckedIn');
  if (active) {
    state.activeBooking = active;
  } else {
    state.activeBooking = null;
  }
  
  updateActiveBookingUI();
  updateHistoryUI();
  updateNetworkBadge();
}

function saveLocalBookings() {
  localStorage.setItem('thuso_bookings_history', JSON.stringify(state.bookings));
  localStorage.setItem('thuso_offline_queue', JSON.stringify(state.offlineQueue));
}

// ----------------------------------------------------
// DATA FETCHING & SYNCHRONIZATION
// ----------------------------------------------------

async function fetchClinics() {
  const listContainer = document.getElementById('clinics-list');
  
  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/clinics/nearby?lat=${state.userLocation.lat}&lng=${state.userLocation.lng}`);
      const data = await response.json();
      if (data.success) {
        state.clinics = data.clinics;
        renderClinicsList();
        return;
      }
    } catch (err) {
      console.warn("Fetch clinics failed, falling back to offline mode computation");
    }
  }
  
  // Offline fallback
  calculateOfflineClinics();
  renderClinicsList();
}

async function fetchBookings() {
  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings/user/${CONFIG.DEFAULT_USER.id}`);
      const data = await response.json();
      if (data.success) {
        state.bookings = data.bookings;
        
        // Update active booking
        const active = state.bookings.find(b => b.status === 'Confirmed' || b.status === 'CheckedIn');
        state.activeBooking = active || null;
        
        saveLocalBookings();
        updateActiveBookingUI();
        updateHistoryUI();
      }
    } catch (err) {
      console.warn("Fetch bookings failed, using local history");
    }
  }
}

function initSyncButton() {
  const syncBtn = document.getElementById('sync-btn');
  syncBtn.addEventListener('click', async () => {
    if (!state.isOnline || state.offlineQueue.length === 0) return;
    
    syncBtn.disabled = true;
    syncBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Syncing...`;
    
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookings: state.offlineQueue })
      });
      const data = await response.json();
      
      if (data.success) {
        showToast(`Successfully synchronized ${data.synced.length} offline bookings!`, 'success');
        
        // Remove synced bookings from offline queue
        state.offlineQueue = [];
        saveLocalBookings();
        
        // Refresh full data
        await fetchClinics();
        await fetchBookings();
      } else {
        showToast("Synchronization failed: " + data.message, 'error');
      }
    } catch (err) {
      showToast("Connection lost during sync.", 'error');
    } finally {
      syncBtn.disabled = false;
      updateNetworkBadge();
    }
  });
}

// ----------------------------------------------------
// DOM MANIPULATION & UI RENDERING
// ----------------------------------------------------

function initLocationSelector() {
  const buttons = document.querySelectorAll('.btn-loc');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      state.userLocation.lat = parseFloat(btn.dataset.lat);
      state.userLocation.lng = parseFloat(btn.dataset.lng);
      state.userLocation.name = btn.dataset.name;
      
      showToast(`Location simulated to ${state.userLocation.name}`, 'info');
      fetchClinics();
    });
  });
}

function initSortingControls() {
  const sortTotal = document.getElementById('sort-total');
  const sortDistance = document.getElementById('sort-distance');
  const sortWait = document.getElementById('sort-wait');
  
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
  searchInput.addEventListener('input', () => {
    sortAndRenderClinics();
  });
}

function renderClinicsList() {
  sortAndRenderClinics();
}

function sortAndRenderClinics() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const listContainer = document.getElementById('clinics-list');
  
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

  document.getElementById('clinics-count').innerText = filtered.length;

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

    return `
      <div class="card clinic-card" onclick="openBookingModal('${c.id}')">
        <div class="clinic-card-header">
          <h3>${c.name}</h3>
          <span class="distance-tag">
            <i class="fa-solid fa-car"></i> ${c.distanceKm} km
          </span>
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
          <div class="time-metric accent-indigo">
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
  if (!state.activeBooking) {
    panel.className = 'card active-booking-card empty';
    panel.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-ticket-simple"></i>
        <h3>No Active Queue Ticket</h3>
        <p>Select a clinic from the list to book a slot and secure your ticket.</p>
      </div>
    `;
    return;
  }

  const booking = state.activeBooking;
  const clinic = MOCK_CLINICS.find(c => c.id === booking.clinicId) || { name: 'Health Clinic', address: '' };
  
  panel.className = 'card active-booking-card';
  panel.innerHTML = `
    <div class="active-booking-header">
      <div>
        <h3>${clinic.name}</h3>
        <span class="subtext"><i class="fa-solid fa-location-dot"></i> ${clinic.address.substring(0, 40)}...</span>
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
        <span class="time" id="live-wait-time-counter">${booking.estimatedWaitTime} mins</span>
      </div>
    </div>
    
    <div class="booking-advice">
      <i class="fa-solid fa-bell"></i>
      <p>Please arrive at the clinic around ${formatTime(booking.appointmentTime)}.</p>
    </div>
    
    <div class="booking-actions">
      ${booking.status === 'Confirmed' ? `
        <button class="btn btn-checkin" onclick="checkInBooking('${booking.id}')">
          <i class="fa-solid fa-circle-check"></i> Check In
        </button>
      ` : `
        <button class="btn btn-checkin" onclick="completeBooking('${booking.id}')">
          <i class="fa-solid fa-flag-checkered"></i> Done/Complete
        </button>
      `}
      <button class="btn btn-cancel" onclick="cancelBooking('${booking.id}')">
        <i class="fa-solid fa-trash-can"></i> Cancel
      </button>
    </div>
  `;
}

function updateHistoryUI() {
  const container = document.getElementById('bookings-history');
  if (state.bookings.length === 0) {
    container.innerHTML = `
      <div class="empty-history">
        <p>No past bookings found.</p>
      </div>
    `;
    return;
  }

  // Display reverse order (newest first)
  const sortedHistory = [...state.bookings].sort((a, b) => new Date(b.bookingTime) - new Date(a.bookingTime));

  container.innerHTML = sortedHistory.map(b => {
    const clinic = MOCK_CLINICS.find(c => c.id === b.clinicId) || { name: 'Health Clinic' };
    const dateStr = new Date(b.bookingTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = new Date(b.bookingTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const statusClass = `status-${b.status.toLowerCase()}`;

    return `
      <div class="history-item">
        <div class="history-item-info">
          <h4>${clinic.name}</h4>
          <p><i class="fa-regular fa-calendar"></i> ${dateStr} at ${timeStr} • Ticket: <strong>${b.queueNumber}</strong></p>
        </div>
        <span class="history-status ${statusClass}">${b.status}</span>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// BOOKING ACTIONS (CREATE, CHECKIN, COMPLETE, CANCEL)
// ----------------------------------------------------

function openBookingModal(clinicId) {
  const clinic = state.clinics.find(c => c.id === clinicId);
  if (!clinic) return;

  document.getElementById('booking-clinic-id').value = clinic.id;
  document.getElementById('modal-clinic-name').innerText = clinic.name;
  document.getElementById('modal-clinic-address').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${clinic.address}`;
  document.getElementById('modal-clinic-distance').innerText = `${clinic.distanceKm} km`;
  document.getElementById('modal-clinic-travel').innerText = `${clinic.travelTimeMinutes} mins`;
  document.getElementById('modal-clinic-wait').innerText = `${clinic.estimatedWaitTimeMinutes} mins`;

  const select = document.getElementById('booking-time');
  const advice = document.getElementById('booking-advice-text');
  
  // Dynamic advice calculations based on selection
  const updateAdvice = () => {
    const val = select.value;
    const travelTime = clinic.travelTimeMinutes;
    if (val === 'now') {
      advice.innerHTML = `<i class="fa-solid fa-car-side"></i> Leave now. You will arrive in approx. <strong>${travelTime} mins</strong>.`;
    } else {
      const waitMinutes = parseInt(val, 10);
      const leaveIn = waitMinutes - travelTime;
      if (leaveIn <= 0) {
        advice.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #fb923c;"></i> Warning: Travel takes ${travelTime} mins! You should leave immediately.`;
      } else {
        advice.innerHTML = `<i class="fa-regular fa-bell"></i> You should leave in <strong>${leaveIn} minutes</strong> to arrive on time.`;
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
  
  close.onclick = () => {
    modal.style.display = 'none';
  };

  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };

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
    
    if (state.activeBooking) {
      showToast("You already have an active ticket. Please cancel or complete it first.", "warning");
      return;
    }

    await createBooking(clinicId, appointmentTime);
  };
}

async function createBooking(clinicId, appointmentTime) {
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
        showToast(`Ticket ${data.booking.queueNumber} reserved successfully!`, 'success');
        state.bookings.push(data.booking);
        state.activeBooking = data.booking;
        
        saveLocalBookings();
        updateActiveBookingUI();
        updateHistoryUI();
        
        // Refresh clinics to update queue count
        fetchClinics();
        return;
      }
    } catch (err) {
      console.warn("Server booking failed, saving locally for offline sync");
    }
  }

  // Create Offline Booking
  const clinic = state.clinics.find(c => c.id === clinicId);
  const queuePrefix = clinicId.toUpperCase();
  const count = state.bookings.filter(b => b.clinicId === clinicId).length + 101;
  const estWait = clinic ? clinic.estimatedWaitTimeMinutes : 30;
  
  const offlineBooking = {
    id: `off-${Date.now()}`,
    userId: CONFIG.DEFAULT_USER.id,
    clinicId,
    bookingTime: new Date().toISOString(),
    appointmentTime,
    status: 'Confirmed',
    queueNumber: `${queuePrefix}-${count} (Offline)`,
    estimatedWaitTime: estWait
  };
  
  // Save in local state and offline sync queue
  state.bookings.push(offlineBooking);
  state.activeBooking = offlineBooking;
  state.offlineQueue.push(offlineBooking);
  
  // Temporarily increment the local queue count so it reflects immediately offline
  const localClinic = state.clinics.find(c => c.id === clinicId);
  if (localClinic) {
    localClinic.currentQueueCount += 1;
    localClinic.estimatedWaitTimeMinutes += 10;
    localClinic.totalTimeMinutes += 10;
  }
  
  saveLocalBookings();
  updateActiveBookingUI();
  updateHistoryUI();
  renderClinicsList();
  
  showToast("Saved offline. Will sync automatically when connection restores.", "warning");
}

async function checkInBooking(bookingId) {
  if (bookingId.startsWith('off-')) {
    // Local checkin for offline bookings
    const booking = state.bookings.find(b => b.id === bookingId);
    if (booking) {
      booking.status = 'CheckedIn';
      state.activeBooking = booking;
      saveLocalBookings();
      updateActiveBookingUI();
      updateHistoryUI();
      showToast("Checked in successfully offline!", "success");
    }
    return;
  }

  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings/${bookingId}/checkin`, { method: 'PUT' });
      const data = await response.json();
      if (data.success) {
        showToast("Checked in successfully!", "success");
        await fetchBookings();
      }
    } catch (err) {
      showToast("Could not check in: server is unreachable.", "error");
    }
  } else {
    showToast("Must be online to check in official server tickets.", "warning");
  }
}

async function completeBooking(bookingId) {
  // If completed offline, let's just complete locally
  if (bookingId.startsWith('off-')) {
    const booking = state.bookings.find(b => b.id === bookingId);
    if (booking) {
      booking.status = 'Completed';
      state.activeBooking = null;
      
      // Remove from offline sync queue if we already completed it locally before syncing
      state.offlineQueue = state.offlineQueue.filter(b => b.id !== bookingId);
      
      // Decrement the local clinic count
      const localClinic = state.clinics.find(c => c.id === booking.clinicId);
      if (localClinic) {
        localClinic.currentQueueCount = Math.max(0, localClinic.currentQueueCount - 1);
        localClinic.estimatedWaitTimeMinutes = Math.max(localClinic.baseWaitTimeMinutes, localClinic.estimatedWaitTimeMinutes - 10);
        localClinic.totalTimeMinutes = Math.max(localClinic.travelTimeMinutes, localClinic.totalTimeMinutes - 10);
      }
      
      saveLocalBookings();
      updateActiveBookingUI();
      updateHistoryUI();
      renderClinicsList();
      showToast("Completed booking!", "success");
    }
    return;
  }

  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings/${bookingId}/complete`, { method: 'PUT' });
      const data = await response.json();
      if (data.success) {
        showToast("Ticket completed. Thank you!", "success");
        await fetchBookings();
        fetchClinics();
      }
    } catch (err) {
      showToast("Error completing ticket: server is unreachable.", "error");
    }
  } else {
    showToast("Must be online to complete server tickets.", "warning");
  }
}

async function cancelBooking(bookingId) {
  if (bookingId.startsWith('off-')) {
    // Remove local booking
    state.bookings = state.bookings.filter(b => b.id !== bookingId);
    state.activeBooking = null;
    state.offlineQueue = state.offlineQueue.filter(b => b.id !== bookingId);
    
    // Decrement the local clinic count
    const booking = state.bookings.find(b => b.id === bookingId);
    const cId = booking ? booking.clinicId : null;
    if (cId) {
      const localClinic = state.clinics.find(c => c.id === cId);
      if (localClinic) {
        localClinic.currentQueueCount = Math.max(0, localClinic.currentQueueCount - 1);
        localClinic.estimatedWaitTimeMinutes = Math.max(localClinic.baseWaitTimeMinutes, localClinic.estimatedWaitTimeMinutes - 10);
        localClinic.totalTimeMinutes = Math.max(localClinic.travelTimeMinutes, localClinic.totalTimeMinutes - 10);
      }
    }
    
    saveLocalBookings();
    updateActiveBookingUI();
    updateHistoryUI();
    renderClinicsList();
    showToast("Offline booking cancelled.", "info");
    return;
  }

  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings/${bookingId}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        showToast("Booking cancelled.", "info");
        await fetchBookings();
        fetchClinics();
      }
    } catch (err) {
      showToast("Could not cancel: server is unreachable.", "error");
    }
  } else {
    showToast("Must be online to cancel server bookings.", "warning");
  }
}

// ----------------------------------------------------
// LOCAL HAVERSINE & WAIT TIME CALCULATIONS (OFFLINE ENGINE)
// ----------------------------------------------------

function calculateOfflineClinics() {
  state.clinics = MOCK_CLINICS.map(clinic => {
    // Local Haversine
    const { distanceKm, durationMinutes: travelTimeMinutes } = 
      calculateDistanceAndDuration(
        state.userLocation.lat, 
        state.userLocation.lng, 
        clinic.lat, 
        clinic.lng
      );
    
    // Check if we have active bookings for this clinic in local state
    // and adjust queue count dynamically
    const bookingCount = state.bookings.filter(b => b.clinicId === clinic.id && (b.status === 'Confirmed' || b.status === 'CheckedIn')).length;
    const totalQueueCount = clinic.currentQueueCount + bookingCount;
    
    const estimatedWaitTimeMinutes = clinic.baseWaitTimeMinutes + (totalQueueCount * 10);
    const totalTimeMinutes = travelTimeMinutes + estimatedWaitTimeMinutes;
    
    return {
      ...clinic,
      currentQueueCount: totalQueueCount,
      distanceKm,
      travelTimeMinutes,
      estimatedWaitTimeMinutes,
      totalTimeMinutes
    };
  });
}

function calculateDistanceAndDuration(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
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

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// ----------------------------------------------------
// TIME FORMATTING HELPERS
// ----------------------------------------------------

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
