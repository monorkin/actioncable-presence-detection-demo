require "action_cable"

module MonkeyPatches
  module ActionCable
    module ClientSideHeartbeat
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
          return super unless expects_client_side_heartbeat?

          logger.debug "🩹 Invoked client-side beat handler"

          if @last_heartbeat_at.nil?
            if @started_at.before?(dead_connection_treshold.ago)
              logger.debug "🩹 Heartbeat PING never received. Closing connection (#{connection_identifier}) due to client-side heartbeat timeout"
              subscriptions.unsubscribe_from_all
              close(reason: ::ActionCable::INTERNAL[:disconnect_reasons][:heartbeat_timeout])
              server.remove_connection(self)
            else
              logger.debug "🩹 Connection just opened, no hearbeat received yet"
            end
          else
            if @last_heartbeat_at.before?(dead_connection_treshold.ago)
              logger.debug "🩹 Heartbeat PING received too long ago. Closing connection (#{connection_identifier}) due to client-side heartbeat timeout"
              subscriptions.unsubscribe_from_all
              close(reason: ::ActionCable::INTERNAL[:disconnect_reasons][:heartbeat_timeout])
              server.remove_connection(self)
            else
              logger.debug "🩹 Heartbeat PING received recently"
            end
          end
        rescue Exception => e
          rescue_with_handler(e)
          logger.error "Beat error [#{e.class} - #{e.message}]: #{e.backtrace.first(5).join(" | ")}"
        end

        def register_heartbeat(data)
          logger.debug "🩹 Invoked ActionCable::Connection::Base#register_heartbeat!"

          @last_heartbeat_at = Time.now
          logger.debug "🩹 Received client hearbeat message at #{@last_heartbeat_at}"

          transmit(type: ::ActionCable::INTERNAL[:message_types][:pong], timestamp: data["timestamp"])
        rescue Exception => e
          rescue_with_handler(e)
          logger.error "register_heartbeat error [#{e.class} - #{e.message}]: #{e.backtrace.first(5).join(" | ")}"
        end

        # Checks if the connection is expecting PONG messages from the client
        def expects_client_side_heartbeat?
          protocol&.start_with?("actioncable-v1.1")
        end

        def dead_connection_treshold
          ::ActionCable::Server::Connections::BEAT_INTERVAL.seconds * 2
        end
      end

      module SubscriptionsExtensions
        # Patched to process incoming PONG messages from the client.
        def execute_command(data)
          logger.debug "🩹 Invoked patched ActionCable::Connection::Subscriptions#execute_command"

          if data["type"] == ::ActionCable::INTERNAL[:message_types][:ping]
            logger.debug "🩹 Received client PING message"
            return @connection.register_heartbeat(data)
          end

          logger.info "🩹 Invoked standard execute_command handler"
          logger.info "🩹 data: #{data.inspect}"
          super(data)
        rescue Exception => e
          @connection.rescue_with_handler(e)
          logger.error "Could not execute command from (#{data.inspect}) [#{e.class} - #{e.message}]: #{e.backtrace.first(5).join(" | ")}"
        end
      end
    end
  end
end
