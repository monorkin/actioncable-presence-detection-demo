class Device::OnlineStatusChange < ApplicationRecord
  belongs_to :device, touch: true

  broadcasts :events,
    inserts_by: :prepend,
    target: ->(status_change) { "online_status_changes_device_#{status_change.device_id}" }

  enum :status, { online: 1, offline: 0 }, prefix: :to
end
