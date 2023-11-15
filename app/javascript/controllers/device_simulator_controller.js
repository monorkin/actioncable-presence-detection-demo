import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"
import installClientSideHeartbeatMonkeyPath from "monkey_patches/action_cable/client_initiated_heartbeats"
import installHeartbeatWithPongMonkeyPath from "monkey_patches/action_cable/heartbeat_with_pong"

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
    // installClientSideHeartbeatMonkeyPath(this.consumer)
    // installHeartbeatWithPongMonkeyPath(this.consumer)
  }
}
