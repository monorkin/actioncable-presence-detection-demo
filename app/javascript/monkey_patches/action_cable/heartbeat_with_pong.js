import { INTERNAL, adapters } from "@rails/actioncable"

export default function install(consumer) {
  console.log("🩹 MonkeyPatching the ActionCable consumer to respond to PINGs with PONGs")

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

  const originalMessageHandler = consumer.connection.events.message

  consumer.connection.events.message = function(event) {
    console.log("🩹 Invoked patched ActionCable.Connection.events.message")

    const {type, message} = JSON.parse(event.data)
    console.log(`🩹 Received message of type ${type}`)
    switch (type) {
      case "ping":
        console.log("🩹 Received server-side PING")
        console.log(`🩹 Sending back PONG with message: ${message}`)
        this.send({ type: "pong", message: message })
        console.log("🩹 Logging received PING")
        return this.monitor.recordPing()
      default:
        console.log("🩹 Unpatched message. Passing it through to original handler...")
        originalMessageHandler.apply(this, [event])
    }
  }
}
