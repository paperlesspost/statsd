require 'erb'

default_run_options[:pty] = true

set :application, "statsd"
set :deploy_to, '/var/daemons/statsd'
set :scm, :git
set :repository,  "git://github.com/paperlesspost/statsd.git"
set :user, "paperless"
set :use_sudo, false
set :normalize_asset_timestamps, false

namespace :statsd do
  task :write_config do
    put ERB.new(File.read("config.js.erb")).result(binding), "#{release_path}/config.js", :via => :scp
  end
end

task :staging do
  role :app, '10.0.0.172', :primary => true

  set :graphite_port, 2003
  set :graphite_host, 'graphite01-staging'
  set :statsd_port, 8125
  set :lock_file, '/var/run/statsd.pid'
  set :log_file, '/var/log/statsd.log'
  set :flush_interval, 10000
end

namespace :deploy do
 task :start do
   run "#{current_path}/stats.js '#{current_path}/config.js' \"$@\""
 end
 task :stop do
   run "if [ -e #{lock_file}]; then kill `cat #{lock_file}`; fi;"
 end
 task :restart, :roles => :app, :except => { :no_release => true } do
   stop
   start
 end
end

after "deploy:update_code", "statsd:write_config"
