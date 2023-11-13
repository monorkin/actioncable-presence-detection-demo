require "action_cable"

module MonkeyPatches
  module ActionCable
    module HeartbeatWithPong
      class << self
        def install!
          Rails.logger.debug "Installing ActionCable client-side hearbeat moneky patch"

          ::ActionCable::INTERNAL[:message_types][:pong] = "pong"
          ::ActionCable::INTERNAL[:disconnect_reasons][:heartbeat_timeout] = "heartbeat_timeout"
          ::ActionCable::INTERNAL[:protocols] = ::ActionCable::INTERNAL[:protocols].dup.prepend("actioncable-v1.1-json").freeze

          ::ActionCable::Connection::Base.prepend(ConnectionExtensions)
          ::ActionCable::Connection::Subscriptions.prepend(SubscriptionsExtensions)
        end
      end

      module ConnectionExtensions
        def initialize(...)
          super
          @last_message_received_at = @started_at
        end

        def receive(...)
          @last_message_received_at = Time.now
          super
        end

        # Patched to check if the client responded with a PONG message to the
        # server's hearbeat PING.
        #
        # If the client supports PONGs and didn't respond with a PONG message
        # to the server's PING within the expected timeframe, the client is
        # assumed to have disconnected and the connection is closed.
        def beat
          return super unless expects_pong_response_to_heartbeat?

          if connection_half_open?
            logger.debug "🩹 PONG received too long ago. Closing connection (#{connection_identifier}) due to client-side heartbeat timeout"
            subscriptions.unsubscribe_from_all
            close(reason: ::ActionCable::INTERNAL[:disconnect_reasons][:heartbeat_timeout])
            return server.remove_connection(self)
          end

          # Send a PING to the client, but with a more precise timestamp
          logger.debug "🩹 Transmiting new PING message"
          transmit type: ::ActionCable::INTERNAL[:message_types][:ping], message: Time.now.to_f
        rescue Exception => e
          rescue_with_handler(e)
          logger.error "Beat error [#{e.class} - #{e.message}]: #{e.backtrace.first(5).join(" | ")}"
        end

        # Processes incoming PONG messages from the client
        def register_client_pong!(data)
          logger.debug "🩹 Invoked ActionCable::Connection::Base#register_client_pong! data: #{data}"

          latency = Time.now.to_f - data["message"].to_f

          if latency.negative?
            logger.info "🩹 We have a time traveler! Latency: #{latency}ms (#{connection_identifier})"
          else
            logger.info "🩹 Latency: #{latency}ms (#{connection_identifier})"
            ActiveSupport::Notifications.instrument(
              "connection.latency",
              value: latency,
              action: :timing,
              connection_identifier: connection_identifier,
              identifiers: identifiers.map { |id| [id, instance_variable_get("@#{id}")] }.to_h
            )
          end
        rescue Exception => e
          rescue_with_handler(e)
          logger.error "#register_client_pong! error [#{e.class} - #{e.message}]: #{e.backtrace.first(5).join(" | ")}"
        end

        # Checks if the connection is expecting PONG messages from the client in
        # response to a heartbeat PING
        def expects_pong_response_to_heartbeat?
          protocol&.start_with?("actioncable-v1.1-")
        end

        # Returns true if the connection is considered to be half-open
        #
        # A half-open connection means that the client has disconnected
        # without closing the connection, so the server's OS keeps the connection
        # virtually open, buffering any outgoing messages, hoping that the
        # client will continue the connection.
        #
        # To detect a half-open connection we check if the connection was
        # started within, or if last heartbeat PONG response came within, a
        # certain timeframe.
        def connection_half_open?
          @last_message_received_at.before?(half_open_connection_treshold.ago)
        end

        # Returns the time after which a connection is considered to be half-open
        def half_open_connection_treshold
          ::ActionCable::Server::Connections::BEAT_INTERVAL.seconds * 2
        end
      end

      module SubscriptionsExtensions
        # Patched to process incoming PONG messages from the client.
        def execute_command(data)
          logger.debug "🩹 Invoked patched ActionCable::Connection::Subscriptions#execute_command"

          if data["type"] == ::ActionCable::INTERNAL[:message_types][:pong]
            logger.debug "🩹 Received client PONG message"
            return @connection.register_client_pong!(data)
          end

          logger.info "🩹 Invoked standard execute_command handler"
          super(data)
        rescue Exception => e
          @connection.rescue_with_handler(e)
          logger.error "Could not execute command from (#{data.inspect}) [#{e.class} - #{e.message}]: #{e.backtrace.first(5).join(" | ")}"
        end
      end
    end
  end
end
