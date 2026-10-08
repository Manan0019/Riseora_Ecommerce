import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),v=k=>args.find(x=>x.startsWith(`--${k}=`))?.slice(k.length+3);
const input=v('file');if(!input||!fs.existsSync(input)||!fs.statSync(input).isFile()){console.error('NO_GO  Provide an existing PostgreSQL custom-format backup via --file=...');process.exit(2);}
const fd=fs.openSync(input,'r'),header=Buffer.alloc(5);try{fs.readSync(fd,header,0,5,0);}finally{fs.closeSync(fd);}
let bad=header.toString('ascii')!=='PGDMP';const stat=fs.statSync(input);if(stat.size<8192)bad=true;
const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(input,{highWaterMark:1_048_576}))hash.update(chunk);
const checksum=hash.digest('hex');if(v('sha256') && v('sha256').toLowerCase()!==checksum)bad=true;
console.log(`Phase 97 backup archive: ${bad?'NO_GO':'ARCHIVE_ONLY_PASS'}, ${stat.size} bytes, SHA256 ${checksum}`);
if(bad)process.exitCode=1;
else if(v('pg-restore')){
 const proc=spawnSync(v('pg-restore'),['--list',input],{encoding:'utf8',timeout:30000,windowsHide:true,shell:false});
 if(proc.error||proc.status!==0){console.error('NO_GO  pg_restore could not list archive');process.exitCode=1;}
 else console.log('PASS  pg_restore --list succeeded (archive readable; no actual restoration performed)');
}
console.log('RESTORE_DRILL_REQUIRED  An isolated restore and data reconciliation must still be completed and signed off.');
