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
  gap:           {c:"#ff5c6c", r:9,  label:"Gap"},
  result_group:  {c:"#66b8a8", r:14, label:"Result group"}
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
const resultScans = G.result_region_scan||[];
const routes = G.provenance_routes||[];
const routesById = {};    routes.forEach(r=>routesById[r.id]=r);
// headline (core) claims are declared on the contribution groups
const groupById={}; groups.forEach(gr=>groupById[gr.id]=gr);
const headlineClaims=new Set(); const claimGroups={};
groups.forEach(gr=>(gr.headline_claim_ids||[]).forEach(cid=>{
  headlineClaims.add(cid); (claimGroups[cid]=claimGroups[cid]||[]).push(gr.id); }));

/* A 0.3 Reading Map is a reference-only reader layer. Keep it separate from
   the graph indexes: it may order and annotate existing ids, but it never
   becomes a graph node or an edge. */
function buildNativeReadingMap(){
  if(G.format_version!=="paper-evidence-graph/0.3")return null;
  const map=G.reading_map;
  if(!map||typeof map!=="object"||Array.isArray(map))return null;
  const entries=Array.isArray(map.contributions)?map.contributions:[];
  const byGroupId={}; entries.forEach(entry=>{
    if(entry&&typeof entry==="object"&&typeof entry.group_id==="string")byGroupId[entry.group_id]=entry;
  });
  const guideByClaimId={};
  (Array.isArray(map.claim_guides)?map.claim_guides:[]).forEach(guide=>{
    if(guide&&typeof guide==="object"&&typeof guide.claim_id==="string")guideByClaimId[guide.claim_id]=guide;
  });
  const contributionOrder=(Array.isArray(map.contribution_order)?map.contribution_order:[])
    .filter(id=>byGroupId[id]&&groupById[id]);
  if(!contributionOrder.length)return null;
  return {map,contributionOrder,contributionByGroupId:byGroupId,guideByClaimId};
}
const nativeReadingMap=buildNativeReadingMap();
function hasNativeReadingMap(){ return !!nativeReadingMap; }

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
  } else {
    // No usable two-ended `between` -- fall back to one dotted annotation edge
    // per `affects` entry (a node directly, or a route's terminal Result as
    // its visual stand-in), so a result-affecting Gap isn't left as a fully
    // disconnected island with nothing on the canvas showing what it affects.
    const seen=new Set(); let i=0;
    (gp.affects||[]).forEach(aff=>{
      const target = RN[aff] ? aff : (routesById[aff] ? routesById[aff].result_id : null);
      if(target && RN[target] && !seen.has(target)){
        seen.add(target);
        edges.push({id:gp.id+"__aff"+(i++), a:gp.id, b:target, rel:"affects", level:"gap", ref:gp, gap:true, annotation:true});
      }
    });
  }
});

/* Compact is a lossless Viewer projection over the exact graph. It groups
   Results only by their exact, non-empty paper_locator and bundles incident
   relationships without changing graph.json. */
function buildCompactResultProjection(nodeList,edgeList){
  const byLocator=new Map(),exactResultIds=new Set(),groupByMemberId={};
  nodeList.forEach(n=>{
    if(!n||n.kind!=="result")return;
    const locator=typeof n.paper_locator==="string"?n.paper_locator:"";
    if(!locator.trim()){exactResultIds.add(n.id);return;}
    if(!byLocator.has(locator))byLocator.set(locator,[]);
    byLocator.get(locator).push(n.id);
  });
  const groups=[];
  byLocator.forEach((memberIds,locator)=>{
    if(memberIds.length<2){memberIds.forEach(id=>exactResultIds.add(id));return;}
    const id="__pg_result_group_"+groups.length;
    const group={id,locator,memberIds:memberIds.slice(),resultCount:memberIds.length};
    groups.push(group);memberIds.forEach(memberId=>groupByMemberId[memberId]=id);
  });
  const bundled=new Map();
  edgeList.forEach(edge=>{
    const groupA=groupByMemberId[edge.a],groupB=groupByMemberId[edge.b];
    if(!groupA&&!groupB)return;
    const a=groupA||edge.a,b=groupB||edge.b;
    const key=[a,b,edge.rel||"",edge.gap?"gap":"edge"].join("\u0000");
    if(!bundled.has(key)){
      bundled.set(key,{id:"__pg_summary_edge_"+bundled.size,a,b,rel:edge.rel,
        level:edge.level==="explicit"?"explicit":edge.level||"reconstructed",
        gap:!!edge.gap,virtualType:"result_summary",constituentEdgeIds:[],constituentEdges:[]});
    }
    const summary=bundled.get(key);
    summary.constituentEdgeIds.push(edge.id);summary.constituentEdges.push(edge);
    if(edge.level!=="explicit")summary.level=edge.level==="gap"?"gap":"reconstructed";
  });
  return {groups,groupByMemberId,exactResultIds,summaryEdges:[...bundled.values()]};
}

const exactEdges=edges.slice();
const compactProjection=buildCompactResultProjection(rawNodes,exactEdges);
compactProjection.groups.forEach(group=>{
  const n={id:group.id,kind:"result_group",label:group.locator,ref:group,gap:false,
    virtualType:"result_group",resultIds:group.memberIds,resultCount:group.resultCount};
  nodes.push(n);RN[n.id]=n;
});
edges=exactEdges.concat(compactProjection.summaryEdges);
const edgeById={}; exactEdges.forEach(e=>edgeById[e.id]=e);

function buildTopology(nodeList,edgeList){
  const degree={},adjacency={};
  nodeList.forEach(n=>{degree[n.id]=0;adjacency[n.id]=new Set();});
  edgeList.forEach(e=>{
    if(!(e.a in adjacency)||!(e.b in adjacency))return;
    degree[e.a]++;degree[e.b]++;
    adjacency[e.a].add(e.b);adjacency[e.b].add(e.a);
  });
  return {degree,adjacency};
}
const compactExactEdges=exactEdges.filter(e=>
  !compactProjection.groupByMemberId[e.a]&&!compactProjection.groupByMemberId[e.b]);
const compactTopology=buildTopology(nodes,compactExactEdges.concat(compactProjection.summaryEdges));
const exactTopology=buildTopology(nodes,exactEdges);
const deg=exactTopology.degree, exactAdj=exactTopology.adjacency;
function inspectorAdjacency(){ return exactAdj; }

// node -> its measurements
function measOf(n){ return (n.ref && n.ref.measurements) ? n.ref.measurements : []; }

// routes indexed by their terminal result and by nodes they traverse
const routesByResult={};
routes.forEach(r=>{ (routesByResult[r.result_id]=routesByResult[r.result_id]||[]).push(r); });
const claimContextById={};
headlineClaims.forEach(cid=>{
  const ids=claimContextById[cid]=new Set();
  (G.edges||[]).filter(e=>e.relation==="supports"&&e.to===cid).forEach(e=>{
    (routesByResult[e.from]||[]).forEach(r=>(r.path||[]).forEach(id=>{
      const n=nodeById[id];
      if(n&&["artifact","procedure","configuration"].includes(n.kind))ids.add(id);
    }));
  });
});
// map a route to the set of edge/gap ids & node ids it lights up
function routeElems(r){
  const nd=new Set(), eg=new Set();
  const path=r.path||[]; const pe=r.path_edge_ids||[];
  path.forEach(id=>{ if(RN[id]) nd.add(id); });
  [
    ...(r.subject_procedure_ids||[]),
    ...(r.subject_output_id?[r.subject_output_id]:[]),
    ...(r.additional_input_ids||[]),
    ...(r.configuration_ids||[]),
    ...((r.subject_variant&&r.subject_variant.distinguishing_configuration_ids)||[]),
    ...(r.gap_ids||[])
  ].forEach(id=>{if(RN[id])nd.add(id);});
  (r.branch_edge_ids||[]).forEach(id=>{
    const edge=edgeById[id];if(!edge)return;
    eg.add(id);nd.add(edge.a);nd.add(edge.b);
  });
  (r.gap_ids||[]).forEach(id=>{
    exactEdges.filter(e=>e.gap&&(e.a===id||e.b===id)).forEach(e=>{
      eg.add(e.id);nd.add(e.a);nd.add(e.b);
    });
  });
  for(let i=0;i<path.length-1;i++){
    const a=path[i], b=path[i+1], eid=pe[i];
    if(eid && edgeById[eid]){ eg.add(eid); }
    else {
      // gap-adjacent hop: light the synthesized gap links between a and b if a gap sits there
      const gp = RN[a]&&RN[a].gap?a : (RN[b]&&RN[b].gap?b:null);
      if(gp){ eg.add(gp+"__in"); eg.add(gp+"__out"); nd.add(gp); }
      else { // find any real edge connecting a,b
        const hit=exactEdges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)); if(hit) eg.add(hit.id);
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
  const chain=buildClaimChain(claimId);
  return {nd:chain.nodeIds,eg:chain.edgeIds};
}
function buildClaimChain(claimId){
  const nd=new Set([claimId]), eg=new Set();
  const resultIds=new Set(),gapIds=new Set();
  exactEdges.filter(e=>!e.gap && e.b===claimId && e.rel==="supports").forEach(e=>{
    eg.add(e.id); nd.add(e.a);resultIds.add(e.a);
    const rts=routesByResult[e.a];
    if(rts) rts.forEach(r=>{ const re=routeElems(r); re.nd.forEach(id=>nd.add(id)); re.eg.forEach(id=>eg.add(id)); });
  });
  gaps.filter(gp=>gp.category==="unsupported_claim" && (gp.affects||[]).includes(claimId)).forEach(gp=>{
    nd.add(gp.id);gapIds.add(gp.id);
    exactEdges.filter(e=>e.gap&&(e.a===gp.id||e.b===gp.id)).forEach(e=>{
      eg.add(e.id); nd.add(e.a); nd.add(e.b);
    });
  });
  const aggregateIds=new Set();
  resultIds.forEach(id=>{
    const groupId=compactProjection.groupByMemberId[id];if(groupId)aggregateIds.add(groupId);
  });
  return {claimId,nodeIds:nd,edgeIds:eg,resultIds,gapIds,aggregateIds};
}

/* ---------- layout: deterministic evidence flow + bounded cooling relaxation ----------
   Home positions are an interpretation of existing graph facts, never new graph
   structure. The short force pass only resolves local pressure around those homes;
   it may not turn the reading map back into a free-force drawing. */
let viewMode="compact";
const manualExpandedResultGroups=new Set(), claimExpandedResultGroups=new Set();
function effectiveExpandedResultGroups(){
  return new Set([...manualExpandedResultGroups,...claimExpandedResultGroups]);
}
function resultGroupExpanded(id){
  return manualExpandedResultGroups.has(id)||claimExpandedResultGroups.has(id);
}
const RAIL_WIDTH_KEY="papergraph-rail-width";
const RAIL_COLLAPSED_KEY="papergraph-rail-collapsed";
const RAIL_MIN=320,RAIL_MAX=600,RAIL_DEFAULT=410,RAIL_COLLAPSED_WIDTH=16;
const RAIL_COLLAPSE_DRAG_DISTANCE=48;
let railWidth=RAIL_DEFAULT,railCollapsed=false;
const DETAIL_WIDTH_KEY="papergraph-detail-width";
const DETAIL_MIN=300,DETAIL_MAX=520,DETAIL_DEFAULT=372;
let detailWidth=DETAIL_DEFAULT;
const CLAIM_WIDTH_KEY="papergraph-claim-width";
const CLAIM_MIN=300,CLAIM_MAX=520,CLAIM_DEFAULT=372;
let claimWidth=CLAIM_DEFAULT;
const FLOW_COLUMNS={artifact:-360,procedure:-160,configuration:0,result:200,result_group:200,claim:400};
const FLOW_BAND_GAP=300,FLOW_CONTEXT_GAP=78,FLOW_RESULT_ANCHOR_GAP=64;
function semanticColumnForKind(kind){ return FLOW_COLUMNS[kind]===undefined?FLOW_COLUMNS.result:FLOW_COLUMNS[kind]; }
function average(values,fallback){
  const finite=values.filter(Number.isFinite);return finite.length?finite.reduce((sum,value)=>sum+value,0)/finite.length:fallback;
}
function placementBands(ids){ return [...ids].sort((a,b)=>a-b); }
/* Pure layout seam: wrapper nodes need only id, kind, virtualType, resultIds,
   and (for Gap placement) ref. It returns positions rather than mutating input,
   so Viewer tests can exercise evidence-flow behavior without the canvas. */
function computeEvidenceFlowPlacement(layoutNodes,layoutEdges,coreClaimIds,routeIndex){
  const byId={};layoutNodes.forEach(node=>{byId[node.id]=node;});
  const incoming={};layoutNodes.forEach(node=>{incoming[node.id]=[];});
  const degree={};layoutNodes.forEach(node=>{degree[node.id]=0;});
  layoutEdges.forEach(edge=>{
    if(incoming[edge.b]&&byId[edge.a]&&byId[edge.b]){
      incoming[edge.b].push(edge.a);degree[edge.a]++;degree[edge.b]++;
    }
  });
  const coreIndex={};coreClaimIds.forEach((id,index)=>{if(byId[id])coreIndex[id]=index;});
  const served={};layoutNodes.forEach(node=>{served[node.id]=new Set();});
  Object.keys(coreIndex).forEach(coreId=>{
    const seen=new Set([coreId]),queue=[coreId],band=coreIndex[coreId];
    while(queue.length){
      const target=queue.shift();served[target].add(band);
      (incoming[target]||[]).forEach(source=>{
        if(!seen.has(source)){seen.add(source);queue.push(source);}
      });
    }
  });
  layoutNodes.filter(node=>node.virtualType==="result_group").forEach(group=>{
    (group.resultIds||[]).forEach(memberId=>{
      (served[memberId]||[]).forEach(band=>served[group.id].add(band));
    });
  });
  const coreCenter=(coreClaimIds.length-1)/2;
  const primaryY=bands=>average(placementBands(bands).map(index=>(index-coreCenter)*FLOW_BAND_GAP),0);
  const contextBase=(coreClaimIds.length?coreCenter*FLOW_BAND_GAP+FLOW_BAND_GAP*.9:0);
  const positions={};
  layoutNodes.forEach((node,index)=>{
    if(node.gap)return;
    const bands=placementBands(served[node.id]||new Set());
    const isCoreClaim=node.kind==="claim"&&coreIndex[node.id]!==undefined;
    positions[node.id]={x:semanticColumnForKind(node.kind),y:isCoreClaim?(coreIndex[node.id]-coreCenter)*FLOW_BAND_GAP:
      (bands.length?primaryY(bands):contextBase),column:node.kind,bands};
  });
  /* Secondary Claims remain contextual rather than starting their own bands.
     When their supporting evidence is already placed, align them to that
     local context instead of exiling them to a generic overflow row. */
  layoutNodes.filter(node=>node.kind==="claim"&&coreIndex[node.id]===undefined).forEach(node=>{
    const supporting=(incoming[node.id]||[]).map(id=>positions[id]).filter(Boolean);
    if(supporting.length)positions[node.id].y=average(supporting.map(position=>position.y),positions[node.id].y);
  });
  /* A column can contain several entities serving the same Claim band. Spread
     that small local stack deterministically; core Claims retain their exact
     sidebar-aligned band centres. */
  const buckets={};
  layoutNodes.forEach(node=>{
    if(node.gap||node.virtualType==="result_group"||
      (node.kind==="result"&&layoutNodes.some(group=>group.virtualType==="result_group"&&(group.resultIds||[]).includes(node.id)))||
      (node.kind==="claim"&&coreIndex[node.id]!==undefined))return;
    const position=positions[node.id];if(!position)return;
    const key=position.column+"|"+(position.bands.length?position.bands.join(","):"context");
    (buckets[key]=buckets[key]||[]).push(node);
  });
  Object.keys(buckets).forEach(key=>{
    const bucket=buckets[key].sort((a,b)=>a.id.localeCompare(b.id));
    bucket.forEach((node,index)=>{positions[node.id].y+=(index-(bucket.length-1)/2)*FLOW_CONTEXT_GAP;});
  });
  /* A declared node with no exact graph relationship has no Claim band to
     follow. Keep such structural islands on a short tail of their semantic
     column, after the related content, instead of exiling them to the generic
     context row. */
  const isolatedByColumn={};
  layoutNodes.forEach(node=>{
    const position=positions[node.id];
    if(node.gap||node.virtualType==="result_group"||!position||position.bands.length||degree[node.id])return;
    (isolatedByColumn[position.column]=isolatedByColumn[position.column]||[]).push(node);
  });
  Object.keys(isolatedByColumn).forEach(column=>{
    const occupied=layoutNodes.map(node=>positions[node.id]).filter(position=>
      position&&position.column===column&&position.bands.length
    );
    const base=occupied.length?Math.max(...occupied.map(position=>position.y))+FLOW_CONTEXT_GAP:contextBase;
    isolatedByColumn[column].sort((a,b)=>a.id.localeCompare(b.id)).forEach((node,index)=>{
      positions[node.id].y=base+index*FLOW_CONTEXT_GAP;
    });
  });
  /* Results outside a headline Claim's evidence chain are still meaningful
     paper content. Anchor each exact Result or folded table to the Procedure
     that declares it as an output, rather than treating it as an ever-growing
     overflow list below the reading map. */
  const groupedResultIds=new Set();
  layoutNodes.filter(node=>node.virtualType==="result_group").forEach(group=>{
    (group.resultIds||[]).forEach(id=>groupedResultIds.add(id));
  });
  const contextOutputFamilies={};
  layoutNodes.filter(node=>{
    if(node.gap||!positions[node.id]||positions[node.id].bands.length)return false;
    return node.virtualType==="result_group"||(node.kind==="result"&&!groupedResultIds.has(node.id));
  }).forEach(node=>{
    const outputIds=node.virtualType==="result_group"?(node.resultIds||[]):[node.id];
    const producerIds=[...new Set(outputIds.flatMap(id=>incoming[id]||[]))].filter(id=>positions[id]);
    if(!producerIds.length)return;
    positions[node.id].y=average(producerIds.map(id=>positions[id].y),positions[node.id].y);
    const key=producerIds.slice().sort().join("|");
    (contextOutputFamilies[key]=contextOutputFamilies[key]||[]).push(node);
  });
  Object.keys(contextOutputFamilies).forEach(key=>{
    const family=contextOutputFamilies[key].sort((a,b)=>a.id.localeCompare(b.id));
    const gap=Math.max(FLOW_CONTEXT_GAP,190);
    family.forEach((node,index)=>{positions[node.id].y+=(index-(family.length-1)/2)*gap;});
  });
  /* Compact mode renders table aggregates alongside ungrouped Results. Give
     those visible anchors deterministic breathing room before placing the
     table's hidden child Results around each aggregate. */
  const displayResultAnchors=layoutNodes.filter(node=>
    node.virtualType==="result_group"||(node.kind==="result"&&!groupedResultIds.has(node.id))
  ).filter(node=>positions[node.id]).sort((a,b)=>
    positions[a.id].y-positions[b.id].y||a.id.localeCompare(b.id)
  );
  let previousAnchorY=-Infinity;
  displayResultAnchors.forEach(node=>{
    const position=positions[node.id];
    position.y=Math.max(position.y,previousAnchorY+FLOW_RESULT_ANCHOR_GAP);
    previousAnchorY=position.y;
  });
  /* A grouped table owns the Result-column anchor. Its exact Result members
     occupy a stable local cluster around it, which works in Full and when the
     Compact group is expanded. */
  layoutNodes.filter(node=>node.virtualType==="result_group").forEach(group=>{
    const position=positions[group.id];if(!position)return;
    const memberIds=group.resultIds||[];
    const childPositions=concentricResultPositions(memberIds.length,position.x,position.y);
    memberIds.forEach((memberId,index)=>{
      if(!positions[memberId])return;
      positions[memberId].x=childPositions[index].x;
      positions[memberId].y=childPositions[index].y;
    });
  });
  /* Different Claim-band memberships can still average to one y-coordinate
     (for example, a node serving Claims 1+3 and another serving Claim 2).
     Keep those reset anchors deterministic and centered around their original
     y instead of relying on the later, bounded force pass to separate them.
     Core Claims are fixed by the reading order; Result anchors keep their
     existing spacing and are intentionally excluded here. */
  const COLUMN_ANCHOR_PADDING=8;
  const columnKinds=new Set(["artifact","procedure","configuration","claim"]);
  const visualRadius=node=>{
    const radius=Number(node.r);
    if(Number.isFinite(radius)&&radius>=0)return radius;
    return ({artifact:10,procedure:11,configuration:8,claim:13}[node.kind]||6);
  };
  const separateColumnAnchors=kind=>{
    const anchors=layoutNodes.filter(node=>{
      if(node.gap||node.kind!==kind||!positions[node.id])return false;
      return !(node.kind==="claim"&&coreIndex[node.id]!==undefined);
    }).sort((a,b)=>positions[a.id].y-positions[b.id].y||
      String(a.id).localeCompare(String(b.id)));
    if(anchors.length<2)return;
    const original=anchors.map(node=>positions[node.id].y);
    const packed=[];
    anchors.forEach((node,index)=>{
      const previous=anchors[index-1];
      const clearance=previous
        ? visualRadius(previous)+visualRadius(node)+COLUMN_ANCHOR_PADDING
        : 0;
      packed[index]=index===0
        ? original[index]
        : Math.max(original[index],packed[index-1]+clearance);
    });
    const originalCenter=(original[0]+original[original.length-1])/2;
    const packedCenter=(packed[0]+packed[packed.length-1])/2;
    const shift=originalCenter-packedCenter;
    anchors.forEach((node,index)=>{positions[node.id].y=packed[index]+shift;});
  };
  columnKinds.forEach(kind=>separateColumnAnchors(kind));
  layoutNodes.filter(node=>node.gap).forEach((node,index)=>{
    const gap=node.ref||{},between=(gap.between||[]).filter(id=>positions[id]);
    const affected=[...new Set((gap.affects||[]).map(id=>
      positions[id]?id:(routeIndex&&routeIndex[id]&&positions[routeIndex[id].result_id]?routeIndex[id].result_id:null)
    ).filter(Boolean))];
    let x,y,column="gap";
    if(between.length===2){
      x=average(between.map(id=>positions[id].x),semanticColumnForKind(gap.expected_kind));
      y=average(between.map(id=>positions[id].y),contextBase);
    }else{
      x=semanticColumnForKind(gap.expected_kind||"result");
      y=average(affected.map(id=>positions[id].y),contextBase+index*FLOW_CONTEXT_GAP);
    }
    positions[node.id]={x,y,column,bands:[]};
  });
  return positions;
}
function applyEvidenceFlowLayout(){
  const positions=computeEvidenceFlowPlacement(nodes,exactEdges,orderedCoreClaimIds(),routesById);
  nodes.forEach(n=>{
    const p=positions[n.id]||{x:0,y:0,column:n.kind,bands:[]};
    n.homeX=p.x;n.homeY=p.y;n.homeColumn=p.column;n.homeBands=p.bands;
    n.x=p.x;n.y=p.y;n.vx=0;n.vy=0;n.fixx=null;n.fixy=null;n.manualPosition=false;
  });
}
nodes.forEach(n=>{
  n.x=0;n.y=0;n.homeX=0;n.homeY=0;n.vx=0;n.vy=0;n.fixx=null;n.fixy=null;n.manualPosition=false;
  const projectedDegree=compactTopology.degree[n.id]||0;
  n.r=(KIND[n.kind]||KIND.result).r + Math.min(7,(deg[n.id]||projectedDegree)*0.5);
});
const LINK_LEN=150, LINK_K=0.009, HOME_K=0.36, VEL_DECAY=0.6, GAP_LEN=105;
const HOME_X_BOUND=14,HOME_Y_BOUND=18,LOCAL_X_BOUND=16,LOCAL_Y_BOUND=20,LOCAL_REHEAT=0.12;
const COLLISION_PADDING=18,COLLISION_K=0.3;
let alpha=0, alphaTarget=0; const ALPHA_MIN=0.0018, ALPHA_DECAY=0.05;
let localInteractionIds=null;
function reheat(v){ alpha=Math.max(alpha,v); alphaTarget=v; }
function localInteractionIdsFor(nodeId){
  const ids=new Set([nodeId]);
  edges.forEach(edge=>{
    if(!visibleEdge(edge))return;
    if(edge.a===nodeId)ids.add(edge.b);
    else if(edge.b===nodeId)ids.add(edge.a);
  });
  return ids;
}
function commitManualNodePlacement(node){
  node.homeX=node.x;node.homeY=node.y;node.vx=0;node.vy=0;
  node.fixx=null;node.fixy=null;node.manualPosition=true;
}
function collisionRangeFor(a,b){ return a.r+b.r+COLLISION_PADDING; }
function concentricResultPositions(count,cx,cy){
  const out=[];if(count<=0)return out;
  const ringCount=count<=8?1:Math.ceil(count/9);
  const base=Math.floor(count/ringCount),extra=count%ringCount;
  let index=0;
  for(let ring=0;ring<ringCount;ring++){
    const size=base+(ring<extra?1:0),radius=82+ring*54;
    for(let position=0;position<size;position++){
      const angle=-Math.PI/2+(Math.PI*2*position/size)+(ring%2?0.18:0);
      out[index++]={x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius};
    }
  }
  return out;
}
function resultGroupAnchor(n){
  if(n.manualPosition||viewMode!=="compact"||n.kind!=="result")return null;
  const groupId=compactProjection.groupByMemberId[n.id];
  if(!groupId||!resultGroupExpanded(groupId))return null;
  const group=RN[groupId],index=group.resultIds.indexOf(n.id);
  const positions=concentricResultPositions(group.resultIds.length,group.x,group.y);
  return positions[index]||null;
}
function tick(){
  alpha += (alphaTarget-alpha)*ALPHA_DECAY;
  if(alpha<ALPHA_MIN){ if(alphaTarget===0){alpha=0;localInteractionIds=null;return false;} }
  const scopedIds=typeof localInteractionIds==="undefined"?null:localInteractionIds;
  const visibleNodes=nodes.filter(visibleNode);
  const activeIds=new Set(scopedIds?[...scopedIds]:visibleNodes.map(node=>node.id));
  const simEdges=edges.filter(edge=>visibleEdge(edge)&&(!scopedIds||(scopedIds.has(edge.a)&&scopedIds.has(edge.b))));
  // Short-range collision only: distant nodes do not exert any force. During
  // a drag, an affected node can make room only for the dragged node or its
  // direct graph neighbors, so the rest of the map stays still.
  for(let i=0;i<visibleNodes.length;i++){ const p=visibleNodes[i];
    for(let j=i+1;j<visibleNodes.length;j++){ const q=visibleNodes[j];
      if(scopedIds&&!scopedIds.has(p.id)&&!scopedIds.has(q.id))continue;
      let dx=q.x-p.x, dy=q.y-p.y, d2=dx*dx+dy*dy;
      if(d2<0.01){
        // Home positions can legitimately coincide before the bounded relaxer
        // separates a local stack. Use an ID-stable nudge, not layout-time
        // randomness, so startup and reset remain reproducible.
        const split=String(p.id)<String(q.id)?-1:1;
        dx=split*.08;dy=((i+j)%2?split:-split)*.05;d2=dx*dx+dy*dy+0.01;
      }
      const d=Math.sqrt(d2);
      if(d<collisionRangeFor(p,q)){
        const f=(collisionRangeFor(p,q)-d)*COLLISION_K*alpha,ux=dx/d,uy=dy/d;
        p.vx-=ux*f;p.vy-=uy*f;q.vx+=ux*f;q.vy+=uy*f;
        activeIds.add(p.id);activeIds.add(q.id);
      }
    }
  }
  const simNodes=visibleNodes.filter(node=>activeIds.has(node.id));
  // springs, scaled by alpha
  simEdges.forEach(e=>{ const p=RN[e.a], q=RN[e.b];
    let dx=q.x-p.x, dy=q.y-p.y; let d=Math.sqrt(dx*dx+dy*dy)||0.01;
    const L=e.gap?GAP_LEN:LINK_LEN; const f=(d-L)*LINK_K*alpha; const ux=dx/d,uy=dy/d;
    p.vx+=ux*f; p.vy+=uy*f; q.vx-=ux*f; q.vy-=uy*f;
  });
  // Home springs keep the brief relaxation local: no node may cross semantic
  // columns or Claim bands merely because neighboring edges are dense.
  simNodes.forEach(n=>{
    if(n.fixx!==null){ n.x=n.fixx; n.y=n.fixy; n.vx=0; n.vy=0; return; }
    const target=resultGroupAnchor(n);
    const home=target||{x:n.homeX,y:n.homeY};
    n.vx+=(home.x-n.x)*HOME_K*alpha;n.vy+=(home.y-n.y)*HOME_K*alpha;
    n.vx*=VEL_DECAY; n.vy*=VEL_DECAY;
    n.x+=n.vx; n.y+=n.vy;
    const xBound=scopedIds?LOCAL_X_BOUND:HOME_X_BOUND;
    const yBound=scopedIds?LOCAL_Y_BOUND:HOME_Y_BOUND;
    n.x=Math.max(home.x-xBound,Math.min(home.x+xBound,n.x));
    n.y=Math.max(home.y-yBound,Math.min(home.y+yBound,n.y));
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
let hoverNode=null, selNode=null, selEdge=null, activeRoute=null;
let activeClaimId=null,claimChain=null,detailSelection=null,claimCameraFitted=false;
let hi = null;   // {nd:Set, eg:Set} of highlighted ids (route or neighbor focus); null = all lit
let kindOff = new Set();
let searchHit = new Set();

function visibleNode(n){
  if(!n)return false;
  if(viewMode==="full") return !n.virtualType;
  if(n.virtualType==="result_group")return true;
  if(n.kind==="result"){
    const groupId=compactProjection.groupByMemberId[n.id];
    return !groupId||resultGroupExpanded(groupId);
  }
  return !n.virtualType;
}

function visibleEdge(e){
  if(viewMode==="full") return !e.virtualType;
  if(!visibleNode(RN[e.a]) || !visibleNode(RN[e.b])) return false;
  if(e.virtualType==="result_summary")return true;
  if(e.virtualType)return false;
  const ga=compactProjection.groupByMemberId[e.a],gb=compactProjection.groupByMemberId[e.b];
  return (!ga||resultGroupExpanded(ga))&&(!gb||resultGroupExpanded(gb));
}

function computeHighlight(){
  if(activeRoute){ hi=routeElems(activeRoute); return; }
  if(activeClaimId&&claimChain){
    hi={nd:claimChain.nodeIds,eg:claimChain.edgeIds};
    return;
  }
  if(selNode){
    const nd=new Set([selNode.id]), eg=new Set();
    edges.forEach(e=>{ if(visibleEdge(e)&&(e.a===selNode.id||e.b===selNode.id)){eg.add(e.id);nd.add(e.a);nd.add(e.b);} });
    hi={nd,eg}; return;
  }
  hi=null;
}
function litNode(n){ if(!visibleNode(n)||kindOff.has(n.kind)) return false; if(!hi) return true; return hi.nd.has(n.id); }
function litEdge(e){ if(!visibleEdge(e))return false; if(!hi) return true; return hi.eg.has(e.id); }

/* ---------- draw ---------- */
function relLabel(e){ return e.rel||""; }
function drawResultGroupNode(n,x,y,R,k,lit,isHover){
  const light=document.documentElement.getAttribute("data-theme")==="light";
  const open=resultGroupExpanded(n.id);
  ctx.save();
  if(isHover&&lit){ctx.shadowColor=k.c;ctx.shadowBlur=18;}
  if(!open)[[-6,-5],[-3,-2]].forEach((off,i)=>{
    ctx.beginPath();ctx.arc(x+off[0]*cam.z,y+off[1]*cam.z,R,0,7);
    ctx.fillStyle=light?(i?"#dce7e5":"#cbdcda"):(i?"#19332f":"#142924");
    ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle=k.c;ctx.stroke();
  });
  ctx.beginPath();ctx.arc(x,y,R,0,7);
  ctx.fillStyle=open?"transparent":(light?"#f8fbfb":"#0d1717");ctx.fill();
  ctx.lineWidth=open?2.5:2;ctx.strokeStyle=k.c;ctx.stroke();
  ctx.fillStyle=k.c;
  ctx.font="700 "+Math.max(10,R*0.72)+"px ui-monospace,Menlo,monospace";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText(open?"−":String(n.resultCount),x,y+0.5);
  ctx.restore();
}
function summaryEdgeExpanded(e){
  return e.virtualType==="result_summary"&&[e.a,e.b].some(id=>
    RN[id]&&RN[id].virtualType==="result_group"&&resultGroupExpanded(id));
}
function selfLoopGeometry(n){
  const [x,y]=toScreen(n.x,n.y),nodeRadius=n.r*cam.z;
  const radius=Math.max(12,nodeRadius*0.9);
  return {x:x+nodeRadius*0.72,y:y-nodeRadius*0.72,radius};
}
function drawSummarySelfLoop(n,col,w,dash){
  const loop=selfLoopGeometry(n);
  ctx.strokeStyle=col;ctx.lineWidth=w;ctx.setLineDash(dash);
  ctx.beginPath();ctx.arc(loop.x,loop.y,loop.radius,0.2*Math.PI,2.05*Math.PI);ctx.stroke();
  const angle=2.05*Math.PI,ax=loop.x+Math.cos(angle)*loop.radius,ay=loop.y+Math.sin(angle)*loop.radius;
  ctx.setLineDash([]);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(ax+5,ay);
  ctx.lineTo(ax-3,ay-4);ctx.lineTo(ax-2,ay+5);ctx.closePath();ctx.fill();
}
function draw(){
  const P=pal();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,innerWidth,innerHeight);
  ctx.save();
  // edges
  ctx.lineCap="round";
  edges.forEach(e=>{
    if(!visibleEdge(e))return;
    const p=RN[e.a], q=RN[e.b]; if(!p||!q)return;
    const [x1,y1]=toScreen(p.x,p.y),[x2,y2]=toScreen(q.x,q.y);
    const lit=litEdge(e) && !kindOff.has(RN[e.a].kind) && !kindOff.has(RN[e.b].kind);
    const onSel = selEdge===e;
    let col, w, dash;
    if(e.gap){ col=P.gap; w=1.5; dash=[1.5,5]; }
    else if(e.level==="explicit"||e.level==="summary"){ col=P.edgeExplicit; w=1.4; dash=[]; }
    else { col=P.edgeReconstructed; w=1.2; dash=[5,5]; }
    ctx.globalAlpha = lit ? (e.gap?0.95:0.7) : 0.06;
    const summaryExpanded=summaryEdgeExpanded(e);
    if(summaryExpanded&&!onSel){ctx.globalAlpha*=0.32;w*=0.82;}
    if(onSel){col=P.accent;w=2.4;ctx.globalAlpha=1;}
    else if(hi&&lit&&!hi.soft){col=e.gap?P.gapFocus:P.edgeFocus;w+=0.5;}
    ctx.strokeStyle=col; ctx.lineWidth=w; ctx.setLineDash(dash);
    if(e.a===e.b){drawSummarySelfLoop(p,col,w,dash);return;}
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
      ctx.setLineDash([]); ctx.globalAlpha = lit ? (summaryExpanded?0.3:0.92) : 0.06; ctx.fillStyle=col;
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
      if(e.gap || e.a===e.b || !litEdge(e)) return;
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
    if(!visibleNode(n))return;
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
    } else if(n.virtualType==="result_group"){
      drawResultGroupNode(n,x,y,R,k,lit,isHover);
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
  for(let i=nodes.length-1;i>=0;i--){ const n=nodes[i]; if(!visibleNode(n)||kindOff.has(n.kind))continue;
    const [x,y]=toScreen(n.x,n.y); const R=n.r*cam.z+4;
    if((sx-x)**2+(sy-y)**2<=R*R) return n; }
  return null;
}
function edgeAt(sx,sy){
  let best=null,bd=7;
  for(const e of edges){ const p=RN[e.a],q=RN[e.b]; if(!visibleEdge(e)||!litEdge(e))continue;
    if(e.a===e.b){const loop=selfLoopGeometry(p),d=Math.abs(Math.hypot(sx-loop.x,sy-loop.y)-loop.radius);
      if(d<bd){bd=d;best=e;}continue;}
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
  if(n){ dragNode=n; n.fixx=n.x; n.fixy=n.y; localInteractionIds=localInteractionIdsFor(n.id); reheat(LOCAL_REHEAT); cv.setPointerCapture(ev.pointerId); }
  else { panning=true; cv.classList.add("dragging"); }
});
cv.addEventListener("pointermove",ev=>{
  const sx=ev.clientX,sy=ev.clientY;
  if(dragNode){ const [wx,wy]=toWorld(sx,sy); dragNode.fixx=wx; dragNode.fixy=wy; dragNode.x=wx; dragNode.y=wy; reheat(LOCAL_REHEAT); moved+=Math.abs(sx-last[0])+Math.abs(sy-last[1]); last=[sx,sy]; return; }
  if(panning){ cam.x-=(sx-last[0])/cam.z; cam.y-=(sy-last[1])/cam.z; moved+=Math.abs(sx-last[0])+Math.abs(sy-last[1]); last=[sx,sy]; return; }
  // hover
  const n=nodeAt(sx,sy);
  hoverNode=n;
  cv.classList.toggle("overnode",!!n);
  const tip=document.getElementById("pg-tip");
  if(n){ const k=KIND[n.kind]||KIND.result;
    const detail=n.virtualType==="result_group"?` · ${n.resultCount} results`:"";
    tip.innerHTML=`<span class="tk" style="color:${k.c}">${n.gap?"gap · "+(n.ref.category||""):n.kind}${detail}</span>${esc(n.label)}`;
    const [x,y]=toScreen(n.x,n.y); tip.style.left=x+"px"; tip.style.top=(y-n.r*cam.z)+"px"; tip.style.opacity=1;
  } else tip.style.opacity=0;
});
function endPtr(ev){
  if(dragNode){ try{cv.releasePointerCapture(ev.pointerId);}catch(e){}
    if(moved>=5)commitManualNodePlacement(dragNode);
    else {dragNode.fixx=null;dragNode.fixy=null;}
    alphaTarget=0;
  }
  dragNode=null; panning=false; cv.classList.remove("dragging");
  if(moved<5 && downPt){ // treat as click
    const sx=downPt[0],sy=downPt[1]; const n=nodeAt(sx,sy);
    if(n) selectNode(n);
    else {
      const e=edgeAt(sx,sy);
      if(e && !e.gap)selectEdge(e);
      else if(e&&e.gap&&e.ref&&RN[e.ref.id])selectNode(RN[e.ref.id]);
      else clearCanvasSelection();
    }
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
  if(n.virtualType==="result_group"){ toggleResultGroup(n); return; }
  if(!n.gap&&n.kind==="claim"){enterClaimBrowsing(n.id);return;}
  if(activeClaimId&&claimChain&&claimChain.nodeIds.has(n.id)){selectDetailNode(n);return;}
  if(activeClaimId){
    const groupId=compactProjection.groupByMemberId[n.id];
    if(viewMode==="compact"&&groupId)manualExpandedResultGroups.add(groupId);
    exitClaimBrowsing(false);
  }
  selEdge=null; selNode=n; activeRoute=null;detailSelection={type:"node",value:n};
  // if a result with route(s) -> activate route trace (Level 2)
  if(!n.gap && n.kind==="result" && routesByResult[n.id]){ activeRoute=routesByResult[n.id][0]; }
  computeHighlight(); renderDetailInspector(); renderCrumb();
  syncOutlineUI();
  focusOn(n);
}
function selectEdge(e){
  if(activeClaimId&&claimChain&&claimChain.edgeIds.has(e.id)){
    detailSelection={type:"edge",value:e};selNode=null;selEdge=e;renderDetailInspector();return;
  }
  if(activeClaimId)exitClaimBrowsing(false);
  selNode=null;activeRoute=null;selEdge=e;detailSelection={type:"edge",value:e};hi=null;
  if(e.virtualType==="result_summary"){
    const groupIds=[e.a,e.b].filter(id=>RN[id]&&RN[id].virtualType==="result_group");
    groupIds.forEach(id=>{manualExpandedResultGroups.add(id);placeResultGroupChildren(RN[id]);});
    const nd=new Set(),eg=new Set(e.constituentEdgeIds||[]);
    (e.constituentEdges||[]).forEach(item=>{nd.add(item.a);nd.add(item.b);});
    hi={nd,eg};
    renderDetailInspector();settleVisible(100);
  } else renderDetailInspector();
  renderCrumb();
}
function selectDetailNode(n){
  detailSelection={type:"node",value:n};selNode=n;selEdge=null;activeRoute=null;
  // A node opened from a provenance tree is secondary inspection. Keep the
  // active Claim context and restore its full-chain highlight after any
  // previously selected route branch.
  computeHighlight();
  document.getElementById("pg-root").classList.add("detail-tab-active");
  renderDetailInspector();renderCrumb();
  requestAnimationFrame(()=>ensureNodeVisible(n));
}
function enterClaimBrowsing(claimId){
  if(activeClaimId!==claimId)claimCameraFitted=false;
  activeClaimId=claimId;claimChain=buildClaimChain(claimId);
  claimExpandedResultGroups.clear();
  exactEdges.filter(e=>!e.gap&&e.b===claimId&&e.rel==="supports").forEach(e=>{
    const groupId=compactProjection.groupByMemberId[e.a];
    if(viewMode==="compact"&&groupId){
      claimExpandedResultGroups.add(groupId);placeResultGroupChildren(RN[groupId]);
    }
  });
  selNode=RN[claimId]||null;selEdge=null;activeRoute=null;detailSelection=null;
  closeDetailInspector();computeHighlight();renderClaimBrowser();syncOutlineUI();renderCrumb();
  settleVisible(120);
  if(!claimCameraFitted){fitIds(claimChain.nodeIds);claimCameraFitted=true;}
}
function exitClaimBrowsing(clearDetail){
  activeClaimId=null;claimChain=null;claimExpandedResultGroups.clear();claimCameraFitted=false;
  closeClaimBrowser();
  if(clearDetail!==false){detailSelection=null;selNode=null;selEdge=null;activeRoute=null;closeDetailInspector();}
  computeHighlight();syncOutlineUI();renderCrumb();settleVisible(80);
}
function clearSel(){
  if(activeClaimId){exitClaimBrowsing(true);return;}
  selNode=null;selEdge=null;activeRoute=null;detailSelection=null;hi=null;
  syncOutlineUI();closeDetailInspector();renderCrumb();
}
function clearCanvasSelection(){
  if(!activeClaimId){clearSel();return;}
  detailSelection=null;selNode=RN[activeClaimId]||null;selEdge=null;activeRoute=null;
  closeDetailInspector();computeHighlight();renderCrumb();
}
function placeResultGroupChildren(n){
  const positions=concentricResultPositions(n.resultIds.length,n.x,n.y);
  n.resultIds.forEach((id,i)=>{
    const child=RN[id];if(!child||child.manualPosition)return;
    child.x=positions[i].x;child.y=positions[i].y;
    child.vx=0;child.vy=0;
  });
}
function clearCollapsedResultSelection(n){
  if(!selNode||!n.resultIds.includes(selNode.id))return;
  selNode=null;selEdge=null;activeRoute=null;detailSelection=null;hi=null;
  syncOutlineUI();closeDetailInspector();renderCrumb();
}
function toggleManualResultGroup(groupId,manualGroups,automaticGroups,claimActive){
  if(claimActive&&automaticGroups.has(groupId))return false;
  if(manualGroups.has(groupId))manualGroups.delete(groupId);else manualGroups.add(groupId);
  return true;
}
function toggleResultGroup(n){
  const wasOpen=manualExpandedResultGroups.has(n.id);
  if(!toggleManualResultGroup(n.id,manualExpandedResultGroups,claimExpandedResultGroups,!!activeClaimId))return;
  if(wasOpen)clearCollapsedResultSelection(n);else placeResultGroupChildren(n);
  settleVisible(100);
}
function rightDockWidth(){
  if(innerWidth<=900)return activeClaimId||detailSelection?16:0;
  if(activeClaimId&&detailSelection&&innerWidth>1280)return 28+claimWidth+detailWidth;
  if(activeClaimId&&detailSelection&&document.getElementById("pg-root").classList.contains("detail-tab-active"))return 16+detailWidth;
  if(activeClaimId)return 16+claimWidth;
  return detailSelection?16+detailWidth:0;
}
function canvasOffset(z){
  if(innerWidth<=900)return 0;
  const left=16+(railCollapsed?RAIL_COLLAPSED_WIDTH:railWidth)+8;
  return (left-rightDockWidth())/(2*(z||1));
}
function ensureNodeVisible(n){
  if(!n)return;
  const [sx,sy]=toScreen(n.x,n.y),pad=48;
  const left=innerWidth>900?16+(railCollapsed?RAIL_COLLAPSED_WIDTH:railWidth)+pad:pad;
  const right=innerWidth-rightDockWidth()-pad;
  const top=64+pad,bottom=innerHeight-52-pad;
  let dx=0,dy=0;
  if(sx<left)dx=sx-left;else if(sx>right)dx=sx-right;
  if(sy<top)dy=sy-top;else if(sy>bottom)dy=sy-bottom;
  if(dx||dy)animCam(cam.x+dx/cam.z,cam.y+dy/cam.z,cam.z);
}
function focusOn(n){ // ease camera toward node, accounting for the left rail
  const s=Math.min(cam.z<0.8?1.05:cam.z,1.4);
  animCam(n.x-canvasOffset(s),n.y,s);
}
let camAnim=null;
function animCam(tx,ty,tz){ const s={x:cam.x,y:cam.y,z:cam.z}, t0=tms;
  camAnim={s,tx,ty,tz,t0}; }
(function camLoop(){ requestAnimationFrame(camLoop);
  if(!camAnim)return; const k=Math.min(1,(tms-camAnim.t0)/420); const e=1-Math.pow(1-k,3);
  cam.x=camAnim.s.x+(camAnim.tx-camAnim.s.x)*e; cam.y=camAnim.s.y+(camAnim.ty-camAnim.s.y)*e;
  cam.z=camAnim.s.z+(camAnim.tz-camAnim.s.z)*e; if(k>=1)camAnim=null; })();

/* ---------- inspector rendering ---------- */
const claimBrowser=document.getElementById("pg-claim-browser");
const detailInspector=document.getElementById("pg-detail-inspector");
function openClaimBrowser(){
  claimBrowser.classList.add("open");document.getElementById("pg-root").classList.add("claim-browsing");
}
function closeClaimBrowser(){
  claimBrowser.classList.remove("open");document.getElementById("pg-root").classList.remove("claim-browsing");
}
function openDetailInspector(){
  detailInspector.classList.add("open");
  if(activeClaimId)document.getElementById("pg-root").classList.add("detail-tab-active");
}
function closeDetailInspector(){
  detailInspector.classList.remove("open");
  document.getElementById("pg-root").classList.remove("detail-tab-active");
}
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

/* ---------- folded provenance trees ----------
   These trees are a reader projection over declared route fields. A tree entry
   is either an existing graph node (nodeId) or a structural disclosure group;
   structural entries never become graph entities and never participate in
   highlighting. */
function foldedRoutePath(route,rootId){
  const path=(route&&route.path||[]).filter(id=>typeof id==="string");
  const reversed=path.slice().reverse();
  const rootIndex=reversed.indexOf(rootId);
  return rootIndex>=0?reversed.slice(rootIndex):reversed;
}
function newProvTreeNode(nodeId,structural,label,kind){
  return {nodeId:nodeId||null,structural:!!structural,label:label||"",kind:kind||"",routeIds:[],children:[],branchEdges:[]};
}
function addProvRouteId(node,routeId){
  if(routeId&&node.routeIds.indexOf(routeId)<0)node.routeIds.push(routeId);
}
function findProvNode(root,nodeId){
  if(root.nodeId===nodeId)return root;
  for(const child of root.children){
    const hit=findProvNode(child,nodeId);if(hit)return hit;
  }
  return null;
}
function ensureProvChild(parent,nodeId,routeId,edgeId,relation){
  let child=parent.children.find(item=>item.nodeId===nodeId);
  if(!child){
    const raw=RN[nodeId];if(!raw)return null;
    child=newProvTreeNode(nodeId,false,raw.label,raw.kind);parent.children.push(child);
  }
  addProvRouteId(child,routeId);if(edgeId)child.branchEdges.push({routeId,edgeId,relation:relation||""});
  return child;
}
function ensureProvSection(parent,label,category){
  let section=parent.children.find(item=>item.structural&&item.category===category);
  if(!section){section=newProvTreeNode(null,true,label,"group");section.category=category;parent.children.push(section);}
  return section;
}
function routePathEdge(route,upstream,downstream){
  const path=route&&route.path||[],edgesForPath=route&&route.path_edge_ids||[];
  for(let i=0;i<path.length-1;i++)if(path[i]===upstream&&path[i+1]===downstream)return edgesForPath[i]||null;
  return null;
}
function routeLabel(route,index){
  return (route&&route.subject_variant&&route.subject_variant.label)||`Route ${index+1}`;
}
function buildFoldedProvenanceTree(rootId,routeList){
  const rawRoot=RN[rootId],root=newProvTreeNode(rootId,false,rawRoot?rawRoot.label:rootId,rawRoot?rawRoot.kind:"");
  (routeList||[]).forEach((route,index)=>{
    if(!route)return;
    const routeId=route.id||`route_${index+1}`;addProvRouteId(root,routeId);
    const path=foldedRoutePath(route,rootId);let parent=root;
    if(path[0]!==rootId){
      // A malformed or partial route must remain visibly unlinked rather than
      // implying an edge from the selected result to an unrelated path.
      parent=ensureProvSection(root,"Declared path (terminal not in path)","unlinked-route");
    }
    path.forEach((nodeId,pathIndex)=>{
      if(pathIndex===0&&nodeId===rootId)return;
      if(!RN[nodeId])return;
      const downstream=path[pathIndex-1],edgeId=routePathEdge(route,nodeId,downstream);
      parent=ensureProvChild(parent,nodeId,routeId,edgeId,"path")||parent;
      addProvRouteId(parent,routeId);
    });
    // Explicit branch edges attach their upstream endpoint to the declared
    // downstream endpoint. This is where Configuration branches stay visible.
    (route.branch_edge_ids||[]).forEach(edgeId=>{
      const edge=edgeById[edgeId];if(!edge||!RN[edge.a]||!RN[edge.b])return;
      const target=findProvNode(root,edge.b);if(!target)return;
      const branch=ensureProvChild(target,edge.a,routeId,edgeId,edge.rel);if(branch)addProvRouteId(branch,routeId);
    });
    const configs=[...(route.configuration_ids||[]),...((route.subject_variant&&route.subject_variant.distinguishing_configuration_ids)||[])];
    const procedures=route.subject_procedure_ids||[];
    const outputs=route.subject_output_id?[route.subject_output_id]:[];
    const inputs=route.additional_input_ids||[];
    const gapsForRoute=route.gap_ids||[];
    const declared=[
      ["Declared configuration","configuration",configs],
      ["Declared procedures","procedure",procedures],
      ["Declared outputs","artifact",outputs],
      ["Additional inputs","additional-input",inputs],
      ["Declared gaps","gap",gapsForRoute]
    ];
    declared.forEach(([label,category,ids])=>{
      ids.filter(id=>RN[id]&&!findProvNode(root,id)).forEach(id=>{
        const section=ensureProvSection(root,label,category);
        const child=ensureProvChild(section,id,routeId,null,"declared");if(child)addProvRouteId(section,routeId);
      });
    });
  });
  return root;
}
function buildClaimEvidenceTree(claimId,supportEdges,openGaps){
  const root=newProvTreeNode(claimId,false,RN[claimId]?RN[claimId].label:claimId,"claim");
  const byLocator=new Map();
  (supportEdges||[]).forEach(edge=>{
    const result=RN[edge.a];if(!result)return;
    const locator=(result.ref&&result.ref.paper_locator)||"Unassigned location";
    if(!byLocator.has(locator))byLocator.set(locator,[]);byLocator.get(locator).push({edge,result});
  });
  byLocator.forEach((items,locator)=>{
    const group=items.length>1?newProvTreeNode(null,true,locator,"result-group"):null;
    if(group){group.category="supporting-results";root.children.push(group);}
    items.forEach(({edge,result})=>{
      const resultTree=buildFoldedProvenanceTree(result.id,routesByResult[result.id]||[]);
      resultTree.assertionLevel=edge.level||"";
      (group?group.children:root.children).push(resultTree);
    });
  });
  if((openGaps||[]).length){
    const gapGroup=newProvTreeNode(null,true,"Open gaps","gap-group");gapGroup.category="open-gaps";
    (openGaps||[]).forEach(gap=>{
      const child=newProvTreeNode(gap.id,false,gap.question||gap.missing_content||"Missing evidence","gap");
      child.gap=true;gapGroup.children.push(child);
    });
    root.children.push(gapGroup);
  }
  return root;
}
let provTreeSeq=0;
function renderRouteIndex(routeList){
  const seen=new Set(),unique=(routeList||[]).filter(route=>{
    if(!route||seen.has(route.id))return false;seen.add(route.id);return true;
  });
  if(!unique.length)return "";
  return `<div class="prov-route-index"><div class="prov-route-heading">Declared routes <span class="n">${unique.length}</span></div>`+
    unique.map((route,index)=>`<button type="button" class="prov-route-branch${activeRoute&&activeRoute.id===route.id?" active":""}" data-route-branch="${esc(route.id||"")}">
      <span class="prov-route-mark">↳</span><span>${esc(routeLabel(route,index))}</span><span class="prov-route-meta">${esc((route.path||[]).length)} nodes</span></button>`).join("")+`</div>`;
}
function renderFoldedTreeNode(tree,options,depth){
  options=options||{};depth=depth||0;
  const children=tree.children||[],hasChildren=children.length>0;
  const open=(depth===0&&options.root!==false)||
    (!tree.nodeId&&options.openStructural===true&&depth===1);
  const domId="pg-prov-"+(++provTreeSeq),active=activeRoute&&tree.routeIds&&tree.routeIds.includes(activeRoute.id);
  const node=tree.nodeId?RN[tree.nodeId]:null;
  const label=tree.structural?tree.label:(node?node.label:tree.label);
  const kind=tree.structural?(tree.kind||"group"):(node?node.kind:tree.kind);
  const routeCount=(tree.routeIds||[]).length;
  const badge=tree.assertionLevel?`<span class="prov-node-count">${esc(tree.assertionLevel)}</span>`:
    (routeCount>1?`<span class="prov-node-count">${routeCount} routes</span>`:"");
  const toggle=hasChildren?`<button type="button" class="prov-toggle" data-tree-toggle="${domId}" aria-expanded="${open?"true":"false"}" aria-label="${open?"Collapse":"Expand"}">${open?"−":"+"}</button>`:`<span class="prov-toggle-spacer"></span>`;
  const labelHtml=tree.nodeId?`<button type="button" class="prov-node-label" data-node="${esc(tree.nodeId)}">${esc(label)}</button>`:`<span class="prov-structural-label">${esc(label)}</span>`;
  const childHtml=hasChildren?`<div class="prov-children${open?" open":""}" id="${domId}">${children.map(child=>renderFoldedTreeNode(child,options,depth+1)).join("")}</div>`:"";
  return `<div class="prov-entry ${tree.structural?"prov-structural":"prov-real"}${active?" route-active":""}" data-prov-kind="${esc(kind)}">
    <div class="prov-row">${toggle}${labelHtml}<span class="prov-node-kind">${esc(kind)}</span>${badge}</div>${childHtml}</div>`;
}
function renderFoldedProvenanceTree(rootId,routeList,options){
  const tree=buildFoldedProvenanceTree(rootId,routeList);
  const opts=Object.assign({root:true,openStructural:false},options||{});
  return `<div class="prov-tree">${renderFoldedTreeNode(tree,opts,0)}${renderRouteIndex(routeList)}</div>`;
}
function renderClaimProvenanceTree(claimId,supportEdges,openGaps){
  const tree=buildClaimEvidenceTree(claimId,supportEdges,openGaps);
  return `<div class="prov-tree claim-prov-tree">${renderFoldedTreeNode(tree,{root:true,openStructural:true},0)}${renderRouteIndex(supportEdges.flatMap(edge=>routesByResult[edge.a]||[]))}</div>`;
}

function renderClaimBrowser(){
  if(!activeClaimId||!claimChain){closeClaimBrowser();return;}
  openClaimBrowser();
  const n=RN[activeClaimId],nd=n.ref;
  const guide=hasNativeReadingMap()?nativeReadingMap.guideByClaimId[activeClaimId]:null;
  const head=document.getElementById("pg-claim-head"),body=document.getElementById("pg-claim-body");
  const supports=exactEdges.filter(e=>!e.gap&&e.b===activeClaimId&&e.rel==="supports");
  const openGaps=gaps.filter(gp=>gp.category==="unsupported_claim"&&(gp.affects||[]).includes(activeClaimId));
  // paper_locator still determines the supporting-result grouping; each
  // result keeps its declared Assertion level inside the folded tree.
  head.innerHTML=kindPill("claim","Claim browser")+
    `<div class="ititle">${esc((guide&&guide.short_label)||nd.label||activeClaimId)}</div>`+
    `<div class="iloc">${supports.length} supporting result${supports.length===1?"":"s"} · ${openGaps.length} open gap${openGaps.length===1?"":"s"}</div>`;
  let h="";
  if(guide&&guide.takeaway)h+=`<section class="sec"><div class="sh">Takeaway</div><div class="reading-takeaway">${esc(guide.takeaway.text||"")}</div>${evBlock(guide.takeaway.evidence_ids)}</section>`;
  const featured=(guide&&guide.featured_result_ids||[]).filter(id=>RN[id]);
  if(featured.length)h+=`<section class="sec"><div class="sh">Key evidence</div><div class="pill-row">`+
    featured.map(id=>`<button class="p" data-node="${esc(id)}">${esc(RN[id].label||id)}</button>`).join("")+`</div></section>`;
  if(supports.length||openGaps.length){
    h+=`<section class="sec"><div class="sh">Evidence routes · Supporting results <span class="n">${supports.length} supporting result${supports.length===1?"":"s"} · ${openGaps.length} gap${openGaps.length===1?"":"s"}</span></div>`+
      `<div class="prov-caption">Claim → supporting results → declared provenance</div>`+
      renderClaimProvenanceTree(activeClaimId,supports,openGaps)+`</section>`;
  }
  const sal=nd.salience_evidence_ids||[];
  if(sal.length)h+=`<section class="sec"><div class="sh">Stated in <span class="n">${sal.length}</span></div>${evBlock(sal)}</section>`;
  if(openGaps.length)h+=`<section class="sec"><div class="sh gap-heading">Open gaps <span class="n">${openGaps.length}</span></div>`+
    openGaps.map(gp=>`<button class="claim-gap" data-node="${esc(gp.id)}"><span>?</span><span>${esc(gp.question||gp.missing_content||"Missing evidence")}</span></button>`).join("")+`</section>`;
  body.innerHTML=h;wireInspector(body);
}

function renderClaimInspector(n,nd,head,body){
  const isHead = headlineClaims.has(n.id);
  const grpTitles = (claimGroups[n.id]||[]).map(gid=>groupById[gid]&&groupById[gid].title).filter(Boolean);
  const guide=hasNativeReadingMap()?nativeReadingMap.guideByClaimId[n.id]:null;
  head.innerHTML = kindPill("claim", "Claim"+(nd.claim_form?" · "+nd.claim_form:"")) +
    (isHead ? `<div class="hlbadge">★ Headline claim${grpTitles.length?` · ${esc(grpTitles[0])}`:""}</div>`
            : `<div class="subbadge">non-headline claim</div>`) +
    `<div class="ititle">${esc((guide&&guide.short_label)||nd.label||n.id)}</div>` +
    (guide&&guide.short_label&&guide.short_label!==nd.label?`<div class="iloc">${esc(nd.label||n.id)}</div>`:"");
  let h="";
  if(guide&&guide.takeaway){
    h+=`<div class="sec"><div class="sh">Reading takeaway</div><div class="reading-takeaway">${esc(guide.takeaway.text||"")}</div>${evBlock(guide.takeaway.evidence_ids)}</div>`;
  }
  if(guide){
    const featuredResults=(guide.featured_result_ids||[]).filter(id=>RN[id]);
    const featuredMeasurements=(guide.featured_measurement_ids||[]).map(mid=>{
      for(const resultId of featuredResults){
        const measurement=measOf(RN[resultId]).find(item=>item.id===mid);
        if(measurement)return {resultId,measurement};
      }
      return null;
    }).filter(Boolean);
    if(featuredResults.length||featuredMeasurements.length){
      h+=`<div class="sec"><div class="sh">Featured evidence</div><div class="pill-row">`+
        featuredResults.map(id=>`<span class="p" data-node="${esc(id)}">${esc(RN[id].label||id)}</span>`).join("")+`</div>`;
      if(featuredMeasurements.length)h+=`<table class="meas featured-measurements"><tbody>`+
        featuredMeasurements.map(item=>`<tr><td>${esc(item.measurement.metric)}</td><td class="val">${esc(item.measurement.raw_text!=null?item.measurement.raw_text:item.measurement.numeric_value)}${item.measurement.unit?` <span class="u">${esc(item.measurement.unit)}</span>`:""}</td></tr>`).join("")+`</tbody></table>`;
      h+=`</div>`;
    }
  }
  // Support: incoming supports-edges (result → claim), with their evidence + rationale
  const sup = exactEdges.filter(e=>!e.gap && e.b===n.id && e.rel==="supports");
  const clmGaps = gaps.filter(gp=>gp.category==="unsupported_claim" &&
    (gp.affects||[]).includes(n.id));
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
  const nb=[...(inspectorAdjacency()[n.id]||[])].filter(id=>RN[id]);
  if(nb.length){ h+=`<div class="sec"><div class="sh">Connections <span class="n">${nb.length}</span></div><div class="pill-row">`+
    nb.slice(0,24).map(id=>`<span class="p" data-node="${esc(id)}">${esc((RN[id].label||id).slice(0,28))}</span>`).join("")+`</div></div>`; }
  body.innerHTML=h; wireInspector(body);
}

function renderDetailInspector(){
  if(!detailSelection){closeDetailInspector();return;}
  const selection=detailSelection;
  if(selection.type==="edge"){
    if(selection.value.virtualType==="result_summary")renderSummaryEdgeInspector(selection.value);
    else renderInspectorEdge(selection.value);
    return;
  }
  const n=selection.value; if(!n){closeDetailInspector();return;}
  openDetailInspector();
  const head=document.getElementById("pg-detail-head"), body=document.getElementById("pg-detail-body");
  if(n.gap){ renderGapInspector(n); return; }
  const nd=n.ref;
  if(n.kind==="claim"){ renderClaimInspector(n,nd,head,body); return; }
  head.innerHTML = kindPill(n.kind) +
    `<div class="ititle">${esc(nd.label||n.id)}</div>` +
    (nd.paper_locator?`<div class="iloc">${esc(nd.paper_locator)}${nd.system_or_condition?" · "+esc(nd.system_or_condition):""}</div>`:
      `<div class="iloc">${esc(n.id)}</div>`);
  let h="";
  // Folded upstream provenance: shared path segments are merged by node id,
  // while every declared route remains selectable for route-only highlighting.
  const rts=routesByResult[n.id];
  if(rts && rts.length){
    h+=`<div class="sec"><div class="sh">Evidence routes <span class="n">${rts.length}</span></div>`+
      `<div class="prov-caption">Result → declared upstream paths and branches</div>`+
      renderFoldedProvenanceTree(n.id,rts,{root:false})+`</div>`;
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
  const nb=[...(inspectorAdjacency()[n.id]||[])].filter(id=>RN[id]);
  if(nb.length){ h+=`<div class="sec"><div class="sh">Connections <span class="n">${nb.length}</span></div><div class="pill-row">`+
    nb.slice(0,24).map(id=>`<span class="p" data-node="${esc(id)}">${esc((RN[id].label||id).slice(0,28))}</span>`).join("")+`</div></div>`; }
  body.innerHTML=h; wireInspector(body);
}

function renderGapInspector(n){
  const g=n.ref; const head=document.getElementById("pg-detail-head"), body=document.getElementById("pg-detail-body");
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
    // `affects` entries are a mix of node ids and provenance-route ids (see
    // graph-contract) -- label each kind correctly instead of calling every
    // reference a "route".
    const nodeAffects=g.affects.filter(a=>RN[a]);
    const routeAffects=g.affects.filter(a=>routesById[a]);
    const unknown=g.affects.filter(a=>!RN[a]&&!routesById[a]);
    h+=`<div class="sec"><div class="sh">Affects <span class="n">${g.affects.length}</span></div>`;
    if(nodeAffects.length){
      h+=`<div style="font-size:11px;color:var(--ink-faint);margin-bottom:4px">${nodeAffects.length} node${nodeAffects.length>1?"s":""}</div>
        <div class="pill-row">`+nodeAffects.map(id=>`<span class="p" data-node="${esc(id)}">${esc(RN[id].label||id)}</span>`).join("")+`</div>`;
    }
    if(routeAffects.length){
      h+=`<div style="font-size:11px;color:var(--ink-faint);margin:${nodeAffects.length?"10px":"0"} 0 4px">${routeAffects.length} provenance route${routeAffects.length>1?"s":""}</div>
        <div style="font-size:12px;color:var(--ink-dim);line-height:1.5">This missing link breaks ${routeAffects.length===1?"a":"the"} provenance chain for ${routeAffects.length} route${routeAffects.length>1?"s":""} — ${routeAffects.length>1?"those":"that"} route${routeAffects.length>1?"s":""} cannot be fully drawn from the paper alone.</div>`;
    }
    if(unknown.length){
      h+=`<div style="font-size:11px;color:var(--ink-faint);margin-top:6px">${unknown.length} unresolved reference${unknown.length>1?"s":""}: ${unknown.map(a=>esc(a)).join(", ")}</div>`;
    }
    h+=`</div>`;
  }
  body.innerHTML=h; wireInspector(body);
}
function renderSummaryEdgeInspector(e){
  openDetailInspector();
  const head=document.getElementById("pg-detail-head"),body=document.getElementById("pg-detail-body");
  const p=RN[e.a],q=RN[e.b],constituents=e.constituentEdges||[];
  head.innerHTML=`<span class="kindpill" style="color:${pal().pillRecon}"><span class="d"></span>Bundled ${esc(e.rel)}</span>
    <div class="ititle">${esc(p.label)} <span style="color:var(--ink-faint)">→</span> ${esc(q.label)}</div>
    <div class="iloc">${constituents.length} exact relationship${constituents.length===1?"":"s"}</div>`;
  body.innerHTML=`<div class="sec"><div class="sh">Constituent relationships <span class="n">${constituents.length}</span></div>
    <div class="pill-row">${constituents.map(item=>{
      const a=RN[item.a],b=RN[item.b];
      return `<span class="p" data-edge="${esc(item.id)}">${esc(a?a.label:item.a)} → ${esc(b?b.label:item.b)} · ${esc(item.level)}</span>`;
    }).join("")}</div></div>`;
  wireInspector(body);
}
function renderInspectorEdge(e){
  openDetailInspector();
  const head=document.getElementById("pg-detail-head"), body=document.getElementById("pg-detail-body");
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
  body.querySelectorAll("[data-node]").forEach(el=>el.addEventListener("click",()=>{
    const n=RN[el.getAttribute("data-node")];if(!n)return;
    // Tree nodes are secondary inspection while Claim browsing; do not leave
    // the Claim Browser just because the reader followed an upstream node.
    if(activeClaimId&&el.closest(".prov-tree"))selectDetailNode(n);else selectNode(n);
  }));
  body.querySelectorAll("[data-edge]").forEach(el=>el.addEventListener("click",()=>{
    const e=edgeById[el.getAttribute("data-edge")];if(e)selectEdge(e);
  }));
  body.querySelectorAll("[data-tree-toggle]").forEach(el=>el.addEventListener("click",ev=>{
    ev.stopPropagation();
    const target=document.getElementById(el.getAttribute("data-tree-toggle"));if(!target)return;
    const open=target.classList.toggle("open");el.setAttribute("aria-expanded",open?"true":"false");
    el.setAttribute("aria-label",open?"Collapse":"Expand");el.textContent=open?"−":"+";
  }));
  body.querySelectorAll("[data-route-branch]").forEach(el=>el.addEventListener("click",ev=>{
    ev.stopPropagation();const route=routesById[el.getAttribute("data-route-branch")];if(!route)return;
    activeRoute=route;computeHighlight();
    if(activeClaimId)renderClaimBrowser();
    if(detailSelection)renderDetailInspector();
    renderCrumb();
  }));
  body.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>{
    const res=el.getAttribute("data-res"), i=+el.getAttribute("data-route");
    activeRoute=routesByResult[res][i]; computeHighlight(); renderDetailInspector(); renderCrumb(); }));
}

/* ---------- crumb ---------- */
function renderCrumb(){
  const c=document.getElementById("pg-crumb");
  if(activeRoute){ const res=nodeById[activeRoute.result_id];
    c.style.display="flex"; c.innerHTML=`<span class="lvl">route</span><span>${esc(res?res.label:activeRoute.result_id)}</span><span class="x">✕</span>`;
    c.querySelector(".x").onclick=clearSel; return; }
  if(activeClaimId){ const n=nodeById[activeClaimId];
    c.style.display="flex"; c.innerHTML=`<span class="lvl">claim</span><span>${esc(n?n.label:activeClaimId)}</span><span class="x">✕</span>`;
    c.querySelector(".x").onclick=clearSel; return; }
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
function orderedCoreClaimIds(){
  const ordered=[],seen=new Set();
  if(hasNativeReadingMap())(nativeReadingMap.map.claim_guides||[]).forEach(guide=>{
    if(RN[guide.claim_id]&&!seen.has(guide.claim_id)){seen.add(guide.claim_id);ordered.push(guide.claim_id);}
  });
  const evidenceRank={};(G.evidence_spans||[]).forEach((span,index)=>evidenceRank[span.id]=index);
  const nodeRank={};rawNodes.forEach((node,index)=>nodeRank[node.id]=index);
  [...headlineClaims].filter(id=>RN[id]&&!seen.has(id)).sort((a,b)=>{
    const salience=id=>Math.min(...((nodeById[id].salience_evidence_ids||[]).map(ev=>evidenceRank[ev]).filter(Number.isFinite)),Infinity);
    return salience(a)-salience(b)||(nodeRank[a]||0)-(nodeRank[b]||0);
  }).forEach(id=>{seen.add(id);ordered.push(id);});
  return ordered;
}
function buildReadingOutline(){
  const el=document.getElementById("pg-outline");
  const ordered=orderedCoreClaimIds();
  el.innerHTML=ordered.map((cid,i)=>{
    const incoming=exactEdges.filter(e=>!e.gap&&e.rel==="supports"&&e.b===cid);
    const openGaps=gaps.filter(gp=>gp.category==="unsupported_claim"&&(gp.affects||[]).includes(cid));
    const guide=hasNativeReadingMap()?nativeReadingMap.guideByClaimId[cid]:null;
    return `<button type="button" class="outline-claim" data-claim="${esc(cid)}">
      <span class="outline-index">${String(i+1).padStart(2,"0")}</span>
      <span class="claim-label">${esc((guide&&guide.short_label)||RN[cid].label)}</span>
      <span class="claim-support">${incoming.length?`<span>${incoming.length} supporting result${incoming.length===1?"":"s"}</span>`:"<span>no supporting result</span>"}
        ${openGaps.length?`<span class="unsupported">${openGaps.length} open gap${openGaps.length===1?"":"s"}</span>`:""}</span>
    </button>`;
  }).join("");
  el.querySelectorAll("[data-claim]").forEach(btn=>btn.addEventListener("click",()=>{
    const n=RN[btn.getAttribute("data-claim")]; if(n)selectNode(n);
  }));
}
function buildStructuralIntroductions(){
  const el=document.getElementById("pg-structural");
  el.innerHTML=groups.map(group=>{
    const members=(group.member_node_ids||[]).map(id=>RN[id]).filter(n=>n&&n.kind!=="result"&&n.kind!=="claim");
    if(!members.length)return "";
    return `<section class="structural-group"><div class="structural-title">${esc(group.title||group.id)}</div>
      <div class="pill-row">${members.map(n=>`<button class="p" data-node="${esc(n.id)}">${esc(n.label)}</button>`).join("")}</div></section>`;
  }).join("");
  el.querySelectorAll("[data-node]").forEach(btn=>btn.addEventListener("click",()=>{
    const n=RN[btn.getAttribute("data-node")];if(n)selectNode(n);
  }));
}
function buildReadingSummary(){
  const takeaway=hasNativeReadingMap()&&nativeReadingMap.map.paper_takeaway;
  document.getElementById("pg-paper-summary").textContent=(takeaway&&takeaway.text)||(G.paper&&G.paper.title)||"Untitled paper";
  const basis=document.getElementById("pg-reading-basis");
  if(basis)basis.style.display="none";
  const headlineCount=headlineClaims.size;
  const resultCount=rawNodes.filter(n=>n.kind==="result").length;
  document.getElementById("pg-reading-stats").innerHTML=
    `<span class="summary-stat"><b>${headlineCount}</b> core claims</span>
     <span class="summary-stat"><b>${resultCount}</b> results</span>
     <span class="summary-stat gaps"><b>${gaps.length}</b> gaps</span>`;
  const q=document.getElementById("pg-open-questions");
  q.innerHTML=gaps.length?gaps.map((gp,i)=>`<button type="button" class="open-question" data-gap="${esc(gp.id)}">
    <span class="qmark">?</span><span class="qtext">${esc(gp.question||gp.missing_content||"Missing evidence")}</span>
    <span class="qcat">${esc(gp.category||"gap")}</span></button>`).join(""):
    `<div class="open-question-empty">No recorded evidence gaps.</div>`;
  q.querySelectorAll("[data-gap]").forEach(btn=>btn.addEventListener("click",()=>{
    const n=RN[btn.getAttribute("data-gap")];if(n)selectNode(n);
  }));
}
function syncOutlineUI(){
  document.querySelectorAll(".outline-claim").forEach(row=>
    row.classList.toggle("active",row.getAttribute("data-claim")===activeClaimId));
}
function buildStats(){
  const el=document.getElementById("pg-stats");
  const nc=rawNodes.length, ec=(G.edges||[]).length, rc=routes.length, gc=gaps.length;
  el.innerHTML=[["nodes",nc],["edges",ec],["routes",rc]].map(([l,v])=>
    `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")+
    `<div class="stat gap"><div class="v">${gc}</div><div class="l">gaps</div></div>`;
}

/* ---------- search ---------- */
function revealSearchMatches(query){
  const q=(query||"").trim().toLowerCase(),matches=new Set();
  if(!q)return matches;
  rawNodes.forEach(raw=>{
    if(!((raw.label||"").toLowerCase().includes(q)||raw.id.toLowerCase().includes(q)))return;
    matches.add(raw.id);
    const groupId=compactProjection.groupByMemberId[raw.id];
    if(viewMode==="compact"&&groupId){
      manualExpandedResultGroups.add(groupId);
      placeResultGroupChildren(RN[groupId]);
    }
  });
  return matches;
}
document.getElementById("pg-search").addEventListener("input",ev=>{
  searchHit=revealSearchMatches(ev.target.value);
  if(searchHit.size){
    settleVisible(80);
    fitIds(searchHit);
  }
});

/* ---------- controls ---------- */
function setRailWidth(width,preserveCanvas,persist){
  const max=innerWidth>900?Math.max(RAIL_MIN,Math.min(RAIL_MAX,innerWidth-180)):RAIL_MAX;
  const next=Math.max(RAIL_MIN,Math.min(max,Math.round(width)));
  const delta=next-railWidth;
  railWidth=next;
  document.documentElement.style.setProperty("--rail-width",next+"px");
  document.getElementById("pg-rail-resizer").setAttribute("aria-valuenow",String(next));
  if(preserveCanvas&&!railCollapsed&&innerWidth>900&&delta){
    camAnim=null;
    cam.x-=delta/(2*cam.z);
  }
  if(persist!==false){try{localStorage.setItem(RAIL_WIDTH_KEY,String(next));}catch(e){}}
}
function setRailCollapsed(collapsed,preserveCanvas,persist){
  const next=!!collapsed;if(next===railCollapsed&&persist!==false)return;
  const oldDisplayed=railCollapsed?RAIL_COLLAPSED_WIDTH:railWidth;
  const newDisplayed=next?RAIL_COLLAPSED_WIDTH:railWidth;
  railCollapsed=next;
  const root=document.getElementById("pg-root"),btn=document.getElementById("pg-rail-toggle");
  root.classList.toggle("rail-collapsed",next);
  btn.title=next?"Expand sidebar":"Collapse sidebar";
  btn.setAttribute("aria-label",btn.title);
  btn.setAttribute("aria-expanded",next?"false":"true");
  if(preserveCanvas&&innerWidth>900){
    camAnim=null;
    cam.x-=(newDisplayed-oldDisplayed)/(2*cam.z);
  }
  if(persist!==false){try{localStorage.setItem(RAIL_COLLAPSED_KEY,next?"true":"false");}catch(e){}}
}
function initRailControls(){
  let storedWidth=RAIL_DEFAULT,storedCollapsed=false;
  try{
    const raw=localStorage.getItem(RAIL_WIDTH_KEY);
    if(raw!==null&&Number.isFinite(+raw))storedWidth=+raw;
    storedCollapsed=localStorage.getItem(RAIL_COLLAPSED_KEY)==="true";
  }catch(e){}
  setRailWidth(storedWidth,false,false);
  setRailCollapsed(storedCollapsed,false,false);
  const root=document.getElementById("pg-root");
  const handle=document.getElementById("pg-rail-resizer");
  const toggle=document.getElementById("pg-rail-toggle");
  let drag=null;
  handle.addEventListener("pointerdown",ev=>{
    if(innerWidth<=900)return;
    drag={x:ev.clientX,width:railWidth,collapsed:false};
    camAnim=null;root.classList.add("rail-resizing");handle.classList.add("dragging");
    handle.setPointerCapture(ev.pointerId);ev.preventDefault();
  });
  handle.addEventListener("pointermove",ev=>{
    if(!drag)return;
    const requested=drag.width+(ev.clientX-drag.x);
    if(drag.collapsed){
      if(requested>=RAIL_MIN){
        drag.collapsed=false;
        setRailCollapsed(false,true,false);
        setRailWidth(requested,true,false);
      }
      return;
    }
    if(requested<RAIL_MIN-RAIL_COLLAPSE_DRAG_DISTANCE){
      drag.collapsed=true;
      setRailWidth(RAIL_MIN,false,false);
      setRailCollapsed(true,true,false);
      return;
    }
    setRailWidth(requested,true,false);
  });
  function stopRailDrag(ev){
    if(!drag)return;
    drag=null;root.classList.remove("rail-resizing");handle.classList.remove("dragging");
    try{handle.releasePointerCapture(ev.pointerId);}catch(e){}
    try{
      localStorage.setItem(RAIL_WIDTH_KEY,String(railWidth));
      localStorage.setItem(RAIL_COLLAPSED_KEY,railCollapsed?"true":"false");
    }catch(e){}
  }
  handle.addEventListener("pointerup",stopRailDrag);
  handle.addEventListener("pointercancel",stopRailDrag);
  handle.addEventListener("dblclick",()=>setRailWidth(RAIL_DEFAULT,true));
  handle.addEventListener("keydown",ev=>{
    let next=null;
    if(ev.key==="ArrowLeft")next=railWidth-(ev.shiftKey?32:16);
    if(ev.key==="ArrowRight")next=railWidth+(ev.shiftKey?32:16);
    if(ev.key==="Home")next=RAIL_MIN;
    if(ev.key==="End")next=RAIL_MAX;
    if(next!==null){setRailWidth(next,true);ev.preventDefault();}
  });
  toggle.addEventListener("click",()=>setRailCollapsed(!railCollapsed,true));
  addEventListener("resize",()=>setRailWidth(railWidth,false,false));
}
function setDetailWidth(width,preserveCanvas,persist){
  const next=Math.max(DETAIL_MIN,Math.min(DETAIL_MAX,Math.round(width)));
  const delta=next-detailWidth;
  detailWidth=next;
  document.documentElement.style.setProperty("--detail-width",next+"px");
  document.getElementById("pg-detail-resizer").setAttribute("aria-valuenow",String(next));
  if(preserveCanvas&&innerWidth>900&&delta){
    camAnim=null;
    cam.x+=delta/(2*cam.z);
  }
  if(persist!==false){try{localStorage.setItem(DETAIL_WIDTH_KEY,String(next));}catch(e){}}
}
function initDetailResizeControl(){
  let storedWidth=DETAIL_DEFAULT;
  try{
    const raw=localStorage.getItem(DETAIL_WIDTH_KEY);
    if(raw!==null&&Number.isFinite(+raw))storedWidth=+raw;
  }catch(e){}
  setDetailWidth(storedWidth,false,false);
  const root=document.getElementById("pg-root");
  const handle=document.getElementById("pg-detail-resizer");
  let drag=null;
  handle.addEventListener("pointerdown",ev=>{
    if(innerWidth<=900)return;
    drag={x:ev.clientX,width:detailWidth};
    camAnim=null;root.classList.add("detail-resizing");handle.classList.add("dragging");
    handle.setPointerCapture(ev.pointerId);ev.preventDefault();
  });
  handle.addEventListener("pointermove",ev=>{
    if(!drag)return;
    setDetailWidth(drag.width+(drag.x-ev.clientX),true,false);
  });
  function stopDetailDrag(ev){
    if(!drag)return;
    drag=null;root.classList.remove("detail-resizing");handle.classList.remove("dragging");
    try{handle.releasePointerCapture(ev.pointerId);}catch(e){}
    try{localStorage.setItem(DETAIL_WIDTH_KEY,String(detailWidth));}catch(e){}
  }
  handle.addEventListener("pointerup",stopDetailDrag);
  handle.addEventListener("pointercancel",stopDetailDrag);
  handle.addEventListener("dblclick",()=>setDetailWidth(DETAIL_DEFAULT,true));
  handle.addEventListener("keydown",ev=>{
    let next=null;
    if(ev.key==="ArrowLeft")next=detailWidth+(ev.shiftKey?32:16);
    if(ev.key==="ArrowRight")next=detailWidth-(ev.shiftKey?32:16);
    if(ev.key==="Home")next=DETAIL_MIN;
    if(ev.key==="End")next=DETAIL_MAX;
    if(next!==null){setDetailWidth(next,true);ev.preventDefault();}
  });
  addEventListener("resize",()=>setDetailWidth(detailWidth,false,false));
}
function setClaimWidth(width,preserveCanvas,persist){
  const next=Math.max(CLAIM_MIN,Math.min(CLAIM_MAX,Math.round(width)));
  const delta=next-claimWidth;
  claimWidth=next;
  document.documentElement.style.setProperty("--claim-width",next+"px");
  document.getElementById("pg-claim-resizer").setAttribute("aria-valuenow",String(next));
  if(preserveCanvas&&innerWidth>900&&delta){
    camAnim=null;
    cam.x+=delta/(2*cam.z);
  }
  if(persist!==false){try{localStorage.setItem(CLAIM_WIDTH_KEY,String(next));}catch(e){}}
}
function initClaimResizeControl(){
  let storedWidth=CLAIM_DEFAULT;
  try{
    const raw=localStorage.getItem(CLAIM_WIDTH_KEY);
    if(raw!==null&&Number.isFinite(+raw))storedWidth=+raw;
  }catch(e){}
  setClaimWidth(storedWidth,false,false);
  const root=document.getElementById("pg-root");
  const handle=document.getElementById("pg-claim-resizer");
  let drag=null;
  handle.addEventListener("pointerdown",ev=>{
    if(innerWidth<=900)return;
    drag={x:ev.clientX,width:claimWidth};
    camAnim=null;root.classList.add("claim-resizing");handle.classList.add("dragging");
    handle.setPointerCapture(ev.pointerId);ev.preventDefault();
  });
  handle.addEventListener("pointermove",ev=>{
    if(!drag)return;
    setClaimWidth(drag.width+(drag.x-ev.clientX),true,false);
  });
  function stopClaimDrag(ev){
    if(!drag)return;
    drag=null;root.classList.remove("claim-resizing");handle.classList.remove("dragging");
    try{handle.releasePointerCapture(ev.pointerId);}catch(e){}
    try{localStorage.setItem(CLAIM_WIDTH_KEY,String(claimWidth));}catch(e){}
  }
  handle.addEventListener("pointerup",stopClaimDrag);
  handle.addEventListener("pointercancel",stopClaimDrag);
  handle.addEventListener("dblclick",()=>setClaimWidth(CLAIM_DEFAULT,true));
  handle.addEventListener("keydown",ev=>{
    let next=null;
    if(ev.key==="ArrowLeft")next=claimWidth+(ev.shiftKey?32:16);
    if(ev.key==="ArrowRight")next=claimWidth-(ev.shiftKey?32:16);
    if(ev.key==="Home")next=CLAIM_MIN;
    if(ev.key==="End")next=CLAIM_MAX;
    if(next!==null){setClaimWidth(next,true);ev.preventDefault();}
  });
  addEventListener("resize",()=>setClaimWidth(claimWidth,false,false));
}
function settleVisible(iterations){
  localInteractionIds=null;alpha=0.05;
  const frames=Math.min(iterations||300,24);
  for(let i=0;i<frames;i++){alphaTarget=i<frames*.5?0.025:0;tick();}
  alpha=0;alphaTarget=0;
}
function setViewMode(mode,initial){
  viewMode=mode==="full"?"full":"compact";
  if(viewMode==="compact"){
    manualExpandedResultGroups.clear();claimExpandedResultGroups.clear();
    if(activeClaimId){
      exactEdges.filter(e=>!e.gap&&e.b===activeClaimId&&e.rel==="supports").forEach(e=>{
        const groupId=compactProjection.groupByMemberId[e.a];
        if(groupId){claimExpandedResultGroups.add(groupId);placeResultGroupChildren(RN[groupId]);}
      });
    }
  }
  const root=document.getElementById("pg-root");
  root.classList.toggle("compact-mode",viewMode==="compact");
  root.classList.toggle("full-mode",viewMode==="full");
  [["pg-mode-compact","compact"],["pg-mode-full","full"]].forEach(pair=>{
    const btn=document.getElementById(pair[0]),on=viewMode===pair[1];
    btn.classList.toggle("active",on);btn.setAttribute("aria-pressed",on?"true":"false");
  });
  detailSelection=null;selEdge=null;activeRoute=null;closeDetailInspector();
  if(!activeClaimId){selNode=null;hi=null;}else{selNode=RN[activeClaimId];computeHighlight();renderClaimBrowser();}
  syncOutlineUI();renderCrumb();
  settleVisible(initial?420:260);
  if(activeClaimId&&claimChain)fitIds(claimChain.nodeIds);else fitAll();
}
document.getElementById("pg-claim-close").addEventListener("click",()=>exitClaimBrowsing(true));
document.getElementById("pg-detail-close").addEventListener("click",()=>{
  detailSelection=null;selNode=activeClaimId?RN[activeClaimId]:null;selEdge=null;activeRoute=null;
  closeDetailInspector();computeHighlight();renderCrumb();
});
document.getElementById("pg-tab-claim").addEventListener("click",()=>{
  document.getElementById("pg-root").classList.remove("detail-tab-active");
});
document.getElementById("pg-tab-detail").addEventListener("click",()=>{
  if(detailSelection)document.getElementById("pg-root").classList.add("detail-tab-active");
});
document.getElementById("pg-zin").addEventListener("click",()=>{cam.z=Math.min(3.2,cam.z*1.25);});
document.getElementById("pg-zout").addEventListener("click",()=>{cam.z=Math.max(0.25,cam.z/1.25);});
document.getElementById("pg-zfit").addEventListener("click",fitAll);
document.getElementById("pg-layout-reset").addEventListener("click",()=>{
  applyEvidenceFlowLayout();
  alpha=0;alphaTarget=0;localInteractionIds=null;
  fitAll();
});
document.getElementById("pg-mode-compact").addEventListener("click",()=>setViewMode("compact"));
document.getElementById("pg-mode-full").addEventListener("click",()=>setViewMode("full"));
function fitIds(ids){
  const fitNodes=nodes.filter(n=>visibleNode(n)&&(!ids||ids.has(n.id)));if(!fitNodes.length)return;
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  fitNodes.forEach(n=>{minx=Math.min(minx,n.x);miny=Math.min(miny,n.y);maxx=Math.max(maxx,n.x);maxy=Math.max(maxy,n.y);});
  const cx=(minx+maxx)/2,cy=(miny+maxy)/2,w=maxx-minx+190,h=maxy-miny+190;
  const displayed=railCollapsed?RAIL_COLLAPSED_WIDTH:railWidth;
  const usableW=innerWidth-(innerWidth>900?displayed+rightDockWidth()+40:32);
  const z=Math.max(0.3,Math.min(1.25,Math.min(usableW/w,(innerHeight-96)/h)));
  animCam(cx-canvasOffset(z),cy,z);
}
function fitAll(){fitIds(null);}

/* ---------- boot ---------- */
document.getElementById("pg-paper").textContent = (G.paper&&G.paper.title)||"";
buildLegend();buildReadingOutline();buildStructuralIntroductions();buildReadingSummary();buildStats();
initRailControls();
initDetailResizeControl();
initClaimResizeControl();
applyEvidenceFlowLayout();
setViewMode("compact",true);
requestAnimationFrame(loop);
  }
})();
