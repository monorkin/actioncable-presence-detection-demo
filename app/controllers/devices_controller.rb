class DevicesController < ApplicationController
  before_action :set_device, only: %i[ show ]

  def index
    @devices = scope.order(name: :asc)
  end

  def show
  end

  private

    def set_device
      @device = scope.find(params[:id])
    end

    def scope
      Device.all
    end
end
