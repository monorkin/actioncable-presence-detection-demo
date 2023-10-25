class Device < ApplicationRecord
  has_many :online_status_changes, dependent: :destroy

  # Update the online status indicator in the UI when the device is updated.
  after_update_commit do
    broadcast_replace_later_to(
      :events,
      target: "online_status_indicator_device_#{id}",
      partial: "devices/online_status_indicator"
    )
    broadcast_replace_later_to(
      :events,
      target: "header_online_status_indicator_device_#{id}",
      partial: "devices/online_status_indicator",
      locals: { prefix: "header" }
    )
  end

  def came_online
    online_status_changes.create!(status: :online)
  end

  def went_offline
    online_status_changes.create!(status: :offline)
  end

  def online?
    online_status_changes.order(created_at: :desc).first&.to_online?
  end

  def offline?
    !online?
  end
end
