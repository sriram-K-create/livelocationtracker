import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

/**
 * DATABASE CONNECTION POOL
 * 
 * Connection pooling: Instead of creating new DB connection for each query,
 * we maintain a pool of connections. Queries reuse idle connections.
 * 
 * Benefits:
 * - Faster: No connection creation overhead
 * - Resource efficient: Limited number of connections to database
 * - Scalable: Can handle many concurrent requests
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/location_tracker',
  max: 20,  // Maximum concurrent connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err)
})

/**
 * Initialize Database
 * 
 * Creates tables if they don't exist
 * This runs once on server startup
 */
export async function initDatabase() {
  const client = await pool.connect()

  try {
    // Create users table (stores authenticated user info)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        oauth_provider VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP
      )
    `)

    // Create location_history table (stores location updates)
    await client.query(`
      CREATE TABLE IF NOT EXISTS location_history (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        accuracy FLOAT,
        recorded_at TIMESTAMP NOT NULL,
        processed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, recorded_at),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)

    // Create indexes for fast queries
    // Index on user_id: Queries like "get all locations for user" are fast
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_location_user_time 
      ON location_history(user_id, recorded_at DESC)
    `)

    // Index on timestamp: Queries like "get recent locations" are fast
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_location_timestamp 
      ON location_history(recorded_at DESC)
    `)

    console.log('✅ Database initialized successfully')
    console.log('   Tables: users, location_history')
    console.log('   Indexes: user_time, timestamp')
  } catch (error) {
    console.error('❌ Database initialization error:', error.message)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Get database connection from pool
 * 
 * Usage:
 *   const connection = await getConnection()
 *   await connection.query('SELECT ...')
 */
export async function getConnection() {
  return await pool.connect()
}

/**
 * Helper: Insert or update user
 */
export async function upsertUser(userId, email, name) {
  const connection = await pool.connect()
  try {
    await connection.query(`
      INSERT INTO users (id, email, name, last_seen)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id) DO UPDATE
      SET last_seen = NOW(), name = COALESCE($3, name)
    `, [userId, email, name])
  } finally {
    connection.release()
  }
}

/**
 * Helper: Get location history for a user
 */
export async function getUserLocationHistory(userId, limit = 100) {
  const connection = await pool.connect()
  try {
    const result = await connection.query(`
      SELECT latitude, longitude, accuracy, recorded_at
      FROM location_history
      WHERE user_id = $1
      ORDER BY recorded_at DESC
      LIMIT $2
    `, [userId, limit])
    return result.rows
  } finally {
    connection.release()
  }
}

/**
 * Helper: Get all users (for listing on map)
 */
export async function getAllUsers() {
  const connection = await pool.connect()
  try {
    const result = await connection.query(`
      SELECT u.id, u.email, u.name, 
             lh.latitude, lh.longitude, lh.recorded_at
      FROM users u
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, recorded_at
        FROM location_history
        WHERE user_id = u.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) lh ON TRUE
      WHERE u.last_seen > NOW() - INTERVAL '5 minutes'
      ORDER BY u.email
    `)
    return result.rows
  } finally {
    connection.release()
  }
}

export default pool
