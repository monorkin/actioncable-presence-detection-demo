module DeviceHelper
  def device_online_status_indicator(device, **options)
    prefix = [options[:prefix], :online_status_indicator].compact.join("_")

    content_tag(:div, id: dom_id(device, prefix), class: "relative inline-block w-5 h-5") do
      if device.online?
        content_tag(:div, "", class: "bg-green-500 rounded-full absolute inset-1 z-20") +
        content_tag(:div, "", class: "bg-green-500 rounded-full absolute inset-1 z-10 animate-ping")
      else
        content_tag(:div, "", class: "bg-red-500 rounded-full absolute inset-1 z-20")
      end
    end
  end
end
