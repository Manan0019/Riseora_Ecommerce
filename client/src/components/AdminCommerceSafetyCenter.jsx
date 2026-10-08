import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/http';

export default function AdminCommerceSafetyCenter(){
 const [report,setReport]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[showAll,setShowAll]=useState(false);
 const reload=useCallback(async()=>{setLoading(true);setError('');try{const response=await apiFetch('/admin/phase97-launch/commerce');setReport(response.data);}catch(e){setError(e?.message||'Could not run reconciliation');setReport(null);}finally{setLoading(false);}},[]);
 useEffect(()=>{reload();},[reload]);
 const items=(report?.gates||[]).filter(x=>showAll||x.status!=='PASS');
 return <section className="admin-panel phase97-safety" aria-label="Commerce launch integrity">
  <div className="phase96-heading"><div><p className="eyebrow">PHASE 97 · COMMERCE INTEGRITY</p><h2>Payment, Order & Warehouse Reconciliation</h2><p>Read-only launch gates. All counts are aggregate; no customer details or payment IDs leave the server.</p></div><button type="button" className="button button-secondary" onClick={reload} disabled={loading}>{loading?'Checking…':'Refresh checks'}</button></div>
  {error&&<p className="alert error" role="alert">{error}</p>}
  {report&&<><div className="phase97-summary"><div><small>COMMERCE DECISION</small><strong className={report.decision==='GO'?'ok':report.decision==='REVIEW'?'caution':'danger'}>{report.decision}</strong></div><div><small>BLOCKING</small><strong>{report.blockers}</strong></div><div><small>TO REVIEW</small><strong>{report.reviews}</strong></div><div><small>PASSING</small><strong>{report.passing}</strong></div></div>
   <label className="phase97-toggle"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> Show passing checks</label>
   <div className="phase97-grid">{items.map(g=><article className={`phase97-gate ${g.status.toLowerCase()}`} key={g.code}><div className="phase97-gate-head"><strong>{g.code.replace(/_/g,' ')}</strong><span>{g.status}</span></div><small>{g.category} · {g.affected===null?'QUERY FAILED':`${g.affected} affected`}</small><p>{g.explanation}</p>{g.status!=='PASS'&&<p><b>Next:</b> {g.action}</p>}</article>)}</div>
   {!items.length&&<p>No outstanding commerce check violations. Continue staging payment and checkout verification.</p>}
   <p className="phase96-note">Results reflect this database at {new Date(report.generatedAt).toLocaleString()}. No transactions, settlement or stock correction executed.</p></>}
 </section>;
}
