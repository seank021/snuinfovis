// ========================== utils ==========================
const num = (x) => {
  if (x === null || x === undefined) return NaN;
  if (typeof x === "number") return x;
  const s = String(x).replace(/[,$]/g, "").trim();
  const v = parseFloat(s);
  return isFinite(v) ? v : NaN;
};
const parseRuntime = (s) => {
  if (s == null) return NaN;
  const m = String(s).match(/(\d+)\s*min/i);
  return m ? +m[1] : num(s);
};
const decadeOf = (y) => (isFinite(y) ? Math.floor(y / 10) * 10 : NaN);
const log1p = (v) => (v > 0 ? Math.log(v) : 0);
const mean = (a) => (a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN);
const std = (a) => {
  const m = mean(a); const v = mean(a.map(x => (x-m)*(x-m)));
  return Math.sqrt(v);
};
function uniqSorted(arr){
  return [...new Set(arr.filter(v=>v!=null && !Number.isNaN(v)))].sort((a,b)=>a-b);
}
function counts(arr) {
  const m = new Map();
  for (const k of arr) m.set(k, (m.get(k)||0)+1);
  return m;
}
function linreg(x, y) {
  const n = x.length;
  if (n < 2) return {a:0, b:0};
  const mx = mean(x), my = mean(y);
  let nume=0, deno=0;
  for (let i=0;i<n;i++){ nume += (x[i]-mx)*(y[i]-my); deno += (x[i]-mx)*(x[i]-mx); }
  const b = deno ? nume/deno : 0; const a = my - b*mx;
  return {a,b};
}
const tooltip = d3.select('body').append('div').attr('class','tooltip');

// ======================== data ======================
let RAW = [];
let DECADES = [];
let GENRE_MODE = 'stacked';
let NET_DEG_THRESH = 4;

const REQUIRED_COLS = {
  year: ["Released_Year", "Released Year", "Year"],
  genre: ["Genre"],
  rating: ["IMDB_Rating", "IMDB Rating", "IMDB"],
  metascore: ["Meta_score", "Meta Score", "Metascore"],
  votes: ["No_of_Votes", "No of Votes", "Votes"],
  runtime: ["Runtime"],
  gross: ["Gross"],
  director: ["Director"],
  stars: ["Stars", "Star1", "Star2", "Star3", "Star4"],
};

function pick(row, keys) { for (const k of keys) if (k in row) return row[k]; }
function normalizeRow(row){
  const year = num(pick(row, REQUIRED_COLS.year));
  const rt = parseRuntime(pick(row, REQUIRED_COLS.runtime));
  const imdb = num(pick(row, REQUIRED_COLS.rating));
  const meta = num(pick(row, REQUIRED_COLS.metascore));
  const votes = num(pick(row, REQUIRED_COLS.votes));
  const gross = num(String(pick(row, REQUIRED_COLS.gross)||"").replace(/[$,]/g,""));
  const genreStr = String(pick(row, REQUIRED_COLS.genre)||"");
  const primary = genreStr.split(",")[0].trim() || "Other";
  const director = (pick(row, REQUIRED_COLS.director) || "").toString().trim();
  let starsStr = pick(row, REQUIRED_COLS.stars);
  if (Array.isArray(REQUIRED_COLS.stars) && typeof starsStr !== "string") {
    const parts = [];
    for (const key of ["Star1","Star2","Star3","Star4"]) {
      if (row[key]) parts.push(String(row[key]).trim());
    }
    starsStr = parts.join(", ");
  }
  starsStr = (starsStr || "").toString();

  return {
    title: row.Title || row["Series_Title"] || "",
    year,
    decade: decadeOf(year),
    runtime_min: rt,
    imdb,
    meta,
    votes,
    logVotes: log1p(votes),
    gross,
    genre: primary,
    original_genres: genreStr,
    director,
    stars: starsStr
  };
}

async function tryFetchDefault() {
  try {
    const res = await fetch("../imdb_top_1000.csv", {cache: "no-store"});
    if (!res.ok) throw new Error("fetch failed");
    const csv = await res.text();
    const parsed = Papa.parse(csv, {header:true, dynamicTyping:false, skipEmptyLines:true});
    RAW = parsed.data.map(normalizeRow).filter(d => isFinite(d.decade));
    afterLoad();
  } catch (e) { console.log("auto fetch failed; use file upload", e); }
}

document.getElementById("fileInput").addEventListener("change", (ev)=>{
  const file = ev.target.files?.[0];
  if (!file) return;
  Papa.parse(file, { header:true, skipEmptyLines:true,
    complete: (res)=>{
      RAW = res.data.map(normalizeRow).filter(d => isFinite(d.decade));
      afterLoad();
    }
  });
});

document.getElementById("btnGenreStacked").addEventListener("click", ()=>{
  GENRE_MODE = 'stacked';
  document.getElementById("btnGenreStacked").classList.add("active");
  document.getElementById("btnGenreHorizontal").classList.remove("active");
  const dA = +document.getElementById("decadeA").value;
  const dB = +document.getElementById("decadeB").value;
  renderGenre(RAW.filter(r=>r.decade===dA), RAW.filter(r=>r.decade===dB), dA, dB);
});

document.getElementById("btnGenreHorizontal").addEventListener("click", ()=>{
  GENRE_MODE = 'horizontal';
  document.getElementById("btnGenreHorizontal").classList.add("active");
  document.getElementById("btnGenreStacked").classList.remove("active");
  const dA = +document.getElementById("decadeA").value;
  const dB = +document.getElementById("decadeB").value;
  renderGenre(RAW.filter(r=>r.decade===dA), RAW.filter(r=>r.decade===dB), dA, dB);
});

function afterLoad(){
  DECADES = uniqSorted(RAW.map(d => d.decade));
  populateDecadeSelects();
  renderAll();
}

function populateDecadeSelects(){
  const a = document.getElementById("decadeA");
  const b = document.getElementById("decadeB");
  a.innerHTML = ""; b.innerHTML = "";
  for (const d of DECADES){
    const opt1 = document.createElement("option");
    opt1.value = d; opt1.textContent = `${d}s`;
    const opt2 = opt1.cloneNode(true);
    a.appendChild(opt1); b.appendChild(opt2);
  }
  if (DECADES.length >= 2){
    a.value = String(DECADES[DECADES.length-2]);
    b.value = String(DECADES[DECADES.length-1]);
  }
}

document.getElementById("updateBtn").addEventListener("click", renderAll);

// ========================== render ==========================
function renderAll(){
  if (!RAW.length) return;
  const dA = +document.getElementById("decadeA").value;
  const dB = +document.getElementById("decadeB").value;
  const A = RAW.filter(r => r.decade===dA);
  const B = RAW.filter(r => r.decade===dB);

  renderCards(A,B,dA,dB);
  renderGenre(A,B,dA,dB);
  renderRuntime(A,B,dA,dB);
  renderAudienceCritic(A,B,dA,dB);
  renderFeatureImportance(A,B,dA,dB);
  renderNetworks(A,B,dA,dB);
}

// ---------- stat cards ----------
function renderCards(A,B,dA,dB){
  const el = document.getElementById("statsCards");
  const mk = (k,v)=>`<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const avg = (arr, key) => {
    const xs = arr.map(d=>d[key]).filter(v=>isFinite(v));
    if (!xs.length) return "–";
    const m = xs.reduce((a,b)=>a+b,0)/xs.length;
    return (key==="imdb") ? m.toFixed(2) : m.toFixed(1);
  };
  el.innerHTML =
    mk(`${dA}s #`, A.length) +
    mk(`${dB}s #`, B.length) +
    mk(`${dA}s Avg IMDB`, avg(A,"imdb")) +
    mk(`${dB}s Avg IMDB`, avg(B,"imdb"));
}

// ---------- charts: genre ----------
function renderGenre(A,B,dA,dB){
  const cA = counts(A.map(d=>d.genre));
  const cB = counts(B.map(d=>d.genre));
  const genres = [...new Set([...cA.keys(), ...cB.keys()])].sort();
  const yA = genres.map(g=>cA.get(g)||0);
  const yB = genres.map(g=>cB.get(g)||0);

  if (GENRE_MODE === 'stacked'){ // default: stacked
    const traceA = {x: genres, y: yA, type:'bar', name:`${dA}s`};
    const traceB = {x: genres, y: yB, type:'bar', name:`${dB}s`};
    Plotly.newPlot('genreChart', [traceA, traceB], {
      barmode:'stack',
      margin:{t:10,l:40,r:10,b:80},
      legend:{orientation:'h'},
      xaxis:{tickangle:-30},
      paper_bgcolor:'rgba(0,0,0,0)',
      plot_bgcolor:'rgba(0,0,0,0)',
      font:{color:'#e6edf3'}
    }, {displayModeBar:false, responsive:true});
  } else { // horizontal
    const traceA = {y: genres, x: yA, type:'bar', orientation:'h', name:`${dA}s`};
    const traceB = {y: genres, x: yB, type:'bar', orientation:'h', name:`${dB}s`};
    Plotly.newPlot('genreChart', [traceA, traceB], {
      barmode:'group',
      margin:{t:10,l:120,r:20,b:50},
      legend:{orientation:'h'},
      xaxis:{title:'Count'},
      yaxis:{automargin:true},
      paper_bgcolor:'rgba(0,0,0,0)',
      plot_bgcolor:'rgba(0,0,0,0)',
      font:{color:'#e6edf3'}
    }, {displayModeBar:false, responsive:true});
  }
}

// ---------- charts: runtime vs imdb ----------
function renderRuntime(A,B,dA,dB){
  const prep = (arr, name)=>({
    x: arr.map(d=>d.runtime_min).filter((v,i)=>isFinite(v) && isFinite(arr[i].imdb)),
    y: arr.filter((_,i)=>isFinite(arr[i].runtime_min) && isFinite(arr[i].imdb)).map(d=>d.imdb),
    s: arr.filter(d=>isFinite(d.runtime_min) && isFinite(d.imdb)).map(d=>5+3*log1p(d.votes)),
    text: arr.filter(d=>isFinite(d.runtime_min) && isFinite(d.imdb)).map(d=>`${d.title} (${d.year})`),
    name
  });
  const a = prep(A, `${dA}s`);
  const b = prep(B, `${dB}s`);
  Plotly.newPlot('runtimeChart', [
    {x:a.x,y:a.y,mode:'markers',type:'scatter',name:a.name,
     marker:{size:a.s}, text:a.text, hoverinfo:'text+x+y+name'},
    {x:b.x,y:b.y,mode:'markers',type:'scatter',name:b.name,
     marker:{size:b.s}, text:b.text, hoverinfo:'text+x+y+name'},
  ], {
    margin:{t:10,l:40,r:10,b:50},
    xaxis:{title:'Runtime (min)'},
    yaxis:{title:'IMDB Rating'},
    paper_bgcolor:'rgba(0,0,0,0)',
    plot_bgcolor:'rgba(0,0,0,0)',
    font:{color:'#e6edf3'}
  }, {displayModeBar:false, responsive:true});
}

// ---------- charts: audience vs critic ----------
function renderAudienceCritic(A,B,dA,dB){
  function series(arr, name){
    const pts = arr.filter(d => isFinite(d.imdb) && isFinite(d.meta));
    const xs = pts.map(d => d.imdb);
    const ys = pts.map(d => d.meta);
    const text = pts.map(d => `${d.title} (${d.year})<br>IMDB: ${d.imdb}, Meta: ${d.meta}`);

    const lr = xs.length>=2 ? linreg(xs, ys) : {a:0, b:0};
    const xMin = xs.length ? Math.min(...xs) : 0, xMax = xs.length ? Math.max(...xs) : 10;
    const xLine = [xMin, xMax];
    const yLine = xLine.map(x => lr.a + lr.b*x);

    return {
      scatter: {
        x: xs, y: ys, text,
        mode: 'markers', type: 'scatter', name,
        hoverinfo: 'text+x+y+name',
        marker: { opacity: 0.9 }
      },
      line: {
        x: xLine, y: yLine,
        mode: 'lines', type: 'scatter',
        name: `${name} trend`,
        line: { dash: 'dash' },
        hoverinfo: 'skip'
      }
    };
  }

  const a = series(A, `${dA}s`);
  const b = series(B, `${dB}s`);

  Plotly.newPlot('audCritChart', [a.scatter, a.line, b.scatter, b.line], {
    margin:{t:10,l:40,r:10,b:50},
    xaxis:{title:'IMDB Rating'},
    yaxis:{title:'Metascore'},
    legend:{orientation:'h'},
    paper_bgcolor:'rgba(0,0,0,0)',
    plot_bgcolor:'rgba(0,0,0,0)',
    font:{color:'#e6edf3'}
  }, {displayModeBar:false, responsive:true});
}

// ---------- Feature Importance (OLS-based) ----------
function renderFeatureImportance(A,B,dA,dB){
  function prepXY(rows){
    const feats = ["runtime_min","logVotes","meta","gross"];
    const X=[], y=[];
    for (const r of rows){
      if ([r.runtime_min, r.logVotes, r.meta, r.gross, r.imdb].every(v=>isFinite(v))){
        X.push([r.runtime_min, r.logVotes, r.meta, r.gross]);
        y.push(r.imdb);
      }
    }
    return {X, y, feats};
  }

  function standardize(vs){
    const m = mean(vs), s = std(vs)||1;
    return {z: vs.map(x => (x-m)/s), m, s};
  }

  function olsBetaStd(X, y){
    // standardize X cols and y, solve beta = (Z'Z)^-1 Z'z
    const n = X.length; if (!n) return [];
    const p = X[0].length;
    const Z = Array.from({length:n}, _=>Array(p)); // z-matrix
    const stats = [];
    for (let j=0;j<p;j++){
      const col = X.map(r=>r[j]);
      const {z, m, s} = standardize(col);
      stats.push({m,s});
      for (let i=0;i<n;i++) Z[i][j]=z[i];
    }
    const yz = standardize(y).z;

    // compute (Z'Z) and (Z'y)
    const XtX = Array.from({length:p}, _=>Array(p).fill(0));
    const Xty = Array(p).fill(0);
    for (let i=0;i<n;i++){
      for (let j=0;j<p;j++){
        Xty[j] += Z[i][j]*yz[i];
        for (let k=0;k<p;k++) XtX[j][k] += Z[i][j]*Z[i][k];
      }
    }
    // inverse XtX (Gauss-Jordan)
    const I = Array.from({length:p}, (_,i)=>Array.from({length:p},(__,j)=> i===j?1:0));
    const A = XtX.map((row,i)=>row.concat(I[i]));
    for (let col=0; col<p; col++){ // elimination
      let piv = col;
      for (let r=col+1;r<p;r++) if (Math.abs(A[r][col])>Math.abs(A[piv][col])) piv=r;
      if (Math.abs(A[piv][col])<1e-8) return Array(p).fill(0);
      if (piv!==col){ const tmp=A[col]; A[col]=A[piv]; A[piv]=tmp; }
      const div = A[col][col];
      for (let c=0;c<2*p;c++) A[col][c]/=div;
      for (let r=0;r<p;r++){
        if (r===col) continue;
        const factor = A[r][col];
        for (let c=0;c<2*p;c++) A[r][c]-=factor*A[col][c];
      }
    }
    const XtX_inv = A.map(row => row.slice(p));
    const beta = Array(p).fill(0); // XtX_inv * X'y
    for (let j=0;j<p;j++){
      for (let k=0;k<p;k++) beta[j] += XtX_inv[j][k]*Xty[k];
    }
    return beta.map(b => Math.abs(b)); // standardized absolute beta as importance
  }

  function compute(rows){
    const {X, y, feats} = prepXY(rows);
    const imp = olsBetaStd(X, y);
    const items = feats.map((f,i)=>({name:f, val: +((imp[i]||0).toFixed(3))}));
    items.sort((a,b)=>b.val-a.val);
    return items;
  }

  const Aimp = compute(A);
  const Bimp = compute(B);
  const names = [...new Set([...Aimp.map(d=>d.name), ...Bimp.map(d=>d.name)])];

  const yA = names.map(n=> (Aimp.find(d=>d.name===n)?.val) || 0);
  const yB = names.map(n=> (Bimp.find(d=>d.name===n)?.val) || 0);

  Plotly.newPlot('fiChart', [
    {y:names, x:yA, type:'bar', orientation:'h', name: document.getElementById("decadeA").value + "s"},
    {y:names, x:yB, type:'bar', orientation:'h', name: document.getElementById("decadeB").value + "s"}
  ], {
    barmode:'group', margin:{t:10,l:120,r:10,b:40},
    xaxis:{title:'Standardized |β| (relative importance)'}, yaxis:{automargin:true},
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{color:'#e6edf3'}
  }, {displayModeBar:false, responsive:true});
}

// ---------- Networks ----------
function renderNetworks(A,B,dA,dB){
  const buildGraph = (rows) => {
    const nodesMap = new Map(); const links = [];
    const addNode = (id, type) => {
      if (!id) return; const key = type+":"+id;
      if (!nodesMap.has(key)) nodesMap.set(key, {id:key, name:id, type});
      return nodesMap.get(key);
    };
    for (const r of rows){
      const d = addNode(r.director, "director");
      const stars = String(r.stars||"").split(",").map(s=>s.trim()).filter(Boolean);
      for (const s of stars){
        const sn = addNode(s, "star");
        if (d && sn) links.push({source:d.id, target:sn.id});
      }
    }
    const nodes = [...nodesMap.values()];
    return {nodes, links};
  };

  d3.select("#netTitleA").text(`Network (${dA}s)`);
  d3.select("#netTitleB").text(`Network (${dB}s)`);

  const GA = buildGraph(A), GB = buildGraph(B);

  drawNetwork("#netA", GA, NET_DEG_THRESH); // default threshold=4
  drawNetwork("#netB", GB, NET_DEG_THRESH); // default threshold=4

  renderTopPeopleBox("netInfoA", dA, topPeopleFromRows(A, 6));
  renderTopPeopleBox("netInfoB", dB, topPeopleFromRows(B, 6));

  // degree threshold control
  const label = document.getElementById("degLabel");
  const update = () => {
    label.textContent = `deg ≥ ${NET_DEG_THRESH}`;
    drawNetwork("#netA", GA, NET_DEG_THRESH);
    drawNetwork("#netB", GB, NET_DEG_THRESH);
    renderTopPeopleBox("netInfoA", dA, topPeopleFromRows(A, 6));
    renderTopPeopleBox("netInfoB", dB, topPeopleFromRows(B, 6));
  };
  document.getElementById("degPlus").onclick = () => { NET_DEG_THRESH = Math.min(NET_DEG_THRESH+1, 15); update(); };
  document.getElementById("degMinus").onclick = () => { NET_DEG_THRESH = Math.max(NET_DEG_THRESH-1, 1); update(); };
}

function topPeopleFromRows(rows, topN=5){
  const dir = new Map();
  const star = new Map();
  for (const r of rows){
    if (r.director) dir.set(r.director, (dir.get(r.director)||0)+1);
    const stars = String(r.stars||"")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    for (const s of stars){
      star.set(s, (star.get(s)||0)+1);
    }
  }
  const toSortedArray = (m) => [...m.entries()]
    .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN);

  return {
    directors: toSortedArray(dir),
    stars: toSortedArray(star)
  };
}

function renderTopPeopleBox(containerId, decade, top){
  const el = document.getElementById(containerId);
  if (!el) return;
  const pill = ([name, cnt]) => `<span class="pill">${name} <small>×${cnt}</small></span>`;
  el.innerHTML = `
    <div class="row"><b>${decade}s Top Directors:</b><br>${top.directors.map(pill).join(" ") || "–"}</div>
    <div class="row"><b>${decade}s Top Stars:</b><br>${top.stars.map(pill).join(" ") || "–"}</div>
  `;
}

function computeDegrees(nodes, links){
  const deg = new Map(nodes.map(n => [n.id, 0]));
  for (const e of links){
    deg.set(e.source, (deg.get(e.source)||0)+1);
    deg.set(e.target, (deg.get(e.target)||0)+1);
  }
  return deg;
}

function filterGraphByDegree(graph, t){
  const deg = computeDegrees(
    graph.nodes.map(n => ({id:n.id})),
    graph.links.map(e => ({source: typeof e.source==='object'? e.source.id : e.source, target: typeof e.target==='object'? e.target.id : e.target}))
  );
  const keepCore = new Set([...deg.entries()].filter(([id,v])=>v>=t).map(([id])=>id));
  const keepNode = new Set(keepCore);
  for (const e of graph.links){
    const s = typeof e.source==='object'? e.source.id : e.source;
    const t2 = typeof e.target==='object'? e.target.id : e.target;
    if (keepCore.has(s) || keepCore.has(t2)){ keepNode.add(s); keepNode.add(t2); }
  }
  const nodes = graph.nodes.filter(n => keepNode.has(n.id));
  const links = graph.links.filter(e => {
    const s = typeof e.source==='object'? e.source.id : e.source;
    const t3 = typeof e.target==='object'? e.target.id : e.target;
    return keepNode.has(s) && keepNode.has(t3);
  });
  return {nodes, links, deg};
}

function drawNetwork(svgSel, graphAll, degreeThreshold){
  const svg = d3.select(svgSel);
  svg.selectAll("*").remove();
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  // 1) Filter by degree threshold
  const {nodes, links, deg} = filterGraphByDegree(graphAll, degreeThreshold);

  // 2) Node sizing
  const baseDir = 7, baseStar = 5;
  const baseR = (d) => (d.type === "director" ? baseDir : baseStar);
  const degBoost = (d) => 2 * Math.sqrt(deg.get(d.id) || 1); // higher degree, bigger
  const targetFill = 0.18;
  const sumBaseArea = nodes.reduce((acc, d) => {
    const r0 = baseR(d) + degBoost(d);
    return acc + Math.PI * r0 * r0;
  }, 0);
  const targetArea = width * height * targetFill;
  const s = Math.max(0.35, Math.min(1.0, Math.sqrt((targetArea || 1) / (sumBaseArea || 1))));
  const radius = (d) => {
    const r = s * (baseR(d) + degBoost(d));
    return Math.max(2.2, Math.min(12, r));
  };

  // 3) Clipping path to avoid overflow
  const clipId = `clip-${Math.random().toString(36).slice(2)}`;
  const defs = svg.append("defs");
  defs.append("clipPath").attr("id", clipId)
      .append("rect").attr("x", 1).attr("y", 1)
      .attr("width", Math.max(1, width - 2))
      .attr("height", Math.max(1, height - 2));
  const g = svg.append("g").attr("clip-path", `url(#${clipId})`);

  // 4) Force
  const n = Math.max(1, nodes.length);
  const linkDist = 28 + 22 * s;
  const charge = - (70 + 40 * s);
  const collidePad = 1.2;
  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d=>d.id).distance(linkDist).strength(0.55))
    .force("charge", d3.forceManyBody().strength(charge))
    .force("center", d3.forceCenter(width/2, height/2))
    .force("x", d3.forceX(width/2).strength(0.02)) 
    .force("y", d3.forceY(height/2).strength(0.02))
    .force("collide", d3.forceCollide().radius(d=>radius(d)+collidePad))
    .alpha(0.9).alphaDecay(0.06);

  const link = g.append("g").attr("stroke","#6b7280").attr("stroke-opacity",0.45)
    .selectAll("line").data(links).enter().append("line").attr("stroke-width",1);

  const node = g.append("g")
    .selectAll("circle").data(nodes).enter().append("circle")
    .attr("r", radius)
    .attr("fill", d => d.type==="director" ? "#4da3ff" : "#7ee787");

  // Tooltip
  node.on("mouseenter", (ev,d)=>{
      const dg = deg.get(d.id)||0;
      tooltip.style("display","block")
             .html(`<b>${d.name}</b><br/>type: ${d.type}<br/>degree: ${dg}`);
  })
  .on("mousemove", (ev)=> tooltip.style("left",(ev.clientX+12)+"px").style("top",(ev.clientY+12)+"px"))
  .on("mouseleave", ()=> tooltip.style("display","none"));

  const WALL_PAD = 4;

  sim.on("tick", ()=>{
    nodes.forEach(d=>{
        const r = radius(d) + WALL_PAD;
        if (d.x < r) { d.x = r; if (d.vx < 0) d.vx *= -0.35; }
        if (d.x > width - r) { d.x = width - r; if (d.vx > 0) d.vx *= -0.35; }
        if (d.y < r) { d.y = r; if (d.vy < 0) d.vy *= -0.35; }
        if (d.y > height - r) { d.y = height - r; if (d.vy > 0) d.vy *= -0.35; }
    });

    link.attr("x1", d=>d.source.x).attr("y1", d=>d.source.y)
        .attr("x2", d=>d.target.x).attr("y2", d=>d.target.y);

    node.attr("cx", d=>d.x).attr("cy", d=>d.y);
  });
}

tryFetchDefault();
