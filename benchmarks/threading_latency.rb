# This tests how slow Ruby gets as the number of threads increases.

sleep_duration = 1
connection_counts = [1, 10, 100, 1000, 10_000]
test_runs = 10

def human_readable_time(seconds)
  if seconds < 0.000000001
    "#{(seconds * 1_000_000_000).round(2)} nanoseconds"
  elsif seconds < 0.000001
    "#{(seconds * 1_000_000).round(2)} microseconds"
  elsif seconds < 0.001
    "#{(seconds * 1_000).round(2)} milliseconds"
  elsif seconds < 1
    "#{(seconds * 1000).round(2)} seconds"
  else
    "#{seconds.round(2)} seconds"
  end
end


runs = test_runs.times.map do |i|
  results = connection_counts.map do |connections_count|
    latencies = connections_count.times.map do |i|
      Thread.new do
        started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        sleep(sleep_duration)
        finished_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)

        finished_at - started_at
      end
    end.map(&:value).sort

    puts "Test run: #{i + 1}"
    puts "Connections: #{connections_count}"
    puts "Average: #{latencies.sum / connections_count} seconds"
    puts "Best: #{latencies.first} seconds"
    puts "Worst: #{latencies.last} seconds"
    puts

    {
      connections_count: connections_count,
      average: latencies.sum / connections_count,
      best: latencies.first,
      worst: latencies.last,
      overhead: latencies.last - sleep_duration
    }
  end

  best = results.min_by { |result| result[:overhead] }
  worst = results.max_by { |result| result[:overhead] }
  average = results.sum { |result| result[:overhead] } / results.size
  nintyninth_percentile = results.sort_by { |result| result[:overhead] }[results.size * 0.99][:overhead]
  nintyfifth_percentile = results.sort_by { |result| result[:overhead] }[results.size * 0.95][:overhead]

  puts "Test run: #{i + 1}"
  puts "Best: #{best[:connections_count]} connections with #{human_readable_time best[:overhead]}"
  puts "Worst: #{worst[:connections_count]} connections with #{human_readable_time worst[:overhead]}"
  puts "Average: #{human_readable_time average}"
  puts "99th percentile: #{human_readable_time nintyninth_percentile}"
  puts "95th percentile: #{human_readable_time nintyfifth_percentile}"
  puts

  {
    best: best,
    worst: worst,
    average: average,
    nintyninth_percentile: nintyninth_percentile,
    nintyfifth_percentile: nintyfifth_percentile
  }
end

best = runs.min_by { |run| run[:best][:overhead] }
worst = runs.max_by { |run| run[:worst][:overhead] }
average = runs.sum { |run| run[:average] } / runs.size
nintyninth_percentile = runs.sort_by { |run| run[:nintyninth_percentile] }[runs.size * 0.99][:nintyninth_percentile]
nintyfifth_percentile = runs.sort_by { |run| run[:nintyfifth_percentile] }[runs.size * 0.95][:nintyfifth_percentile]

puts "Best: #{best[:best][:connections_count]} connections with #{human_readable_time best[:best][:overhead]}"
puts "Worst: #{worst[:worst][:connections_count]} connections with #{human_readable_time worst[:worst][:overhead]}"
puts "Average: #{human_readable_time average}"
puts "99th percentile: #{human_readable_time nintyninth_percentile}"
puts "95th percentile: #{human_readable_time nintyfifth_percentile}"
puts
