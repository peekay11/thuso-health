import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// ─────────────────────────────────────────────
// CORS — allow all origins for static frontend
// ─────────────────────────────────────────────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}))

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 12)
}

// JWT HS256 via Web Crypto (no external library needed in Workers)
async function jwtSign(payload, secret, expiresInDays = 7) {
  const enc = new TextEncoder()
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400
  const full = { ...payload, exp, iat: Math.floor(Date.now() / 1000) }

  const b64url = (obj) =>
    btoa(typeof obj === 'string' ? obj : JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url(full)

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`))
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${header}.${body}.${sig}`
}

async function jwtVerify(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')

  const [header, body, sig] = parts
  const enc = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify']
  )
  const rawSig = Uint8Array.from(
    atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  )
  const valid = await crypto.subtle.verify('HMAC', key, rawSig, enc.encode(`${header}.${body}`))
  if (!valid) throw new Error('Invalid token signature')

  const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
  return payload
}

// PBKDF2 password hashing — 100k iterations, SHA-256
async function hashPassword(password, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

// Haversine — offline fallback when ORS key is not configured
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return {
    distanceKm: parseFloat(dist.toFixed(2)),
    travelTimeMinutes: Math.max(1, Math.round((dist / 40) * 60))
  }
}

// OSRM Table API — free, no key, real driving routes via OpenStreetMap data
// Returns null on any failure so callers fall back to haversine
async function osrmMatrixBatch(userLat, userLng, clinics) {
  // Build coordinate string: user location first, then each clinic
  const coords = [[userLng, userLat], ...clinics.map(c => [c.lng, c.lat])]
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(';')
  const destinations = clinics.map((_, i) => i + 1).join(';')

  try {
    const res = await fetch(
      `http://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${destinations}&annotations=duration,distance`,
      { headers: { 'User-Agent': 'ThusoHealth/1.0 (Gauteng Hackathon)' }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.durations) return null

    return clinics.map((_, i) => {
      const distM  = data.distances ? data.distances[0][i] : null
      const durS   = data.durations[0][i] || 60
      const distKm = distM != null
        ? parseFloat((distM / 1000).toFixed(2))
        : haversine(userLat, userLng, clinics[i].lat, clinics[i].lng).distanceKm
      return {
        distanceKm: distKm,
        travelTimeMinutes: Math.max(1, Math.round(durS / 60))
      }
    })
  } catch (_) { return null }
}

// OpenRouteService Matrix API — one batch call gets real driving distances to ALL clinics
// Free tier: 2,000 requests/day. Get key at openrouteservice.org (no credit card needed)
// ORS uses [longitude, latitude] order (the opposite of lat/lng convention)
async function orsMatrixBatch(userLat, userLng, clinics, apiKey) {
  const locations = [
    [userLng, userLat],
    ...clinics.map(c => [c.lng, c.lat])
  ]
  const destinations = clinics.map((_, i) => i + 1)

  const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      locations,
      sources: [0],
      destinations,
      metrics: ['distance', 'duration']
    })
  })

  if (!res.ok) return null
  const data = await res.json()
  if (!data.distances || !data.durations) return null

  return clinics.map((_, i) => ({
    distanceKm: parseFloat(((data.distances[0][i] || 0) / 1000).toFixed(2)),
    travelTimeMinutes: Math.max(1, Math.round((data.durations[0][i] || 60) / 60))
  }))
}

// Transform D1 booking row → camelCase for frontend
function normalizeBooking(row) {
  return {
    id: row.id,
    userId: row.user_id,
    clinicId: row.clinic_id,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    bookingTime: row.booking_time,
    appointmentTime: row.appointment_time,
    status: row.status,
    queueNumber: row.queue_number,
    estimatedWaitTime: row.estimated_wait_time
  }
}

// Transform D1 clinic row + computed fields → frontend shape
// dist: optional { distanceKm, travelTimeMinutes } from batch ORS call or haversine
function enrichClinic(row, queueCount = 0, dist = null) {
  const services = typeof row.services === 'string' ? JSON.parse(row.services || '[]') : (row.services || [])
  const distanceKm = dist ? dist.distanceKm : 0
  const travelTimeMinutes = dist ? dist.travelTimeMinutes : 1
  const estimatedWaitTimeMinutes = (row.base_wait_time_minutes || 30) + (queueCount * 10)
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    baseWaitTimeMinutes: row.base_wait_time_minutes,
    currentQueueCount: queueCount,
    services,
    operatingHours: row.operating_hours,
    capacityPerDay: row.capacity_per_day,
    hasElectricity: Boolean(row.has_electricity),
    hasSolar: Boolean(row.has_solar),
    openTime: row.open_time,
    closeTime: row.close_time,
    distanceKm,
    travelTimeMinutes,
    estimatedWaitTimeMinutes,
    totalTimeMinutes: travelTimeMinutes + estimatedWaitTimeMinutes
  }
}

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────

const requireAuth = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }
  try {
    const payload = await jwtVerify(authHeader.slice(7), c.env.JWT_SECRET)
    c.set('user', payload)
    await next()
  } catch (err) {
    return c.json({ success: false, error: 'Invalid or expired token. Please sign in again.' }, 401)
  }
}

const requireHealthcare = async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 'healthcare') {
    return c.json({ success: false, error: 'Healthcare provider access required' }, 403)
  }
  await next()
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// Health check — frontend pings this to detect online/offline
app.get('/', (c) => c.json({ success: true, message: 'Thuso Health API', version: '2.0.0', status: 'Healthy' }))
app.get('/api', (c) => c.json({ success: true, message: 'Thuso Health API', version: '2.0.0', status: 'Healthy' }))

// ─── AUTH ─────────────────────────────────────

app.post('/api/auth/register', async (c) => {
  try {
    const { name, email, password, phone, role, clinicName, clinicAddress } = await c.req.json()

    if (!name || !email || !password) {
      return c.json({ success: false, message: 'Name, email, and password are required' }, 400)
    }
    if (password.length < 6) {
      return c.json({ success: false, message: 'Password must be at least 6 characters' }, 400)
    }

    const existing = await c.env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email.toLowerCase()).first()
    if (existing) {
      return c.json({ success: false, message: 'Email is already registered' }, 400)
    }

    const salt = generateSalt()
    const passwordHash = await hashPassword(password, salt)
    const userId = 'u' + generateId()
    const thusoIdHash = `TH-${userId.toUpperCase()}`
    const consentPin = Math.floor(1000 + Math.random() * 9000).toString()
    const userRole = role || 'patient'

    let clinicId = null
    if (userRole === 'healthcare') {
      if (!clinicName || !clinicAddress) {
        return c.json({ success: false, message: 'Clinic name and address are required for healthcare registration' }, 400)
      }
      clinicId = 'c' + generateId()
      const lat = -26.19 + (Math.random() - 0.5) * 0.05
      const lng = 28.03 + (Math.random() - 0.5) * 0.05

      await c.env.DB.prepare(`
        INSERT INTO clinics (id, name, address, lat, lng, base_wait_time_minutes, current_queue_count,
          services, operating_hours, capacity_per_day, has_electricity, has_solar, open_time, close_time)
        VALUES (?, ?, ?, ?, ?, 30, 0, '["General Practitioner"]', '08:00 - 17:00', 50, 1, 0, '08:00', '17:00')
      `).bind(clinicId, clinicName, clinicAddress, lat, lng).run()
    }

    await c.env.DB.prepare(`
      INSERT INTO users (id, name, email, password_hash, salt, phone, role, clinic_id, thuso_id_hash, consent_pin, is_access_granted, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'en')
    `).bind(userId, name, email.toLowerCase(), passwordHash, salt, phone || null, userRole, clinicId, thusoIdHash, consentPin).run()

    const token = await jwtSign(
      { id: userId, email: email.toLowerCase(), role: userRole, clinicId },
      c.env.JWT_SECRET
    )

    return c.json({
      success: true,
      token,
      user: {
        id: userId, name, email: email.toLowerCase(), role: userRole,
        clinicId, thuso_id_hash: thusoIdHash, consentPin,
        isAccessGranted: true, language: 'en'
      }
    }, 201)
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) {
      return c.json({ success: false, message: 'Email and password are required' }, 400)
    }

    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email.toLowerCase()).first()

    if (!user) {
      return c.json({ success: false, message: 'Invalid email or password' }, 401)
    }

    const hash = await hashPassword(password, user.salt)
    if (hash !== user.password_hash) {
      return c.json({ success: false, message: 'Invalid email or password' }, 401)
    }

    let clinic = null
    if (user.clinic_id) {
      const row = await c.env.DB.prepare('SELECT * FROM clinics WHERE id = ?').bind(user.clinic_id).first()
      if (row) clinic = await enrichClinic(row)
    }

    const token = await jwtSign(
      { id: user.id, email: user.email, role: user.role, clinicId: user.clinic_id },
      c.env.JWT_SECRET
    )

    return c.json({
      success: true,
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        clinicId: user.clinic_id, thuso_id_hash: user.thuso_id_hash,
        consentPin: user.consent_pin, isAccessGranted: Boolean(user.is_access_granted),
        language: user.language || 'en'
      },
      clinic
    })
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500)
  }
})

// ─── USERS ─────────────────────────────────────

app.get('/api/users/profile', requireAuth, async (c) => {
  const me = c.get('user')
  const user = await c.env.DB.prepare(
    'SELECT id, name, email, role, phone, clinic_id, thuso_id_hash, consent_pin, is_access_granted, language FROM users WHERE id = ?'
  ).bind(me.id).first()
  if (!user) return c.json({ success: false, message: 'User not found' }, 404)
  return c.json({ success: true, user: { ...user, isAccessGranted: Boolean(user.is_access_granted) } })
})

app.get('/api/users/find-by-email', requireAuth, async (c) => {
  const email = c.req.query('email')
  if (!email) return c.json({ success: false, message: 'email query param is required' }, 400)

  const user = await c.env.DB.prepare(
    'SELECT id, name, email, role, thuso_id_hash FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first()

  if (!user) return c.json({ success: false, message: 'No patient found with that email address' }, 404)
  return c.json({ success: true, patient: user })
})

// ─── CLINICS ─────────────────────────────────────

app.get('/api/clinics/nearby', async (c) => {
  const lat = parseFloat(c.req.query('lat'))
  const lng = parseFloat(c.req.query('lng'))
  const orsKey = c.env.ORS_API_KEY || null

  const [{ results: clinicRows }, { results: queueRows }] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM clinics').all(),
    c.env.DB.prepare(
      "SELECT clinic_id, COUNT(*) as cnt FROM bookings WHERE status IN ('Confirmed','CheckedIn') GROUP BY clinic_id"
    ).all()
  ])

  const queueMap = {}
  queueRows.forEach(r => { queueMap[r.clinic_id] = Number(r.cnt) })

  const userLat = isNaN(lat) ? null : lat
  const userLng = isNaN(lng) ? null : lng

  // Compute distances: ORS (key) → OSRM (free, real routes) → Haversine (fallback)
  let distResults = null
  if (userLat !== null && userLng !== null) {
    if (orsKey) {
      try { distResults = await orsMatrixBatch(userLat, userLng, clinicRows, orsKey) } catch (_) {}
    }
    if (!distResults) {
      distResults = await osrmMatrixBatch(userLat, userLng, clinicRows)
    }
  }

  const clinics = clinicRows.map((row, i) => {
    let dist = null
    if (userLat !== null && userLng !== null) {
      dist = (distResults && distResults[i]) || haversine(userLat, userLng, row.lat, row.lng)
    }
    return enrichClinic(row, queueMap[row.id] || 0, dist)
  })

  clinics.sort((a, b) => a.totalTimeMinutes - b.totalTimeMinutes)
  return c.json({ success: true, clinics })
})

app.get('/api/clinics', async (c) => {
  const lat = parseFloat(c.req.query('lat'))
  const lng = parseFloat(c.req.query('lng'))
  const orsKey = c.env.ORS_API_KEY || null

  const { results } = await c.env.DB.prepare('SELECT * FROM clinics').all()

  const userLat = isNaN(lat) ? null : lat
  const userLng = isNaN(lng) ? null : lng

  let distResults = null
  if (userLat !== null && userLng !== null) {
    if (orsKey) {
      try { distResults = await orsMatrixBatch(userLat, userLng, results, orsKey) } catch (_) {}
    }
    if (!distResults) {
      distResults = await osrmMatrixBatch(userLat, userLng, results)
    }
  }

  const clinics = results.map((row, i) => {
    const dist = userLat !== null
      ? (distResults && distResults[i]) || haversine(userLat, userLng, row.lat, row.lng)
      : null
    return enrichClinic(row, 0, dist)
  })
  return c.json({ success: true, clinics })
})

app.get('/api/clinics/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM clinics WHERE id = ?').bind(c.req.param('id')).first()
  if (!row) return c.json({ success: false, message: 'Clinic not found' }, 404)
  return c.json({ success: true, clinic: enrichClinic(row) })
})

app.put('/api/clinics/:id', requireAuth, requireHealthcare, async (c) => {
  const id = c.req.param('id')
  const { capacityPerDay, hasElectricity, hasSolar, openTime, closeTime, services } = await c.req.json()

  const existing = await c.env.DB.prepare('SELECT * FROM clinics WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ success: false, message: 'Clinic not found' }, 404)

  const svcJson = JSON.stringify(Array.isArray(services) ? services : JSON.parse(existing.services || '[]'))
  const opHours = (openTime && closeTime) ? `${openTime} - ${closeTime}` : existing.operating_hours

  await c.env.DB.prepare(`
    UPDATE clinics
    SET capacity_per_day=?, has_electricity=?, has_solar=?, open_time=?, close_time=?, operating_hours=?, services=?
    WHERE id=?
  `).bind(
    capacityPerDay ?? existing.capacity_per_day,
    hasElectricity !== undefined ? (hasElectricity ? 1 : 0) : existing.has_electricity,
    hasSolar !== undefined ? (hasSolar ? 1 : 0) : existing.has_solar,
    openTime || existing.open_time,
    closeTime || existing.close_time,
    opHours,
    svcJson,
    id
  ).run()

  const updated = await c.env.DB.prepare('SELECT * FROM clinics WHERE id = ?').bind(id).first()
  return c.json({ success: true, clinic: enrichClinic(updated) })
})

// ─── BOOKINGS ─────────────────────────────────────

app.get('/api/bookings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM bookings ORDER BY booking_time DESC').all()
  return c.json({ success: true, bookings: results.map(normalizeBooking) })
})

app.get('/api/bookings/user/:userId', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM bookings WHERE user_id = ? ORDER BY booking_time DESC'
  ).bind(c.req.param('userId')).all()
  return c.json({ success: true, bookings: results.map(normalizeBooking) })
})

app.post('/api/bookings', async (c) => {
  try {
    const { userId, clinicId, appointmentTime, patientName, patientPhone } = await c.req.json()

    if (!userId || !clinicId) {
      return c.json({ success: false, message: 'userId and clinicId are required' }, 400)
    }

    const clinic = await c.env.DB.prepare('SELECT * FROM clinics WHERE id = ?').bind(clinicId).first()
    if (!clinic) return c.json({ success: false, message: 'Clinic not found' }, 404)

    const { count } = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM bookings WHERE clinic_id = ? AND status IN ('Confirmed','CheckedIn')"
    ).bind(clinicId).first()

    const queueCount = Number(count) || 0
    const queueNumber = `${clinicId.toUpperCase()}-${101 + queueCount}`
    const estimatedWaitTime = (clinic.base_wait_time_minutes || 30) + (queueCount * 10)

    let finalName = patientName
    if (!finalName && userId) {
      const userRow = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first()
      if (userRow) finalName = userRow.name
    }

    const id = 'b' + generateId()
    await c.env.DB.prepare(`
      INSERT INTO bookings (id, user_id, clinic_id, patient_name, patient_phone, booking_time, appointment_time, status, queue_number, estimated_wait_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?, ?)
    `).bind(
      id, userId, clinicId,
      finalName || 'Patient',
      patientPhone || null,
      new Date().toISOString(),
      appointmentTime || new Date().toISOString(),
      queueNumber,
      estimatedWaitTime
    ).run()

    const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first()
    return c.json({ success: true, booking: normalizeBooking(booking) }, 201)
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500)
  }
})

app.post('/api/bookings/sync', async (c) => {
  try {
    const { bookings } = await c.req.json()
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return c.json({ success: false, message: 'bookings array required' }, 400)
    }

    const stmts = bookings.map(b => {
      const id = 'b' + generateId()
      return c.env.DB.prepare(`
        INSERT OR IGNORE INTO bookings (id, user_id, clinic_id, patient_name, patient_phone, booking_time, appointment_time, status, queue_number, estimated_wait_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, b.userId || 'u1', b.clinicId || 'c1',
        b.patientName || 'Patient', b.patientPhone || null,
        b.bookingTime || new Date().toISOString(),
        b.appointmentTime || new Date().toISOString(),
        b.status || 'Confirmed',
        b.queueNumber || `SYNC-${id}`,
        b.estimatedWaitTime || 30
      )
    })

    await c.env.DB.batch(stmts)
    return c.json({ success: true, synced: bookings.length })
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500)
  }
})

app.put('/api/bookings/:id/checkin', async (c) => {
  await c.env.DB.prepare("UPDATE bookings SET status='CheckedIn' WHERE id=?")
    .bind(c.req.param('id')).run()
  return c.json({ success: true })
})

app.put('/api/bookings/:id/complete', async (c) => {
  await c.env.DB.prepare("UPDATE bookings SET status='Completed' WHERE id=?")
    .bind(c.req.param('id')).run()
  return c.json({ success: true })
})

app.delete('/api/bookings/:id', async (c) => {
  await c.env.DB.prepare("UPDATE bookings SET status='Cancelled' WHERE id=?")
    .bind(c.req.param('id')).run()
  return c.json({ success: true })
})

// ─── PATIENTS / DIGITAL HEALTH PASSPORT ──────────

app.get('/api/patients/:id/records', requireAuth, async (c) => {
  const patientId = c.req.param('id')
  const requestingUser = c.get('user')
  const pin = c.req.query('pin')

  if (requestingUser.id !== patientId) {
    // Healthcare provider must have consent + correct PIN
    const patient = await c.env.DB.prepare(
      'SELECT is_access_granted, consent_pin FROM users WHERE id = ?'
    ).bind(patientId).first()

    if (!patient) return c.json({ success: false, error: 'Patient not found' }, 404)
    if (!patient.is_access_granted) {
      return c.json({ success: false, error: 'Patient has revoked access to their records' }, 403)
    }
    if (patient.consent_pin && pin !== patient.consent_pin) {
      return c.json({ success: false, error: 'Invalid access PIN. Ask the patient for their PIN.' }, 403)
    }

    // POPIA audit log
    const doctorRow = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(requestingUser.id).first()
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (timestamp, practitioner_id, practitioner_name, patient_id, action)
      VALUES (?, ?, ?, ?, 'READ_RECORDS')
    `).bind(new Date().toISOString(), requestingUser.id, doctorRow?.name || 'Provider', patientId).run()
  }

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM medical_records WHERE patient_id = ? ORDER BY created_at DESC'
  ).bind(patientId).all()

  return c.json({ success: true, records: results })
})

app.post('/api/patients/:id/records', requireAuth, requireHealthcare, async (c) => {
  const patientId = c.req.param('id')
  const requestingUser = c.get('user')
  const { diagnosis, treatment_plan, medication_prescribed } = await c.req.json()

  if (!diagnosis) return c.json({ success: false, error: 'Diagnosis is required' }, 400)

  const doctorRow = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(requestingUser.id).first()
  const doctorName = doctorRow?.name || 'Dr. Unknown'

  let clinicName = 'Thuso Health Clinic'
  if (requestingUser.clinicId) {
    const clinicRow = await c.env.DB.prepare('SELECT name FROM clinics WHERE id = ?').bind(requestingUser.clinicId).first()
    if (clinicRow) clinicName = clinicRow.name
  }

  await c.env.DB.prepare(`
    INSERT INTO medical_records (patient_id, doctor_id, doctor_name, clinic_name, diagnosis, treatment_plan, medication_prescribed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(patientId, requestingUser.id, doctorName, clinicName, diagnosis, treatment_plan || null, medication_prescribed || null).run()

  // POPIA audit log
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (timestamp, practitioner_id, practitioner_name, patient_id, action)
    VALUES (?, ?, ?, ?, 'WRITE_RECORD')
  `).bind(new Date().toISOString(), requestingUser.id, doctorName, patientId).run()

  return c.json({ success: true, message: 'Medical record saved successfully' }, 201)
})

app.get('/api/patients/:id/consent', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT thuso_id_hash, consent_pin, is_access_granted, language FROM users WHERE id = ?'
  ).bind(c.req.param('id')).first()

  if (!row) return c.json({ success: false, message: 'Patient not found' }, 404)
  return c.json({
    success: true,
    consent: {
      thuso_id_hash: row.thuso_id_hash,
      consentPin: row.consent_pin,
      isAccessGranted: Boolean(row.is_access_granted),
      language: row.language || 'en'
    }
  })
})

app.put('/api/patients/:id/consent', requireAuth, async (c) => {
  const patientId = c.req.param('id')
  const me = c.get('user')
  if (me.id !== patientId) {
    return c.json({ success: false, error: 'You can only update your own consent settings' }, 403)
  }

  const { isAccessGranted, language, notifyMedications, notifyAppointments } = await c.req.json()

  const fields = []
  const values = []
  if (isAccessGranted !== undefined) { fields.push('is_access_granted = ?'); values.push(isAccessGranted ? 1 : 0) }
  if (language !== undefined) { fields.push('language = ?'); values.push(language) }
  if (notifyMedications !== undefined) { fields.push('notify_medications = ?'); values.push(notifyMedications ? 1 : 0) }
  if (notifyAppointments !== undefined) { fields.push('notify_appointments = ?'); values.push(notifyAppointments ? 1 : 0) }

  if (fields.length > 0) {
    values.push(patientId)
    await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  }

  const updated = await c.env.DB.prepare(
    'SELECT thuso_id_hash, consent_pin, is_access_granted, language FROM users WHERE id = ?'
  ).bind(patientId).first()

  return c.json({
    success: true,
    consent: {
      thuso_id_hash: updated.thuso_id_hash,
      consentPin: updated.consent_pin,
      isAccessGranted: Boolean(updated.is_access_granted),
      language: updated.language
    }
  })
})

app.get('/api/patients/:id/logs', requireAuth, async (c) => {
  const patientId = c.req.param('id')
  const me = c.get('user')
  if (me.id !== patientId && me.role !== 'healthcare') {
    return c.json({ success: false, error: 'Forbidden' }, 403)
  }

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM audit_logs WHERE patient_id = ? ORDER BY timestamp DESC'
  ).bind(patientId).all()

  return c.json({ success: true, logs: results })
})

// ─── TRANSLATE ─────────────────────────────────────
// Returns a stub — Cloudflare Workers AI can be wired here once the AI binding is added

app.post('/api/translate', async (c) => {
  return c.json({ success: false, message: 'Translation service not yet configured (add AI binding)' })
})

// ─── WHATSAPP BOT ──────────────────────────────────
// Supports two providers — configure ONE in Cloudflare Dashboard > Workers > Settings:
//
//  OPTION A — Twilio Sandbox (free, no business account needed, great for testing/demos):
//    TWILIO_ACCOUNT_SID  — from console.twilio.com
//    TWILIO_AUTH_TOKEN   — from console.twilio.com
//    TWILIO_FROM         — whatsapp:+14155238886  (Twilio sandbox number)
//    Webhook URL: https://thuso-health-api.pasekamabitsela22.workers.dev/api/whatsapp/twilio
//
//  OPTION B — Meta WhatsApp Cloud API (production, requires verified business):
//    WHATSAPP_TOKEN        — permanent access token from Meta developer console
//    WHATSAPP_PHONE_ID     — phone number ID from Meta console
//    WHATSAPP_VERIFY_TOKEN — any secret string for webhook verification
//    Webhook URL: https://thuso-health-api.pasekamabitsela22.workers.dev/api/whatsapp/webhook

// Meta Cloud API sender
async function waSend(phoneId, to, body, token) {
  if (!phoneId || !token) return
  await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: false } })
  })
}

// Twilio REST API sender
async function twilioSend(to, body, accountSid, authToken, fromNumber) {
  if (!accountSid || !authToken) return
  const auth = btoa(`${accountSid}:${authToken}`)
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: fromNumber, To: `whatsapp:+${to}`, Body: body }).toString()
  })
}

// Nominatim geocode — area name → { lat, lng, name }
async function geocodeArea(query) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', South Africa')}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ThusoHealth/1.0' } }
    )
    const d = await r.json()
    if (d.length) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), name: d[0].display_name.split(',')[0] }
  } catch (_) {}
  return null
}

// Fetch & rank clinics by total time from a given lat/lng
async function getNearbyWa(db, lat, lng) {
  const [{ results: rows }, { results: qRows }] = await Promise.all([
    db.prepare('SELECT * FROM clinics').all(),
    db.prepare("SELECT clinic_id, COUNT(*) as cnt FROM bookings WHERE status IN ('Confirmed','CheckedIn') GROUP BY clinic_id").all()
  ])
  const qMap = {}
  qRows.forEach(r => { qMap[r.clinic_id] = Number(r.cnt) })
  return rows
    .map(row => enrichClinic(row, qMap[row.id] || 0, haversine(lat, lng, row.lat, row.lng)))
    .sort((a, b) => a.totalTimeMinutes - b.totalTimeMinutes)
}

function pwr(c) {
  if (c.hasElectricity && c.hasSolar) return '⚡☀️'
  if (c.hasElectricity) return '⚡'
  if (c.hasSolar) return '☀️'
  return '🔴'
}

// Main conversation handler — sendFn is injected by each provider webhook
async function handleWaMessage(from, msgType, msgText, msgLoc, db, env, sendFn) {
  const send = sendFn || ((txt) => waSend(env.WHATSAPP_PHONE_ID, from, txt, env.WHATSAPP_TOKEN))

  let sess = await db.prepare('SELECT * FROM whatsapp_sessions WHERE phone=?').bind(from).first()
  let state = sess?.state || 'NEW'
  let d = {}
  try { d = sess ? JSON.parse(sess.data) : {} } catch (_) {}
  let uid = sess?.user_id || null

  const save = (ns, nd = d, nu = uid) => {
    nd = nd || {}
    if (sess) {
      return db.prepare('UPDATE whatsapp_sessions SET state=?,data=?,user_id=?,updated_at=? WHERE phone=?')
        .bind(ns, JSON.stringify(nd), nu, new Date().toISOString(), from).run()
    }
    return db.prepare('INSERT INTO whatsapp_sessions (phone,state,data,user_id,updated_at) VALUES (?,?,?,?,?)')
      .bind(from, ns, JSON.stringify(nd), nu, new Date().toISOString()).run()
  }

  const t = (msgText || '').trim()
  const tl = t.toLowerCase()

  const showMenu = async () => {
    const u = uid ? await db.prepare('SELECT name FROM users WHERE id=?').bind(uid).first() : null
    const greet = u ? `Welcome back, *${u.name}*! 👋` : `Welcome to *Thuso Health* 🏥`
    await send(`${greet}\n\nHealthcare in your pocket — zero data cost.\n\n1️⃣  Find nearby clinics & book\n2️⃣  My active booking\n3️⃣  My health passport\n4️⃣  ${uid ? 'Sign out' : 'Sign in / Register'}\n\nType *HELP* anytime.`)
    await save('MENU', {})
  }

  // ── Global shortcuts (work from any state) ─────────────────────────────
  if (['menu', 'hi', 'hello', 'start', '0', 'back', 'home', 'thuso'].includes(tl) || state === 'NEW') {
    return showMenu()
  }

  if (tl === 'help') {
    await send(`*Thuso Health — Help*\n\n*MENU* — main menu\n*STATUS* — check your active ticket\n*CANCEL* — cancel your active booking\n*PASSPORT* — view health summary\n\nZero-rated service. No data fees on local networks.`)
    return
  }

  if (tl === 'status') {
    if (!uid) { await send('You are not signed in. Reply *MENU* to continue.'); return }
    const b = await db.prepare("SELECT b.*,c.name AS cn FROM bookings b JOIN clinics c ON b.clinic_id=c.id WHERE b.user_id=? AND b.status IN ('Confirmed','CheckedIn') ORDER BY b.booking_time DESC LIMIT 1").bind(uid).first()
    if (!b) { await send('No active bookings. Reply *MENU* to book a slot.'); return }
    await send(`🎫 *Active Booking*\n\n🏥 ${b.cn}\n📋 Ticket: *${b.queue_number}*\n⏱ Est. wait: ${b.estimated_wait_time} mins\n📌 Status: ${b.status}\n\nReply *CANCEL* to cancel or *MENU* for home.`)
    return
  }

  if (tl === 'cancel') {
    if (!uid) { await send('You are not signed in. Reply *MENU* to continue.'); return }
    const b = await db.prepare("SELECT * FROM bookings WHERE user_id=? AND status IN ('Confirmed','CheckedIn') ORDER BY booking_time DESC LIMIT 1").bind(uid).first()
    if (!b) { await send('No active booking to cancel. Reply *MENU*.'); return }
    await db.prepare("UPDATE bookings SET status='Cancelled' WHERE id=?").bind(b.id).run()
    await send(`✅ Booking *${b.queue_number}* cancelled.\n\nReply *MENU* to book again.`)
    return
  }

  if (tl === 'passport') {
    state = 'PASSPORT'
  }

  // ── State machine ──────────────────────────────────────────────────────

  // MENU — waiting for 1/2/3/4
  if (state === 'MENU') {
    if (t === '1') {
      await send(`📍 *Find Nearby Clinics*\n\nShare your location using WhatsApp's 📎 location button, _or_ type an area name:\n\n_e.g. "Dube Soweto", "Parktown", "Braamfontein"_`)
      await save('AWAIT_LOC', {})
      return
    } else if (t === '2') {
      if (!uid) { await send('Please sign in first.\n\nReply *4* to sign in.'); return }
      const b = await db.prepare("SELECT b.*,c.name AS cn FROM bookings b JOIN clinics c ON b.clinic_id=c.id WHERE b.user_id=? AND b.status IN ('Confirmed','CheckedIn') ORDER BY b.booking_time DESC LIMIT 1").bind(uid).first()
      if (!b) { await send('No active bookings.\n\nReply *1* to find a clinic or *MENU* for home.'); return }
      await send(`🎫 *Your Active Booking*\n\n🏥 ${b.cn}\n📋 Ticket: *${b.queue_number}*\n⏱ Est. wait: ${b.estimated_wait_time} mins\n📌 Status: ${b.status}\n\nReply *CANCEL* to cancel or *MENU* for home.`)
      return
    } else if (t === '3' || tl === 'passport') {
      state = 'PASSPORT' // intentional fall-through to PASSPORT block below
    } else if (t === '4') {
      if (uid) {
        await db.prepare('UPDATE whatsapp_sessions SET user_id=NULL WHERE phone=?').bind(from).run()
        uid = null
        await send('✅ You have been signed out.\n\nReply *MENU* to continue.')
        return
      } else {
        await send(`*Sign in or Register*\n\nReply:\n• *LOGIN* to sign into an existing account\n• *REGISTER* to create a new account`)
        await save('AUTH_CHOICE', {})
        return
      }
    } else {
      await showMenu()
      return
    }
  }

  // PASSPORT state
  if (state === 'PASSPORT') {
    if (!uid) {
      await send('You need to be signed in to view your passport.\n\nReply *LOGIN* to sign in or *REGISTER* to create an account.')
      await save('AUTH_CHOICE', { pendingAction: 'passport' })
      return
    }
    const u = await db.prepare('SELECT * FROM users WHERE id=?').bind(uid).first()
    if (!u) { await showMenu(); return }
    const recs = await db.prepare('SELECT * FROM medical_records WHERE patient_id=? ORDER BY created_at DESC LIMIT 3').bind(uid).all()
    let recText = ''
    if (recs.results.length === 0) {
      recText = '_No medical records yet_'
    } else {
      recText = recs.results.map(r => {
        const d2 = Math.round((Date.now() - new Date(r.created_at)) / 86400000)
        const when = d2 === 0 ? 'Today' : d2 === 1 ? 'Yesterday' : `${d2} days ago`
        return `• _${when}_ — ${r.doctor_name} (${r.clinic_name})\n  📋 ${r.diagnosis}${r.medication_prescribed ? `\n  💊 ${r.medication_prescribed}` : ''}`
      }).join('\n\n')
    }
    await send(`🛂 *Health Passport*\n\n👤 ${u.name}\n🆔 ThusoID: ${u.thuso_id_hash}\n🔑 Access PIN: ${u.consent_pin}\n✅ Access: ${u.is_access_granted ? 'Granted' : 'Revoked'}\n\n📋 *Recent Records:*\n${recText}\n\nReply *MENU* to go home.`)
    await save('MENU', {})
    return
  }

  // AWAIT_LOC — waiting for location or area text
  if (state === 'AWAIT_LOC') {
    let lat, lng, areaName
    if (msgType === 'location' && msgLoc) {
      lat = msgLoc.latitude; lng = msgLoc.longitude; areaName = msgLoc.name || 'Your location'
    } else if (t) {
      const geo = await geocodeArea(t)
      if (!geo) {
        await send(`❌ Could not find "${t}" on the map. Try a well-known area like:\n\n• Dube Soweto\n• Parktown JHB\n• Braamfontein\n• Meadowlands Soweto`)
        return
      }
      lat = geo.lat; lng = geo.lng; areaName = geo.name
    } else {
      await send('Please share your location using the 📎 button, or type an area name.')
      return
    }

    const clinics = await getNearbyWa(db, lat, lng)
    const top5 = clinics.slice(0, 5)
    const list = top5.map((c, i) => {
      const wt = c.estimatedWaitTimeMinutes
      const badge = wt < 30 ? '🟢' : wt <= 60 ? '🟡' : '🔴'
      return `${i + 1}. ${badge} *${c.name}*\n   🚗 ${c.distanceKm} km · ⏱ ${wt} min wait · ${pwr(c)}`
    }).join('\n\n')
    await send(`📍 *Clinics near ${areaName}*\n\n${list}\n\nReply with a number to book (1-5), or *MENU* to go back.`)
    await save('CLINIC_LIST', { clinics: top5, lat, lng, areaName })
    return
  }

  // CLINIC_LIST — user picks a clinic number
  if (state === 'CLINIC_LIST') {
    const n = parseInt(t, 10)
    if (isNaN(n) || n < 1 || n > (d.clinics?.length || 5)) {
      await send(`Reply with a number 1–${d.clinics?.length || 5} to choose a clinic, or *MENU* to go back.`)
      return
    }
    const clinic = d.clinics[n - 1]
    if (!clinic) { await showMenu(); return }
    await send(`🏥 *${clinic.name}*\n📍 ${clinic.address}\n${pwr(clinic)} ${clinic.hasElectricity ? 'Grid power' : clinic.hasSolar ? 'Solar backup' : 'No power'}\n⏱ Est. wait: *${clinic.estimatedWaitTimeMinutes} mins*\n🚗 ${clinic.distanceKm} km from you\n\nWhen would you like to arrive?\n1. Now — leave immediately\n2. In 30 minutes\n3. In 1 hour\n4. In 2 hours`)
    await save('BOOK_TIME', { ...d, clinic })
    return
  }

  // BOOK_TIME — user picks arrival window
  if (state === 'BOOK_TIME') {
    const opts = { '1': 0, '2': 30, '3': 60, '4': 120 }
    if (!opts.hasOwnProperty(t)) {
      await send('Reply 1, 2, 3 or 4 to choose your arrival time.')
      return
    }
    // Need to be logged in to book
    if (!uid) {
      await send(`To book a slot you need to sign in.\n\nReply:\n• *LOGIN* — sign in to your account\n• *REGISTER* — create a new account`)
      await save('AUTH_CHOICE', { ...d, bookingOffset: opts[t], pendingAction: 'book' })
      return
    }
    await send(`What is the patient's full name?\n_(or reply *ME* to use your account name)_`)
    await save('BOOK_NAME', { ...d, bookingOffset: opts[t] })
    return
  }

  // BOOK_NAME
  if (state === 'BOOK_NAME') {
    let name = t
    if (tl === 'me' && uid) {
      const u = await db.prepare('SELECT name FROM users WHERE id=?').bind(uid).first()
      name = u?.name || t
    }
    if (!name || name.length < 2) { await send('Please enter the patient\'s full name.'); return }
    await send(`📞 What phone number should the clinic use to contact the patient?\n\n_(Reply *MINE* to use your WhatsApp number +${from})_`)
    await save('BOOK_PHONE', { ...d, bookingName: name })
    return
  }

  // BOOK_PHONE — final step, create the booking
  if (state === 'BOOK_PHONE') {
    let phone = t
    if (tl === 'mine') phone = `+${from}`
    if (!phone) { await send('Please enter a phone number or reply *MINE*.'); return }

    const clinic = d.clinic
    const offset = d.bookingOffset || 0
    const appointmentTime = new Date(Date.now() + offset * 60000).toISOString()
    const bookingTime = new Date().toISOString()

    const { count: qCount } = await db.prepare(
      "SELECT COUNT(*) as count FROM bookings WHERE clinic_id=? AND status IN ('Confirmed','CheckedIn')"
    ).bind(clinic.id).first()
    const qNum = `${clinic.id.toUpperCase()}-WA${String(Number(qCount) + 101).padStart(3, '0')}`
    const waitTime = clinic.estimatedWaitTimeMinutes

    const bookingId = 'bwa' + generateId()
    await db.prepare(
      'INSERT INTO bookings (id,user_id,clinic_id,patient_name,patient_phone,booking_time,appointment_time,status,queue_number,estimated_wait_time) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(bookingId, uid, clinic.id, d.bookingName, phone, bookingTime, appointmentTime, 'Confirmed', qNum, waitTime).run()

    const leaveMsg = offset === 0 ? 'Leave now!' : `Leave in ${offset - clinic.travelTimeMinutes} mins.`
    await send(`✅ *Booking Confirmed!*\n\n🏥 ${clinic.name}\n📍 ${clinic.address}\n🎫 Ticket: *${qNum}*\n⏱ Est. wait: ${waitTime} mins\n📅 ${leaveMsg}\n\nReply:\n• *STATUS* — check your ticket\n• *CANCEL* — cancel booking\n• *MENU* — main menu`)
    await save('MENU', {})
    return
  }

  // AUTH_CHOICE — login or register?
  if (state === 'AUTH_CHOICE') {
    if (tl === 'login') {
      await send('Enter your Thuso Health email address:')
      await save('AUTH_EMAIL', d)
      return
    } else if (tl === 'register') {
      await send('Let\'s create your account.\n\nWhat is your full name?')
      await save('REG_NAME', d)
      return
    } else {
      await send('Reply *LOGIN* to sign in or *REGISTER* to create a new account.')
      return
    }
  }

  // AUTH_EMAIL
  if (state === 'AUTH_EMAIL') {
    if (!t.includes('@')) { await send('Please enter a valid email address.'); return }
    await send('Enter your password:')
    await save('AUTH_PWD', { ...d, authEmail: t })
    return
  }

  // AUTH_PWD — verify and log in
  if (state === 'AUTH_PWD') {
    const u = await db.prepare('SELECT * FROM users WHERE email=?').bind(d.authEmail?.toLowerCase()).first()
    if (!u) { await send('❌ No account found with that email. Reply *REGISTER* to create one or *MENU* to go back.'); await save('MENU', {}); return }
    const hashed = await hashPassword(t, u.salt)
    if (hashed !== u.password_hash) {
      await send('❌ Incorrect password. Reply *MENU* to restart or try again — enter your password:')
      return
    }
    uid = u.id
    await send(`✅ Welcome back, *${u.name}*!`)
    await save('MENU', {}, uid)
    // Resume pending action
    if (d.pendingAction === 'book' && d.clinic) {
      await send(`What is the patient\'s full name?\n_(or reply *ME* to use your account name)_`)
      await save('BOOK_NAME', { ...d, pendingAction: null }, uid)
    } else if (d.pendingAction === 'passport') {
      state = 'PASSPORT'
      sess = { ...sess, user_id: uid }; uid = u.id
      await handleWaMessage(from, msgType, 'passport', msgLoc, db, env, sendFn)
    } else {
      await showMenu()
    }
    return
  }

  // REG_NAME
  if (state === 'REG_NAME') {
    if (!t || t.length < 2) { await send('Please enter your full name.'); return }
    await send('Your email address?')
    await save('REG_EMAIL', { ...d, regName: t })
    return
  }

  // REG_EMAIL
  if (state === 'REG_EMAIL') {
    if (!t.includes('@')) { await send('Please enter a valid email address.'); return }
    const exists = await db.prepare('SELECT id FROM users WHERE email=?').bind(t.toLowerCase()).first()
    if (exists) { await send('That email is already registered. Reply *LOGIN* to sign in.'); await save('AUTH_CHOICE', d); return }
    await send('Create a password (minimum 6 characters):')
    await save('REG_PWD', { ...d, regEmail: t.toLowerCase() })
    return
  }

  // REG_PWD — create account
  if (state === 'REG_PWD') {
    if (!t || t.length < 6) { await send('Password must be at least 6 characters. Try again:'); return }
    const salt = generateSalt()
    const hash = await hashPassword(t, salt)
    const userId2 = 'u' + generateId()
    const thusoId = `TH-${userId2.toUpperCase()}`
    const pin = Math.floor(1000 + Math.random() * 9000).toString()
    await db.prepare(
      'INSERT INTO users (id,name,email,password_hash,salt,phone,role,thuso_id_hash,consent_pin,is_access_granted,language) VALUES (?,?,?,?,?,?,?,?,?,1,?)'
    ).bind(userId2, d.regName, d.regEmail, hash, salt, `+${from}`, 'patient', thusoId, pin, 'en').run()
    uid = userId2
    await send(`✅ *Account created!*\n\n👤 ${d.regName}\n🆔 ThusoID: *${thusoId}*\n🔑 Consent PIN: ${pin}\n\nKeep your PIN safe — doctors use it to access your records.\n\nWelcome to Thuso Health! 🏥`)
    await save('MENU', {}, uid)
    if (d.pendingAction === 'book' && d.clinic) {
      await send(`What is the patient\'s full name?\n_(or reply *ME* to use your account name)_`)
      await save('BOOK_NAME', { ...d, pendingAction: null }, uid)
    } else {
      await showMenu()
    }
    return
  }

  // Fallback
  await showMenu()
}

// WhatsApp webhook — Meta verification (GET)
app.get('/api/whatsapp/webhook', async (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')
  if (mode === 'subscribe' && token === c.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return c.json({ success: false, message: 'Verification failed' }, 403)
})

// WhatsApp webhook — incoming messages (POST)
app.post('/api/whatsapp/webhook', async (c) => {
  try {
    const body = await c.req.json()
    const entry = body?.entry?.[0]
    const change = entry?.changes?.[0]?.value
    if (!change?.messages?.length) return c.json({ success: true })

    for (const msg of change.messages) {
      const from = msg.from // e.g. "27821234567"
      const msgType = msg.type
      let msgText = null
      let msgLoc = null

      if (msgType === 'text') msgText = msg.text?.body || ''
      else if (msgType === 'location') msgLoc = msg.location
      else if (msgType === 'interactive') {
        msgText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || ''
      }
      // Handle in background so Meta doesn't retry (must respond within 5s)
      c.executionCtx.waitUntil(
        handleWaMessage(from, msgType, msgText, msgLoc, c.env.DB, c.env)
      )
    }
    return c.json({ success: true })
  } catch (err) {
    console.error('WhatsApp webhook error:', err.message)
    return c.json({ success: true }) // always 200 to Meta
  }
})

// Twilio WhatsApp Sandbox webhook — POST /api/whatsapp/twilio
// Set webhook in Twilio console → Messaging → WhatsApp Sandbox → When a message comes in:
//   https://thuso-health-api.pasekamabitsela22.workers.dev/api/whatsapp/twilio  (HTTP POST)
app.post('/api/whatsapp/twilio', async (c) => {
  try {
    const raw = await c.req.text()
    const params = new URLSearchParams(raw)
    // Twilio sends From as "whatsapp:+27821234567" — strip to bare digits
    const from = (params.get('From') || '').replace(/^whatsapp:\+?/, '')
    const msgBody = params.get('Body') || ''
    const msgType = 'text'

    if (!from) return new Response('', { status: 200 })

    const accountSid = c.env.TWILIO_ACCOUNT_SID
    const authToken  = c.env.TWILIO_AUTH_TOKEN
    const twilioFrom = c.env.TWILIO_FROM || 'whatsapp:+14155238886'

    const sendFn = (txt) => twilioSend(from, txt, accountSid, authToken, twilioFrom)

    c.executionCtx.waitUntil(
      handleWaMessage(from, msgType, msgBody, null, c.env.DB, c.env, sendFn)
    )

    // Empty TwiML — actual reply sent via REST API above
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' }
    })
  } catch (err) {
    console.error('Twilio webhook error:', err.message)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' }
    })
  }
})

// ─── ADMIN SEED ────────────────────────────────────
// Call once after deploying: POST /api/admin/seed?secret=YOUR_SEED_SECRET

app.post('/api/admin/seed', async (c) => {
  const secret = c.req.query('secret')
  if (!secret || secret !== c.env.SEED_SECRET) {
    return c.json({ success: false, message: 'Forbidden — wrong seed secret' }, 403)
  }

  const existing = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first()
  if (Number(existing.count) > 0) {
    return c.json({ success: false, message: 'Database is already seeded. Drop tables and re-apply schema to reseed.' })
  }

  const patientSalt = generateSalt()
  const patientHash = await hashPassword('password123', patientSalt)
  const doctorSalt = generateSalt()
  const doctorHash = await hashPassword('password123', doctorSalt)

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c1','Thuso Health Central Clinic','26 Jorissen St, Braamfontein, Johannesburg, 2001',-26.1929,28.0328,45,12,'["General Practitioner","Dentistry","Pediatrics","Vaccinations"]','08:00 - 17:00',80,1,0,'08:00','17:00')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c2','Hillbrow Community Health Centre','Smith St & Klein St, Hillbrow, Johannesburg, 2001',-26.1884,28.0443,90,28,'["General Practitioner","HIV/AIDS Care","Maternity","Pharmacy"]','24 Hours',150,0,0,'00:00','23:59')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c3','Parktown Medical Centre','15 Princess of Wales Terrace, Parktown, Johannesburg, 2193',-26.1772,28.0308,20,3,'["General Practitioner","Physiotherapy","Optometry"]','08:00 - 18:00',40,1,1,'08:00','18:00')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c4','Rosebank Health Clinic','50 Bath Ave, Rosebank, Johannesburg, 2196',-26.1460,28.0371,15,2,'["General Practitioner","Travel Clinic","Dermatology"]','09:00 - 17:00',30,1,1,'09:00','17:00')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c5','Dube Community Health Centre','Nhlapo St, Dube, Soweto, 1801',-26.2465,27.8712,55,14,'["General Practitioner","HIV/AIDS Care","Vaccinations","Pharmacy"]','07:30 - 16:00',100,1,0,'07:30','16:00')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c6','Chris Hani Baragwanath Outpatient Clinic','Chris Hani Rd, Diepkloof, Soweto, 1864',-26.2728,27.9377,80,31,'["General Practitioner","Emergency Care","Maternity","Pediatrics","Pharmacy"]','24 Hours',200,1,1,'00:00','23:59')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c7','Meadowlands Community Clinic','Zone 6, Meadowlands, Soweto, 1852',-26.2195,27.9098,40,8,'["General Practitioner","Family Planning","Vaccinations"]','08:00 - 16:30',60,0,1,'08:00','16:30')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c8','Phiri Primary Health Care','Phiri, Soweto, 1864',-26.2643,27.8558,30,5,'["General Practitioner","TB Care","Chronic Medication"]','07:30 - 15:30',50,1,0,'07:30','15:30')
    `),
    c.env.DB.prepare(`
      INSERT INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
      VALUES ('c9','Orlando East Clinic','Khumalo St, Orlando East, Soweto, 1804',-26.2537,27.9042,25,4,'["General Practitioner","Dentistry","Optometry","Chronic Medication"]','08:00 - 17:00',70,1,1,'08:00','17:00')
    `),
    c.env.DB.prepare(`
      INSERT INTO users (id,name,email,password_hash,salt,phone,role,thuso_id_hash,consent_pin,is_access_granted,language)
      VALUES ('u1','Paseka Moloi','paseka@thuso.health',?,?,'+27 82 123 4567','patient','TH-U1','1234',1,'en')
    `).bind(patientHash, patientSalt),
    c.env.DB.prepare(`
      INSERT INTO users (id,name,email,password_hash,salt,phone,role,clinic_id,thuso_id_hash,consent_pin,is_access_granted,language)
      VALUES ('u2','Dr. Sarah Dube','sarah@thuso.health',?,?,'+27 83 987 6543','healthcare','c3','TH-U2','5678',1,'en')
    `).bind(doctorHash, doctorSalt),
    c.env.DB.prepare(`
      INSERT INTO bookings (id,user_id,clinic_id,patient_name,patient_phone,booking_time,appointment_time,status,queue_number,estimated_wait_time)
      VALUES ('b1','u1','c1','Paseka Moloi','+27 82 123 4567',?,?,'Confirmed','C1-101',35)
    `).bind(new Date(Date.now() - 3600000).toISOString(), new Date(Date.now() + 7200000).toISOString()),
    c.env.DB.prepare(`
      INSERT INTO medical_records (patient_id,doctor_id,doctor_name,clinic_name,diagnosis,treatment_plan,medication_prescribed,file_url_r2,created_at)
      VALUES ('u1','u2','Dr. Sarah Dube','Parktown Medical Centre','Mild respiratory infection','Bed rest and hydration','Paracetamol 500mg, Vitamin C','https://r2.thuso.health/reports/u1-rec1.pdf',?)
    `).bind(new Date(Date.now() - 86400000 * 2).toISOString()),
    c.env.DB.prepare(`
      INSERT INTO audit_logs (timestamp,practitioner_id,practitioner_name,patient_id,action)
      VALUES (?,'u2','Dr. Sarah Dube','u1','WRITE_RECORD')
    `).bind(new Date(Date.now() - 86400000 * 2).toISOString())
  ])

  return c.json({
    success: true,
    message: 'Database seeded with demo data',
    accounts: {
      patient: { email: 'paseka@thuso.health', password: 'password123' },
      healthcare: { email: 'sarah@thuso.health', password: 'password123' }
    }
  })
})

// ─── EXPAND CLINICS (one-shot, safe to re-run) ────────────────────────────────
// POST /api/admin/expand-clinics?secret=YOUR_SEED_SECRET

app.post('/api/admin/expand-clinics', async (c) => {
  const secret = c.req.query('secret')
  if (!secret || secret !== c.env.SEED_SECRET) return c.json({ success: false, message: 'Forbidden' }, 403)

  const EXTRA = [
    ['c10','Zola Community Health Centre','Ntuli Rd, Zola, Soweto, 1820',-26.2271,27.8534,60,18,'["General Practitioner","HIV/AIDS Care","Family Planning","Vaccinations"]','07:30 - 16:00',90,1,0,'07:30','16:00'],
    ['c11','Dobsonville Community Health Centre','Ipelegeng Rd, Dobsonville, Soweto, 1863',-26.2099,27.8389,50,11,'["General Practitioner","Pediatrics","Chronic Medication","TB Care"]','08:00 - 16:30',80,1,1,'08:00','16:30'],
    ['c12','Naledi Clinic','Naledi, Soweto, 1809',-26.2794,27.8815,35,6,'["General Practitioner","Vaccinations","Chronic Medication"]','07:30 - 15:30',50,1,0,'07:30','15:30'],
    ['c13','Diepkloof Zone 4 Clinic','Zone 4, Diepkloof, Soweto, 1864',-26.2489,27.9413,45,9,'["General Practitioner","HIV/AIDS Care","Family Planning"]','08:00 - 16:00',70,1,0,'08:00','16:00'],
    ['c14','Mofolo North Clinic','Mofolo North, Soweto, 1861',-26.2373,27.8898,40,7,'["General Practitioner","TB Care","Chronic Medication","Vaccinations"]','07:30 - 15:30',60,0,1,'07:30','15:30'],
    ['c15','Jabavu Community Health Centre','White City, Jabavu, Soweto, 1808',-26.2582,27.8706,70,21,'["General Practitioner","HIV/AIDS Care","Maternity","Pharmacy","Vaccinations"]','07:30 - 16:00',120,1,1,'07:30','16:00'],
    ['c16','Pimville Community Health Centre','Pimville, Soweto, 1809',-26.2825,27.9230,55,13,'["General Practitioner","Pediatrics","HIV/AIDS Care","Family Planning"]','08:00 - 16:00',85,1,0,'08:00','16:00'],
    ['c17','Moroka Community Clinic','Moroka, Soweto, 1832',-26.2621,27.9097,30,5,'["General Practitioner","Chronic Medication","TB Care"]','08:00 - 16:00',55,1,0,'08:00','16:00'],
    ['c18','Protea Glen Clinic','Protea Glen, Soweto, 1818',-26.2891,27.8411,25,3,'["General Practitioner","Vaccinations","Family Planning"]','08:00 - 15:30',45,1,1,'08:00','15:30'],
    ['c19','Alexandra Community Health Centre','Far East Bank, Alexandra, Johannesburg, 2090',-26.1026,28.0951,65,23,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Pharmacy"]','07:30 - 16:30',130,1,1,'07:30','16:30'],
    ['c20','Tembisa Community Health Centre','Tembisa, Ekurhuleni, 1628',-26.0042,28.2290,75,27,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Pharmacy"]','24 Hours',160,1,1,'00:00','23:59'],
    ['c21','Katlehong Community Health Centre','Katlehong, Ekurhuleni, 1431',-26.3621,28.1502,60,16,'["General Practitioner","HIV/AIDS Care","Family Planning","TB Care"]','07:30 - 16:00',100,1,0,'07:30','16:00'],
    ['c22','Mamelodi Community Health Centre','Mamelodi East, Tshwane, 0122',-25.7059,28.3941,80,29,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Vaccinations"]','24 Hours',150,1,1,'00:00','23:59'],
    ['c23','Soshanguve Community Health Centre','Block H, Soshanguve, Tshwane, 0152',-25.5261,28.0882,70,19,'["General Practitioner","HIV/AIDS Care","Dentistry","Pharmacy","Vaccinations"]','07:30 - 16:00',120,1,0,'07:30','16:00'],
    ['c24','Atteridgeville Community Health Centre','Atteridgeville, Tshwane, 0008',-25.7728,27.9944,55,15,'["General Practitioner","HIV/AIDS Care","Family Planning","Chronic Medication"]','08:00 - 16:00',90,0,1,'08:00','16:00'],
    ['c25','Kagiso Community Health Centre','Kagiso, Mogale City, 1754',-26.1650,27.7771,45,10,'["General Practitioner","HIV/AIDS Care","Vaccinations","TB Care"]','07:30 - 16:00',80,1,0,'07:30','16:00'],
    ['c26','Bekkersdal Community Health Centre','Bekkersdal, Westonaria, 1779',-26.3432,27.6678,50,12,'["General Practitioner","HIV/AIDS Care","Family Planning","Pharmacy"]','07:30 - 15:30',75,0,1,'07:30','15:30'],
    ['c27','Orange Farm Community Health Centre','Orange Farm, Johannesburg South, 1804',-26.4880,27.8473,85,33,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Pharmacy"]','07:30 - 16:30',140,1,1,'07:30','16:30'],
    ['c28','Evaton Community Health Centre','Evaton, Sedibeng, 1984',-26.5157,27.9239,60,17,'["General Practitioner","HIV/AIDS Care","Chronic Medication","Vaccinations"]','08:00 - 16:00',95,1,0,'08:00','16:00'],
    ['c29','Lenasia Community Health Centre','Lenasia, Johannesburg South, 1827',-26.3012,27.8297,40,8,'["General Practitioner","Dentistry","Pediatrics","Vaccinations","Pharmacy"]','08:00 - 17:00',70,1,1,'08:00','17:00'],
    ['c30','Ivory Park Community Health Centre','Ivory Park, Midrand, 1685',-26.0201,28.1892,70,22,'["General Practitioner","HIV/AIDS Care","Maternity","Family Planning"]','24 Hours',130,1,0,'00:00','23:59'],
    ['c31','Westbury Community Clinic','Westbury, Johannesburg West, 2092',-26.1836,27.9682,35,7,'["General Practitioner","HIV/AIDS Care","Chronic Medication","Vaccinations"]','08:00 - 16:00',60,1,1,'08:00','16:00'],
    ['c32','Ennerdale Community Clinic','Ennerdale, Johannesburg South, 1786',-26.4137,27.8771,45,9,'["General Practitioner","TB Care","Chronic Medication","Family Planning"]','08:00 - 15:30',65,0,1,'08:00','15:30'],
  ]

  const stmt = `INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  const batch = EXTRA.map(row => c.env.DB.prepare(stmt).bind(...row))
  await c.env.DB.batch(batch)

  const { results } = await c.env.DB.prepare('SELECT COUNT(*) as n FROM clinics').all()
  return c.json({ success: true, total_clinics: results[0].n, added: EXTRA.length })
})

// ─── 404 + ERROR ───────────────────────────────────

app.notFound((c) => c.json({ success: false, message: `Route not found: ${c.req.method} ${c.req.path}` }, 404))

app.onError((err, c) => {
  console.error('Worker error:', err.message)
  return c.json({ success: false, message: err.message || 'Internal server error' }, 500)
})

export default app
