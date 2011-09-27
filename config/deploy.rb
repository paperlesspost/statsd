require 'erb'

default_run_options[:pty] = true

set :application, "statsd"
set :deploy_to, '/var/daemons/statsd'
set :deploy_via, :remote_cache
set :scm, :git
set :repository,  "git://github.com/paperlesspost/statsd.git"
set :user, "paperless"
set :use_sudo, false
set :normalize_asset_timestamps, false

namespace :statsd do
  task :install_modules do
    run "cd #{shared_path} && npm install service"
    run "rm -rf #{current_path}/node_modules && ln -nfs #{shared_path}/node_modules #{current_path}/node_modules"
  end

  task :write_config do
    put ERB.new(File.read("config.js.erb")).result(binding), "#{release_path}/config.js", :via => :scp
  end
end

task :production do
  role :app, 'statsd01.pp.local', :primary => true

  set :graphite_port, 2003
  set :graphite_host, '10.0.0.242'
  set :statsd_port, 8125
  set :lock_file, lambda { "#{shared_path}/pids/statsd.pid" }
  set :log_file, lambda { "#{shared_path}/log/statsd.log" }
  set :flush_interval, 10000
end

task :staging do
  role :app, '10.0.0.172', :primary => true

  set :graphite_port, 2003
  set :graphite_host, '10.0.0.242'
  set :statsd_port, 8125
  set :lock_file, lambda { "#{shared_path}/pids/statsd.pid" }
  set :log_file, lambda { "#{shared_path}/log/statsd.log" }
  set :flush_interval, 10000
end

namespace :deploy do
 [:start, :stop, :restart].each do |command|
   task command, :roles => :app, :except => { :no_release => true } do
     run "cd #{current_path} && ./stats.js ./config.js' #{command}"
   end
  end
end

after "deploy:update_code", "statsd:write_config"
after "deploy:symlink", "statsd:install_modules"
