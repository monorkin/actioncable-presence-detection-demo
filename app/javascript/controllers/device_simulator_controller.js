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
    this.disconnectFromWebSocket()
  }

  initializeConsumer() {
    const url = new URL(window.location.href)
    url.pathname = "/cable"
    url.scheme = "ws"
    const deviceId = url.searchParams.set("device_id", this.deviceIdValue)

    this.consumer = createConsumer(url)
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
}
