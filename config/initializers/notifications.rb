ActiveSupport::Notifications.subscribe("connection.latency") do |name, start, finish, id, payload|
  Rails.logger.info "[LATENCY] [#{payload[:identifiers].map { |key, record| "#{key}:#{record.class}-#{record.id}" }.join(";")}] #{payload[:value].round(6)}ms"
end

