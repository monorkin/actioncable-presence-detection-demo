class EventsChannel < ApplicationCable::Channel
  def subscribed
    device.came_online
  end

  def unsubscribed
   device.went_offline
  end
end
