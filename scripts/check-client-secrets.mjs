import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
loadEnvFile('.env.local');
if(existsSync('.env.server.local'))loadEnvFile('.env.server.local');
const secrets=Object.entries(process.env).filter(([name,value])=>!name.startsWith('NEXT_PUBLIC_')&&/(SECRET|PASSWORD|PRIVATE_KEY|SMTP|ACCESS_TOKEN|SERVICE_ROLE)/i.test(name)&&value&&value.length>=12).map(([,value])=>value);
for(const name of Object.keys(process.env))if(name.startsWith('NEXT_PUBLIC_')&&/(SECRET|PASSWORD|SERVICE_ROLE|SMTP|PRIVATE_KEY|ACCESS_TOKEN)/i.test(name)&&process.env[name])throw new Error(`Privileged environment variable incorrectly exposed: ${name}`);
let files=0;
function walk(path){for(const name of readdirSync(path)){const full=`${path}/${name}`;if(statSync(full).isDirectory())walk(full);else{files++;const content=readFileSync(full,'utf8');if(secrets.some(secret=>content.includes(secret)))throw new Error(`Server secret found in browser artifact: ${full}`);}}}
walk('.next/static');
console.log(`Verified ${files} browser artifacts: no server secret present.`);
