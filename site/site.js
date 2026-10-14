const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={data:null,scenario:'exchange-commit',mutation:'none',run:null,baseline:null,selectedEnvelope:0,phase:'ingest'};
const short=(v,n=10)=>!v?'—':v.length>n*2+3?`${v.slice(0,n)}…${v.slice(-n)}`:v;
const esc=(s)=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function boot(){
  state.data=await fetch('./data/reality.json?v=4').then(r=>r.json());
  bindGlobal(); initLab(); renderControls(); selectRun(); initReveal(); initNarrative(); initCanvas();
}
function bindGlobal(){
  document.addEventListener('pointermove',e=>{const g=$('.cursor-glow');if(g){g.style.left=e.clientX+'px';g.style.top=e.clientY+'px'}});
}
function renderControls(){
  $('#scenarioButtons').innerHTML=state.data.scenarios.map(s=>`<button data-scenario="${s.id}" class="${s.id===state.scenario?'active':''}"><b>${esc(s.title)}</b><small>${esc(s.summary)}</small></button>`).join('');
  $('#scenarioButtons').onclick=e=>{const b=e.target.closest('[data-scenario]');if(!b)return;state.scenario=b.dataset.scenario;state.mutation='none';renderControls();selectRun()};
  const muts=state.data.mutations.filter(m=>m.applies.includes(state.scenario));
  $('#mutationButtons').innerHTML=muts.map(m=>`<button data-mutation="${m.id}" class="${m.id===state.mutation?'active':''}"><b>${esc(m.title)}</b><small>${esc(m.summary)}</small></button>`).join('');
  $('#mutationButtons').onclick=e=>{const b=e.target.closest('[data-mutation]');if(!b)return;state.mutation=b.dataset.mutation;renderControls();selectRun()};
}
function selectRun(){
  state.run=state.data.runs[state.scenario][state.mutation];state.baseline=state.data.runs[state.scenario].none;state.selectedEnvelope=Math.min(state.selectedEnvelope,state.run.envelopes.length-1);renderRun();
}
function statusClass(s){return String(s||'').toLowerCase()}

function initLab(){
  const scenario=$('#labScenario'),mutation=$('#labMutation'),run=$('#labRun');
  if(!scenario||!mutation||!run)return;
  scenario.innerHTML=state.data.scenarios.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('');
  const syncMutations=()=>{const muts=state.data.mutations.filter(m=>m.applies.includes(scenario.value));mutation.innerHTML=muts.map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join('');};
  scenario.onchange=syncMutations;syncMutations();
  run.onclick=()=>{state.scenario=scenario.value;state.mutation=mutation.value;run.classList.remove('running');void run.offsetWidth;run.classList.add('running');$('#labStamp').textContent='RUN '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});renderControls();selectRun();setTimeout(()=>run.classList.remove('running'),650)};
  $('#labMatrix').onclick=e=>{const b=e.target.closest('[data-lab-run]');if(!b)return;const [sc,mu]=b.dataset.labRun.split('|');state.scenario=sc;state.mutation=mu;scenario.value=sc;syncMutations();mutation.value=mu;renderControls();selectRun();$('#testlab').scrollIntoView({behavior:'smooth',block:'start'})};
  renderLabMatrix();
}
function renderLab(){
  if(!state.run||!$('#labVerdict'))return;const r=state.run;const scenario=$('#labScenario'),mutation=$('#labMutation');if(scenario){scenario.value=state.scenario;const muts=state.data.mutations.filter(m=>m.applies.includes(state.scenario));mutation.innerHTML=muts.map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join('');mutation.value=state.mutation}
  const verdict=$('#labVerdict');verdict.textContent=r.status;verdict.className=statusClass(r.status);
  $('#labWhy').textContent=(r.why&&r.why[0])||'bounded deterministic result';
  $('#labDivergence').textContent=r.firstEnvelopeDivergence?String(r.firstEnvelopeDivergence.layer).toUpperCase():r.replay?.firstDivergence?`RSPACE / STEP ${r.replay.firstDivergence.step}`:'NONE';
  $('#labReplay').textContent=!r.replay?'N/A':r.replay.match?'MATCH':'DIVERGED';$('#labReplayDetail').textContent=!r.replay?'no execution':`${r.replay.stepsCompared} steps compared`;
  $('#labCross').textContent=!r.cross?'N/A':`${r.cross.agreeingNodes}/${r.cross.targetCount}`;$('#labCrossDetail').textContent=!r.cross?'no observations':`${r.cross.status} / quorum ${r.cross.quorumObserved?'observed':'not observed'}`;
  $('#labCert').textContent=!r.lattice?'N/A':r.lattice.committedCertificate?'COMMIT QC':'NO QC';$('#labCertDetail').textContent=!r.lattice?'no digest':`${r.lattice.status} / ${r.lattice.committedCount}/${r.lattice.quorum} commit votes`;
  $('#labEnvelopeCount').textContent=r.envelopes.length;
  const steps=r.execution?.steps||[];$('#labTraceCount').textContent=`${steps.length} STEPS`;$('#labTrace').innerHTML=steps.length?steps.map(st=>`<div class="lab-trace-row"><i>${String(st.n).padStart(2,'0')}</i><b>${esc(st.rule)}</b><span>${esc(st.description)}</span></div>`).join(''):'<div class="lab-witness empty">No execution trace under this run.</div>';
  const w=r.witness;$('#labWitnessTag').textContent=w?`${w.verification} / ${w.invariantId}`:'NONE';$('#labWitnessTag').style.color=w?'var(--red)':'var(--cyan)';$('#labWitness').className='lab-witness'+(w?'':' empty');$('#labWitness').innerHTML=w?`<dl><div><dt>LAYER</dt><dd>${esc(w.layer)}</dd></div><div><dt>INVARIANT</dt><dd>${esc(w.invariant)}</dd></div><div><dt>EXPECTED</dt><dd>${esc(w.expected)}</dd></div><div><dt>OBSERVED</dt><dd>${esc(w.observed)}</dd></div><div><dt>SOURCE</dt><dd>${esc(w.source)} / ${esc(w.field)}</dd></div><div><dt>IMPACT</dt><dd>${esc(w.impact)}</dd></div></dl>`:'No failure witness. This PASS remains bounded by the implemented model.';
  const claim=(r.claims||[]).find(c=>c.status==='FAIL'||c.status==='WARN')||(r.claims||[]).at(-1);$('#labClaimStatus').textContent=claim?.status||r.status;$('#labClaimStatus').style.color=claim?.status==='FAIL'?'var(--red)':claim?.status==='WARN'?'var(--amber)':'var(--cyan)';$('#labClaim').innerHTML=claim?`<dl><div><dt>STATEMENT</dt><dd>${esc(claim.statement)}</dd></div><div><dt>BASIS</dt><dd>${esc(claim.basis)}</dd></div><div><dt>NOT CLAIMED</dt><dd>${esc(claim.notClaimed)}</dd></div></dl>`:'<div class="lab-witness empty">No exported claim object.</div>';
}
function renderLabMatrix(){
  if(!$('#labMatrix'))return;const rows=[];const counts={PASS:0,WARN:0,FAIL:0,UNAVAILABLE:0};for(const sc of state.data.scenarios){for(const [mu,r] of Object.entries(state.data.runs[sc.id]||{})){counts[r.status]=(counts[r.status]||0)+1;const mm=state.data.mutations.find(x=>x.id===mu);rows.push(`<tr><td>${esc(sc.title)}</td><td>${esc(mm?.title||mu)}</td><td class="status ${statusClass(r.status)}">${esc(r.status)}</td><td>${esc(r.witness?.invariantId||'—')}</td><td>${!r.replay?'N/A':r.replay.match?'MATCH':'DIVERGED'}</td><td>${r.envelopes?.length||0}</td><td><button class="lab-open" data-lab-run="${sc.id}|${mu}">OPEN</button></td></tr>`);}}$('#labMatrix').innerHTML=rows.join('');$('#labCounts').innerHTML=`<b class="pass">PASS ${counts.PASS||0}</b><b class="warn">WARN ${counts.WARN||0}</b><b class="fail">FAIL ${counts.FAIL||0}</b><b>TOTAL ${rows.length}</b>`;
}
function renderRun(){
  const r=state.run,b=state.baseline,meta=state.data.scenarios.find(x=>x.id===state.scenario),mut=state.data.mutations.find(x=>x.id===state.mutation);
  $('#runStatus').textContent=r.status;$('#runStatus').className=statusClass(r.status);
  $('#runEvent').textContent=r.qos.eventId;$('#runEnvelopes').textContent=r.envelopes.length;
  $('#firstDivergence').textContent=r.firstEnvelopeDivergence?`${r.firstEnvelopeDivergence.layer.toUpperCase()} / ENVELOPE HASH`:r.replay?.firstDivergence?`RSPACE / STEP ${r.replay.firstDivergence.step}`:'NONE / BASELINE';
  $('#replayState').textContent=!r.replay?'UNAVAILABLE':r.replay.match?`MATCH / ${r.replay.stepsCompared} STEPS`:`DIVERGED / STEP ${r.replay.firstDivergence?.step??'?'}`;
  $('#crossState').textContent=!r.cross?'UNAVAILABLE':`${r.cross.status} / ${r.cross.agreeingNodes}/${r.cross.targetCount} AGREE`;
  $('#latticeState').textContent=!r.lattice?'UNAVAILABLE':`${r.lattice.status} / COMMIT CERT ${r.lattice.committedCertificate?'YES':'NO'}`;
  const divergedLayer=r.firstEnvelopeDivergence?.layer;
  $('#forgePipeline').innerHTML=r.envelopes.map((e)=>`<div class="pipe-node ${e.layer===divergedLayer?'diverged':''}"><b>${esc(e.layer)}</b><span>${esc(e.label)}</span><code>${short(e.hash,5)}</code></div>`).join('');
  const w=r.witness;$('#witnessBadge').textContent=w?`${w.verification} / ${w.invariantId}`:'NO FAILURE';$('#witnessBadge').style.color=w?'var(--red)':'var(--cyan)';
  $('#witnessBody').innerHTML=w?`<dl><div><dt>LAYER</dt><dd>${esc(w.layer)}</dd></div><div><dt>INVARIANT</dt><dd>${esc(w.invariant)}</dd></div><div><dt>EXPECTED</dt><dd>${esc(w.expected)}</dd></div><div><dt>OBSERVED</dt><dd>${esc(w.observed)}</dd></div><div><dt>IMPACT</dt><dd>${esc(w.impact)}</dd></div></dl>`:`<p class="empty">No failure witness under this run. The baseline still carries explicit claim boundaries; PASS is not promoted beyond the implemented model.</p>`;
  const claim=r.claims.find(c=>c.status==='FAIL'||c.status==='WARN')||r.claims.at(-1);$('#claimBoundary').textContent=claim?.notClaimed||'Compiler output is bounded by the implemented model.';
  renderEnvelopes();renderDiff(meta,mut,b,r);renderLab();updateCanvasRun();
}
function renderEnvelopes(){
  const r=state.run;$('#envelopeChain').innerHTML=r.envelopes.map((e,i)=>`<button class="env-node ${i===state.selectedEnvelope?'active':''}" data-env="${i}"><span>${String(i+1).padStart(2,'0')} / ${esc(e.layer)}</span><strong>${esc(e.label)}</strong><code>${short(e.hash,8)}</code></button>`).join('');
  $('#envelopeChain').onclick=e=>{const b=e.target.closest('[data-env]');if(!b)return;state.selectedEnvelope=+b.dataset.env;renderEnvelopes()};
  const selected=r.envelopes[state.selectedEnvelope];if(!selected)return;const e=selected;$('#envLayer').textContent=e.layer.toUpperCase();$('#envLabel').textContent=e.label;$('#envSummary').textContent=e.summary;$('#envHash').textContent=e.hash;$('#envPayload').textContent=e.payloadHash;$('#envPrev').textContent=e.prevHash||'GENESIS / NONE';
  $('#envFields').innerHTML=(e.fields||[]).map(f=>`<div class="env-field"><b>${esc(f.source)} / ${esc(f.field)}</b><span>${esc(f.value)}</span></div>`).join('')||'<div class="env-field"><b>NO EXPORTED FIELDS</b><span>Envelope link is represented by hashes and summary.</span></div>';
}
function realityTrace(r){
  const e=r.envelopes;return [
    ['event',r.qos.eventId],['capability',r.qos.capability||'ABSENT'],['qlf',r.qlf?.digest||'UNAVAILABLE'],['trace',r.execution?.traceHash||'UNAVAILABLE'],['block',r.blocks?.[0]?.hash||'UNAVAILABLE'],['witness',r.witness?.invariantId||'NONE'],['verdict',r.status]
  ];
}
function renderDiff(meta,mut,b,r){
  $('#baseTitle').textContent=meta.title;$('#activeTitle').textContent=mut.title;$('#baseHash').textContent=b.envelopes.at(-1)?.hash||'—';$('#activeHash').textContent=r.envelopes.at(-1)?.hash||'—';
  const A=realityTrace(b),B=realityTrace(r),changed=new Set();A.forEach((x,i)=>{if(String(x[1])!==String(B[i]?.[1]))changed.add(x[0])});
  const rows=(arr)=>arr.map(([k,v])=>`<div class="trace-row ${changed.has(k)?'changed':''}"><span>${esc(k)}</span><b title="${esc(v)}">${esc(short(String(v),14))}</b></div>`).join('');$('#baseTrace').innerHTML=rows(A);$('#activeTrace').innerHTML=rows(B);
  $('#diffLayer').textContent=r.firstEnvelopeDivergence?r.firstEnvelopeDivergence.layer.toUpperCase():r.replay?.firstDivergence?`RSPACE / STEP ${r.replay.firstDivergence.step}`:'NO DIVERGENCE';
}
function initReveal(){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.08});$$('.reveal').forEach(x=>io.observe(x))}
const phases={
  ingest:['INGEST / 01','RAW EVENT','event.origin / capability / lemma','RAW → EVENT'],
  normalize:['NORMALIZE / 02','TYPED ARTIFACT','source shape → normalized object','SOURCE → NORMALIZED'],
  compile:['COMPILE / 03','DERIVED REALITY','process → execution → state','MODEL → DERIVATION'],
  envelope:['ENVELOPE / 04','HASH-LINKED WITNESS','payloadHash + prevHash → envelope','ARTIFACT → ENVELOPE'],
  replay:['REPLAY / 05','COUNTERFACTUAL DIFF','baseline ⇄ mutation / first divergence','REALITY A ⇄ REALITY B'],
  witness:['WITNESS / 06','BOUNDED VERDICT','invariant + evidence → PASS|WARN|FAIL','EVIDENCE → WITNESS']
};
function initNarrative(){const steps=$$('.step'),io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){steps.forEach(x=>x.classList.toggle('active',x===e.target));setPhase(e.target.dataset.phase)}},{rootMargin:'-42% 0px -42% 0px',threshold:0});steps.forEach(s=>io.observe(s));}
function setPhase(p){state.phase=p;const [a,b,c,d]=phases[p];$('#hudStage').textContent=a;$('#hudState').textContent=b;$('#phaseTitle').textContent=d;$('#phaseCode').textContent=c;const idx=Object.keys(phases).indexOf(p);$('#railPulse').style.left=`${idx*20}%`;$('#railPulse').style.background=p==='witness'?'var(--amber)':'var(--cyan)';}
let canvas,ctx,particles=[],cw=0,ch=0,dpr=1;
function initCanvas(){canvas=$('#foundryCanvas');ctx=canvas.getContext('2d');resizeCanvas();window.addEventListener('resize',resizeCanvas);const count=matchMedia('(max-width:720px)').matches?45:85;particles=Array.from({length:count},(_,i)=>makeParticle(i/count));animate()}
function makeParticle(t=Math.random()){return{x:Math.random(),y:Math.random(),v:.0009+Math.random()*.0014,size:1+Math.random()*2,lane:Math.floor(Math.random()*5),phase:Math.random()*6.28,t}}
function resizeCanvas(){if(!canvas)return;const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,1.5);cw=r.width;ch=r.height;canvas.width=cw*dpr;canvas.height=ch*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
function updateCanvasRun(){if(!$('#hudHash')||!state.run)return;$('#hudHash').textContent=short(state.run.envelopes.at(-1)?.hash||'no envelope',12)}
function animate(){if(!ctx)return;ctx.clearRect(0,0,cw,ch);const stage=Object.keys(phases).indexOf(state.phase);const gateX=[.16,.30,.44,.58,.72,.86];ctx.lineWidth=1;for(let i=0;i<gateX.length;i++){const x=cw*gateX[i];ctx.strokeStyle=i<=stage?'rgba(97,231,255,.24)':'rgba(58,70,88,.35)';ctx.beginPath();ctx.moveTo(x,ch*.16);ctx.lineTo(x,ch*.82);ctx.stroke();ctx.fillStyle=i===stage?'rgba(97,231,255,.9)':'rgba(102,113,128,.5)';ctx.font='9px IBM Plex Mono';ctx.fillText(String(i+1).padStart(2,'0'),x-6,ch*.12)}
  const targetY=ch*.49;particles.forEach((p,i)=>{p.x+=p.v;if(p.x>1.08){Object.assign(p,makeParticle(-.08));p.x=-.08}const gx=gateX[Math.min(stage,gateX.length-1)],bend=Math.max(0,(p.x-gx+.16)/.32);const laneY=ch*(.23+p.lane*.13);const y=laneY+(targetY-laneY)*Math.min(1,Math.max(0,bend));const x=p.x*cw;const hot=p.x>gx-.02&&p.x<gx+.18;ctx.fillStyle=hot?'rgba(255,187,85,.95)':'rgba(97,231,255,.75)';ctx.fillRect(x,y,p.size,p.size);if(i%9===0){ctx.strokeStyle='rgba(97,231,255,.08)';ctx.beginPath();ctx.moveTo(x-24,y);ctx.lineTo(x,y);ctx.stroke()}});
  const sx=cw*.78,sy=targetY,w=cw*.15,h=ch*.23;ctx.strokeStyle=stage>=3?'rgba(255,187,85,.8)':'rgba(220,228,236,.24)';ctx.strokeRect(sx-w/2,sy-h/2,w,h);ctx.strokeRect(sx-w*.37,sy-h*.34,w*.74,h*.68);ctx.fillStyle=stage>=5?'rgba(255,187,85,.06)':'rgba(97,231,255,.035)';ctx.fillRect(sx-w/2,sy-h/2,w,h);ctx.font='8px IBM Plex Mono';ctx.fillStyle='rgba(220,228,236,.55)';ctx.fillText(stage>=3?'WITNESS ENVELOPE':'ASSEMBLY TARGET',sx-w*.36,sy+4);requestAnimationFrame(animate)}
boot().catch(e=>{console.error(e);document.body.dataset.bootError='true'});
