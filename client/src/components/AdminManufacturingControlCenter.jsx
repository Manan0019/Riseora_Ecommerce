import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";

const roleLabels={FINISHED_GOOD:"Finished good",RAW_MATERIAL:"Raw material",PACKAGING:"Packaging",CONSUMABLE:"Consumable",SPARE_PART:"Spare part"};
const money=(v)=>`₹${Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}`;
const blankBom=()=>({name:"",outputVariantId:"",outputQuantity:1,yieldTolerancePercent:5,items:[{componentVariantId:"",quantityPerRun:1,wastagePercent:0,isCritical:true}]});

export default function AdminManufacturingControlCenter(){
  const [data,setData]=useState(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [bomDraft,setBomDraft]=useState(blankBom());
  const [orderDraft,setOrderDraft]=useState({bomId:"",warehouseId:"",plannedRuns:1,dueAt:""});
  const [selectedOrderId,setSelectedOrderId]=useState("");
  const [completion,setCompletion]=useState(null);
  const [trace,setTrace]=useState(null);

  async function load(){setError("");const r=await apiFetch("/admin/ops/phase92-manufacturing/overview");setData(r.data)}
  useEffect(()=>{load().catch(e=>setError(e.message))},[]);
  const variants=data?.variants||[],warehouses=data?.warehouses||[],boms=data?.boms||[],orders=data?.orders||[];
  const finished=variants.filter(v=>v.inventoryRole==="FINISHED_GOOD"),components=variants.filter(v=>v.inventoryRole!=="FINISHED_GOOD"),activeBoms=boms.filter(b=>b.status==="ACTIVE");
  const selectedOrder=useMemo(()=>orders.find(o=>o.id===selectedOrderId)||null,[orders,selectedOrderId]);

  async function run(action,success){setBusy(true);setError("");setMessage("");try{await action();await load();setMessage(success)}catch(e){setError(e.message)}finally{setBusy(false)}}
  const setRole=(id,role)=>run(()=>apiFetch(`/admin/ops/phase92-manufacturing/variants/${id}/role`,{method:"PATCH",body:{inventoryRole:role}}),"Inventory role updated.");
  const addBomRow=()=>setBomDraft(d=>({...d,items:[...d.items,{componentVariantId:"",quantityPerRun:1,wastagePercent:0,isCritical:true}]}));
  const setBomRow=(i,key,value)=>setBomDraft(d=>({...d,items:d.items.map((x,n)=>n===i?{...x,[key]:value}:x)}));
  const removeBomRow=(i)=>setBomDraft(d=>({...d,items:d.items.filter((_,n)=>n!==i)}));
  const createBom=()=>run(async()=>{await apiFetch("/admin/ops/phase92-manufacturing/boms",{method:"POST",body:{...bomDraft,outputQuantity:Number(bomDraft.outputQuantity),yieldTolerancePercent:Number(bomDraft.yieldTolerancePercent),items:bomDraft.items.map(x=>({...x,quantityPerRun:Number(x.quantityPerRun),wastagePercent:Number(x.wastagePercent)}))}});setBomDraft(blankBom())},"BOM draft created. Activate it after review.");
  const activateBom=(id)=>run(()=>apiFetch(`/admin/ops/phase92-manufacturing/boms/${id}/activate`,{method:"POST"}),"BOM activated; older active version archived.");
  const createOrder=()=>run(async()=>{await apiFetch("/admin/ops/phase92-manufacturing/production-orders",{method:"POST",body:{...orderDraft,plannedRuns:Number(orderDraft.plannedRuns),dueAt:orderDraft.dueAt||null}});setOrderDraft(d=>({...d,plannedRuns:1,dueAt:""}))},"Production order created.");
  const orderAction=(id,action,msg)=>run(()=>apiFetch(`/admin/ops/phase92-manufacturing/production-orders/${id}/${action}`,{method:"POST"}),msg);

  function openCompletion(order){setSelectedOrderId(order.id);setCompletion({actualOutputQty:order.plannedOutputQty,outputBatchCode:`${order.productionNumber}-FG`,manufacturedAt:new Date().toISOString().slice(0,10),expiryDate:"",labourCost:0,overheadCost:0,materials:(order.materials||[]).map(m=>({materialLineId:m.id,label:`${m.componentVariant?.sku} · ${m.componentVariant?.product?.name||m.componentVariant?.name}`,issuedQty:Number(m.issuedQty||0),consumedQty:Number(m.issuedQty||0),wasteQty:0,returnedQty:0}))})}
  const setMaterial=(id,key,value)=>setCompletion(c=>({...c,materials:c.materials.map(m=>m.materialLineId===id?{...m,[key]:Number(value)}:m)}));
  const completeOrder=()=>run(async()=>{await apiFetch(`/admin/ops/phase92-manufacturing/production-orders/${selectedOrderId}/complete`,{method:"POST",body:{...completion,actualOutputQty:Number(completion.actualOutputQty),labourCost:Number(completion.labourCost),overheadCost:Number(completion.overheadCost),manufacturedAt:completion.manufacturedAt||null,expiryDate:completion.expiryDate||null,materials:completion.materials.map(({materialLineId,consumedQty,wasteQty,returnedQty})=>({materialLineId,consumedQty:Number(consumedQty),wasteQty:Number(wasteQty),returnedQty:Number(returnedQty)}))}});setCompletion(null)},"Production completed. Finished batch is on Phase 91 QA hold—not sellable yet.");
  const loadTrace=async(id)=>{setBusy(true);setError("");try{const r=await apiFetch(`/admin/ops/phase92-manufacturing/production-orders/${id}/trace`);setTrace(r.data)}catch(e){setError(e.message)}finally{setBusy(false)}};

  return (
    <section className="admin-panel phase92-manufacturing-center">
      <div className="admin-panel-head">
        <div>
          <p className="eyebrow">PHASE 92 · MANUFACTURING CONTROL</p>
          <h2>BOM, Production, Yield & Batch Traceability</h2>
          <p>Versioned formulas, FEFO component issue, material reconciliation and finished-batch QA handoff connect supplier lots to manufactured products without inventing sellable stock.</p>
        </div>
        <button className="button button-secondary" onClick={()=>load().catch(e=>setError(e.message))}>Refresh</button>
      </div>

      {error && <p className="alert error">{error}</p>}
      {message && <p className="alert success">{message}</p>}

      <div className="phase92-kpis">
        <article><small>ACTIVE BOMs</small><strong>{data?.summary?.activeBoms||0}</strong><span>Released formulas</span></article>
        <article><small>OPEN PRODUCTION</small><strong>{data?.summary?.openOrders||0}</strong><span>Not yet closed</span></article>
        <article><small>READY TO ISSUE</small><strong>{data?.summary?.materialReady||0}</strong><span>Materials available</span></article>
        <article className={(data?.summary?.materialShortage||0)>0?"danger":""}><small>MATERIAL SHORTAGE</small><strong>{data?.summary?.materialShortage||0}</strong><span>Approved orders blocked</span></article>
        <article><small>READINESS REVIEW</small><strong>{data?.summary?.materialReviewPending||0}</strong><span>Approved orders beyond live-check window</span></article>
        <article><small>IN PRODUCTION</small><strong>{data?.summary?.inProduction||0}</strong><span>Materials issued / running</span></article>
        <article><small>QA PENDING</small><strong>{data?.summary?.qaPending||0}</strong><span>Finished physical stock blocked</span></article>
        <article className={(data?.summary?.yieldVariance||0)>0?"danger":""}><small>YIELD VARIANCE</small><strong>{data?.summary?.yieldVariance||0}</strong><span>Needs process review</span></article>
      </div>

      <div className="phase92-grid-two">
        <div>
          <h3>Inventory role classification</h3>
          <p className="muted">Use active variants under inactive catalog products for raw-material and packaging SKUs. Phase 89 can procure those hidden inputs while the parent product remains off the customer storefront.</p>
          <div className="phase92-role-list">
            {variants.slice(0,80).map(v=>(
              <article key={v.id}>
                <div>
                  <strong>{v.sku}</strong>
                  <span>{v.product?.name} · {v.name}</span>
                  <small>Stock {v.stockQuantity} · {v.unit||"unit"}</small>
                </div>
                <select value={v.inventoryRole||"FINISHED_GOOD"} disabled={busy} onChange={e=>setRole(v.id,e.target.value)}>
                  {Object.entries(roleLabels).map(([k,l])=><option key={k} value={k}>{l}</option>)}
                </select>
              </article>
            ))}
          </div>
        </div>

        <div>
          <h3>Create versioned BOM</h3>
          <div className="phase92-form">
            <label>Name<input value={bomDraft.name} onChange={e=>setBomDraft({...bomDraft,name:e.target.value})} placeholder="Hair Oil 100 ml formula"/></label>
            <label>Finished output
              <select value={bomDraft.outputVariantId} onChange={e=>setBomDraft({...bomDraft,outputVariantId:e.target.value})}>
                <option value="">Select finished SKU</option>
                {finished.map(v=><option key={v.id} value={v.id}>{v.sku} · {v.product?.name} · {v.name}</option>)}
              </select>
            </label>
            <div className="phase92-inline">
              <label>Output / run<input type="number" min="1" value={bomDraft.outputQuantity} onChange={e=>setBomDraft({...bomDraft,outputQuantity:e.target.value})}/></label>
              <label>Yield tolerance %<input type="number" min="0" max="100" step="0.1" value={bomDraft.yieldTolerancePercent} onChange={e=>setBomDraft({...bomDraft,yieldTolerancePercent:e.target.value})}/></label>
            </div>
            <h4>Components</h4>
            {bomDraft.items.map((row,i)=>(
              <div className="phase92-bom-row" key={i}>
                <select value={row.componentVariantId} onChange={e=>setBomRow(i,"componentVariantId",e.target.value)}>
                  <option value="">Select component</option>
                  {components.map(v=><option key={v.id} value={v.id}>{v.sku} · {roleLabels[v.inventoryRole]} · stock {v.stockQuantity}</option>)}
                </select>
                <input type="number" min="1" value={row.quantityPerRun} onChange={e=>setBomRow(i,"quantityPerRun",e.target.value)} title="Base units per run"/>
                <input type="number" min="0" max="100" step="0.1" value={row.wastagePercent} onChange={e=>setBomRow(i,"wastagePercent",e.target.value)} title="Wastage %"/>
                <label className="phase92-mini-check"><input type="checkbox" checked={row.isCritical} onChange={e=>setBomRow(i,"isCritical",e.target.checked)}/>Critical</label>
                {bomDraft.items.length>1 && <button className="button button-secondary" type="button" onClick={()=>removeBomRow(i)}>×</button>}
              </div>
            ))}
            <div className="phase92-actions">
              <button className="button button-secondary" type="button" onClick={addBomRow}>Add component</button>
              <button className="button" disabled={busy||!bomDraft.name||!bomDraft.outputVariantId||bomDraft.items.some(x=>!x.componentVariantId)} onClick={createBom}>Create BOM draft</button>
            </div>
          </div>
        </div>
      </div>

      <div className="phase92-grid-two">
        <div>
          <h3>BOM versions</h3>
          <div className="phase92-bom-list">
            {boms.length===0 ? (
              <div className="admin-empty"><strong>No manufacturing BOM yet</strong></div>
            ) : boms.slice(0,30).map(b=>(
              <article key={b.id}>
                <div>
                  <span className={`status-pill status-${String(b.status).toLowerCase()}`}>{b.status}</span>
                  <strong>{b.name} · v{b.version}</strong>
                  <small>{b.outputVariant?.sku} · {b.items?.length||0} component(s) · output {b.outputQuantity}</small>
                </div>
                {b.status==="DRAFT" && <button className="button button-secondary" disabled={busy} onClick={()=>activateBom(b.id)}>Activate</button>}
              </article>
            ))}
          </div>
        </div>

        <div>
          <h3>Create production order</h3>
          <div className="phase92-form">
            <label>Active BOM
              <select value={orderDraft.bomId} onChange={e=>setOrderDraft({...orderDraft,bomId:e.target.value})}>
                <option value="">Select BOM</option>
                {activeBoms.map(b=><option key={b.id} value={b.id}>{b.name} · {b.outputVariant?.sku} · v{b.version}</option>)}
              </select>
            </label>
            <label>Warehouse
              <select value={orderDraft.warehouseId} onChange={e=>setOrderDraft({...orderDraft,warehouseId:e.target.value})}>
                <option value="">Select warehouse</option>
                {warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </select>
            </label>
            <div className="phase92-inline">
              <label>Runs<input type="number" min="1" value={orderDraft.plannedRuns} onChange={e=>setOrderDraft({...orderDraft,plannedRuns:e.target.value})}/></label>
              <label>Due date<input type="date" value={orderDraft.dueAt} onChange={e=>setOrderDraft({...orderDraft,dueAt:e.target.value})}/></label>
            </div>
            <button className="button" disabled={busy||!orderDraft.bomId||!orderDraft.warehouseId} onClick={createOrder}>Create production order</button>
          </div>
        </div>
      </div>

      <div className="phase92-orders">
        <div className="admin-panel-head">
          <div>
            <h3>Production execution</h3>
            <p>Stock changes only at controlled material issue/return and Phase 91 QA release boundaries.</p>
          </div>
        </div>
        {orders.length===0 ? (
          <div className="admin-empty"><strong>No production orders</strong></div>
        ) : orders.slice(0,50).map(o=>(
          <article key={o.id} className={["QA_REJECTED","CANCELLED"].includes(o.status)?"danger":""}>
            <div className="phase92-order-head">
              <div>
                <span className={`status-pill status-${String(o.status).toLowerCase()}`}>{o.status}</span>
                <strong>{o.productionNumber}</strong>
                <small>{o.outputVariant?.product?.name} · {o.outputVariant?.name} · planned {o.plannedOutputQty}</small>
              </div>
              <div>
                <b>{o.varianceStatus||"ON_TARGET"}</b>
                <small>{o.yieldVariancePercent==null?"No final yield yet":`${Number(o.yieldVariancePercent).toFixed(2)}% yield variance`}</small>
              </div>
            </div>
            <div className="phase92-materials">
              {(o.materials||[]).map(m=>(
                <span key={m.id}>{m.componentVariant?.sku}: planned {m.plannedQty} · issued {m.issuedQty} · used {Number(m.consumedQty||0)+Number(m.wasteQty||0)} · returned {m.returnedQty||0}</span>
              ))}
              {o.status==="APPROVED"&&o.materialAvailability ? (
                <span className={o.materialAvailability.ready?"ok":"bad"}>
                  {o.materialAvailability.ready?"Material ready":`Material shortage · ${o.materialAvailability.shortageQty} unit(s)`}
                </span>
              ) : null}
            </div>
            <div className="phase92-actions">
              {o.status==="DRAFT" && <button className="button button-secondary" disabled={busy} onClick={()=>orderAction(o.id,"approve","Production order approved. Material availability was rechecked server-side.")}>Approve</button>}
              {o.status==="APPROVED" && <button className="button" disabled={busy} onClick={()=>orderAction(o.id,"issue-materials","FEFO material issue posted with source-batch lineage.")}>Issue materials</button>}
              {o.status==="MATERIAL_ISSUED" && <button className="button" disabled={busy} onClick={()=>orderAction(o.id,"start","Production started.")}>Start production</button>}
              {o.status==="IN_PRODUCTION" && <button className="button" disabled={busy} onClick={()=>openCompletion(o)}>Complete & create QA batch</button>}
              {["DRAFT","APPROVED"].includes(o.status) && <button className="button button-secondary" disabled={busy} onClick={()=>orderAction(o.id,"cancel","Production order cancelled without consuming materials.")}>Cancel</button>}
              <button className="button button-secondary" disabled={busy} onClick={()=>loadTrace(o.id)}>Trace lineage</button>
            </div>
            {o.outputBatch && (
              <p className="phase92-output-note">
                Finished batch <strong>{o.outputBatch.batchCode}</strong> · physical {o.outputBatch.quantityOnHand} · QA {o.outputBatch.qualityStatus}.{" "}
                {o.status==="QA_PENDING"?"Not sellable until Phase 91 release.":o.status==="RELEASED"?"QA released and sellable.":""}
              </p>
            )}
          </article>
        ))}
      </div>

      {completion && selectedOrder && (
        <div className="phase92-completion">
          <div className="admin-panel-head">
            <div>
              <h3>Complete {selectedOrder.productionNumber}</h3>
              <p>Reconcile every issued material exactly. Returned + consumed + waste must equal issued.</p>
            </div>
            <button className="button button-secondary" onClick={()=>setCompletion(null)}>Close</button>
          </div>
          <div className="phase92-form">
            <div className="phase92-inline">
              <label>Actual output<input type="number" min="1" value={completion.actualOutputQty} onChange={e=>setCompletion({...completion,actualOutputQty:e.target.value})}/></label>
              <label>Finished batch<input value={completion.outputBatchCode} onChange={e=>setCompletion({...completion,outputBatchCode:e.target.value})}/></label>
            </div>
            <div className="phase92-inline">
              <label>Manufactured<input type="date" value={completion.manufacturedAt} onChange={e=>setCompletion({...completion,manufacturedAt:e.target.value})}/></label>
              <label>Expiry<input type="date" value={completion.expiryDate} onChange={e=>setCompletion({...completion,expiryDate:e.target.value})}/></label>
            </div>
            <div className="phase92-inline">
              <label>Labour cost<input type="number" min="0" step="0.01" value={completion.labourCost} onChange={e=>setCompletion({...completion,labourCost:e.target.value})}/></label>
              <label>Overhead cost<input type="number" min="0" step="0.01" value={completion.overheadCost} onChange={e=>setCompletion({...completion,overheadCost:e.target.value})}/></label>
            </div>
            <div className="phase92-reconcile">
              {completion.materials.map(m=>(
                <article key={m.materialLineId}>
                  <strong>{m.label}</strong>
                  <span>Issued {m.issuedQty}</span>
                  <label>Consumed<input type="number" min="0" value={m.consumedQty} onChange={e=>setMaterial(m.materialLineId,"consumedQty",e.target.value)}/></label>
                  <label>Waste<input type="number" min="0" value={m.wasteQty} onChange={e=>setMaterial(m.materialLineId,"wasteQty",e.target.value)}/></label>
                  <label>Returned<input type="number" min="0" value={m.returnedQty} onChange={e=>setMaterial(m.materialLineId,"returnedQty",e.target.value)}/></label>
                  <b className={Number(m.consumedQty)+Number(m.wasteQty)+Number(m.returnedQty)===m.issuedQty?"ok":"bad"}>
                    {Number(m.consumedQty)+Number(m.wasteQty)+Number(m.returnedQty)} / {m.issuedQty}
                  </b>
                </article>
              ))}
            </div>
            <button className="button" disabled={busy||completion.materials.some(m=>Number(m.consumedQty)+Number(m.wasteQty)+Number(m.returnedQty)!==m.issuedQty)||!completion.outputBatchCode} onClick={completeOrder}>Complete production → QA hold</button>
          </div>
        </div>
      )}

      {trace && (
        <div className="phase92-trace">
          <div className="admin-panel-head">
            <div>
              <h3>Production trace · {trace.productionNumber}</h3>
              <p>Raw supplier batches → manufacturing order → finished batch → shipped customer orders.</p>
            </div>
            <button className="button button-secondary" onClick={()=>setTrace(null)}>Close</button>
          </div>
          <div className="phase92-trace-grid">
            <div>
              <h4>Input lineage</h4>
              {(trace.materials||[]).map(m=>(
                <article key={m.id}>
                  <strong>{m.componentVariant?.sku} · {m.componentVariant?.product?.name}</strong>
                  {(m.allocations||[]).map(a=>(
                    <span key={a.id}>Batch {a.batch?.batchCode} · issued {a.quantityIssued} · supplier {a.batch?.goodsReceiptItem?.goodsReceipt?.purchaseOrder?.supplier?.name||"Legacy / internal"}</span>
                  ))}
                </article>
              ))}
            </div>
            <div>
              <h4>Finished lineage</h4>
              {trace.outputBatch ? (
                <article>
                  <strong>{trace.outputBatch.batchCode}</strong>
                  <span>QA {trace.outputBatch.qualityStatus} · {trace.outputBatch.quantityOnHand} physical</span>
                  <span>Unit production cost {money(trace.unitProductionCost)}</span>
                  {(trace.outputBatch.orderAllocations||[]).length
                    ? trace.outputBatch.orderAllocations.map(a=><span key={a.id}>→ {a.order?.orderNumber} · {a.quantity} unit(s) · {a.order?.status}</span>)
                    : <span>No customer shipment from this batch yet.</span>}
                </article>
              ) : <p>No finished batch yet.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
