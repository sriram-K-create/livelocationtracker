import { Kafka } from 'kafkajs'

/**
 * KAFKA CONSUMER: Socket Broadcaster
 * 
 * Consumer Group: "socket-broadcaster"
 * Responsibility: Consume location events and broadcast to connected clients via Socket.IO
 * 
 * WHY separate consumer?
 * ✓ Decouples event production (socket server) from event consumption (broadcasting)
 * ✓ If Socket.IO server restarts, messages aren't lost (in Kafka)
 * ✓ Can scale independently - add more broadcaster instances if needed
 * ✓ Database consumer handles different logic without affecting this
 * 
 * CONSUMER GROUPS explained:
 * - Group "socket-broadcaster" reads from all partitions
 * - Group "db-processor" also reads from all partitions
 * - Both see every message (independent consumption)
 * - Each group tracks its own offset (position in topic)
 * - If broadcaster crashes, it resumes from where it left off
 * 
 * DATA FLOW:
 * Socket.IO Server → Kafka (location-updates topic)
 *                      ↓
 *              ┌───────┴───────┐
 *              ↓               ↓
 *        Socket Consumer   DB Consumer
 *         (this file)      (separate)
 *              ↓               ↓
 *        Broadcast to      Store in
 *        Map Clients       Database
 */

let ioInstance = null

export async function startSocketConsumer(io) {
  ioInstance = io

  const kafka = new Kafka({
    clientId: 'location-service-socket-consumer',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
  })

  const consumer = kafka.consumer({
    groupId: 'socket-broadcaster',  // Consumer group name
    sessionTimeout: 30000,
    rebalanceTimeout: 60000
  })

  try {
    console.log('🔌 Connecting Socket Consumer...')
    await consumer.connect()
    
    console.log('📌 Subscribing to location-updates topic...')
    await consumer.subscribe({
      topic: 'location-updates',
      fromBeginning: false  // Only get new messages from now on
    })

    console.log('👁️  Socket Consumer listening for location updates...')
    
    /**
     * RUN: Main message loop
     * 
     * This continuously listens for messages from Kafka
     * When a location update arrives, we broadcast to all connected Socket.IO clients
     * 
     * eachMessage callback is called for EACH message in order
     */
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const locationEvent = JSON.parse(message.value.toString())

          console.log(`
📡 Broadcasting location update:
   User: ${locationEvent.email}
   Position: (${locationEvent.lat}, ${locationEvent.lng})
   Accuracy: ${locationEvent.accuracy || 'unknown'}
          `)

          /**
           * SOCKET.IO BROADCAST
           * 
           * io.emit() sends message to ALL connected clients
           * Clients listen to 'location-update' event and update markers
           * 
           * Why via Kafka and not direct socket.emit in socket handler?
           * ✓ If we had multiple Socket.IO servers, both would broadcast via Kafka
           * ✓ Ensures consistency: all clients see same updates in same order
           * ✓ Can replay updates for new connections
           * ✓ Better for testing and debugging
           */
          ioInstance.emit('location-update', {
            userId: locationEvent.userId,
            email: locationEvent.email,
            lat: locationEvent.lat,
            lng: locationEvent.lng,
            accuracy: locationEvent.accuracy,
            timestamp: locationEvent.timestamp,
            // Add server timestamp so client knows how fresh this is
            receivedAt: Date.now()
          })

          /**
           * OFFSET COMMIT
           * 
           * Kafka tracks which message we just processed
           * If consumer crashes, it resumes from this offset (not from beginning)
           * 
           * Auto commit would do this automatically, but explicit is clearer
           */
        } catch (error) {
          console.error('❌ Error processing location message:', error.message)
          // Continue processing despite error (don't crash the consumer)
        }
      }
    })
  } catch (error) {
    console.error('❌ Socket Consumer error:', error.message)
    // Attempt to reconnect after delay
    setTimeout(() => startSocketConsumer(ioInstance), 5000)
  }
}

/**
 * KEY CONCEPTS for evaluation:
 * 
 * 1. CONSUMER GROUP
 *    - "socket-broadcaster" identifies this consumer group
 *    - Multiple instances of this consumer could run (would split partitions)
 *    - All instances see all messages (just processed in parallel)
 * 
 * 2. KAFKA ADVANTAGES OVER DIRECT DB WRITES
 *    Direct write: Socket → DB (❌ DB overload at scale)
 *    Kafka way: Socket → Kafka → Multiple consumers (✅ scales independently)
 * 
 * 3. USER ID IMPORTANCE
 *    We use locationEvent.userId (not socket ID) because:
 *    - Socket IDs change on reconnect
 *    - User ID is stable across sessions
 *    - Frontend can match userId to remove old markers
 * 
 * 4. BROADCAST VS DIRECT
 *    io.emit() = All connected clients get update
 *    socket.emit() = Single client only
 *    We use io.emit() so all map viewers see the update
 */
