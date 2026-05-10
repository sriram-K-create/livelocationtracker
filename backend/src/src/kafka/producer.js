import { Kafka } from 'kafkajs'

/**
 * KAFKA PRODUCER
 * 
 * Responsibility: Publish location events to Kafka
 * 
 * Why this design?
 * ✓ Decouples socket server from database writes
 * ✓ Location updates go to Kafka first (fast, non-blocking)
 * ✓ Multiple consumers can process events independently
 * ✓ Can handle thousands of location updates per second
 * 
 * KEY CONCEPT: Partitioning by userId
 * - Same user's location updates go to same partition
 * - Guarantees ordering for individual users
 * - Prevents location from jumping backwards
 */

class KafkaProducer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'location-service-producer',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      connectionTimeout: 10000,
      requestTimeout: 30000,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        multiplier: 2
      }
    })

    // Create producer instance
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: true  // Exactly-once semantics
    })

    // Track connection state
    this.connected = false
    this.init()
  }

  async init() {
    try {
      await this.producer.connect()
      this.connected = true
      console.log('✅ Kafka Producer connected')
    } catch (error) {
      console.error('❌ Failed to connect Kafka Producer:', error.message)
      // Retry connection after 5 seconds
      setTimeout(() => this.init(), 5000)
    }
  }

  /**
   * Send a location event to Kafka
   * 
   * @param {string} topic - Kafka topic name (e.g., 'location-updates')
   * @param {object} message - Location data { userId, lat, lng, timestamp, ... }
   * 
   * IMPORTANT: message.userId is used as the KEY
   * This ensures all updates from same user go to same partition
   * Partition 0: User A updates
   * Partition 1: User B updates
   * Partition 2: User C updates
   * This ordering is critical for location history!
   */
  async send(topic, message) {
    if (!this.connected) {
      console.warn('⚠️  Kafka not connected yet, queuing message')
      return
    }

    try {
      const result = await this.producer.send({
        topic,
        messages: [
          {
            key: message.userId,  // Partition by user ID
            value: JSON.stringify(message),
            timestamp: message.serverTimestamp.toString(),
            headers: {
              'source': 'socket-server',
              'version': '1'
            }
          }
        ],
        timeout: 30000,
        compression: 1  // Gzip compression for network efficiency
      })

      console.log(`📤 Published to Kafka: ${topic} [user: ${message.userId}]`)
      return result
    } catch (error) {
      console.error(`❌ Kafka producer error: ${error.message}`)
      throw error
    }
  }

  async disconnect() {
    try {
      await this.producer.disconnect()
      this.connected = false
      console.log('✅ Kafka Producer disconnected')
    } catch (error) {
      console.error('Error disconnecting producer:', error)
    }
  }
}

export default KafkaProducer
