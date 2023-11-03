import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"

export default class extends Controller {
  static values = {
    deviceId: String
  }

  static targets = [ "disconnectButton", "connectionCounter" ]

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
  }

  disconnectFromWebSocket(event) {
    event?.preventDefault()
    console.log(`[Device ${this.deviceIdValue}] Disconnecting from WebSocket...`)

    const subscription = this.subscriptions.pop()

    subscription?.unsubscribe()

    if (this.subscriptions.length === 0) {
      this.consumer.connection.close({ allowReconnect: false })
    }

    this.updateConnectionCounter()
  }

  updateConnectionCounter() {
    if (!this.hasConnectionCounterTarget) return

    this.connectionCounterTarget.innerText = this.subscriptions.length
  }

  monkeyPatchConsumer() {
    console.log("🩹 MonkeyPatching the ActionCable consumer to respond to PINGs with PONGs")

    const originalMessageHandler = this.consumer.connection.events.message

    this.consumer.connection.events.message = function(event) {
      console.log("🩹 Invoked patched ActionCable.Connection.events.message")

      const {type, message} = JSON.parse(event.data)
      console.log(`🩹 Received message of type ${type}`)
      switch (type) {
        case "ping":
          console.log("🩹 Received server-side PING")
          console.log("🩹 Sending back PONG")
          this.send({ type: "pong", message: message })
          console.log("🩹 Logging received PING")
          return this.monitor.recordPing()
        default:
          console.log("🩹 Unpatched message. Passing it through to original handler...")
          originalMessageHandler.apply(this, [event])
      }
    }
  }
}
