import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"

export default class extends Controller {
  static values = {
    deviceId: String
  }

  initialize() {
    this.subscription = null
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

    this.subscription = this.consumer.subscriptions.create(
      {
        channel: "EventsChannel",
      },
      {
        received(data) {
          console.log(`[Device ${this.deviceIdValue}] Received data: ${data}`)
        }
      }
    )
  }

  disconnectFromWebSocket(event) {
    event?.preventDefault()
    console.log(`[Device ${this.deviceIdValue}] Disconnecting from WebSocket...`)

    this.subscription?.unsubscribe()
    this.consumer.connection.close({ allowReconnect: false })
    this.subscription = null
  }

  abruptlyDisconnectToWebSocket(event) {
    event?.preventDefault()
    console.log(`[Device ${this.deviceIdValue}] Abruptly disconnecting from WebSocket...`)

    this.consumer.connection.uninstallEventHandlers()
    this.sockets ||= []
    const webSocket = this.consumer.connection.webSocket
    this.sockets.push(webSocket)

    webSocket.onmessage = () => { console.log(`[Device ${this.deviceIdValue}] Message received on dead WebSocket`) }

    this.consumer.connection.webSocket = null

    console.log(`[Device ${this.deviceIdValue}] WebSocket`, this.consumer.connection.webSocket)
  }
}
