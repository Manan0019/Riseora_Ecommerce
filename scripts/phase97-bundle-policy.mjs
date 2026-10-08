/** Static public build safety: evidence of server secrets inside frontend output is a blocker. */
export function evaluateBundleFiles(files){
 const findings=[];
 for(const f of files){
  const name=f.path.replaceAll('\\','/');
  if(/(?:^|\/)\.env(?:\.|$)|\.pem$|\.key$|\.dump$|\.sqlite$/i.test(name))findings.push({code:'PRIVATE_ARTIFACT_IN_PUBLIC_BUILD',file:name,status:'BLOCK'});
  if(/\.map$/i.test(name))findings.push({code:'SOURCE_MAP_REVIEW',file:name,status:'REVIEW'});
  if(/\.(?:js|css|html|json|txt)$/i.test(name)){
   const text=String(f.content||'');
   if(/postgres(?:ql)?:\/\/[^\s"'<>]{6,}/i.test(text))findings.push({code:'DATABASE_URL_IN_BUNDLE',file:name,status:'BLOCK'});
   if(/(?:JWT_SECRET|RAZORPAY_KEY_SECRET|DATABASE_URL|SMTP_PASSWORD|SESSION_SECRET)\s*[:=]\s*["'][^"']{4,}/i.test(text))findings.push({code:'SERVER_SECRET_ASSIGNMENT_IN_BUNDLE',file:name,status:'BLOCK'});
  }
 }
 return {decision:findings.some(x=>x.status==='BLOCK')?'NO_GO':findings.length?'REVIEW':'GO',findings,filesScanned:files.length};
}
