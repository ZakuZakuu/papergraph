/* papergraph viewer v2 — force-directed, dependency-free.
   Data source: window.__PAPERGRAPH_DATA__ (self-contained standalone build) or
   fetched from ./data/ per ./manifest.json (served build). No libraries, no CDN. */
/* ================= papergraph viewer v2 — force-directed, dependency-free ================= */
(function(){
"use strict";
  // ---- theme (light/dark): applied immediately, independent of data load ----
  var THEME_KEY = "papergraph-theme";
  function systemPrefersLight(){
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
  }
  function savedTheme(){ try{ return localStorage.getItem(THEME_KEY); }catch(e){ return null; } }
  function currentTheme(){ return savedTheme() || (systemPrefersLight() ? "light" : "dark"); }
  function applyTheme(t){
    document.documentElement.setAttribute("data-theme", t);
    var btn = document.getElementById("pg-theme");
    if(btn){
      btn.classList.toggle("on", t==="light");
      var label = t==="light" ? "Switch to dark theme" : "Switch to light theme";
      btn.setAttribute("aria-label", label); btn.title = label;
    }
  }
  applyTheme(currentTheme());
  document.addEventListener("DOMContentLoaded", function(){
    var btn = document.getElementById("pg-theme");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var next = document.documentElement.getAttribute("data-theme")==="light" ? "dark" : "light";
      try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
      applyTheme(next);
    });
  });

  // ---- data loading: inline (standalone) first, else fetch per manifest.json ----
  function loadData(){
    if (window.__PAPERGRAPH_DATA__) return Promise.resolve(window.__PAPERGRAPH_DATA__);
    return fetch("manifest.json").then(function(r){ return r.json(); }).then(function(manifest){
      var dir = manifest.data_dir || "data";
      var files = manifest.data_files || {};
      var out = { graph:null, coverage:null, source:null };
      var chain = fetch(dir + "/" + files.graph).then(function(r){ return r.json(); }).then(function(g){ out.graph = g; });
      if (files.coverage) chain = chain.then(function(){
        return fetch(dir + "/" + files.coverage).then(function(r){ return r.json(); }).then(function(c){ out.coverage = c; }); });
      return chain.then(function(){ return out; });
    });
  }

  loadData().then(start).catch(function(err){ if (window.console) console.error("papergraph: data load failed", err); });

  function start(PG_DATA){
const G = PG_DATA.graph || PG_DATA;
const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;

const KIND = {
  artifact:      {c:"#e0a458", r:10, label:"Artifact"},
  procedure:     {c:"#3fb8c4", r:11, label:"Procedure"},
  configuration: {c:"#8b7fd6", r:8,  label:"Configuration"},
  result:        {c:"#5fca7d", r:6,  label:"Result"},
  claim:         {c:"#e0678a", r:13, label:"Claim"},
  gap:           {c:"#ff5c6c", r:9,  label:"Gap"}
};
const KIND_ORDER = ["artifact","procedure","configuration","result","claim","gap"];

// Canvas-drawn colors (edges, labels, gap glyph, selection ring) are not CSS,
// so the light/dark toggle needs its own small palette here. Node-kind fill
// colors (KIND[*].c above) stay constant across themes — they're mid-lightness
// hues that already read fine on both a near-black and a near-white ground.
const CANVAS_PAL = {
  dark:  {edgeExplicit:"#5b6b83", edgeReconstructed:"#4a5975", edgeFocus:"#7d90ad",
          gap:"#ff5c6c", gapFocus:"#ff6b7a", gapRGB:"255,92,108", gapGlyph:"#ff8a95", accent:"#57e0d8",
          selRing:"#eafffb", nodeStroke:"rgba(6,9,14,0.65)",
          labelFill:"#cdd8e8", labelGapFill:"#ff9aa4", labelHalo:"rgba(8,11,18,0.85)",
          pillExplicit:"#8aa0bf", pillRecon:"#8b7fd6"},
  light: {edgeExplicit:"#57657c", edgeReconstructed:"#7c8aa3", edgeFocus:"#3d4a63",
          gap:"#d33444", gapFocus:"#c22a3a", gapRGB:"211,52,68", gapGlyph:"#b3243b", accent:"#0e948c",
          selRing:"#12161f", nodeStroke:"rgba(10,14,20,0.32)",
          labelFill:"#28303e", labelGapFill:"#9c2436", labelHalo:"rgba(255,255,255,0.9)",
          pillExplicit:"#3f4b60", pillRecon:"#5b46b8"}
};
function pal(){ return CANVAS_PAL[document.documentElement.getAttribute("data-theme")==="light" ? "light" : "dark"]; }

/* ---------- index the graph ---------- */
const evById = {};        (G.evidence_spans||[]).forEach(e=>evById[e.id]=e);
const rawNodes = G.nodes||[];
const nodeById = {};      rawNodes.forEach(n=>nodeById[n.id]=n);
const groups = G.contribution_groups||[];
const gaps = G.gaps||[];
const routes = G.provenance_routes||[];
// headline (core) claims are declared on the contribution groups
const groupById={}; groups.forEach(gr=>groupById[gr.id]=gr);
const headlineClaims=new Set(); const claimGroups={};
groups.forEach(gr=>(gr.headline_claim_ids||[]).forEach(cid=>{
  headlineClaims.add(cid); (claimGroups[cid]=claimGroups[cid]||[]).push(gr.id); }));

// build render-node list (real nodes + gap pseudo-nodes)
const nodes = [];
rawNodes.forEach(n=>nodes.push({id:n.id,kind:n.kind,label:n.label||n.id,ref:n,gap:false}));
gaps.forEach(gp=>nodes.push({id:gp.id,kind:"gap",label:gp.question?"Missing evidence":(gp.category||"gap"),ref:gp,gap:true}));
const RN = {}; nodes.forEach(n=>RN[n.id]=n);

// build edges: real edges + synthesized gap links
let edges=[];
(G.edges||[]).forEach(e=>{
  if(RN[e.from]&&RN[e.to]) edges.push({id:e.id,a:e.from,b:e.to,rel:e.relation,
     level:e.assertion_level||"reconstructed",ref:e,gap:false});
});
gaps.forEach(gp=>{
  const bt=gp.between||[];
  if(bt.length===2 && RN[bt[0]] && RN[bt[1]]){
    edges.push({id:gp.id+"__in", a:bt[0], b:gp.id, rel:gp.category, level:"gap", ref:gp, gap:true});
    edges.push({id:gp.id+"__out",a:gp.id, b:bt[1], rel:gp.category, level:"gap", ref:gp, gap:true});
  }
});
const edgeById={}; edges.forEach(e=>edgeById[e.id]=e);

// degree (for sizing) + adjacency (for neighbor highlight)
const deg={}, adj={};
nodes.forEach(n=>{deg[n.id]=0;adj[n.id]=new Set();});
edges.forEach(e=>{deg[e.a]++;deg[e.b]++;adj[e.a].add(e.b);adj[e.b].add(e.a);});

// node -> its measurements
function measOf(n){ return (n.ref && n.ref.measurements) ? n.ref.measurements : []; }

// routes indexed by their terminal result and by nodes they traverse
const routesByResult={};
routes.forEach(r=>{ (routesByResult[r.result_id]=routesByResult[r.result_id]||[]).push(r); });
// map a route to the set of edge/gap ids & node ids it lights up
function routeElems(r){
  const nd=new Set(), eg=new Set();
  const path=r.path||[]; const pe=r.path_edge_ids||[];
  path.forEach(id=>{ if(RN[id]) nd.add(id); });
  for(let i=0;i<path.length-1;i++){
    const a=path[i], b=path[i+1], eid=pe[i];
    if(eid && edgeById[eid]){ eg.add(eid); }
    else {
      // gap-adjacent hop: light the synthesized gap links between a and b if a gap sits there
      const gp = RN[a]&&RN[a].gap?a : (RN[b]&&RN[b].gap?b:null);
      if(gp){ eg.add(gp+"__in"); eg.add(gp+"__out"); nd.add(gp); }
      else { // find any real edge connecting a,b
        const hit=edges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)); if(hit) eg.add(hit.id);
      }
    }
  }
  return {nd,eg};
}

/* Union of every route feeding every result that supports this claim, plus the
   claim itself and the supports edges — the full data→conclusion chain, not
   just the claim's immediate neighbors. Falls back to the gap chain (source →
   gap → claim) for a claim the paper never actually backs with a result. */
function claimChainElems(claimId){
  const nd=new Set([claimId]), eg=new Set();
  edges.filter(e=>!e.gap && e.b===claimId && e.rel==="supports").forEach(e=>{
    eg.add(e.id); nd.add(e.a);
    const rts=routesByResult[e.a];
    if(rts) rts.forEach(r=>{ const re=routeElems(r); re.nd.forEach(id=>nd.add(id)); re.eg.forEach(id=>eg.add(id)); });
  });
  gaps.filter(gp=>gp.category==="unsupported_claim" && (gp.between||[])[1]===claimId).forEach(gp=>{
    nd.add(gp.id); eg.add(gp.id+"__in"); eg.add(gp.id+"__out");
    const bt=gp.between||[]; if(bt[0]) nd.add(bt[0]);
  });
  return {nd,eg};
}

/* ---------- layout: seeded init + COOLING force sim that FREEZES when settled ----------
   Nodes are static in the steady state. Forces scale with `alpha`; alpha decays to 0 and the
   layout freezes. Dragging a node reheats alpha, so neighbors follow (gravity-drag), then it
   re-settles and freezes again. No idle drift. */
let seed=20250728;
function rnd(){ seed=(seed*1664525+1013904319)>>>0; return seed/4294967296; }
const KANG={artifact:-3.0,procedure:-1.5,configuration:-0.5,result:1.5,claim:3.0,gap:0.2};
nodes.forEach((n,i)=>{
  const a=rnd()*Math.PI*2, rad=150+rnd()*380;
  n.x=Math.cos(a)*rad + (KANG[n.kind]||0)*95;   // bias flow left→right by kind
  n.y=Math.sin(a)*rad*0.82;
  n.vx=0;n.vy=0; n.fixx=null; n.fixy=null;       // fixx!=null => pinned to cursor while dragging
  n.r=(KIND[n.kind]||KIND.result).r + Math.min(7, deg[n.id]*0.5);
});
// ▼▼ SPREAD KNOBS — tune these to space nodes out / pack them in ▼▼
//   CHARGE   node-to-node repulsion. HIGHER = more spread (main knob).   4200 tight → 16000 very airy
//   LINK_LEN spring rest length (edge length). HIGHER = longer edges.
//   GRAV     pull toward centre. LOWER = looser (nodes can wander out further).
//   GAP_LEN  rest length of the dotted gap links (keep ≈ LINK_LEN*0.7).
const CHARGE=12000, LINK_LEN=130, LINK_K=0.06, GRAV=0.018, VEL_DECAY=0.6, GAP_LEN=90;
let alpha=0, alphaTarget=0; const ALPHA_MIN=0.0018, ALPHA_DECAY=0.05;
function reheat(v){ alpha=Math.max(alpha,v); alphaTarget=v; }   // called on drag
function tick(){
  alpha += (alphaTarget-alpha)*ALPHA_DECAY;
  if(alpha<ALPHA_MIN){ if(alphaTarget===0){alpha=0;return false;} }
  // repulsion (O(n^2), fine at this scale), scaled by alpha
  for(let i=0;i<nodes.length;i++){ const p=nodes[i];
    for(let j=i+1;j<nodes.length;j++){ const q=nodes[j];
      let dx=q.x-p.x, dy=q.y-p.y, d2=dx*dx+dy*dy;
      if(d2<0.01){dx=(rnd()-.5)*0.1;dy=(rnd()-.5)*0.1;d2=dx*dx+dy*dy+0.01;}
      const d=Math.sqrt(d2); const f=CHARGE*alpha/d2; const ux=dx/d,uy=dy/d;
      p.vx-=ux*f; p.vy-=uy*f; q.vx+=ux*f; q.vy+=uy*f;
    }
  }
  // springs, scaled by alpha
  edges.forEach(e=>{ const p=RN[e.a], q=RN[e.b];
    let dx=q.x-p.x, dy=q.y-p.y; let d=Math.sqrt(dx*dx+dy*dy)||0.01;
    const L=e.gap?GAP_LEN:LINK_LEN; const f=(d-L)*LINK_K*alpha; const ux=dx/d,uy=dy/d;
    p.vx+=ux*f; p.vy+=uy*f; q.vx-=ux*f; q.vy-=uy*f;
  });
  // gentle centering + integrate (pinned nodes are held at cursor)
  nodes.forEach(n=>{
    if(n.fixx!==null){ n.x=n.fixx; n.y=n.fixy; n.vx=0; n.vy=0; return; }
    n.vx += -n.x*GRAV*alpha; n.vy += -n.y*GRAV*alpha;
    n.vx*=VEL_DECAY; n.vy*=VEL_DECAY;
    n.x+=n.vx; n.y+=n.vy;
  });
  return true;
}

/* ---------- canvas / camera ---------- */
const cv=document.getElementById("pg-canvas"), ctx=cv.getContext("2d");
// Canvas text/lines only get single-sample AA, so on a standard (non-Retina)
// display where devicePixelRatio is 1, they read visibly softer than the
// browser-rendered DOM text next to them. Floor the backing-store multiplier
// at 2x regardless of the real devicePixelRatio -- free supersampling that
// makes canvas-drawn text match the sidebar's crispness on any monitor.
function pickDPR(){ return Math.min(Math.max(window.devicePixelRatio||1,2),3); }
let DPR=pickDPR();
let cam={x:0,y:0,z:0.9};
function resize(){ DPR=pickDPR();
  cv.width=innerWidth*DPR; cv.height=innerHeight*DPR; cv.style.width=innerWidth+"px"; cv.style.height=innerHeight+"px"; }
addEventListener("resize",resize); resize();
function toScreen(x,y){ return [ (x-cam.x)*cam.z + innerWidth/2, (y-cam.y)*cam.z + innerHeight/2 ]; }
function toWorld(sx,sy){ return [ (sx-innerWidth/2)/cam.z + cam.x, (sy-innerHeight/2)/cam.z + cam.y ]; }

/* ---------- selection / focus state ---------- */
let hoverNode=null, selNode=null, selEdge=null, activeGroup=null, activeRoute=null, activeClaim=null;
let hi = null;   // {nd:Set, eg:Set} of highlighted ids (route or neighbor focus); null = all lit
let kindOff = new Set();
let searchHit = new Set();

function computeHighlight(){
  if(activeRoute){ hi=routeElems(activeRoute); return; }
  if(activeClaim){ hi=claimChainElems(activeClaim); return; }
  if(selNode){
    const nd=new Set([selNode.id]), eg=new Set();
    edges.forEach(e=>{ if(e.a===selNode.id||e.b===selNode.id){eg.add(e.id);nd.add(e.a);nd.add(e.b);} });
    hi={nd,eg}; return;
  }
  if(activeGroup){
    // members + the group's headline (core) claims
    const mem=new Set([...(activeGroup.member_node_ids||[]), ...(activeGroup.headline_claim_ids||[])]);
    const nd=new Set(mem), eg=new Set();
    edges.forEach(e=>{ if(mem.has(e.a)&&mem.has(e.b)){eg.add(e.id);} });
    hi={nd,eg,soft:true}; return;
  }
  hi=null;
}
function litNode(n){ if(kindOff.has(n.kind)) return false; if(!hi) return true; return hi.nd.has(n.id); }
function litEdge(e){ if(!hi) return true; return hi.eg.has(e.id); }

/* ---------- draw ---------- */
function relLabel(e){ return e.rel||""; }
function draw(){
  const P=pal();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,innerWidth,innerHeight);
  ctx.save();
  // edges
  ctx.lineCap="round";
  edges.forEach(e=>{
    const p=RN[e.a], q=RN[e.b]; if(!p||!q)return;
    const [x1,y1]=toScreen(p.x,p.y),[x2,y2]=toScreen(q.x,q.y);
    const lit=litEdge(e) && !kindOff.has(RN[e.a].kind) && !kindOff.has(RN[e.b].kind);
    const onSel = selEdge===e;
    let col, w, dash;
    if(e.gap){ col=P.gap; w=1.5; dash=[1.5,5]; }
    else if(e.level==="explicit"){ col=P.edgeExplicit; w=1.4; dash=[]; }
    else { col=P.edgeReconstructed; w=1.2; dash=[5,5]; }
    ctx.globalAlpha = lit ? (e.gap?0.95:0.7) : 0.06;
    if(onSel){col=P.accent;w=2.4;ctx.globalAlpha=1;}
    else if(hi&&lit&&!hi.soft){col=e.gap?P.gapFocus:P.edgeFocus;w+=0.5;}
    ctx.strokeStyle=col; ctx.lineWidth=w; ctx.setLineDash(dash);
    // slight curve
    const mx=(x1+x2)/2, my=(y1+y2)/2, dx=x2-x1, dy=y2-y1;
    const cx=mx-dy*0.08, cy=my+dx*0.08;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo(cx,cy,x2,y2); ctx.stroke();
    // arrowhead (direction) — larger, and enlarges further when the edge is focused
    if(cam.z>0.3){
      // tangent of the quadratic at the end (points into the target) for accurate aim
      const tx=x2-cx, ty=y2-cy; const ang=Math.atan2(ty,tx); const r=(q.r*cam.z)+4;
      const ax=x2-Math.cos(ang)*r, ay=y2-Math.sin(ang)*r;
      const focus = onSel || (hi && lit && !hi.soft);
      const s = focus ? 9 : 7;                  // ← arrowhead size
      ctx.setLineDash([]); ctx.globalAlpha = lit ? 0.92 : 0.06; ctx.fillStyle=col;
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(ang)*s*0.55, ay + Math.sin(ang)*s*0.55);   // tip
      ctx.lineTo(ax - Math.cos(ang-0.44)*s, ay - Math.sin(ang-0.44)*s);
      ctx.lineTo(ax - Math.cos(ang+0.44)*s, ay - Math.sin(ang+0.44)*s);
      ctx.closePath(); ctx.fill();
    }
  });
  ctx.setLineDash([]);

  /* ---- flow-pulse: ONE dot per highlighted edge, edge-colored, drawn BELOW the nodes.
     Duty cycle = travel then pause, so density stays low. NOT gated by reduced-motion. */
  if(hi && !hi.soft){
    const CYCLE=2600, TRAVEL=1500;      // ms: one dot travels for TRAVEL, then rests (CYCLE-TRAVEL)
    let pidx=0;
    edges.forEach(e=>{
      if(e.gap || !litEdge(e)) return;
      if(kindOff.has(RN[e.a].kind) || kindOff.has(RN[e.b].kind)) return;
      const tt=(tms + (pidx++)*640) % CYCLE;   // stagger each edge so they don't fire in unison
      if(tt>=TRAVEL) return;                    // resting → nothing drawn (lower density)
      const ph=tt/TRAVEL, it=1-ph;              // 0→1 = a→b (provenance direction)
      const p=RN[e.a], q=RN[e.b];
      const [x1,y1]=toScreen(p.x,p.y), [x2,y2]=toScreen(q.x,q.y);
      const dx=x2-x1, dy=y2-y1, mx=(x1+x2)/2, my=(y1+y2)/2;
      const cx=mx-dy*0.08, cy=my+dx*0.08;       // same control point as the drawn edge
      const bx=it*it*x1 + 2*it*ph*cx + ph*ph*x2;
      const by=it*it*y1 + 2*it*ph*cy + ph*ph*y2;
      const col = (selEdge===e) ? P.accent     // matches the edge's drawn colour
                : e.gap ? P.gapFocus : P.edgeFocus;
      ctx.globalAlpha = 0.85 * Math.sin(ph*Math.PI);  // fade in/out at the ends
      ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.arc(bx,by,3.3,0,7); ctx.fill();
    });
    ctx.shadowBlur=0; ctx.globalAlpha=1;
  }

  // nodes
  const showLabels = cam.z>0.78;
  nodes.forEach(n=>{
    const [x,y]=toScreen(n.x,n.y); const k=KIND[n.kind]||KIND.result; const R=n.r*cam.z;
    const lit=litNode(n);
    const isSel = selNode===n;
    const isHover = hoverNode===n;
    const isSearch = searchHit.has(n.id);
    ctx.globalAlpha = lit ? 1 : 0.11;
    if(n.gap){
      // pulsing hollow ring
      const pulse = REDUCED?0:(0.5+0.5*Math.sin(tms/420));
      ctx.beginPath(); ctx.arc(x,y,R,0,7);
      ctx.fillStyle=`rgba(${P.gapRGB},0.10)`; ctx.fill();
      ctx.lineWidth=1.8; ctx.setLineDash([3,3]);
      ctx.strokeStyle=`rgba(${P.gapRGB},${lit?0.6+0.4*pulse:0.5})`; ctx.stroke();
      ctx.setLineDash([]);
      if(lit){ ctx.fillStyle=P.gapGlyph; ctx.font="700 "+(R*1.1)+"px ui-monospace,Menlo,monospace";
        ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("?",x,y+0.5); }
    } else {
      if((isSel||isHover||isSearch) && lit){
        ctx.shadowColor=k.c; ctx.shadowBlur=isSel?26:16;
      }
      ctx.beginPath(); ctx.arc(x,y,R,0,7);
      ctx.fillStyle=k.c; ctx.fill(); ctx.shadowBlur=0;
      if(isSel||isSearch){ ctx.lineWidth=2; ctx.strokeStyle=P.selRing; ctx.stroke(); }
      else { ctx.lineWidth=1; ctx.strokeStyle=P.nodeStroke; ctx.stroke(); }
      // headline (core) claim → outer halo ring so it reads as a headline contribution
      if(n.kind==="claim" && headlineClaims.has(n.id)){
        ctx.globalAlpha = lit?0.95:0.11; ctx.lineWidth=1.6; ctx.strokeStyle=k.c;
        ctx.beginPath(); ctx.arc(x,y,R+4,0,7); ctx.stroke();
      }
    }
    // labels
    if(lit && (showLabels || isHover || isSel || n.r>13 || (hi&&!hi.soft))){
      const t=n.label.length>34?n.label.slice(0,32)+"…":n.label;
      ctx.font=(isSel?"600 ":"500 ")+"12px ui-sans-serif,-apple-system,'Segoe UI',sans-serif";
      ctx.textAlign="center"; ctx.textBaseline="top";
      ctx.globalAlpha=lit?(isHover||isSel?1:0.82):0.11;
      ctx.lineWidth=3; ctx.strokeStyle=P.labelHalo; ctx.lineJoin="round";
      ctx.strokeText(t,x,y+R+4); ctx.fillStyle=n.gap?P.labelGapFill:P.labelFill; ctx.fillText(t,x,y+R+4);
    }
  });

  ctx.restore(); ctx.globalAlpha=1;
}

/* ---------- animation loop: steps physics only while alpha is warm, else just redraws ---------- */
let tms=0, raf;
function loop(t){
  tms=t||0;
  if(alpha>0 || alphaTarget>0) tick();      // frozen when alpha==0 → nodes are static
  draw();
  raf=requestAnimationFrame(loop);
}

/* ---------- hit testing ---------- */
function nodeAt(sx,sy){
  for(let i=nodes.length-1;i>=0;i--){ const n=nodes[i]; if(kindOff.has(n.kind))continue;
    const [x,y]=toScreen(n.x,n.y); const R=n.r*cam.z+4;
    if((sx-x)**2+(sy-y)**2<=R*R) return n; }
  return null;
}
function edgeAt(sx,sy){
  let best=null,bd=7;
  for(const e of edges){ const p=RN[e.a],q=RN[e.b]; if(!litEdge(e))continue;
    const [x1,y1]=toScreen(p.x,p.y),[x2,y2]=toScreen(q.x,q.y);
    const d=segDist(sx,sy,x1,y1,x2,y2); if(d<bd){bd=d;best=e;} }
  return best;
}
function segDist(px,py,x1,y1,x2,y2){ const dx=x2-x1,dy=y2-y1; const L=dx*dx+dy*dy||1;
  let t=((px-x1)*dx+(py-y1)*dy)/L; t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-(x1+dx*t),py-(y1+dy*t)); }

/* ---------- pointer interaction ---------- */
let dragNode=null, panning=false, last=null, moved=0, downPt=null;
cv.addEventListener("pointerdown",ev=>{
  const sx=ev.clientX,sy=ev.clientY; downPt=[sx,sy]; moved=0; last=[sx,sy];
  const n=nodeAt(sx,sy);
  if(n){ dragNode=n; n.fixx=n.x; n.fixy=n.y; reheat(0.32); cv.setPointerCapture(ev.pointerId); }
  else { panning=true; cv.classList.add("dragging"); }
});
cv.addEventListener("pointermove",ev=>{
  const sx=ev.clientX,sy=ev.clientY;
  if(dragNode){ const [wx,wy]=toWorld(sx,sy); dragNode.fixx=wx; dragNode.fixy=wy; dragNode.x=wx; dragNode.y=wy; reheat(0.32); moved+=Math.abs(sx-last[0])+Math.abs(sy-last[1]); last=[sx,sy]; return; }
  if(panning){ cam.x-=(sx-last[0])/cam.z; cam.y-=(sy-last[1])/cam.z; moved+=Math.abs(sx-last[0])+Math.abs(sy-last[1]); last=[sx,sy]; return; }
  // hover
  const n=nodeAt(sx,sy);
  hoverNode=n; cv.classList.toggle("overnode",!!n);
  const tip=document.getElementById("pg-tip");
  if(n){ const k=KIND[n.kind]||KIND.result;
    tip.innerHTML=`<span class="tk" style="color:${k.c}">${n.gap?"gap · "+(n.ref.category||""):n.kind}</span>${esc(n.label)}`;
    const [x,y]=toScreen(n.x,n.y); tip.style.left=x+"px"; tip.style.top=(y-n.r*cam.z)+"px"; tip.style.opacity=1;
  } else tip.style.opacity=0;
});
function endPtr(ev){
  if(dragNode){ try{cv.releasePointerCapture(ev.pointerId);}catch(e){}
    dragNode.fixx=null; dragNode.fixy=null; alphaTarget=0; }  // unpin → let it settle, then freeze
  dragNode=null; panning=false; cv.classList.remove("dragging");
  if(moved<5 && downPt){ // treat as click
    const sx=downPt[0],sy=downPt[1]; const n=nodeAt(sx,sy);
    if(n) selectNode(n);
    else { const e=edgeAt(sx,sy); if(e && !e.gap) selectEdge(e); else if(e&&e.gap) selectNode(RN[e.ref.id]); else clearSel(); }
  }
  downPt=null;
}
cv.addEventListener("pointerup",endPtr);
cv.addEventListener("pointercancel",endPtr);
cv.addEventListener("wheel",ev=>{ ev.preventDefault();
  const [wx,wy]=toWorld(ev.clientX,ev.clientY);
  const f=Math.exp(-ev.deltaY*0.0012); cam.z=Math.max(0.25,Math.min(3.2,cam.z*f));
  const [nx,ny]=toWorld(ev.clientX,ev.clientY); cam.x+=wx-nx; cam.y+=wy-ny;
},{passive:false});

/* ---------- selection actions ---------- */
function selectNode(n){
  selEdge=null; selNode=n; activeRoute=null; activeClaim=null;
  // if a result with route(s) -> activate route trace (Level 2)
  if(!n.gap && n.kind==="result" && routesByResult[n.id]){ activeRoute=routesByResult[n.id][0]; }
  // a claim -> trace the full chain(s) feeding it, same "Level 2" treatment as a result
  else if(!n.gap && n.kind==="claim"){ activeClaim=n.id; }
  activeGroup=null; syncGroupUI();
  computeHighlight(); renderInspector(); renderCrumb();
  focusOn(n);
}
function selectEdge(e){ selNode=null;activeRoute=null;activeClaim=null;activeGroup=null;syncGroupUI(); selEdge=e; hi=null; renderInspectorEdge(e); renderCrumb(); }
function clearSel(){ selNode=null;selEdge=null;activeRoute=null;activeClaim=null;activeGroup=null;syncGroupUI();hi=null;
  closeInspector(); renderCrumb(); }
function focusOn(n){ // ease camera toward node
  const tx=n.x, ty=n.y; const s=cam.z<0.8?1.05:cam.z;
  animCam(tx,ty,Math.min(s,1.4));
}
let camAnim=null;
function animCam(tx,ty,tz){ const s={x:cam.x,y:cam.y,z:cam.z}, t0=tms;
  camAnim={s,tx,ty,tz,t0}; }
(function camLoop(){ requestAnimationFrame(camLoop);
  if(!camAnim)return; const k=Math.min(1,(tms-camAnim.t0)/420); const e=1-Math.pow(1-k,3);
  cam.x=camAnim.s.x+(camAnim.tx-camAnim.s.x)*e; cam.y=camAnim.s.y+(camAnim.ty-camAnim.s.y)*e;
  cam.z=camAnim.s.z+(camAnim.tz-camAnim.s.z)*e; if(k>=1)camAnim=null; })();

/* ---------- inspector rendering ---------- */
const insp=document.getElementById("pg-insp");
function openInspector(){ insp.classList.add("open"); }
function closeInspector(){ insp.classList.remove("open"); }
function esc(s){ return (s==null?"":String(s)).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function evBlock(ids,recon){ ids=ids||[]; if(!ids.length)return "";
  return ids.map(id=>{ const e=evById[id]; if(!e)return "";
    return `<div class="ev${recon?" recon":""}"><div class="q"><span class="qm">“</span>${esc(e.quote)}<span class="qm">”</span></div>
      <div class="meta"><span class="pg">p.${esc(e.page)}</span><span>${esc(e.locator||"")}</span>
      <span>${esc((e.source_span_ids||[]).join(", "))}</span>${e.quote_fidelity?`<span>${esc(e.quote_fidelity)}</span>`:""}</div></div>`;
  }).join("");
}
function kindPill(kind,label){ const k=KIND[kind]||KIND.result;
  return `<span class="kindpill" style="color:${k.c}"><span class="d"></span>${esc(label||k.label)}</span>`; }

function renderClaimInspector(n,nd,head,body){
  const isHead = headlineClaims.has(n.id);
  const grpTitles = (claimGroups[n.id]||[]).map(gid=>groupById[gid]&&groupById[gid].title).filter(Boolean);
  head.innerHTML = kindPill("claim", "Claim"+(nd.claim_form?" · "+nd.claim_form:"")) +
    (isHead ? `<div class="hlbadge">★ Headline claim${grpTitles.length?` · ${esc(grpTitles[0])}`:""}</div>`
            : `<div class="subbadge">non-headline claim</div>`) +
    `<div class="ititle">${esc(nd.label||n.id)}</div>`;
  let h="";
  // Support: incoming supports-edges (result → claim), with their evidence + rationale
  const sup = edges.filter(e=>!e.gap && e.b===n.id && e.rel==="supports");
  const clmGaps = gaps.filter(gp=>gp.category==="unsupported_claim" && (gp.between||[])[1]===n.id);
  if(sup.length){
    h+=`<div class="sec"><div class="sh">Support <span class="n">${sup.length}</span></div>`;
    sup.forEach(e=>{ const src=RN[e.a];
      h+=`<div class="supitem"><div class="suphead"><span class="badge ${esc(e.level)}">${esc(e.level)}</span> from <b class="lnknode" data-node="${esc(e.a)}">${esc(src?src.label:e.a)}</b></div>`;
      if(e.ref.rationale) h+=`<div class="rationale">${esc(e.ref.rationale)}</div>`;
      h+= evBlock(e.ref.evidence_ids, e.level!=="explicit");
      h+=`</div>`;
    });
    h+=`</div>`;
  }
  if(clmGaps.length){
    clmGaps.forEach(gp=>{
      h+=`<div class="sec"><div class="sh" style="color:var(--k-gap)">Unsupported in paper</div>
        <div class="gapcard"><div class="lbl">no reported result backs this claim</div>
        <div class="q">${esc(gp.question||gp.missing_content||"")}</div>
        <div class="pill-row"><span class="p" data-node="${esc(gp.id)}">open gap ▸</span></div></div></div>`;
    });
  }
  // Stated in — where the paper asserts the claim (salience evidence = the "source")
  const sal = nd.salience_evidence_ids||[];
  if(sal.length) h+=`<div class="sec"><div class="sh">Stated in (paper) <span class="n">${sal.length}</span></div>${evBlock(sal)}</div>`;
  else if(!sup.length && !clmGaps.length) h+=`<div class="sec"><div style="color:var(--ink-faint);font-size:12px">No source evidence recorded for this claim.</div></div>`;
  // Connections
  const nb=[...adj[n.id]].filter(id=>RN[id]);
  if(nb.length){ h+=`<div class="sec"><div class="sh">Connections <span class="n">${nb.length}</span></div><div class="pill-row">`+
    nb.slice(0,24).map(id=>`<span class="p" data-node="${esc(id)}">${esc((RN[id].label||id).slice(0,28))}</span>`).join("")+`</div></div>`; }
  body.innerHTML=h; wireInspector(body);
}

function renderInspector(){
  const n=selNode; if(!n){closeInspector();return;}
  openInspector();
  const head=document.getElementById("pg-ihead-inner"), body=document.getElementById("pg-ibody");
  if(n.gap){ renderGapInspector(n); return; }
  const nd=n.ref;
  if(n.kind==="claim"){ renderClaimInspector(n,nd,head,body); return; }
  head.innerHTML = kindPill(n.kind) +
    `<div class="ititle">${esc(nd.label||n.id)}</div>` +
    (nd.paper_locator?`<div class="iloc">${esc(nd.paper_locator)}${nd.system_or_condition?" · "+esc(nd.system_or_condition):""}</div>`:
      `<div class="iloc">${esc(n.id)}</div>`);
  let h="";
  // route trace for results
  const rts=routesByResult[n.id];
  if(rts && rts.length){
    const r=activeRoute&&rts.includes(activeRoute)?activeRoute:rts[0];
    h+=`<div class="sec"><div class="sh">Provenance route ${rts.length>1?`<span class="n">1/${rts.length}</span>`:""}</div>`;
    h+=renderChain(r);
    if(rts.length>1){ h+=`<div class="pill-row">`+rts.map((rr,i)=>`<span class="p" data-route="${i}" data-res="${esc(n.id)}">route ${i+1}</span>`).join("")+`</div>`; }
    h+=`</div>`;
  }
  // measurements
  const ms=measOf(n);
  if(ms.length){
    h+=`<div class="sec"><div class="sh">Measurements <span class="n">${ms.length}</span></div>
      <table class="meas"><thead><tr><th>Metric</th><th>Value</th><th></th></tr></thead><tbody>`;
    ms.forEach(m=>{ h+=`<tr><td>${esc(m.metric)}${m.qualifier?`<div style="color:var(--ink-faint);font-size:10.5px;margin-top:2px">${esc(m.qualifier)}</div>`:""}</td>
      <td class="val">${esc(m.raw_text!=null?m.raw_text:m.numeric_value)}${m.unit?` <span class="u">${esc(m.unit)}</span>`:""}${m.uncertainty?` <span class="u">±${esc(m.uncertainty)}</span>`:""}</td>
      <td><span class="avail ${esc(m.availability)}">${esc(m.availability)}</span></td></tr>`; });
    h+=`</tbody></table></div>`;
  }
  // evidence
  const ev=evBlock(nd.evidence_ids);
  if(ev) h+=`<div class="sec"><div class="sh">Evidence <span class="n">${(nd.evidence_ids||[]).length}</span></div>${ev}</div>`;
  // neighbors
  const nb=[...adj[n.id]].filter(id=>RN[id]);
  if(nb.length){ h+=`<div class="sec"><div class="sh">Connections <span class="n">${nb.length}</span></div><div class="pill-row">`+
    nb.slice(0,24).map(id=>`<span class="p" data-node="${esc(id)}">${esc((RN[id].label||id).slice(0,28))}</span>`).join("")+`</div></div>`; }
  body.innerHTML=h; wireInspector(body);
}
function renderChain(r){
  const path=r.path||[]; const pe=r.path_edge_ids||[];
  let h=`<div class="chain">`;
  path.forEach((id,i)=>{ const nn=RN[id]; if(!nn)return;
    const k=KIND[nn.kind]||KIND.result; const isGap=nn.gap;
    const nextGap = i<path.length-1 && (RN[path[i+1]]&&RN[path[i+1]].gap);
    const gapln = isGap||nextGap||(i<path.length-1&&!pe[i]);
    h+=`<div class="hop${isGap?" gap":""}"><div class="rail"><span class="nd" style="color:${k.c}"></span><span class="ln${gapln?" gapln":""}"></span></div>
      <div class="cnt"><div class="cl">${esc(isGap?(nn.ref.question?"Missing: "+shortGap(nn.ref):nn.label):nn.label)}</div>
      <div class="ck">${esc(isGap?"gap · "+(nn.ref.category||""):nn.kind)}</div></div></div>`;
  });
  h+=`</div>`;
  return h;
}
function shortGap(g){ return (g.missing_content||g.question||"").slice(0,80); }

function renderGapInspector(n){
  const g=n.ref; const head=document.getElementById("pg-ihead-inner"), body=document.getElementById("pg-ibody");
  head.innerHTML = kindPill("gap","Evidence gap") +
    `<div class="ititle">${esc(g.category||"missing evidence")}</div>` +
    `<div class="iloc">${esc((g.between||[]).map(id=>RN[id]?RN[id].label:id).join("  ⟶  "))}</div>`;
  let h=`<div class="sec"><div class="gapcard"><div class="lbl">Open question</div>
    <div class="q">${esc(g.question||g.missing_content||"")}</div>`;
  if(g.missing_content && g.question) h+=`<div style="margin-top:10px;font-size:12px;color:var(--ink-dim)">${esc(g.missing_content)}</div>`;
  if(g.expected_kind) h+=`<div class="searched"><b>expected:</b> ${esc(g.expected_kind)}</div>`;
  if(g.searched_locations&&g.searched_locations.length)
    h+=`<div class="searched"><b>searched:</b> ${esc(g.searched_locations.join(" · "))}</div>`;
  h+=`</div></div>`;
  if(g.affects&&g.affects.length){
    h+=`<div class="sec"><div class="sh">Affects <span class="n">${g.affects.length} routes</span></div>
      <div style="font-size:12px;color:var(--ink-dim);line-height:1.5">This missing link breaks the provenance chain for ${g.affects.length} result${g.affects.length>1?"s":""} — those routes cannot be fully drawn from the paper alone.</div></div>`;
  }
  body.innerHTML=h; wireInspector(body);
}
function renderInspectorEdge(e){
  openInspector();
  const head=document.getElementById("pg-ihead-inner"), body=document.getElementById("pg-ibody");
  const p=RN[e.a],q=RN[e.b];
  head.innerHTML = `<span class="kindpill" style="color:${e.level==="explicit"?pal().pillExplicit:pal().pillRecon}"><span class="d"></span>${esc(e.rel)} · ${esc(e.level)}</span>
    <div class="ititle">${esc(p.label)} <span style="color:var(--ink-faint)">→</span> ${esc(q.label)}</div>`;
  let h="";
  if(e.ref.rationale) h+=`<div class="sec"><div class="sh">Why this link</div><div class="rationale">${esc(e.ref.rationale)}</div></div>`;
  const ev=evBlock(e.ref.evidence_ids, e.level!=="explicit");
  if(ev) h+=`<div class="sec"><div class="sh">Evidence <span class="n">${(e.ref.evidence_ids||[]).length}</span></div>${ev}</div>`;
  if(e.level!=="explicit") h+=`<div class="sec"><div style="font-size:11.5px;color:var(--ink-faint);line-height:1.5">Reconstructed — inferred from the paper's structure, not stated verbatim.</div></div>`;
  body.innerHTML=h; wireInspector(body);
}
function wireInspector(body){
  body.querySelectorAll("[data-node]").forEach(el=>el.addEventListener("click",()=>{ const n=RN[el.getAttribute("data-node")]; if(n)selectNode(n); }));
  body.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{
    const res=el.getAttribute("data-res"), i=+el.getAttribute("data-route");
    activeRoute=routesByResult[res][i]; computeHighlight(); renderInspector(); renderCrumb(); }));
}

/* ---------- crumb ---------- */
function renderCrumb(){
  const c=document.getElementById("pg-crumb");
  if(activeRoute){ const res=nodeById[activeRoute.result_id];
    c.style.display="flex"; c.innerHTML=`<span class="lvl">route</span><span>${esc(res?res.label:activeRoute.result_id)}</span><span class="x">✕</span>`;
    c.querySelector(".x").onclick=clearSel; return; }
  if(activeClaim){ const n=nodeById[activeClaim];
    c.style.display="flex"; c.innerHTML=`<span class="lvl">chain</span><span>${esc(n?n.label:activeClaim)}</span><span class="x">✕</span>`;
    c.querySelector(".x").onclick=clearSel; return; }
  if(activeGroup){ c.style.display="flex"; c.innerHTML=`<span class="lvl">group</span><span>${esc(activeGroup.title)}</span><span class="x">✕</span>`;
    c.querySelector(".x").onclick=()=>{activeGroup=null;syncGroupUI();computeHighlight();renderCrumb();}; return; }
  if(selNode){ c.style.display="flex"; c.innerHTML=`<span class="lvl">${esc(selNode.gap?"gap":selNode.kind)}</span><span>${esc(selNode.label)}</span><span class="x">✕</span>`;
    c.querySelector(".x").onclick=clearSel; return; }
  c.style.display="none";
}

/* ---------- left rail UI ---------- */
function buildLegend(){
  const el=document.getElementById("pg-legend"); const cnt={};
  nodes.forEach(n=>cnt[n.kind]=(cnt[n.kind]||0)+1);
  const present=KIND_ORDER.filter(k=>cnt[k]);
  el.innerHTML=present.map(k=>{
    const m=KIND[k]; const gap=k==="gap";
    return `<div class="leg${gap?" gaprow":""}" data-kind="${k}">
      <span class="dot" style="${gap?"":`background:${m.c};color:${m.c}`}"></span>
      <span class="nm">${m.label}</span><span class="ct">${cnt[k]}</span></div>`;
  }).join("");
  el.querySelectorAll(".leg").forEach(row=>row.addEventListener("click",()=>{
    const k=row.getAttribute("data-kind");
    if(kindOff.has(k))kindOff.delete(k); else kindOff.add(k);
    row.classList.toggle("off",kindOff.has(k)); computeHighlight();
  }));
  function setAll(off){
    present.forEach(k=>{ if(off) kindOff.add(k); else kindOff.delete(k); });
    el.querySelectorAll(".leg").forEach(row=>row.classList.toggle("off",off));
    computeHighlight();
  }
  document.getElementById("pg-legend-all").onclick=()=>setAll(false);
  document.getElementById("pg-legend-none").onclick=()=>setAll(true);
}
function buildGroups(){
  const el=document.getElementById("pg-groups");
  el.innerHTML=groups.map((g,i)=>{
    const cnt={}; (g.member_node_ids||[]).forEach(id=>{ const n=nodeById[id]; if(n)cnt[n.kind]=(cnt[n.kind]||0)+1; });
    let tags=KIND_ORDER.filter(k=>cnt[k]).map(k=>`<span class="tag" style="color:${KIND[k].c}">${cnt[k]} ${k.slice(0,4)}</span>`).join("");
    const hc=(g.headline_claim_ids||[]).length;    // headline claims are attached, not members
    if(hc) tags+=`<span class="tag hl" style="color:var(--k-claim)">★ ${hc} claim</span>`;
    return `<div class="g" data-g="${i}"><div class="t">${esc(g.title)}</div><div class="m">${tags}</div></div>`;
  }).join("");
  el.querySelectorAll(".g").forEach(row=>row.addEventListener("click",()=>{
    const g=groups[+row.getAttribute("data-g")];
    if(activeGroup===g){ activeGroup=null; } else { activeGroup=g; selNode=null;selEdge=null;activeRoute=null;activeClaim=null; }
    syncGroupUI(); computeHighlight(); renderCrumb();
    if(activeGroup){ closeInspector(); fitGroup(activeGroup); }
  }));
}
function syncGroupUI(){ document.querySelectorAll("#pg-groups .g").forEach((row,i)=>row.classList.toggle("active",groups[i]===activeGroup)); }
function fitGroup(g){
  const mem=[...(g.member_node_ids||[]), ...(g.headline_claim_ids||[])].map(id=>RN[id]).filter(Boolean); if(!mem.length)return;
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  mem.forEach(n=>{minx=Math.min(minx,n.x);miny=Math.min(miny,n.y);maxx=Math.max(maxx,n.x);maxy=Math.max(maxy,n.y);});
  const cx=(minx+maxx)/2, cy=(miny+maxy)/2; const w=maxx-minx+160, h=maxy-miny+160;
  const z=Math.max(0.3,Math.min(1.6, Math.min(innerWidth/w, innerHeight/h)));
  animCam(cx,cy,z);
}
function buildStats(){
  const el=document.getElementById("pg-stats");
  const nc=rawNodes.length, ec=(G.edges||[]).length, rc=routes.length, gc=gaps.length;
  el.innerHTML=[["nodes",nc],["edges",ec],["routes",rc]].map(([l,v])=>
    `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")+
    `<div class="stat gap"><div class="v">${gc}</div><div class="l">gaps</div></div>`;
}

/* ---------- search ---------- */
document.getElementById("pg-search").addEventListener("input",ev=>{
  const q=ev.target.value.trim().toLowerCase(); searchHit=new Set();
  if(q){ nodes.forEach(n=>{ if((n.label||"").toLowerCase().includes(q)||n.id.toLowerCase().includes(q)) searchHit.add(n.id); }); }
});

/* ---------- controls ---------- */
document.getElementById("pg-close").addEventListener("click",clearSel);
document.getElementById("pg-zin").addEventListener("click",()=>{cam.z=Math.min(3.2,cam.z*1.25);});
document.getElementById("pg-zout").addEventListener("click",()=>{cam.z=Math.max(0.25,cam.z/1.25);});
document.getElementById("pg-zfit").addEventListener("click",()=>{ activeGroup=null;syncGroupUI(); fitAll(); });
addEventListener("keydown",ev=>{ if(ev.key==="Escape")clearSel(); });
function fitAll(){ let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  nodes.forEach(n=>{minx=Math.min(minx,n.x);miny=Math.min(miny,n.y);maxx=Math.max(maxx,n.x);maxy=Math.max(maxy,n.y);});
  const cx=(minx+maxx)/2,cy=(miny+maxy)/2,w=maxx-minx+200,h=maxy-miny+200;
  animCam(cx,cy,Math.max(0.3,Math.min(1.2,Math.min(innerWidth/w,innerHeight/h))));
}

/* ---------- boot ---------- */
document.getElementById("pg-paper").textContent = (G.paper&&G.paper.title)||"";
buildLegend(); buildGroups(); buildStats();
// anneal the layout offline so the first paint is already settled, then FREEZE (alpha=0 → static)
alpha=0.9;
for(let i=0;i<600;i++){ alphaTarget = (i<460)?0.10:0; tick(); }
alpha=0; alphaTarget=0;
fitAll();
requestAnimationFrame(loop);
  }
})();
