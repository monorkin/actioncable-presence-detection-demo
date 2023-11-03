require "action_cable"

# Don't use this in production!
# This implementation is intentionally very naive, it's designed as a proof of
# concept. As is, it has a race condition whereby a client can donnect and
# disconnect before it receives it's first PING or responds with it's first
# PONG. When that happens the server will assume that the client is connected
# but doesn't support PONG responses.
module MonkeyPatches
  module ActionCable
    module HeartbeatWithPong
      class << self
        def install!
          Rails.logger.debug "Installing ActionCable client-side hearbeat moneky patch"

          ::ActionCable::INTERNAL[:message_types][:pong] = "pong"
          ::ActionCable::INTERNAL[:disconnect_reasons][:heartbeat_timeout] = "heartbeat_timeout"

          ::ActionCable::Connection::Base.prepend(ConnectionExtensions)
          ::ActionCable::Connection::Subscriptions.prepend(SubscriptionsExtensions)
        end
      end

      module ConnectionExtensions
        # Patched to check if the client responded with a PONG message to the
        # server's hearbeat PING.
        #
        # If the client did not respond with a PONG message, the connection
        # continues to send heartbeat PINGs to the client as is normal
        # ActionCable behaviour.
        #
        # If the client did respond with a PONG message, the connection checks
        # if the PONG message was received recently. If it was, the connection
        # continues to send heartbeat PINGs to the client as is normal. If it
        # was not, the connection is closed as the client it not responding and
        # therefore considered to be disconnected.
        def beat
          logger.debug "🩹 Invoked patched ActionCable::Connection::Base#beat"

          if expects_pong_message?
            logger.debug "🩹 Invoked client-side beat handler"

            logger.debug "🩹 Checkign if #{last_pong_at} is before #{dead_connection_treshold.ago} (#{connection_identifier})"
            if last_pong_at.before?(dead_connection_treshold.ago)
              logger.debug "🩹 PONG received too long ago. Closing connection (#{connection_identifier}) due to client-side heartbeat timeout"
              subscriptions.unsubscribe_from_all
              close(reason: ::ActionCable::INTERNAL[:disconnect_reasons][:heartbeat_timeout])
            else
              logger.debug "🩹 PONG received recently. Sending heartbeat to client"
              super
            end
          else
            logger.debug "🩹 Invoked standard beat handler"
            super
          end
        end

        # Processes incoming PONG messages from the client
        # When a PONG is recieved:
        # 1. The connection logs when it received the message
        # 2. The connection marks itself as expecting PONG messages from now on
        def register_client_pong!(data)
          logger.debug "🩹 Invoked ActionCable::Connection::Base#register_client_pong!"

          @last_pong_at = Time.now
          expect_pong_message!
        end

        # Marks the connection as expecting PONg messages from the client
        def expect_pong_message!
          @expect_pong_message = true
        end

        # Checks if the connection is expecting PONG messages from the client
        def expects_pong_message?
          !!@expect_pong_message
        end

        # Returns the time when the connection last received a PONG message from
        def last_pong_at
          @last_pong_at
        end

        # Returns the time after which a connection is considered to be dead
        def dead_connection_treshold
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
        end
      end
    end
  end
end
