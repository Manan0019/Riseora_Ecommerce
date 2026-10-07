import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";

const emptySpec={sampleQty:1,coaRequired:false,labReportRequired:false,minShelfLifeDays:90};
const defaultChecks=[
  {code:"VISUAL",name:"Visual / packaging",specification:"No visible damage, leakage or contamination",critical:true},
  {code:"LABEL",name:"Label / identity",specification:"SKU, batch and label match purchase evidence",critical:true},
  {code:"PACK",name:"Pack integrity",specification:"Seal and primary packaging intact",critical:true},
];

export default function AdminQualityControlCenter(){
  const [overview,setOverview]=useState(null);
  const [batches,setBatches]=useState([]);
  const [selectedId,setSelectedId]=useState("");
  const [coaNumber,setCoaNumber]=useState("");
  const [coaUrl,setCoaUrl]=useState("");
  const [labReportUrl,setLabReportUrl]=useState("");
  const [spec,setSpec]=useState(emptySpec);
  const [testDrafts,setTestDrafts]=useState([]);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    setError("");
    const [o,b]=await Promise.all([apiFetch("/admin/ops/phase91-quality/overview"),apiFetch("/admin/ops/phase91-quality/pending-batches")]);
    setOverview(o.data);setBatches(b.data||[]);
  }
  useEffect(()=>{load().catch(e=>setError(e.message))},[]);
  const active=useMemo(()=>batches.find(x=>x.id===selectedId)||batches[0]||null,[batches,selectedId]);
  const latest=active?.qualityInspections?.[0]||null;

  useEffect(()=>{
    const s=active?.variant?.qualitySpecification;
    setSpec(s?{sampleQty:s.sampleQty||1,coaRequired:!!s.coaRequired,labReportRequired:!!s.labReportRequired,minShelfLifeDays:s.minShelfLifeDays??90}:emptySpec);
    setCoaNumber(latest?.coaNumber||"");setCoaUrl(latest?.coaUrl||"");setLabReportUrl(latest?.labReportUrl||"");
  },[active?.id,latest?.id]);
  useEffect(()=>{
    setTestDrafts((latest?.tests||[]).map(t=>({code:t.code,name:t.name,critical:!!t.critical,result:t.result||"NOT_TESTED",measuredValue:t.measuredValue||"",unit:t.unit||"",note:t.note||""})));
  },[latest?.id,batches]);

  const refresh=async(msg="")=>{await load();if(msg)setMessage(msg)};
  const saveSpec=async()=>{if(!active)return;setBusy(true);setMessage("");try{await apiFetch(`/admin/ops/phase91-quality/specifications/${active.variantId}`,{method:"PUT",body:{...spec,checks:active.variant?.qualitySpecification?.checks||defaultChecks,notes:"Managed from Phase 91 QA Center"}});await refresh("QA specification saved for this SKU.")}catch(e){setError(e.message)}finally{setBusy(false)}};
  const createInspection=async()=>{if(!active)return;setBusy(true);setMessage("");try{await apiFetch("/admin/ops/phase91-quality/inspections",{method:"POST",body:{batchId:active.id,coaNumber,coaUrl,labReportUrl}});setSelectedId(active.id);await refresh("QA inspection started. Record each test result before release.")}catch(e){setError(e.message)}finally{setBusy(false)}};
  const saveTests=async()=>{if(!latest?.id||!testDrafts.length)return;setBusy(true);setMessage("");try{await apiFetch(`/admin/ops/phase91-quality/inspections/${latest.id}/tests`,{method:"PATCH",body:{tests:testDrafts.map(({code,result,measuredValue,unit,note})=>({code,result,measuredValue,unit,note}))}});await refresh("QA test evidence saved and moved to review.")}catch(e){setError(e.message)}finally{setBusy(false)}};
  const decide=async(disposition)=>{if(!latest?.id)return;setBusy(true);setMessage("");try{await apiFetch(`/admin/ops/phase91-quality/inspections/${latest.id}/decision`,{method:"POST",body:{disposition,severity:disposition==="RELEASE"?"MINOR":"MAJOR",notes:disposition==="RELEASE"?"QA checks passed and batch released":"Quality hold / rejection disposition recorded"}});setSelectedId("");await refresh(disposition==="RELEASE"?"Batch released to sellable inventory.":"Batch remains outside sellable inventory.")}catch(e){setError(e.message)}finally{setBusy(false)}};
  const holdSupplier=async(id)=>{setBusy(true);try{await apiFetch(`/admin/ops/phase91-quality/suppliers/${id}/hold`,{method:"POST",body:{force:false}});await refresh("Supplier placed on quality hold.")}catch(e){setError(e.message)}finally{setBusy(false)}};
  const closeIncident=async(id)=>{setBusy(true);try{await apiFetch(`/admin/ops/phase91-quality/incidents/${id}/close`,{method:"POST"});await refresh("Quality incident closed.")}catch(e){setError(e.message)}finally{setBusy(false)}};
  const setTest=(code,key,value)=>setTestDrafts(rows=>rows.map(r=>r.code===code?{...r,[key]:value}:r));

  const scorecards=overview?.supplierScorecards||[],incidents=overview?.incidents||[];
  return <section className="admin-panel phase91-quality-center">
    <div className="admin-panel-head"><div><p className="eyebrow">PHASE 91 · QUALITY ASSURANCE</p><h2>Batch Release, Supplier Quality & Compliance Center</h2><p>Supplier receipts are physically received on QA hold. Only inspected, compliant batches can become sellable; supplier defects, recalls and receipt issues feed a rolling quality scorecard.</p></div><button className="button button-secondary" onClick={()=>refresh().catch(e=>setError(e.message))}>Refresh</button></div>
    {error&&<p className="alert error">{error}</p>}{message&&<p className="alert success">{message}</p>}
    <div className="phase91-kpis"><article><small>PENDING QA</small><strong>{overview?.pendingBatches||0}</strong><span>Physical but not sellable</span></article><article><small>UNDER REVIEW</small><strong>{overview?.underReview||0}</strong><span>Decision pending</span></article><article className={(overview?.failedBatches||0)>0?"danger":""}><small>FAILED BATCHES</small><strong>{overview?.failedBatches||0}</strong><span>Held / supplier disposition</span></article><article><small>RELEASED BATCHES</small><strong>{overview?.releasedBatches||0}</strong><span>QA cleared</span></article><article className={(overview?.openIncidents||0)>0?"danger":""}><small>QUALITY INCIDENTS</small><strong>{overview?.openIncidents||0}</strong><span>Supplier issues open</span></article></div>

    <div className="phase91-layout"><div><h3>Inbound QA queue</h3>{batches.length===0?<div className="admin-empty"><strong>No batch awaiting QA</strong><p>New supplier GRNs will appear here automatically and stay non-sellable until released.</p></div>:<div className="phase91-queue">{batches.map(b=><button type="button" key={b.id} className={active?.id===b.id?"active":""} onClick={()=>setSelectedId(b.id)}><strong>{b.variant?.product?.name} · {b.variant?.name}</strong><span>{b.batchCode}</span><small>{b.goodsReceiptItem?.goodsReceipt?.purchaseOrder?.supplier?.name||(b.sourceType==="MANUFACTURING"?"Manufacturing output":"Legacy / unknown supplier")} · {b.qualityStatus}</small><b>{b.quantityOnHand} physical · {b.quantityBlocked} blocked</b></button>)}</div>}</div>
      <div>{active?<><h3>QA policy & inspection</h3><div className="phase91-batch-card"><span className={`status-pill status-${String(active.qualityStatus||"").toLowerCase()}`}>{active.qualityStatus}</span><strong>{active.batchCode}</strong><p>{active.variant?.product?.name} · {active.variant?.name}</p><dl><div><dt>Physical</dt><dd>{active.quantityOnHand}</dd></div><div><dt>Blocked</dt><dd>{active.quantityBlocked}</dd></div><div><dt>Expiry</dt><dd>{active.expiryDate?new Date(active.expiryDate).toLocaleDateString():"Not recorded"}</dd></div><div><dt>Source</dt><dd>{active.goodsReceiptItem?.goodsReceipt?.purchaseOrder?.supplier?.name||(active.sourceType==="MANUFACTURING"?`Manufacturing · ${active.sourceReference||"production"}`:"—")}</dd></div></dl></div>
        <div className="phase91-policy"><h4>SKU quality specification</h4><div className="phase91-policy-grid"><label>Sample quantity<input type="number" min="1" max="50" value={spec.sampleQty} onChange={e=>setSpec({...spec,sampleQty:Number(e.target.value)})}/></label><label>Minimum shelf life (days)<input type="number" min="0" max="1095" value={spec.minShelfLifeDays} onChange={e=>setSpec({...spec,minShelfLifeDays:Number(e.target.value)})}/></label><label className="phase91-check"><input type="checkbox" checked={spec.coaRequired} onChange={e=>setSpec({...spec,coaRequired:e.target.checked})}/> COA required</label><label className="phase91-check"><input type="checkbox" checked={spec.labReportRequired} onChange={e=>setSpec({...spec,labReportRequired:e.target.checked})}/> Lab report required</label></div><button className="button button-secondary" disabled={busy} onClick={saveSpec}>Save SKU QA policy</button></div>
        {!latest?<><div className="phase91-doc-grid"><label>COA number<input value={coaNumber} onChange={e=>setCoaNumber(e.target.value)} placeholder="Certificate reference" /></label><label>COA URL<input value={coaUrl} onChange={e=>setCoaUrl(e.target.value)} placeholder="https://…" /></label><label>Lab report URL<input value={labReportUrl} onChange={e=>setLabReportUrl(e.target.value)} placeholder="https://…" /></label></div><button className="button" disabled={busy} onClick={createInspection}>Start QA inspection</button></>:<div className="phase91-inspection"><strong>{latest.inspectionNumber}</strong><p>{latest.status} · {(latest.tests||[]).length} test(s)</p><div className="phase91-test-editor">{testDrafts.map(t=><article key={t.code}><div><strong>{t.name}</strong><small>{t.critical?"Critical check":"Standard check"}</small></div><select value={t.result} onChange={e=>setTest(t.code,"result",e.target.value)}><option>NOT_TESTED</option><option>PASS</option><option>WARN</option><option>FAIL</option></select><input value={t.measuredValue} onChange={e=>setTest(t.code,"measuredValue",e.target.value)} placeholder="Measured value / observation"/><input value={t.note} onChange={e=>setTest(t.code,"note",e.target.value)} placeholder="Evidence note"/></article>)}</div><div className="phase91-actions"><button className="button button-secondary" disabled={busy||!testDrafts.length} onClick={saveTests}>Save test evidence</button><button className="button" disabled={busy||latest.status!=="UNDER_REVIEW"} onClick={()=>decide("RELEASE")}>Release sellable</button><button className="button button-secondary" disabled={busy||latest.status!=="UNDER_REVIEW"} onClick={()=>decide("HOLD")}>Fail / hold batch</button></div></div>}</>:<div className="admin-empty"><strong>Select a QA batch</strong></div>}</div>
    </div>

    <div className="phase91-scorecards"><div className="admin-panel-head"><div><h3>Supplier quality scorecards</h3><p>Rolling 180-day score uses physical receipt rejection, QA failure, cost variance, recalls and open critical incidents.</p></div></div><div className="phase91-score-grid">{scorecards.slice(0,12).map(s=><article key={s.id} className={s.recommendation==="HOLD"?"danger":""}><small>{s.status}</small><strong>{s.name}</strong><b>{s.score}/100 · {s.recommendation}</b><span>Reject {s.rejectionRate}% · QA fail {s.qaFailRate}% · cost variance {s.costVarianceRate}%</span><span>{s.recalls} recall(s) · {s.openCriticalIncidents} critical incident(s)</span>{s.recommendation==="HOLD"&&s.status!=="HOLD"?<button className="button button-secondary" disabled={busy} onClick={()=>holdSupplier(s.id)}>Put supplier on quality hold</button>:null}</article>)}</div></div>

    <div className="phase91-incidents"><div className="admin-panel-head"><div><h3>Open quality incidents</h3><p>Receipt rejection, QA failure, cost variance and recall evidence remains linked to the supplier and batch.</p></div></div>{incidents.length===0?<div className="admin-empty"><strong>No open quality incidents</strong></div>:<div className="phase91-incident-list">{incidents.map(i=><article key={i.id}><div><span className={`status-pill status-${String(i.severity).toLowerCase()}`}>{i.severity}</span><strong>{i.title}</strong><small>{i.supplier?.name}{i.batch?.batchCode?` · ${i.batch.batchCode}`:""}</small>{i.notes&&<p>{i.notes}</p>}</div><button className="button button-secondary" disabled={busy} onClick={()=>closeIncident(i.id)}>Close incident</button></article>)}</div>}</div>
  </section>
}