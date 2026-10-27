const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=process.env.STUDY_DEPLOY_ROOT||path.join(os.homedir(),'study-room');
const runtime=JSON.parse(fs.readFileSync(path.join(root,'shared/runtime.json'),'utf8'));
module.exports={apps:[{name:'study-reservation',cwd:path.join(root,'current'),script:path.join(root,'current/local/server.js'),instances:1,exec_mode:'fork',kill_timeout:10000,autorestart:true,time:true,env:{NODE_ENV:'production',...runtime}}]};
