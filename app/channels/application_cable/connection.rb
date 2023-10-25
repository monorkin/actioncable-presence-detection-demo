module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :device

    def connect
      if request.params[:device_id].present?
        self.device = Device.find(request.params[:device_id])
      end
    end
  end
end
