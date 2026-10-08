/** Bounded, GET-only availability measurements. Never generate traffic at load-test scale. */
export const LATENCY_POLICY=Object.freeze({maxRequests:60,minRequests:3,maxIntervalMs:60000,minIntervalMs:200,maxP95Ms:2500,maxFailurePercent:5});
export function summarizeMeasurements(samples,{maxP95Ms=LATENCY_POLICY.maxP95Ms}={}){
 const durations=samples.filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
 const failures=samples.length-durations.length;
 const p95=durations.length?durations[Math.ceil(durations.length*0.95)-1]:null;
 const percent=samples.length?100*failures/samples.length:100;
 return {requests:samples.length,successes:durations.length,failures,failurePercent:Number(percent.toFixed(2)),p95Ms:p95,decision:samples.length<3||!durations.length||percent>LATENCY_POLICY.maxFailurePercent||(p95!==null&&p95>maxP95Ms)?'NO_GO':'GO'};
}
