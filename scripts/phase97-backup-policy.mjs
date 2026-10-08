import crypto from 'node:crypto';
/** Byte signature and checksum are archive checks, not evidence of successful database restore. */
export function inspectBackupBuffer(buffer,{expectedSha256='',minimumBytes=8192}={}){
 const validSignature=buffer.length>=5&&buffer.subarray(0,5).toString('ascii')==='PGDMP';
 const sha256=crypto.createHash('sha256').update(buffer).digest('hex');
 const findings=[];
 if(!validSignature)findings.push('NOT_POSTGRES_CUSTOM_ARCHIVE');
 if(buffer.length<minimumBytes)findings.push('ARCHIVE_TOO_SMALL');
 if(expectedSha256&&expectedSha256.toLowerCase()!==sha256)findings.push('SHA256_MISMATCH');
 return {decision:findings.length?'NO_GO':'ARCHIVE_ONLY_PASS',sizeBytes:buffer.length,sha256,findings,restoreProven:false};
}
