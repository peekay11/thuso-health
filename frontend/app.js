// Thuso Health Application State & Business Logic (Dual-Portal System)

// ─── DEPLOYMENT CONFIG ───────────────────────────────────────────────────────
// After running `wrangler deploy` in the worker/ directory, replace the URL
// below with your actual Worker URL shown in the deploy output.
const WORKER_URL = 'https://thuso-health-api.pasekamabitsela22.workers.dev';

const CONFIG = {
  API_BASE: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8787/api'      // local wrangler dev server (cd worker && npm run dev)
    : `${WORKER_URL}/api`,            // Cloudflare Worker (production)
  SERVER_PING_INTERVAL_MS: 5000
};

// ─── JWT TOKEN MANAGEMENT ────────────────────────────────────────────────────
function getAuthToken() {
  return localStorage.getItem('thuso_jwt_token');
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('thuso_jwt_token', token);
  } else {
    localStorage.removeItem('thuso_jwt_token');
  }
}

// authFetch: wraps fetch() with the JWT Authorization header automatically
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}

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
  
  // Auth: Patient
  patientUser: null,  // { id, name, email, thuso_id_hash, consentPin, isAccessGranted, language }

  // Auth: Healthcare Manager
  loggedInUser: null,
  loggedInClinic: null,
  
  // Offline sync queues
  offlineQueue: [],
  offlineQueueUpdates: [],
  offlineClinicSettings: null,
  
  sortBy: 'totalTime',
  powerFilter: 'all',  // 'all' | 'grid' | 'solar' | 'outage'
  searchRadius: 10,    // km — controlled by the radius slider
  osmFacilities: []    // OSM-discovered facilities (directions-only, not in D1)
};

// ─── MAP STATE ──────────────────────────────────────────────────────────────
let map = null;
let userMarker = null;
let osmLayerGroup = null;   // OSM-discovered facilities (background layer)
let clinicLayerGroup = null; // Our D1 bookable clinics (top layer)

// ─── MAP INITIALISATION ──────────────────────────────────────────────────────

function initMap() {
  const container = document.getElementById('clinic-map');
  if (!container || map) return; // already initialised

  map = L.map('clinic-map', { zoomControl: true, attributionControl: false }).setView(
    [state.userLocation.lat, state.userLocation.lng], 13
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  L.control.attribution({ prefix: false }).addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>').addTo(map);

  osmLayerGroup = L.layerGroup().addTo(map);   // added first = renders below
  clinicLayerGroup = L.layerGroup().addTo(map); // added second = renders on top

  // Place user marker immediately at the current location
  placeUserMarker(state.userLocation.lat, state.userLocation.lng);

  // Render any clinics already loaded
  if (state.clinics.length > 0) updateMapClinicMarkers();
}

function placeUserMarker(lat, lng) {
  if (!map) return;
  const icon = L.divIcon({
    className: '',
    html: '<div class="user-dot"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
    userMarker.bindPopup('<div class="clinic-popup"><h4>You are here</h4></div>');
  }
}

function updateMapClinicMarkers() {
  if (!map || !clinicLayerGroup) return;
  clinicLayerGroup.clearLayers();

  state.clinics.forEach(c => {
    if (!c.lat || !c.lng) return;

    const wait = c.estimatedWaitTimeMinutes || 0;
    let pinColor, waitClass;
    if (wait < 30)       { pinColor = '#22c55e'; waitClass = 'wait-green'; }
    else if (wait <= 60) { pinColor = '#f59e0b'; waitClass = 'wait-amber'; }
    else                 { pinColor = '#ef4444'; waitClass = 'wait-red'; }

    const icon = L.divIcon({
      className: '',
      html: `<div class="clinic-pin">
               <div class="clinic-pin-head" style="background:${pinColor};">
                 <span>${wait}<br>min</span>
               </div>
             </div>`,
      iconSize: [38, 46],
      iconAnchor: [19, 46],
      popupAnchor: [0, -46]
    });

    const power = c.hasElectricity
      ? '<span class="popup-stat"><i>⚡</i> Grid</span>'
      : c.hasSolar
        ? '<span class="popup-stat"><i>☀️</i> Solar</span>'
        : '<span class="popup-stat" style="background:#fee2e2;color:#991b1b;"><i>⚠️</i> Outage</span>';

    const popupHtml = `
      <div class="clinic-popup">
        <h4>${c.name}</h4>
        <p class="popup-address"><i class="fa-solid fa-location-dot"></i> ${c.address}</p>
        <div class="popup-stats">
          <span class="popup-stat"><i>🚗</i> ${c.distanceKm} km · ${c.travelTimeMinutes} min</span>
          <span class="popup-stat ${waitClass}"><i>⏱</i> ${wait} min wait</span>
          ${power}
        </div>
        <button class="popup-book-btn" onclick="openBookingModal('${c.id}');map.closePopup();">
          Book My Slot →
        </button>
      </div>`;

    L.marker([c.lat, c.lng], { icon })
      .addTo(clinicLayerGroup)
      .bindPopup(popupHtml, { maxWidth: 260 });
  });
}

// ─── OVERPASS / OSM FACILITY DISCOVERY ───────────────────────────────────────

async function fetchOSMClinics(lat, lng, radiusM = 8000) {
  const q = `
[out:json][timeout:25];
(
  node["amenity"~"^(hospital|clinic|doctors|health_centre|pharmacy)$"](around:${radiusM},${lat},${lng});
  node["healthcare"](around:${radiusM},${lat},${lng});
  way["amenity"~"^(hospital|clinic|doctors|health_centre|pharmacy)$"](around:${radiusM},${lat},${lng});
  way["healthcare"](around:${radiusM},${lat},${lng});
);
out center tags;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: q
    });
    const data = await res.json();
    return data.elements || [];
  } catch (e) {
    console.warn('Overpass API error:', e);
    return [];
  }
}

function updateOSMMarkers(elements) {
  if (!map || !osmLayerGroup) return;
  osmLayerGroup.clearLayers();
  state.osmFacilities = [];

  const seen = new Set();

  elements.forEach(el => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) return;

    // Deduplicate by rounded position
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Skip if within 200m of one of our D1 clinics (already has a proper pin)
    const overlapsOurs = state.clinics.some(c =>
      Math.abs(c.lat - lat) < 0.0018 && Math.abs(c.lng - lng) < 0.0018
    );
    if (overlapsOurs) return;

    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || 'Healthcare Facility';
    const type = tags.amenity || tags.healthcare || 'clinic';
    const addr = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:city']]
      .filter(Boolean).join(' ') || tags['addr:full'] || tags['is_in'] || '';
    const phone = tags.phone || tags['contact:phone'] || '';
    const hours = tags.opening_hours || '';

    // Compute haversine distance for list rendering
    const { distanceKm } = calculateDistanceAndDuration
      ? calculateDistanceAndDuration(state.userLocation.lat, state.userLocation.lng, lat, lng)
      : { distanceKm: 0 };

    // Store in state for list rendering
    state.osmFacilities.push({ id: `osm-${el.id}`, name, type, addr, phone, hours, lat, lng, distanceKm });

    const emoji = type === 'hospital' ? '🏥'
      : type === 'pharmacy' ? '💊'
      : type === 'doctors' ? '👨‍⚕️'
      : '🏨';

    const icon = L.divIcon({
      className: '',
      html: `<div class="osm-pin osm-pin--${type}">${emoji}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -18]
    });

    const mapsUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`;
    const popup = `
      <div class="clinic-popup">
        <h4>${name}</h4>
        ${addr ? `<p class="popup-address"><i class="fa-solid fa-location-dot"></i> ${addr}</p>` : ''}
        <div class="popup-stats">
          <span class="popup-stat">${emoji} ${type.replace(/_/g,' ')}</span>
          ${phone ? `<span class="popup-stat">📞 ${phone}</span>` : ''}
          ${hours ? `<span class="popup-stat">🕐 ${hours}</span>` : ''}
        </div>
        <a href="${mapsUrl}" target="_blank" rel="noopener"
           style="display:block;width:100%;padding:0.45rem;font-size:0.78rem;font-weight:700;font-family:var(--font-heading,sans-serif);background:#475569;color:#fff;border:none;border-radius:8px;text-align:center;text-decoration:none;margin-top:0.5rem;">
          View on OpenStreetMap →
        </a>
      </div>`;

    L.marker([lat, lng], { icon })
      .addTo(osmLayerGroup)
      .bindPopup(popup, { maxWidth: 270 });
  });

  // Update OSM count badge in the UI
  const badge = document.getElementById('osm-count-badge');
  if (badge) {
    const count = seen.size;
    badge.textContent = `+${count} OSM facilities`;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}
// ─── LOCATION SYSTEM ─────────────────────────────────────────────────────────
// Strategy for maximum accuracy:
//   • maximumAge: 0 everywhere — NEVER use a cached/stale position
//   • Phase 1 – 3-second multi-sample: start watchPosition immediately,
//     collect readings, show map as soon as we get any fix (or after 3 s with
//     the best reading collected so far)
//   • Phase 2 – 30-second background refinement: keep watching, update the
//     marker and shrink the accuracy circle in real-time
//   • Live colour coding: red (>100 m) → amber (≤100 m) → green (≤20 m)

const GPS_PHASE1_MS     = 3000;   // show first result after at most this long
const GPS_REFINE_MS     = 30000;  // keep refining for this long in background
const GPS_EXCELLENT_M   = 10;     // ≤ this = excellent (circle disappears)
const GPS_GOOD_M        = 20;     // ≤ this = good (green badge)
const GPS_FAIR_M        = 100;    // ≤ this = fair (amber badge)

let accuracyCircle   = null;
let refineWatchId    = null;
let locationCaptured = false;

/** Draw / update the translucent accuracy circle around the user dot */
function updateAccuracyCircle(lat, lng, radiusM) {
  if (!map) return;
  if (accuracyCircle) {
    accuracyCircle.setLatLng([lat, lng]);
    accuracyCircle.setRadius(radiusM);
  } else {
    accuracyCircle = L.circle([lat, lng], {
      radius: radiusM,
      color: '#4f46e5',
      fillColor: '#4f46e5',
      fillOpacity: 0.09,
      weight: 1.5,
      dashArray: '4 3'
    }).addTo(map);
  }
}

function _removeAccuracyCircle() {
  if (accuracyCircle && map) {
    map.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }
}

/** Update the location label with colour-coded accuracy badge */
function _updateLocationLabel(label, areaName, accuracyM, source) {
  if (!label) return;
  const icon = source === 'gps'  ? 'fa-location-dot'
             : source === 'wifi' ? 'fa-wifi'
             : 'fa-map-pin';
  let accBadge = '';
  if (accuracyM < 5000) {
    const cls = accuracyM <= GPS_GOOD_M  ? 'loc-acc--good'
              : accuracyM <= GPS_FAIR_M  ? 'loc-acc--fair'
              : 'loc-acc--poor';
    accBadge = `<span class="loc-accuracy ${cls}">±${Math.round(accuracyM)} m</span>`;
  }
  label.innerHTML = `<i class="fa-solid ${icon}"></i> ${areaName}${accBadge}`;
}

/** Apply a position: update state, map, marker, accuracy circle, clinics, geocode */
async function applyLocation(lat, lng, accuracyM, label, btn, silent) {
  state.userLocation = { lat, lng, name: state.userLocation?.name || 'Your Location' };
  locationCaptured = true;

  placeUserMarker(lat, lng);
  updateAccuracyCircle(lat, lng, accuracyM);
  if (map) map.setView([lat, lng], 16);

  await fetchClinics();
  renderClinicsList();
  updateMapClinicMarkers();
  fetchOSMClinics(lat, lng, 15000).then(updateOSMMarkers);

  // Reverse geocode (Nominatim) — non-blocking after first call
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ThusoHealth/1.0' } }
    );
    const geo = await r.json();
    const area = geo.address?.suburb || geo.address?.city_district ||
                 geo.address?.quarter || geo.address?.city ||
                 geo.address?.town    || geo.address?.village || 'Your Location';
    state.userLocation.name = area;
    _updateLocationLabel(label, area, accuracyM, 'gps');
  } catch {
    _updateLocationLabel(label, state.userLocation.name, accuracyM, 'gps');
  }

  if (!silent) showToast('📍 GPS location captured.', 'success');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> My Location'; }
}

/** Phase 2 — continuous background refinement (updates marker live) */
function startBackgroundRefinement(initialAccuracy) {
  if (refineWatchId !== null) navigator.geolocation.clearWatch(refineWatchId);

  let bestAccuracy = initialAccuracy;
  const label = document.getElementById('location-area-name');
  const refineStart = Date.now();

  refineWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
        state.userLocation.lat = latitude;
        state.userLocation.lng = longitude;
        placeUserMarker(latitude, longitude);
        updateAccuracyCircle(latitude, longitude, accuracy);
        _updateLocationLabel(label, state.userLocation.name, accuracy, 'gps');

        if (accuracy <= GPS_EXCELLENT_M) {
          // Perfect fix — stop watching and fade the circle
          navigator.geolocation.clearWatch(refineWatchId);
          refineWatchId = null;
          setTimeout(_removeAccuracyCircle, 1500);
        }
      }
    },
    (err) => { console.warn('Refinement watch error:', err.message); },
    {
      enableHighAccuracy: true,
      maximumAge: 0,          // ← never use a cached reading
      timeout: 10000          // per-reading timeout (watchPosition resets per reading)
    }
  );

  // Hard stop after GPS_REFINE_MS
  setTimeout(() => {
    if (refineWatchId !== null) {
      navigator.geolocation.clearWatch(refineWatchId);
      refineWatchId = null;
    }
    // Fade circle if still showing after refinement window
    if (accuracyCircle) setTimeout(_removeAccuracyCircle, 2000);
  }, GPS_REFINE_MS);
}

async function ipFallbackLocation(label, btn, silent) {
  try {
    const r = await fetch('https://ipapi.co/json/');
    const d = await r.json();
    if (d.latitude && d.longitude) {
      if (!silent) showToast('GPS unavailable — using approximate network location.', 'warning');
      await applyLocation(d.latitude, d.longitude, 5000, label, btn, true);
      const city = d.city || d.region || 'Your Area';
      _updateLocationLabel(label, city, 5000, 'wifi');
      return;
    }
  } catch { /* network error */ }
  if (!silent) showToast('Could not determine location. Pick one manually.', 'warning');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> My Location'; }
  _updateLocationLabel(label, state.userLocation?.name || 'Unknown', Infinity, 'pin');
}

async function requestRealLocation(silent = false) {
  const btn   = document.getElementById('btn-use-real-location');
  const label = document.getElementById('location-area-name');
  if (btn)   { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>'; }
  if (label) label.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Getting exact location…';

  // Stop any previous refinement watch first
  if (refineWatchId !== null) {
    navigator.geolocation.clearWatch(refineWatchId);
    refineWatchId = null;
  }

  if (!navigator.geolocation) {
    await ipFallbackLocation(label, btn, silent);
    return;
  }

  // ── Phase 1: multi-sample quick fix ──────────────────────────────────────
  // Start watchPosition immediately (no maximumAge cache), collect readings
  // for GPS_PHASE1_MS ms, then resolve with the best one seen so far.
  let phase1Best = null;
  let phase1WatchId = null;

  try {
    const phase1Pos = await new Promise((resolve, reject) => {
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        navigator.geolocation.clearWatch(phase1WatchId);
        if (phase1Best) resolve(phase1Best);
        else reject(new Error('No position obtained'));
      };

      phase1WatchId = navigator.geolocation.watchPosition(
        (pos) => {
          // Always keep the most accurate reading
          if (!phase1Best || pos.coords.accuracy < phase1Best.coords.accuracy) {
            phase1Best = pos;
          }
          // Resolve early if we already have an excellent fix
          if (phase1Best.coords.accuracy <= GPS_GOOD_M) finish();
        },
        (err) => {
          navigator.geolocation.clearWatch(phase1WatchId);
          if (!resolved) { resolved = true; reject(err); }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,       // ← NEVER use stale cache
          timeout: 15000       // per-reading timeout
        }
      );

      // After GPS_PHASE1_MS, resolve with whatever is best so far
      setTimeout(finish, GPS_PHASE1_MS);
    });

    const { latitude, longitude, accuracy } = phase1Pos.coords;
    await applyLocation(latitude, longitude, accuracy, label, btn, silent);

    // ── Phase 2: keep improving silently ──────────────────────────────────
    startBackgroundRefinement(accuracy);

  } catch (err) {
    if (err?.code === 1) {
      await ipFallbackLocation(label, btn, silent);
    } else {
      if (!silent) showToast('GPS timed out — using network location.', 'warning');
      await ipFallbackLocation(label, btn, true);
    }
  }
}


async function autoRequestLocation() {
  if (!navigator.geolocation) {
    ipFallbackLocation(
      document.getElementById('location-area-name'),
      document.getElementById('btn-use-real-location'),
      true
    );
    return;
  }

  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'granted') {
        // Permission already granted — capture immediately, silently
        requestRealLocation(true);
      } else if (perm.state === 'prompt') {
        // Will show the browser permission prompt — not silent so user sees context
        requestRealLocation(false);
      } else {
        // Denied — fall back to IP, label shows pin icon
        ipFallbackLocation(
          document.getElementById('location-area-name'),
          document.getElementById('btn-use-real-location'),
          true
        );
      }
      // Listen for permission changes (e.g. user re-grants)
      perm.addEventListener('change', () => {
        if (perm.state === 'granted') requestRealLocation(true);
      });
    } catch {
      requestRealLocation(false);
    }
  } else {
    requestRealLocation(false);
  }
}

// ─── END MAP FUNCTIONS ───────────────────────────────────────────────────────

// Full SA all-province clinic dataset — used as offline fallback when the API is unavailable.
const DEMO_CLINICS_SA = [
  // ── GAUTENG ─────────────────────────────────────────────────────────────
  { id:'gt-1', name:'Parktown Medical Centre', address:'Jubilee Rd, Parktown, Johannesburg', province:'Gauteng',
    lat:-26.1932, lng:28.0459, services:['General Practitioner','HIV/AIDS Care','Pharmacy','Vaccinations'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:30 - 16:30', capacityPerDay:80, baseWaitTimeMinutes:25 },
  { id:'gt-2', name:'Soweto Community Health Centre', address:'Immink Dr, Jabulani, Soweto', province:'Gauteng',
    lat:-26.2485, lng:27.8546, services:['General Practitioner','Pediatrics','Dentistry','Vaccinations'],
    hasElectricity:true, hasSolar:true, operatingHours:'07:00 - 19:00', capacityPerDay:120, baseWaitTimeMinutes:40 },
  { id:'gt-3', name:'Alexandra Community Clinic', address:'Pan Africa Shopping Centre, Alexandra', province:'Gauteng',
    lat:-26.1065, lng:28.1134, services:['General Practitioner','HIV/AIDS Care','Pharmacy'],
    hasElectricity:false, hasSolar:true, operatingHours:'08:00 - 17:00', capacityPerDay:60, baseWaitTimeMinutes:35 },
  { id:'gt-4', name:'Tshwane District Hospital', address:'Dr Savage Rd, Pretoria Central', province:'Gauteng',
    lat:-25.7461, lng:28.1881, services:['General Practitioner','Pediatrics','Dentistry','Pharmacy','HIV/AIDS Care'],
    hasElectricity:true, hasSolar:false, operatingHours:'00:00 - 23:59', capacityPerDay:200, baseWaitTimeMinutes:50 },
  { id:'gt-5', name:'Lenasia South CHC', address:'Lenasia South Ext 4, Johannesburg', province:'Gauteng',
    lat:-26.3630, lng:27.8300, services:['General Practitioner','Vaccinations','Pharmacy'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:30 - 16:00', capacityPerDay:55, baseWaitTimeMinutes:20 },

  // ── WESTERN CAPE ────────────────────────────────────────────────────────
  { id:'wc-1', name:'Mitchells Plain Community Health Centre', address:'AZ Berman Dr, Mitchells Plain, Cape Town', province:'Western Cape',
    lat:-34.0483, lng:18.6153, services:['General Practitioner','HIV/AIDS Care','Pediatrics','Pharmacy'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:30 - 16:30', capacityPerDay:100, baseWaitTimeMinutes:45 },
  { id:'wc-2', name:'Tygerberg Hospital Outpatient', address:'Francie van Zijl Dr, Bellville, Cape Town', province:'Western Cape',
    lat:-33.9183, lng:18.6321, services:['General Practitioner','Dentistry','Pediatrics','Pharmacy','Vaccinations'],
    hasElectricity:true, hasSolar:true, operatingHours:'07:00 - 17:00', capacityPerDay:150, baseWaitTimeMinutes:55 },
  { id:'wc-3', name:'George Hospital Clinic', address:'York St, George, Western Cape', province:'Western Cape',
    lat:-33.9648, lng:22.4541, services:['General Practitioner','HIV/AIDS Care','Pharmacy'],
    hasElectricity:true, hasSolar:false, operatingHours:'08:00 - 16:00', capacityPerDay:60, baseWaitTimeMinutes:30 },

  // ── KWAZULU-NATAL ────────────────────────────────────────────────────────
  { id:'kzn-1', name:'King Edward VIII Hospital Clinic', address:'Umbilo Rd, Umbilo, Durban', province:'KwaZulu-Natal',
    lat:-29.8586, lng:30.9836, services:['General Practitioner','HIV/AIDS Care','Pharmacy','Pediatrics'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:00 - 16:00', capacityPerDay:180, baseWaitTimeMinutes:60 },
  { id:'kzn-2', name:'Addington District Hospital Clinic', address:'Erskine Terrace, South Beach, Durban', province:'KwaZulu-Natal',
    lat:-29.8614, lng:31.0484, services:['General Practitioner','Dentistry','Vaccinations'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:30 - 15:30', capacityPerDay:70, baseWaitTimeMinutes:40 },
  { id:'kzn-3', name:"Grey's Hospital Outpatient", address:'Pietermaritz St, Pietermaritzburg', province:'KwaZulu-Natal',
    lat:-29.6006, lng:30.3794, services:['General Practitioner','Pediatrics','HIV/AIDS Care','Pharmacy'],
    hasElectricity:true, hasSolar:true, operatingHours:'07:00 - 16:30', capacityPerDay:90, baseWaitTimeMinutes:35 },

  // ── EASTERN CAPE ─────────────────────────────────────────────────────────
  { id:'ec-1', name:'Livingstone Hospital Clinic', address:'Standford Rd, Gqeberha (Port Elizabeth)', province:'Eastern Cape',
    lat:-33.9660, lng:25.5703, services:['General Practitioner','HIV/AIDS Care','Pharmacy','Pediatrics'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:30 - 16:00', capacityPerDay:110, baseWaitTimeMinutes:50 },
  { id:'ec-2', name:'Frere Hospital Community Clinic', address:'Billie Rd, East London', province:'Eastern Cape',
    lat:-32.9920, lng:27.8742, services:['General Practitioner','Vaccinations','Dentistry'],
    hasElectricity:false, hasSolar:true, operatingHours:'08:00 - 16:00', capacityPerDay:65, baseWaitTimeMinutes:30 },
  { id:'ec-3', name:'Nelson Mandela Academic Hospital Clinic', address:'Nelson Mandela Dr, Mthatha', province:'Eastern Cape',
    lat:-31.5944, lng:28.7903, services:['General Practitioner','HIV/AIDS Care','Pharmacy','Pediatrics'],
    hasElectricity:true, hasSolar:false, operatingHours:'00:00 - 23:59', capacityPerDay:130, baseWaitTimeMinutes:70 },

  // ── LIMPOPO ──────────────────────────────────────────────────────────────
  { id:'lp-1', name:'Polokwane Provincial Hospital Clinic', address:'Hospital St, Polokwane', province:'Limpopo',
    lat:-23.9061, lng:29.4558, services:['General Practitioner','Pharmacy','Pediatrics','HIV/AIDS Care'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:00 - 16:00', capacityPerDay:100, baseWaitTimeMinutes:45 },
  { id:'lp-2', name:'Tzaneen Community Health Centre', address:'Tzaneen, Limpopo', province:'Limpopo',
    lat:-23.8330, lng:30.1616, services:['General Practitioner','Vaccinations','HIV/AIDS Care'],
    hasElectricity:true, hasSolar:true, operatingHours:'07:30 - 15:30', capacityPerDay:55, baseWaitTimeMinutes:25 },

  // ── MPUMALANGA ───────────────────────────────────────────────────────────
  { id:'mp-1', name:'Rob Ferreira Hospital Clinic', address:'Ferreira St, Mbombela (Nelspruit)', province:'Mpumalanga',
    lat:-25.4745, lng:30.9744, services:['General Practitioner','Pediatrics','HIV/AIDS Care','Pharmacy'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:00 - 16:30', capacityPerDay:90, baseWaitTimeMinutes:40 },
  { id:'mp-2', name:'eMalahleni (Witbank) District Clinic', address:'Mandela St, eMalahleni', province:'Mpumalanga',
    lat:-25.8730, lng:29.2320, services:['General Practitioner','Pharmacy','Vaccinations'],
    hasElectricity:false, hasSolar:true, operatingHours:'08:00 - 16:00', capacityPerDay:60, baseWaitTimeMinutes:20 },

  // ── NORTH WEST ───────────────────────────────────────────────────────────
  { id:'nw-1', name:'Job Shimankana Tabane Hospital Clinic', address:'Fatima Bhayat St, Rustenburg', province:'North West',
    lat:-25.6702, lng:27.2420, services:['General Practitioner','HIV/AIDS Care','Pharmacy','Pediatrics'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:00 - 17:00', capacityPerDay:80, baseWaitTimeMinutes:35 },
  { id:'nw-2', name:'Mahikeng Provincial Hospital Clinic', address:'Joseph Ayinde St, Mahikeng', province:'North West',
    lat:-25.8482, lng:25.6459, services:['General Practitioner','Dentistry','Pharmacy'],
    hasElectricity:true, hasSolar:false, operatingHours:'08:00 - 16:00', capacityPerDay:70, baseWaitTimeMinutes:30 },

  // ── FREE STATE ───────────────────────────────────────────────────────────
  { id:'fs-1', name:'Pelonomi Regional Hospital Clinic', address:'Ngwaketse Rd, Bloemfontein', province:'Free State',
    lat:-29.1210, lng:26.2217, services:['General Practitioner','HIV/AIDS Care','Pediatrics','Pharmacy'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:00 - 16:00', capacityPerDay:95, baseWaitTimeMinutes:50 },
  { id:'fs-2', name:'Dihlabeng Regional Hospital Clinic', address:'Muller St, Bethlehem, Free State', province:'Free State',
    lat:-28.2315, lng:28.2965, services:['General Practitioner','Vaccinations','Dentistry'],
    hasElectricity:true, hasSolar:true, operatingHours:'07:30 - 15:30', capacityPerDay:50, baseWaitTimeMinutes:20 },

  // ── NORTHERN CAPE ────────────────────────────────────────────────────────
  { id:'nc-1', name:'Robert Mangaliso Sobukwe Hospital Clinic', address:'Du Toitspan Rd, Kimberley', province:'Northern Cape',
    lat:-28.7282, lng:24.7514, services:['General Practitioner','HIV/AIDS Care','Pharmacy','Pediatrics'],
    hasElectricity:true, hasSolar:false, operatingHours:'07:00 - 16:00', capacityPerDay:75, baseWaitTimeMinutes:30 },
  { id:'nc-2', name:'Gordonia Hospital Clinic', address:'Mutual St, Upington', province:'Northern Cape',
    lat:-28.4443, lng:21.2560, services:['General Practitioner','Vaccinations','Pharmacy'],
    hasElectricity:true, hasSolar:true, operatingHours:'08:00 - 16:00', capacityPerDay:45, baseWaitTimeMinutes:15 },
  { id:'nc-3', name:'Springbok Community Health Centre', address:'Van Riebeeck St, Springbok', province:'Northern Cape',
    lat:-29.6647, lng:17.8865, services:['General Practitioner','HIV/AIDS Care','Vaccinations'],
    hasElectricity:false, hasSolar:true, operatingHours:'08:00 - 15:00', capacityPerDay:35, baseWaitTimeMinutes:10 },
];

// ─── TAB NAVIGATION ──────────────────────────────────────────────────────────

function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('tab-active'));
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('tab-active');

  // Desktop nav active states
  ['clinics', 'education', 'profile', 'settings'].forEach(t => {
    const el = document.getElementById('nav-' + t);
    if (el) el.classList.toggle('nav-link--active', t === name);
  });

  // Mobile tab bar active states
  ['clinics', 'education', 'profile', 'settings'].forEach(t => {
    const el = document.getElementById('mob-tab-' + t);
    if (el) el.classList.toggle('mob-tab-active', t === name);
  });

  // Leaflet needs a size refresh when its container is revealed from display:none
  if (name === 'clinics' && map) {
    setTimeout(() => map.invalidateSize(), 60);
  }

  document.getElementById('navbar-nav')?.classList.remove('nav-open');
  localStorage.setItem('thuso_active_tab', name);
}

// Initialize UI Elements
// ─── ESKOM LOAD SHEDDING BANNER ──────────────────────────────────────────────

async function checkEskomStatus() {
  const banner = document.getElementById('eskom-banner');
  const bannerText = document.getElementById('eskom-status-text');
  if (!banner || !bannerText) return;
  try {
    const res = await fetch('https://loadshedding.eskom.co.za/LoadShedding/GetStatus', { signal: AbortSignal.timeout(5000) });
    const stage = parseInt(await res.text(), 10);
    if (stage > 0) {
      bannerText.textContent = `⚡ Eskom Stage ${stage} load shedding is active. Clinics may have limited power. Filter to solar-powered clinics below.`;
      banner.classList.remove('hidden');
      if (stage >= 4) banner.classList.add('eskom-high');
    }
  } catch (_) { /* CORS or timeout — silently skip */ }
}

// ─── PUBLIC HOLIDAY CHECK ────────────────────────────────────────────────────

async function checkPublicHoliday() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yr    = new Date().getFullYear();
    const data  = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${yr}/ZA`).then(r => r.json());
    const hol   = data.find(h => h.date === today);
    if (hol) {
      showToast(`Today is ${hol.name} — some clinics may have reduced hours or be closed.`, 'warning');
    }
  } catch (_) {}
}

// ─── MYMEMORY TRANSLATION ────────────────────────────────────────────────────

async function translateText(text, lang) {
  if (!lang || lang === 'en') return text;
  try {
    const res  = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`);
    const data = await res.json();
    return data?.responseData?.translatedText || text;
  } catch (_) { return text; }
}

document.addEventListener('DOMContentLoaded', () => {
  loadLocalState();
  initSyncButton();
  
  const isPatientPortal = document.body.classList.contains('patient-portal');
  const isHealthcarePortal = document.body.classList.contains('healthcare-portal');

  if (isPatientPortal) {
    initPatientAuth(); // Auth gate — MUST come first
    initLocationSelector();
    initSortingControls();
    initSearchInput();
    initModal();
    initPatientPassport();
    // Restore last active tab (default to clinics)
    const lastTab = localStorage.getItem('thuso_active_tab') || 'clinics';
    showTab(lastTab);
    // Live service checks
    checkEskomStatus();
    checkPublicHoliday();
  }

  if (isHealthcarePortal) {
    initHealthcareAuth();
    initHealthcareDashboard();
    initPractitionerPassport();
  }
  
  checkConnection().then(() => {
    fetchClinics().then(() => {
      if (isPatientPortal && state.patientUser) renderClinicsList();
    });
    fetchBookings().then(() => {
      if (isPatientPortal && state.patientUser) {
        updateActiveBookingUI();
        updateHistoryUI();
        fetchPatientPassport();
      }
      if (isHealthcarePortal) {
        updatePortalUI();
      }
    });
  });

  setInterval(() => {
    checkConnection().then(onlineChanged => {
      if (onlineChanged) {
        fetchClinics().then(() => {
          if (isPatientPortal && state.patientUser) renderClinicsList();
        });
        fetchBookings().then(() => {
          if (isPatientPortal && state.patientUser) {
            updateActiveBookingUI();
            updateHistoryUI();
            fetchPatientPassport();
          }
          if (isHealthcarePortal) updatePortalUI();
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
    badge.className = 'status-chip status-chip--online';
    text.innerText = 'Online';

    if (pendingSyncs > 0) {
      syncBtn.classList.remove('hidden');
      syncCount.innerText = pendingSyncs;
    } else {
      syncBtn.classList.add('hidden');
    }
  } else {
    badge.className = 'status-chip status-chip--offline';
    text.innerText = 'Offline';
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
  const localPatient = localStorage.getItem('thuso_patient_session');
  
  if (localHistory) state.bookings = JSON.parse(localHistory);
  if (localQueue) state.offlineQueue = JSON.parse(localQueue);
  if (localQueueUpdates) state.offlineQueueUpdates = JSON.parse(localQueueUpdates);
  if (localClinics) {
    const parsed = JSON.parse(localClinics);
    // Re-seed if cached data is old format without province field
    state.clinics = (parsed.length > 0 && parsed[0].province) ? parsed : [];
  } else {
    state.clinics = [];
  }
  if (localUser) state.loggedInUser = JSON.parse(localUser);
  if (localClinic) state.loggedInClinic = JSON.parse(localClinic);
  if (localOfflineSettings) state.offlineClinicSettings = JSON.parse(localOfflineSettings);
  if (localPatient) state.patientUser = JSON.parse(localPatient);
  
  // Set active booking scoped to logged-in patient
  const uid = state.patientUser ? state.patientUser.id : null;
  const active = state.bookings.find(b =>
    (uid ? b.userId === uid : true) &&
    (b.status === 'Confirmed' || b.status === 'CheckedIn')
  );
  state.activeBooking = active || null;
}

function saveLocalState() {
  localStorage.setItem('thuso_bookings_history', JSON.stringify(state.bookings));
  localStorage.setItem('thuso_offline_queue', JSON.stringify(state.offlineQueue));
  localStorage.setItem('thuso_offline_updates', JSON.stringify(state.offlineQueueUpdates));
  localStorage.setItem('thuso_clinics', JSON.stringify(state.clinics));
  localStorage.setItem('thuso_offline_settings', JSON.stringify(state.offlineClinicSettings));
  
  if (state.patientUser) {
    localStorage.setItem('thuso_patient_session', JSON.stringify(state.patientUser));
  } else {
    localStorage.removeItem('thuso_patient_session');
  }
  
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
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const btn = formLogin.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

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
        if (data.token) setAuthToken(data.token);
        saveLocalState();
        updatePortalUI();
        showToast(`Logged in successfully to ${data.clinic.name}`, 'success');
      } else {
        showToast(data.message || 'Invalid email or password.', 'error');
      }
    } catch (err) {
      // Offline demo fallback for hackathon demo
      if (password === 'password123' && (
        email === 'sarah@thuso.health' || email === 'admin@thuso.health' || email === 'doctor@thuso.health'
      )) {
        state.loggedInUser = { id: 'doctor-1', name: 'Dr. Sarah Dube', email, role: 'provider', clinic_name: 'Parktown Medical Centre' };
        state.loggedInClinic = { id: 'clinic-1', name: 'Parktown Medical Centre', address: 'Parktown, Johannesburg' };
        saveLocalState();
        updatePortalUI();
        showToast('Signed in (offline demo mode).', 'info');
      } else {
        showToast('Could not reach the server. Check your connection.', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In to Clinic Dashboard';
    }
  });

  // Register submit
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const clinicName = document.getElementById('register-clinic-name').value.trim();
    const clinicAddress = document.getElementById('register-clinic-address').value.trim();

    const btn = formRegister.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Registering…';

    try {
      const response = await fetch(`${CONFIG.API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role: 'healthcare', clinicName, clinicAddress })
      });
      const data = await response.json();

      if (data.success) {
        showToast('Registration complete! Please sign in.', 'success');
        tabLogin.click();
      } else {
        showToast(data.message || 'Registration failed.', 'error');
      }
    } catch (err) {
      showToast('Could not reach the server. Check your connection.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Register Clinic';
    }
  });
}

function initHealthcareDashboard() {
  const logoutBtn = document.getElementById('btn-healthcare-logout');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {
    state.loggedInUser = null;
    state.loggedInClinic = null;
    setAuthToken(null);
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
        const response = await authFetch(`${CONFIG.API_BASE}/clinics/${cId}`, {
          method: 'PUT',
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
      console.warn("Fetch clinics failed, using cached data if available");
    }
  }

  if (state.clinics.length > 0) {
    calculateOfflineClinics();
  } else {
    // Seed all-province demo data so the app always has clinics to show
    state.clinics = DEMO_CLINICS_SA;
    saveLocalState();
    calculateOfflineClinics();
    showToast('Showing all-province demo clinics (offline mode).', 'info');
  }
}

async function fetchBookings() {
  if (state.isOnline) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/bookings`);
      const data = await response.json();
      if (data.success) {
        state.bookings = data.bookings;
        
        // Update active patient booking
        const active = state.bookings.find(b => b.userId === (state.patientUser ? state.patientUser.id : 'u1') && (b.status === 'Confirmed' || b.status === 'CheckedIn'));
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
  // "My Location" button — re-captures GPS and re-fetches clinics
  const realLocBtn = document.getElementById('btn-use-real-location');
  if (realLocBtn) {
    realLocBtn.addEventListener('click', () => requestRealLocation(false));
  }

  // "Snap to my location" button — pans/zooms map to known position instantly
  const snapBtn = document.getElementById('btn-snap-to-location');
  if (snapBtn) {
    snapBtn.addEventListener('click', () => {
      if (!map) return;
      const { lat, lng } = state.userLocation;
      if (!lat || !lng) {
        showToast('Location not yet captured. Tap "My Location" first.', 'warning');
        return;
      }
      map.flyTo([lat, lng], 16, { animate: true, duration: 0.8 });
      // Briefly scale up the user dot to draw attention
      if (userMarker) {
        const el = userMarker.getElement();
        if (el) {
          el.style.transition = 'transform 0.3s';
          el.style.transform  = 'scale(2)';
          setTimeout(() => { el.style.transform = 'scale(1)'; }, 500);
        }
      }
    });
  }

  // Manual fallback location buttons
  const buttons = document.querySelectorAll('.btn-loc');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.userLocation.lat = parseFloat(btn.dataset.lat);
      state.userLocation.lng = parseFloat(btn.dataset.lng);
      state.userLocation.name = btn.dataset.name;

      const label = document.getElementById('location-area-name');
      if (label) label.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${state.userLocation.name}`;

      placeUserMarker(state.userLocation.lat, state.userLocation.lng);
      if (map) map.setView([state.userLocation.lat, state.userLocation.lng], 14);

      showToast(`Location set to ${state.userLocation.name}`, 'info');
      fetchClinics().then(() => {
        renderClinicsList();
        updateMapClinicMarkers();
      });
      fetchOSMClinics(state.userLocation.lat, state.userLocation.lng, 15000).then(updateOSMMarkers);
    });
  });
}

function initSortingControls() {
  const sortTotal    = document.getElementById('sort-total');
  const sortDistance = document.getElementById('sort-distance');
  const sortWait     = document.getElementById('sort-wait');
  
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

  // ── Power filter buttons ──────────────────────────────────────────────────
  const pwrBtns = document.querySelectorAll('.btn-power-filter');
  pwrBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pwrBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.powerFilter = btn.dataset.power;
      sortAndRenderClinics();
    });
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
  
  // Text search filter
  let filtered = state.clinics.filter(c => {
    return c.name.toLowerCase().includes(query) ||
           c.services.some(s => s.toLowerCase().includes(query));
  });

  // Power status filter
  if (state.powerFilter === 'grid') {
    filtered = filtered.filter(c => c.hasElectricity);
  } else if (state.powerFilter === 'solar') {
    filtered = filtered.filter(c => !c.hasElectricity && c.hasSolar);
  } else if (state.powerFilter === 'outage') {
    filtered = filtered.filter(c => !c.hasElectricity && !c.hasSolar);
  }

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

  // Sync map markers whenever list updates
  updateMapClinicMarkers();

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
          <div>
            <h3>${c.name}</h3>
            ${c.province ? `<span class="clinic-province-tag"><i class="fa-solid fa-map-pin"></i> ${c.province}</span>` : ''}
          </div>
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
    b.userId === (state.patientUser ? state.patientUser.id : 'u1') &&
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
  const patientBookings = state.bookings.filter(b => b.userId === (state.patientUser ? state.patientUser.id : 'u1'));

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

  // Auto-fill from logged-in patient
  if (state.patientUser) {
    const nameField = document.getElementById('patient-name');
    const phoneField = document.getElementById('patient-phone');
    if (nameField && !nameField.value) nameField.value = state.patientUser.name || '';
    if (phoneField && !phoneField.value) phoneField.value = state.patientUser.phone || '';
  }

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
    const active = state.bookings.find(b => b.userId === (state.patientUser ? state.patientUser.id : 'u1') && (b.status === 'Confirmed' || b.status === 'CheckedIn'));
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
      const response = await authFetch(`${CONFIG.API_BASE}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          userId: state.patientUser ? state.patientUser.id : 'u1',
          clinicId,
          appointmentTime,
          patientName: document.getElementById('patient-name')?.value || (state.patientUser ? state.patientUser.name : 'Patient'),
          patientPhone: document.getElementById('patient-phone')?.value || null
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
    userId: state.patientUser ? state.patientUser.id : 'u1',
    patientName: state.patientUser ? state.patientUser.name : 'Patient',
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
// PATIENT AUTHENTICATION (LOGIN / REGISTER)
// ----------------------------------------------------

function switchPatientTab(tab) {
  const loginForm    = document.getElementById('pt-login-form');
  const registerForm = document.getElementById('pt-register-form');
  const loginBtn     = document.getElementById('pt-tab-login');
  const registerBtn  = document.getElementById('pt-tab-register');
  const banner       = document.getElementById('auth-error-banner');
  if (!loginForm) return;
  // Clear any previous error
  if (banner) banner.classList.add('hidden');
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginBtn.classList.add('auth-tab-active');
    registerBtn.classList.remove('auth-tab-active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    registerBtn.classList.add('auth-tab-active');
    loginBtn.classList.remove('auth-tab-active');
  }
}

function togglePwVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.innerHTML = isHidden
    ? '<i class="fa-regular fa-eye-slash"></i>'
    : '<i class="fa-regular fa-eye"></i>';
}

function showAuthError(msg) {
  const banner  = document.getElementById('auth-error-banner');
  const msgEl   = document.getElementById('auth-error-msg');
  if (!banner) return;
  if (msgEl) msgEl.textContent = msg;
  banner.classList.remove('hidden');
}
function clearAuthError() {
  const banner = document.getElementById('auth-error-banner');
  if (banner) banner.classList.add('hidden');
}

function onPatientLoggedIn(user, token) {
  state.patientUser = user;
  if (token) setAuthToken(token);
  saveLocalState();

  // Close the auth modal
  const modal = document.getElementById('patient-auth-modal');
  if (modal) modal.style.display = 'none';

  // Show greeting and sign-out button
  const greeting = document.getElementById('patient-greeting');
  const greetingName = document.getElementById('patient-greeting-name');
  const logoutBtn = document.getElementById('btn-patient-logout');
  if (greeting) { greeting.style.display = 'inline-flex'; greetingName.innerText = user.name; }
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';

  // Initialise map then auto-request real location
  initMap();
  autoRequestLocation();

  // Load clinic data (map markers updated inside renderClinicsList)
  checkConnection().then(() => {
    fetchClinics().then(() => renderClinicsList());
    fetchBookings().then(() => {
      updateActiveBookingUI();
      updateHistoryUI();
      fetchPatientPassport();
    });
  });
}

function initPatientAuth() {
  const modal = document.getElementById('patient-auth-modal');
  if (!modal) return;

  // If already logged in, just restore session
  if (state.patientUser) {
    modal.style.display = 'none';
    const greeting = document.getElementById('patient-greeting');
    const greetingName = document.getElementById('patient-greeting-name');
    const logoutBtn = document.getElementById('btn-patient-logout');
    if (greeting) { greeting.style.display = 'inline-flex'; greetingName.innerText = state.patientUser.name; }
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    // Initialise map (DOM is ready here because DOMContentLoaded has fired)
    initMap();
    autoRequestLocation();
    return;
  }

  // Login form
  const loginForm = document.getElementById('pt-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();
      const email    = document.getElementById('pt-login-email').value.trim();
      const password = document.getElementById('pt-login-password').value;

      const btn = document.getElementById('btn-pt-login');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in…'; }

      try {
        const res  = await fetch(`${CONFIG.API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success && data.user.role === 'patient') {
          onPatientLoggedIn(data.user, data.token);
          showToast(`👋 Welcome back, ${data.user.name}!`, 'success');
        } else if (data.success && data.user.role !== 'patient') {
          showAuthError('Healthcare providers must use the Providers Portal.');
        } else {
          showAuthError(data.message || 'Incorrect email or password. Please try again.');
        }
      } catch {
        // Offline demo fallback
        if (email === 'paseka@thuso.health' && password === 'password123') {
          onPatientLoggedIn({
            id: 'u1', name: 'Paseka Moloi', email: 'paseka@thuso.health',
            role: 'patient', thuso_id_hash: 'TH-U1', consentPin: '1234',
            isAccessGranted: true, language: 'en'
          }, null);
          showToast('Signed in offline (demo mode).', 'warning');
        } else {
          showAuthError('Could not reach the server. Check your connection or use the demo account.');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In'; }
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('pt-register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();
      const name     = document.getElementById('pt-reg-name').value.trim();
      const email    = document.getElementById('pt-reg-email').value.trim();
      const phone    = document.getElementById('pt-reg-phone').value.trim();
      const password = document.getElementById('pt-reg-password').value;

      if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

      const btn = document.getElementById('btn-pt-register');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating account…'; }

      try {
        const res  = await fetch(`${CONFIG.API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, password, role: 'patient' })
        });
        const data = await res.json();
        if (data.success) {
          onPatientLoggedIn(data.user, data.token);
          showToast(`🎉 Welcome, ${data.user.name}! ThusoID: ${data.user.thuso_id_hash}`, 'success');
        } else {
          showAuthError(data.message || 'Registration failed. Please try again.');
        }
      } catch {
        showAuthError('Could not reach the server. Check your connection.');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create My Health Account'; }
      }
    });
  }

  // Profile tab sign-out button
  const logoutBtnProfile = document.getElementById('btn-patient-logout-profile');
  if (logoutBtnProfile) {
    logoutBtnProfile.style.display = 'inline-flex';
    logoutBtnProfile.addEventListener('click', () => {
      document.getElementById('btn-patient-logout')?.click();
    });
  }

  // Sign-out button (hidden in DOM for JS compat)
  const logoutBtn = document.getElementById('btn-patient-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      // Clear all patient session data
      state.patientUser   = null;
      state.bookings      = [];
      state.activeBooking = null;
      setAuthToken(null);
      saveLocalState();
      localStorage.removeItem('thuso_patient_records');

      // Reset navbar user section
      const greeting = document.getElementById('patient-greeting');
      const greetingName = document.getElementById('patient-greeting-name');
      if (greeting) { greeting.style.display = 'none'; }
      if (greetingName) greetingName.textContent = '';
      logoutBtn.style.display = 'none';

      // Show the auth modal again
      const modal = document.getElementById('patient-auth-modal');
      if (modal) {
        modal.style.display = 'flex';
        switchPatientTab('login');
      }

      showToast('You have been signed out.', 'info');
    });
  }
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
  const notifyMeds = document.getElementById('notify-meds');
  const notifyAppts = document.getElementById('notify-appointments');

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
      const cached = localStorage.getItem('thuso_patient_records');
      if (cached) {
        renderPatientTimeline(JSON.parse(cached));
      }
      // Translate confirmation message via MyMemory API
      const msg = await translateText('Language preference saved.', currentLanguage);
      showToast(msg, 'success');
    });
  }

  if (notifyMeds) {
    notifyMeds.addEventListener('change', async () => {
      await updatePatientConsentSettings({ notifyMedications: notifyMeds.checked });
      showToast(notifyMeds.checked ? 'Medication reminders enabled.' : 'Medication reminders disabled.', 'info');
    });
  }

  if (notifyAppts) {
    notifyAppts.addEventListener('change', async () => {
      await updatePatientConsentSettings({ notifyAppointments: notifyAppts.checked });
      showToast(notifyAppts.checked ? 'Appointment alerts enabled.' : 'Appointment alerts disabled.', 'info');
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

function seedDemoRecordsIfNeeded() {
  const existing = localStorage.getItem('thuso_patient_records');
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed.length > 0 && parsed[0].visit_type) return; // already seeded with new format
    } catch (_) {}
  }
  const now = Date.now();
  const D = 86400000;
  const at = (daysAgo, hour, min) => {
    const d = new Date(now - daysAgo * D);
    d.setHours(hour, min, 0, 0);
    return d.toISOString();
  };
  localStorage.setItem('thuso_patient_records', JSON.stringify([
    {
      id: 'demo-4',
      doctor_name: 'Dr. Sarah Dube',
      clinic_name: 'Parktown Medical Centre',
      visit_type: 'GP Consultation',
      diagnosis: 'Upper Respiratory Tract Infection (URTI)',
      treatment_plan: 'Warm salt-water gargle twice daily, rest, avoid cold drinks',
      medication_prescribed: 'Amoxicillin 250mg, cough syrup, Strepsils',
      created_at: at(180, 9, 15)
    },
    {
      id: 'demo-3',
      doctor_name: 'Dr. Nomsa Zulu',
      clinic_name: 'Alexandra Health Centre',
      visit_type: 'Emergency',
      diagnosis: 'Fracture: Left Fibula (Broken Leg)',
      treatment_plan: 'Plaster cast 6 weeks, crutches, no weight-bearing. Follow-up X-ray in 3 weeks.',
      medication_prescribed: 'Tramadol 50mg, Calcium + Vitamin D supplement',
      created_at: at(90, 14, 30)
    },
    {
      id: 'demo-2',
      doctor_name: 'Dr. James Khumalo',
      clinic_name: 'Soweto Community Clinic',
      visit_type: 'GP Consultation',
      diagnosis: 'Tension Headache',
      treatment_plan: 'Rest in dark quiet room, reduce screen time, stress management techniques',
      medication_prescribed: 'Ibuprofen 400mg, caffeine tablet',
      created_at: at(45, 11, 0)
    },
    {
      id: 'demo-1',
      doctor_name: 'Dr. Sarah Dube',
      clinic_name: 'Parktown Medical Centre',
      visit_type: 'Follow-up',
      diagnosis: 'Influenza (Common Flu)',
      treatment_plan: 'Bed rest 3 days, drink plenty of fluids, steam inhalation twice daily',
      medication_prescribed: 'Paracetamol 500mg, Vitamin C 1000mg, nasal spray',
      created_at: at(14, 8, 45)
    }
  ]));
}

async function fetchPatientPassport() {
  if (!state.patientUser) return;
  const patientId = state.patientUser.id;

  seedDemoRecordsIfNeeded();

  // Pre-populate from session (instant, no API call needed for basics)
  document.getElementById('passport-patient-name').innerText = state.patientUser.name;
  document.getElementById('passport-thuso-id').innerText = state.patientUser.thuso_id_hash || `TH-${patientId.toUpperCase()}`;

  // 1. Fetch/Sync Consent Settings from server
  if (state.isOnline) {
    try {
      const consentRes = await authFetch(`${CONFIG.API_BASE}/patients/${patientId}/consent`);
      const consentData = await consentRes.json();
      if (consentData.success) {
        updateConsentUI(consentData.consent);
      }
    } catch (err) {
      console.warn('Could not fetch consent from server, using session fallback');
      updateConsentUI({
        consentPin: state.patientUser.consentPin,
        isAccessGranted: state.patientUser.isAccessGranted,
        thuso_id_hash: state.patientUser.thuso_id_hash,
        language: state.patientUser.language
      });
    }
  } else {
    updateConsentUI({
      consentPin: state.patientUser.consentPin,
      isAccessGranted: state.patientUser.isAccessGranted,
      thuso_id_hash: state.patientUser.thuso_id_hash,
      language: state.patientUser.language
    });
  }

  // 2. Fetch Medical Records
  let records = [];
  if (state.isOnline) {
    try {
      const recordsRes = await authFetch(`${CONFIG.API_BASE}/patients/${patientId}/records`);
      const recordsData = await recordsRes.json();
      if (recordsData.success) {
        records = recordsData.records;
        localStorage.setItem('thuso_patient_records', JSON.stringify(records));
      }
    } catch (err) {
      console.warn('Could not fetch records from server, checking local cache');
    }
  }

  if (records.length === 0) {
    const cached = localStorage.getItem('thuso_patient_records');
    if (cached) records = JSON.parse(cached);
  }

  renderPatientTimeline(records);
}

function updateConsentUI(consent) {
  const consentToggle = document.getElementById('consent-grant-access');
  const pinDisplay = document.getElementById('consent-pin-code');
  const langSelect = document.getElementById('passport-lang-select');
  const thusoIdDisplay = document.getElementById('passport-thuso-id');
  const patientNameDisplay = document.getElementById('passport-patient-name');

  if (consentToggle) consentToggle.checked = consent.isAccessGranted;
  if (pinDisplay) pinDisplay.innerText = consent.consentPin;
  if (langSelect) {
    langSelect.value = consent.language || 'en';
    currentLanguage = consent.language || 'en';
  }
  if (thusoIdDisplay && consent.thuso_id_hash) {
    thusoIdDisplay.innerText = consent.thuso_id_hash;
  }
  if (patientNameDisplay && state.patientUser) {
    patientNameDisplay.innerText = state.patientUser.name;
  }

  // Generate real QR code
  generatePassportQR(consent);
}

function generatePassportQR(consent) {
  const qrContainer = document.getElementById('passport-qr-canvas');
  if (!qrContainer) return;
  // Clear previous
  qrContainer.innerHTML = '';
  const thusoId = (consent && consent.thuso_id_hash) || (state.patientUser ? `TH-${state.patientUser.id.toUpperCase()}` : 'TH-UNKNOWN');
  const qrData = `${window.location.origin}/healthcare.html?scan=1&id=${state.patientUser ? state.patientUser.id : 'u1'}&thusoId=${thusoId}`;
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrContainer, {
      text: qrData,
      width: 64,
      height: 64,
      colorDark: '#1e293b',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    qrContainer.innerHTML = '<i class="fa-solid fa-qrcode" style="font-size:2.5rem;color:#64748b;"></i>';
  }
}

async function updatePatientConsentSettings(payload) {
  const patientId = state.patientUser ? state.patientUser.id : 'u1';
  if (state.isOnline) {
    try {
      const response = await authFetch(`${CONFIG.API_BASE}/patients/${patientId}/consent`, {
        method: 'PUT',
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

  for (let i = 0; i < sorted.length; i++) {
    const rec = sorted[i];
    const visitDate = new Date(rec.created_at);
    const dateStr = visitDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = visitDate.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    const visitType = rec.visit_type || 'GP Consultation';

    const diagnosis = await translateMockText(rec.diagnosis, currentLanguage);
    const plan = await translateMockText(rec.treatment_plan, currentLanguage);
    const meds = await translateMockText(rec.medication_prescribed, currentLanguage);

    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-header-left">
          <span class="timeline-visit-num">${sorted.length - i}</span>
          <div>
            <div class="timeline-doctor"><i class="fa-solid fa-user-doctor" style="font-size:0.7rem;color:var(--color-primary);margin-right:3px;"></i>${rec.doctor_name}</div>
            <div class="timeline-clinic">${rec.clinic_name}</div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="timeline-date-badge"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
          <div style="font-size:0.6rem;color:var(--text-muted);margin-top:2px;text-align:right;">
            <i class="fa-regular fa-clock"></i> ${timeStr} &nbsp;·&nbsp; ${visitType}
          </div>
        </div>
      </div>
      <div class="timeline-body">
        <p><strong>Diagnosis:</strong> ${diagnosis}</p>
        ${plan ? `<p><strong>Treatment:</strong> ${plan}</p>` : ''}
        ${meds ? `<p><strong>Prescribed:</strong> ${meds}</p>` : ''}
        ${rec.file_url_r2 ? `
          <a href="${rec.file_url_r2}" target="_blank" class="timeline-attachment">
            <i class="fa-solid fa-file-pdf"></i> View Attachment
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

  // Offline fallback — full dictionary covering all demo visit records
  const dict = {
    zulu: {
      // Diagnoses
      'Upper Respiratory Tract Infection (URTI)': 'Ukwetholwa Kwezifo Zomoya Ongaphezulu (URTI)',
      'Fracture: Left Fibula (Broken Leg)': 'Ukugqabhuka: I-Fibula Esokunxele (Umlenze Ophukile)',
      'Tension Headache': 'Ikhanda Elibuhlungu Ngenxa Yethani',
      'Influenza (Common Flu)': 'Umkhuhlane Wamafufunyo (Umkhuhlane Ojwayelekile)',
      // Treatments
      'Warm salt-water gargle twice daily, rest, avoid cold drinks': 'Xwaya amanzi ashisayo anelayisi kabili ngosuku, phumula, gwema iziphuzo ezibandayo',
      'Plaster cast 6 weeks, crutches, no weight-bearing. Follow-up X-ray in 3 weeks.': 'Iplasta evikela amathambo ezinsukwini ezingu-6, izinti zokuhamba, ungasekeli. Ama-X-ray okulandelela emavikini amathathu.',
      'Rest in dark quiet room, reduce screen time, stress management techniques': 'Phumula egumbini elimnyama elingenangxolo, nciphisa isikhathi seskrini, izindlela zokuphatha ingcindezi',
      'Bed rest 3 days, drink plenty of fluids, steam inhalation twice daily': 'Lala embhedeni izinsuku ezintathu, phuza amanzi amaningi, hitha intwesi kabili ngosuku',
      // Prescriptions
      'Amoxicillin 250mg, cough syrup, Strepsils': 'I-Amoxicillin 250mg, isiropho sokhwehlela, i-Strepsils',
      'Tramadol 50mg, Calcium + Vitamin D supplement': 'I-Tramadol 50mg, iCalcium + iVitamin D',
      'Ibuprofen 400mg, caffeine tablet': 'I-Ibuprofen 400mg, ipilisi ye-caffeine',
      'Paracetamol 500mg, Vitamin C 1000mg, nasal spray': 'I-Paracetamol 500mg, iVitamin C 1000mg, isifinqo somphimbo',
    },
    sesotho: {
      'Upper Respiratory Tract Infection (URTI)': 'Tšoaetso ea Tsela ea Ho Hema e ka Holimo (URTI)',
      'Fracture: Left Fibula (Broken Leg)': 'Kephaho: Fibula e ka Molemeng (Leoto le Robehileng)',
      'Tension Headache': 'Hlooho e Utloang Bohloko ka Kgathello',
      'Influenza (Common Flu)': 'Mokotla o tloaelehileng (Mokotla)',
      'Warm salt-water gargle twice daily, rest, avoid cold drinks': 'Gargle ka metsi a chesang a letswai habeli ka letsatsi, phomola, hema linotsi tse batso',
      'Plaster cast 6 weeks, crutches, no weight-bearing. Follow-up X-ray in 3 weeks.': 'Kase ea samente libeke tse 6, litokotoko, se kenye boima. Tšebeliso ea X-ray hamorao libeke tse tharo.',
      'Rest in dark quiet room, reduce screen time, stress management techniques': 'Phomola kamoreng e lefifi le kgutsitseng, theola nako ea skrini, mekhoa ea ho laola kgatello',
      'Bed rest 3 days, drink plenty of fluids, steam inhalation twice daily': 'Phomola setulong matsatsi a mararo, noa metsi a mangata, hema mosi habeli ka letsatsi',
      'Amoxicillin 250mg, cough syrup, Strepsils': 'Amoxicillin 250mg, seropho sa ho sweefa, Strepsils',
      'Tramadol 50mg, Calcium + Vitamin D supplement': 'Tramadol 50mg, Calcium + Vitamin D',
      'Ibuprofen 400mg, caffeine tablet': 'Ibuprofen 400mg, khatase ea caffeine',
      'Paracetamol 500mg, Vitamin C 1000mg, nasal spray': 'Paracetamol 500mg, Vitamin C 1000mg, sepalesa sa nko',
    },
    xhosa: {
      'Upper Respiratory Tract Infection (URTI)': 'Ukusuleleka Kwendlela Yokuphefumla Engaphezulu (URTI)',
      'Fracture: Left Fibula (Broken Leg)': 'Ukwaphuka: I-Fibula Ekhohlo (Umlenze Ophukileyo)',
      'Tension Headache': 'Ntloko Ebuhlungu Ngenxa Yoqhwithelo',
      'Influenza (Common Flu)': 'Umkhuhlane Wafele (Umkhuhlane Oqhelekileyo)',
      'Warm salt-water gargle twice daily, rest, avoid cold drinks': 'Gargle ngamanzi ashushu anetyuwa kabini ngemini, phumla, gqithisa iziselo ezibandayo',
      'Plaster cast 6 weeks, crutches, no weight-bearing. Follow-up X-ray in 3 weeks.': 'Iplasta evikela amathambo iiveki ezi-6, iintsimbi zokukhathaza, unganyamekeli. I-X-ray yokulandelela kwezi-3 iiveki.',
      'Rest in dark quiet room, reduce screen time, stress management techniques': 'Phumla egumbini elimnyama elingenantloko, nciphisa ixesha leskrini, iindlela zokuphatha ingxaki',
      'Bed rest 3 days, drink plenty of fluids, steam inhalation twice daily': 'Lala embhedeni iintsuku ezi-3, sela amanzi amaningi, phefumla umsi kabini ngemini',
      'Amoxicillin 250mg, cough syrup, Strepsils': 'I-Amoxicillin 250mg, isiropo ukukhwehlela, i-Strepsils',
      'Tramadol 50mg, Calcium + Vitamin D supplement': 'I-Tramadol 50mg, iCalcium + iVitamin D',
      'Ibuprofen 400mg, caffeine tablet': 'I-Ibuprofen 400mg, ipilisi ye-caffeine',
      'Paracetamol 500mg, Vitamin C 1000mg, nasal spray': 'I-Paracetamol 500mg, iVitamin C 1000mg, isprey yempumlo',
    },
    afrikaans: {
      'Upper Respiratory Tract Infection (URTI)': 'Bo-Asemhalingstelselinfeksie (URTI)',
      'Fracture: Left Fibula (Broken Leg)': 'Fraktuur: Linker Fibula (Gebreekte Been)',
      'Tension Headache': 'Spanninghoofpyn',
      'Influenza (Common Flu)': 'Griep (Gewone Griep)',
      'Warm salt-water gargle twice daily, rest, avoid cold drinks': 'Warm soutwater gorgel twee keer per dag, rus, vermy koue drankies',
      'Plaster cast 6 weeks, crutches, no weight-bearing. Follow-up X-ray in 3 weeks.': 'Gipsverband 6 weke, krukke, geen gewig dra. Opvolgings-X-straal in 3 weke.',
      'Rest in dark quiet room, reduce screen time, stress management techniques': 'Rus in \'n donker stil kamer, verminder skermtyd, stresbestuurstegnieke',
      'Bed rest 3 days, drink plenty of fluids, steam inhalation twice daily': 'Bedrus 3 dae, drink baie vloeistowwe, stoom inaseming twee keer per dag',
      'Amoxicillin 250mg, cough syrup, Strepsils': 'Amoxicillin 250mg, hoessiroop, Strepsils',
      'Tramadol 50mg, Calcium + Vitamin D supplement': 'Tramadol 50mg, Kalsium + Vitamien D aanvulling',
      'Ibuprofen 400mg, caffeine tablet': 'Ibuprofen 400mg, koffeïentablet',
      'Paracetamol 500mg, Vitamin C 1000mg, nasal spray': 'Parasetamol 500mg, Vitamien C 1000mg, neussproei',
    },
  };
  const langKey = targetLang.toLowerCase();
  if (dict[langKey] && dict[langKey][text]) return dict[langKey][text];
  // Partial match fallback
  if (dict[langKey]) {
    for (const [en, translated] of Object.entries(dict[langKey])) {
      if (text.includes(en) || en.includes(text)) return translated;
    }
  }
  return text;
}

async function fetchAndRenderAuditLogs() {
  const container = document.getElementById('audit-logs-list');
  if (!container) return;

  const patientId = state.patientUser ? state.patientUser.id : 'u1';
  let logs = [];

  if (state.isOnline) {
    try {
      const response = await authFetch(`${CONFIG.API_BASE}/patients/${patientId}/logs`);
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
  const patient = state.patientUser;

  if (!patient) {
    showToast('Please sign in first.', 'error');
    return;
  }

  // Use jsPDF if available
  if (typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined') {
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // Header
    doc.setFillColor(30, 41, 59);  // #1e293b
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('THUSO HEALTH', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Digital Health Passport', 14, 19);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);

    // Patient info block
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PATIENT PROFILE', 14, 38);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${patient.name}`, 14, 45);
    doc.text(`Email: ${patient.email}`, 14, 51);
    doc.text(`ThusoID: ${patient.thuso_id_hash || `TH-${patient.id.toUpperCase()}`}`, 14, 57);
    doc.text(`POPIA Access: ${patient.isAccessGranted ? 'Enabled' : 'Disabled'}`, 14, 63);

    // Divider
    doc.setDrawColor(203, 213, 225);
    doc.line(14, 68, 196, 68);

    let y = 75;
    if (records.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('No medical records on file.', 14, y);
    } else {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('MEDICAL HISTORY', 14, y);
      y += 8;

      records.forEach((r, i) => {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`[${i + 1}] ${new Date(r.created_at).toLocaleDateString()} — ${r.doctor_name} (${r.clinic_name})`, 14, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const diagLines = doc.splitTextToSize(`Diagnosis: ${r.diagnosis}`, 180);
        doc.text(diagLines, 14, y); y += diagLines.length * 4;
        if (r.treatment_plan) {
          const planLines = doc.splitTextToSize(`Treatment: ${r.treatment_plan}`, 180);
          doc.text(planLines, 14, y); y += planLines.length * 4;
        }
        if (r.medication_prescribed) {
          const medLines = doc.splitTextToSize(`Prescription: ${r.medication_prescribed}`, 180);
          doc.text(medLines, 14, y); y += medLines.length * 4;
        }
        doc.setDrawColor(226, 232, 240);
        doc.line(14, y + 1, 196, y + 1);
        y += 7;
      });
    }

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Thuso Health — POPIA Compliant Medical Record. Do not share without patient consent.', 14, 285);

    const filename = `thuso-passport-${patient.thuso_id_hash || patient.id}-${Date.now()}.pdf`;
    doc.save(filename);
    showToast('Health Passport PDF downloaded successfully!', 'success');
  } else {
    // Fallback plain text if jsPDF not loaded
    let txt = `THUSO HEALTH PASSPORT\nPatient: ${patient.name}\nThusoID: ${patient.thuso_id_hash}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    records.forEach((r, i) => {
      txt += `[${i+1}] ${new Date(r.created_at).toLocaleDateString()} | ${r.doctor_name} (${r.clinic_name})\n`;
      txt += `Diagnosis: ${r.diagnosis}\n`;
      if (r.treatment_plan) txt += `Treatment: ${r.treatment_plan}\n`;
      if (r.medication_prescribed) txt += `Prescription: ${r.medication_prescribed}\n`;
      txt += '\n';
    });
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `thuso-passport-${patient.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Health Passport downloaded (text fallback).', 'warning');
  }
}

// ----------------------------------------------------
// DIGITAL HEALTH PASSPORT (PRACTITIONER PORTAL SIDE)
// ----------------------------------------------------

let currentLookupPatientId = null;

function initPractitionerPassport() {
  const lookupBtn = document.getElementById('btn-lookup-passport');
  const consultForm = document.getElementById('consultation-form');

  // Auto-fill from QR code scan URL params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('scan') === '1' && urlParams.get('id')) {
    const pidInput = document.getElementById('lookup-patient-id');
    if (pidInput) pidInput.value = urlParams.get('id');
    // Clean URL without reload
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (lookupBtn) {
    lookupBtn.addEventListener('click', async () => {
      // GUARD: must be logged in
      if (!state.loggedInUser) {
        showToast('Please log in to look up patient records.', 'error');
        return;
      }

      const patientInput = document.getElementById('lookup-patient-id').value.trim();
      const pin = document.getElementById('lookup-patient-pin').value.trim();
      const errorContainer = document.getElementById('lookup-error-container');
      const resultsContainer = document.getElementById('lookup-results-container');

      errorContainer.classList.add('hidden');
      resultsContainer.classList.add('hidden');

      if (!patientInput) {
        showToast('Please enter a valid Patient ID or email', 'warning');
        return;
      }

      // Email or ID lookup
      let patientId = patientInput.includes('@') ? null : patientInput;

      // Offline fallback — show cached records for demo user
      if (!state.isOnline) {
        const isDemo = patientInput === 'u1' || patientInput === 'TH-U1' ||
          patientInput.toLowerCase() === 'paseka@thuso.health';
        if (isDemo) {
          currentLookupPatientId = 'u1';
          document.getElementById('practitioner-patient-name').innerText = 'Paseka Moloi';
          document.getElementById('practitioner-thuso-id').innerText = 'TH-U1';
          const cached = localStorage.getItem('thuso_patient_records');
          const records = cached ? JSON.parse(cached) : [];
          renderPractitionerRecordsList(records);
          resultsContainer.classList.remove('hidden');
          showToast('Showing offline cached records for TH-U1.', 'info');
        } else {
          errorContainer.innerText = 'Patient lookup requires an online connection.';
          errorContainer.classList.remove('hidden');
        }
        return;
      }

      // Online lookup — resolve email to user ID first if needed
      try {
        // If email provided, resolve to patient ID and name via API
        let resolvedId = patientId;
        let resolvedName = null;
        if (!resolvedId) {
          const findRes = await authFetch(`${CONFIG.API_BASE}/users/find-by-email?email=${encodeURIComponent(patientInput)}`);
          const findData = await findRes.json();
          if (findData.success) {
            resolvedId = findData.patient.id;
            resolvedName = findData.patient.name;
          } else {
            errorContainer.innerText = 'No patient found with that email address.';
            errorContainer.classList.remove('hidden');
            return;
          }
        }

        const queryParams = new URLSearchParams({ doctorId: state.loggedInUser.id });
        if (pin) queryParams.append('pin', pin);

        const response = await authFetch(`${CONFIG.API_BASE}/patients/${resolvedId}/records?${queryParams.toString()}`);
        const data = await response.json();

        if (data.success) {
          currentLookupPatientId = resolvedId;
          
          // Get patient name and ThusoID
          const consentRes = await authFetch(`${CONFIG.API_BASE}/patients/${resolvedId}/consent`);
          const consentData = await consentRes.json();
          const thusoId = (consentData.success && consentData.consent.thuso_id_hash) ? consentData.consent.thuso_id_hash : `TH-${resolvedId.toUpperCase()}`;

          // Try to get name from find-by-email result, or find-by-email now
          if (!resolvedName) {
            const nameRes = await fetch(`${CONFIG.API_BASE}/users/find-by-email?email=${encodeURIComponent('')}`).catch(() => null);
            // Name unknown without email — show ID and ThusoID
            resolvedName = `Patient ${thusoId}`;
          }
          
          document.getElementById('practitioner-patient-name').innerText = resolvedName;
          document.getElementById('practitioner-thuso-id').innerText = thusoId;
          
          renderPractitionerRecordsList(data.records);
          resultsContainer.classList.remove('hidden');
          showToast('Authorized Passport access granted.', 'success');
        } else {
          errorContainer.innerText = data.error || 'Access Denied: Patient PIN or consent required.';
          errorContainer.classList.remove('hidden');
        }
      } catch (err) {
        errorContainer.innerText = 'Error looking up patient medical history from server.';
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

      const newRecord = {
        id: `local-${Date.now()}`,
        doctor_name: state.loggedInUser ? state.loggedInUser.name : 'Dr. (Offline)',
        clinic_name: state.loggedInUser ? (state.loggedInUser.clinic_name || 'Clinic') : 'Clinic',
        diagnosis,
        treatment_plan,
        medication_prescribed,
        created_at: new Date().toISOString(),
        file_url_r2: null
      };

      const saveLocally = () => {
        const key = currentLookupPatientId === 'u1' ? 'thuso_patient_records' : `thuso_records_${currentLookupPatientId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift(newRecord);
        localStorage.setItem(key, JSON.stringify(existing));
      };

      if (!state.isOnline) {
        saveLocally();
        showToast("Saved offline — will sync when connection is restored.", "info");
        document.getElementById('consult-diagnosis').value = '';
        document.getElementById('consult-treatment').value = '';
        document.getElementById('consult-prescription').value = '';
        document.getElementById('btn-lookup-passport').click();
        return;
      }

      try {
        const response = await authFetch(`${CONFIG.API_BASE}/patients/${currentLookupPatientId}/records`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
          saveLocally();
          showToast("Consultation summary added and synced successfully!", "success");
          document.getElementById('consult-diagnosis').value = '';
          document.getElementById('consult-treatment').value = '';
          document.getElementById('consult-prescription').value = '';
          document.getElementById('btn-lookup-passport').click();
        } else {
          showToast(data.error || "Failed to save record.", "error");
        }
      } catch (err) {
        saveLocally();
        showToast("Saved locally — server sync failed.", "info");
        document.getElementById('consult-diagnosis').value = '';
        document.getElementById('consult-treatment').value = '';
        document.getElementById('consult-prescription').value = '';
        document.getElementById('btn-lookup-passport').click();
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
  const sorted = [...records].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  sorted.forEach((rec, i) => {
    const visitDate = new Date(rec.created_at);
    const dateStr = visitDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = visitDate.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    const visitType = rec.visit_type || 'GP Consultation';

    const div = document.createElement('div');
    div.className = 'timeline-item';
    div.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-header-left">
          <span class="timeline-visit-num">${sorted.length - i}</span>
          <div>
            <div class="timeline-doctor"><i class="fa-solid fa-user-doctor" style="font-size:0.7rem;color:var(--color-primary);margin-right:3px;"></i>${rec.doctor_name}</div>
            <div class="timeline-clinic">${rec.clinic_name}</div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="timeline-date-badge"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
          <div style="font-size:0.6rem;color:var(--text-muted);margin-top:2px;">
            <i class="fa-regular fa-clock"></i> ${timeStr} &nbsp;·&nbsp; ${visitType}
          </div>
        </div>
      </div>
      <div class="timeline-body">
        <p><strong>Diagnosis:</strong> ${rec.diagnosis}</p>
        ${rec.treatment_plan ? `<p><strong>Treatment:</strong> ${rec.treatment_plan}</p>` : ''}
        ${rec.medication_prescribed ? `<p><strong>Prescribed:</strong> ${rec.medication_prescribed}</p>` : ''}
      </div>
    `;
    container.appendChild(div);
  });
}
