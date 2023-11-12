import { INTERNAL, adapters } from "@rails/actioncable"

export default function install(consumer) {
  console.log("🩹 MonkeyPatching the ActionCable consumer to add client-initiated heartbeats")

  const now = () => new Date().getTime()
  const indexOf = [].indexOf
  const supportedProtocols = ["actioncable-v1.1-json", "actioncable-v1-json", "actioncable-unsupported"]

  // Monkey patch Connection
  const newConnectionOpen = function() {
    console.log("🩹 Invoked monkey patched Connection#open")

    if (this.isActive()) {
      console.log(`Attempted to open WebSocket, but existing socket is ${this.getState()}`)
      return false
    } else {
      console.log("🩹 Sending consumer sub-protocols first")
      const socketProtocols = [...supportedProtocols]

      console.log(`1 Opening WebSocket, current state is ${this.getState()}, subprotocols: ${socketProtocols}`)
      if (this.webSocket) { this.uninstallEventHandlers() }
      this.webSocket = new adapters.WebSocket(consumer.url, socketProtocols)
      console.log(`2 Opening WebSocket, current state is ${this.getState()}, subprotocols: ${socketProtocols}`)
      this.installEventHandlers()
      this.monitor.start()
      return true
    }
  }

  consumer.connection.open = newConnectionOpen.bind(consumer.connection)

  const newIsProtocolSupported = function() {
    return indexOf.call(supportedProtocols, this.getProtocol()) >= 0
  }

  consumer.connection.isProtocolSupported = newIsProtocolSupported.bind(consumer.connection)

  const originalMessageEvent = consumer.connection.events.message
  const newMessageEvent = function(event) {
    if (!this.isProtocolSupported()) { return }
    const message = JSON.parse(event.data)
    if (message.type === "pong") {
      console.log("🩹 Received heartbeat pong")
      if (message.timestamp) {
        this.monitor.latency = Date.now() - message.timestamp
      }
      return this.monitor.recordPing()
    }
    else {
      originalMessageEvent.apply(this, [event])
    }
  }
  consumer.connection.events.message = newMessageEvent.bind(consumer.connection)

  // Monkey patch ConnectionMonitor
  consumer.connection.monitor.hearbeatInterval = 2

  const shouldInitiateHeartbeat = function() {
    console.log(`🩹 Checkign if protocol '${this.connection?.getProtocol()}' is supported`)
    return this.connection?.getProtocol() === "actioncable-v1.1-json"
  }
  consumer.connection.monitor.shouldInitiateHeartbeat = shouldInitiateHeartbeat.bind(consumer.connection.monitor)

  const beat = function() {
    this.beatTimeout = setTimeout(() => {
      if (this.shouldInitiateHeartbeat()) {
        console.log("🩹 Sending heartbeat")
        this.connection.send({ type: "ping", timestamp: Date.now() })
      }
      else {
        console.log("🩹 Skipping heartbeat because protocol is not supported")
      }
      this.beat()
    }
    , this.hearbeatInterval * 1000)
  }
  consumer.connection.monitor.beat = beat.bind(consumer.connection.monitor)

  const startBeating = function() {
    console.log("🩹 Invoked monkey patched ConnectionMonitor#startBeating")
    this.stopBeating()
    this.beat()
  }
  consumer.connection.monitor.startBeating = startBeating.bind(consumer.connection.monitor)

  const stopBeating = function() {
    console.log("🩹 Invoked monkey patched ConnectionMonitor#stopBeating")
    if (this.beatTimeout) clearTimeout(this.beatTimeout)
  }
  consumer.connection.monitor.stopBeating = stopBeating.bind(consumer.connection.monitor)

  const start = function() {
    if (!this.isRunning()) {
      this.startedAt = now()
      delete this.stoppedAt
      this.startPolling()
      this.startBeating()
      addEventListener("visibilitychange", this.visibilityDidChange)
      console.log(`ConnectionMonitor started. stale threshold = ${this.constructor.staleThreshold} s`)
    }
  }
  consumer.connection.monitor.start = start.bind(consumer.connection.monitor)

  const stop = function() {
    if (this.isRunning()) {
      this.stoppedAt = now()
      this.stopPolling()
      this.stopBeating()
      removeEventListener("visibilitychange", this.visibilityDidChange)
      console.log("ConnectionMonitor stopped")
    }
  }
  consumer.connection.monitor.stop = stop.bind(consumer.connection.monitor)
}
