import { Controller } from "@hotwired/stimulus"
import { createConsumer, INTERNAL, adapters } from "@rails/actioncable"

export default class extends Controller {
  static values = {
    deviceId: String
  }

  static targets = [ "disconnectButton", "connectionCounter", "latencyLabel" ]

  initialize() {
    this.subscriptions = []
  }

  connect() {
    if (!this.hasDeviceIdValue) {
      throw new Error(
        "Missing device id value!"+
        " Add a data-device-simulator-device-id attribute with the device's ID" +
        " to the element where the controller is defined."
      )
    }

    console.log(`Device Simulator for device ${this.deviceIdValue} is active`)

    this.initializeConsumer()
    this.updateConnectionCounter()
  }

  disconnect() {
    for(let i in this.subscriptions) {
      this.disconnectFromWebSocket()
    }

    this.disconnectFromWebSocket()
  }

  initializeConsumer() {
    const url = new URL(window.location.href)
    url.pathname = "/cable"
    url.scheme = "ws"
    const deviceId = url.searchParams.set("device_id", this.deviceIdValue)

    this.consumer = createConsumer(url)
    this.monkeyPatchConsumer()
  }

  connectToWebSocket(event) {
    event?.preventDefault()
    console.log(`[Device ${this.deviceIdValue}] Connecting to WebSocket...`)

    const subscription = this.consumer.subscriptions.create(
      {
        channel: "EventsChannel",
      },
      {
        received(data) {
          console.log(`[Device ${this.deviceIdValue}] Received data: ${data}`)
        }
      }
    )

    this.subscriptions.push(subscription)
    this.updateConnectionCounter()
    this.startLatencyMonitor()
  }

  disconnectFromWebSocket(event) {
    event?.preventDefault()
    console.log(`[Device ${this.deviceIdValue}] Disconnecting from WebSocket...`)

    const subscription = this.subscriptions.pop()

    subscription?.unsubscribe()

    if (this.subscriptions.length === 0) {
      this.consumer.connection.close({ allowReconnect: false })
      this.stopLatencyMonitor()
    }

    this.updateConnectionCounter()
  }

  updateConnectionCounter() {
    if (!this.hasConnectionCounterTarget) return

    this.connectionCounterTarget.innerText = this.subscriptions.length
  }

  startLatencyMonitor() {
    this.stopLatencyMonitor()
    this.latencyMonitorInterval = setInterval(() => {
      const latency = this.consumer.connection.monitor.latency
      if (!latency) return

      console.log(`[Device ${this.deviceIdValue}] Latency is ${latency}ms`)
      if (this.hasLatencyLabelTarget) {
        this.latencyLabelTarget.innerText = `${latency}ms`
      }
    }, 1000)
  }

  stopLatencyMonitor() {
    clearInterval(this.latencyMonitorInterval)
  }

  monkeyPatchConsumer() {
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
        this.webSocket = new adapters.WebSocket(this.consumer.url, socketProtocols)
        console.log(`2 Opening WebSocket, current state is ${this.getState()}, subprotocols: ${socketProtocols}`)
        this.installEventHandlers()
        this.monitor.start()
        return true
      }
    }

    this.consumer.connection.open = newConnectionOpen.bind(this.consumer.connection)

    const newIsProtocolSupported = function() {
      return indexOf.call(supportedProtocols, this.getProtocol()) >= 0
    }

    this.consumer.connection.isProtocolSupported = newIsProtocolSupported.bind(this.consumer.connection)

    const originalMessageEvent = this.consumer.connection.events.message
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
    this.consumer.connection.events.message = newMessageEvent.bind(this.consumer.connection)

    // Monkey patch ConnectionMonitor
    this.consumer.connection.monitor.hearbeatInterval = 2

    const shouldInitiateHeartbeat = function() {
      console.log(`🩹 Checkign if protocol '${this.connection?.getProtocol()}' is supported`)
      return this.connection?.getProtocol() === "actioncable-v1.1-json"
    }
    this.consumer.connection.monitor.shouldInitiateHeartbeat = shouldInitiateHeartbeat.bind(this.consumer.connection.monitor)

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
    this.consumer.connection.monitor.beat = beat.bind(this.consumer.connection.monitor)

    const startBeating = function() {
      console.log("🩹 Invoked monkey patched ConnectionMonitor#startBeating")
      this.stopBeating()
      this.beat()
    }
    this.consumer.connection.monitor.startBeating = startBeating.bind(this.consumer.connection.monitor)

    const stopBeating = function() {
      console.log("🩹 Invoked monkey patched ConnectionMonitor#stopBeating")
      if (this.beatTimeout) clearTimeout(this.beatTimeout)
    }
    this.consumer.connection.monitor.stopBeating = stopBeating.bind(this.consumer.connection.monitor)

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
    this.consumer.connection.monitor.start = start.bind(this.consumer.connection.monitor)

    const stop = function() {
      if (this.isRunning()) {
        this.stoppedAt = now()
        this.stopPolling()
        this.stopBeating()
        removeEventListener("visibilitychange", this.visibilityDidChange)
        console.log("ConnectionMonitor stopped")
      }
    }
    this.consumer.connection.monitor.stop = stop.bind(this.consumer.connection.monitor)
  }
}
