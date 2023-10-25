class CreateDeviceOnlineStatusChanges < ActiveRecord::Migration[7.1]
  def change
    create_table :device_online_status_changes do |t|
      t.belongs_to :device, null: false, foreign_key: true
      t.integer :status

      t.timestamps
    end
  end
end
