/* HUNCH CONSTELLATION — engine lifted verbatim from the website splash / GO mock. */
/* ============================================================================
   HUNCH CONSTELLATION — engine unchanged from the website splash.
   Only the sizing and chrome around it changed: fills the whole screen now,
   no header offset, no fold peek, no down-arrow.
   ========================================================================== */
(function(){
const STORIES = [
  { id:'paul',  name:'Paul',  rest:'is obsessed with his dog.',
    points:[[-52,-6],[-40,-24],[-30,-38],[-16,-20],[14,-28],[44,-20],[56,-40],[42,0],[38,30],[4,12],[-6,30],[-28,4]],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[5,7],[7,8],[7,9],[9,11],[11,10],[11,0]] },
  { id:'sarah', name:'Sarah', rest:'runs before the sun rises.',
    points:[[6,-46],[0,-28],[-22,-14],[20,-18],[2,-2],[-14,14],[-26,34],[22,12],[38,28]],
    lines:[[0,1],[1,2],[1,3],[1,4],[4,5],[5,6],[4,7],[7,8]] },
  { id:'mike',  name:'Mike',  rest:'dreams of a bigger house.',
    points:[[0,-44],[-36,-12],[36,-12],[-36,34],[36,34],[-10,34],[10,34],[-10,8],[10,8]],
    lines:[[0,1],[0,2],[1,2],[1,3],[2,4],[3,4],[5,7],[6,8],[7,8]] },
  { id:'emma',  name:'Emma',  rest:'lives for her morning coffee.',
    points:[[-26,-14],[22,-14],[28,22],[-32,22],[24,-8],[42,-2],[38,14],[24,12],[-8,-30],[0,-44]],
    lines:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[8,9]] },
  { id:'james', name:'James', rest:'leaves his go-bag packed.',
    points:[[52,-2],[-44,-26],[-40,26],[-22,0],[-2,10]],
    lines:[[0,1],[1,3],[3,2],[2,0],[0,4],[4,3]] },
  { id:'lisa',  name:'Lisa',  rest:'leads with her heart.',
    points:[[0,-6],[-18,-34],[-38,-22],[-38,4],[0,44],[38,4],[38,-22],[18,-34]],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0]] },
  { id:'nina',  name:'Nina',  rest:'would rather be fishing.',
    points:[[-46,0],[-14,-19],[22,-7],[22,7],[-14,19],[46,-20],[46,20]],
    lines:[[0,1],[1,2],[2,5],[5,6],[6,3],[3,4],[4,0],[2,3]] },
  { id:'dave',  name:'Dave',  rest:'has a song for everything.',
    points:[[-22,32],[-12,25],[-2,32],[-12,39],[-2,-28],[18,-16],[10,2]],
    lines:[[0,1],[1,2],[2,3],[3,0],[2,4],[4,5],[5,6]] },
  { id:'priya', name:'Priya', rest:'talks to her plants.',
    points:[[-16,18],[16,18],[12,40],[-12,40],[0,16],[0,-10],[-22,-24],[22,-26],[0,-36]],
    lines:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[5,7],[5,8]] },
  { id:'sam',   name:'Sam',   rest:'reads two books a week.',
    points:[[-42,18],[-42,-16],[0,-6],[42,-16],[42,18],[0,28]],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[2,5]] },
  { id:'kate',  name:'Kate',  rest:'needs to get back to Italy.',
    points:[[-30,-8],[30,-8],[30,30],[-30,30],[-10,-8],[-10,-20],[10,-20],[10,-8]],
    lines:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7]] },
  { id:'manu',  name:'Manu',  rest:'answers to his cat.',
    points:[[-36,-10],[-28,-36],[-12,-18],[12,-18],[28,-36],[36,-10],[26,20],[0,30],[-26,20]],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,0]] },
  { id:'rangi', name:'Rangi', rest:'lives for a weekend sail.',
    points:[[0,10],[0,-38],[30,-6],[-34,14],[34,14],[22,32],[-22,32]],
    lines:[[0,1],[1,2],[2,0],[3,4],[4,5],[5,6],[6,3]] },
  { id:'aroha', name:'Aroha', rest:'never grew out of kites.',
    points:[[0,-36],[22,-6],[0,20],[-22,-6],[8,32],[-2,42],[10,52]],
    lines:[[0,1],[1,2],[2,3],[3,0],[0,2],[1,3],[2,4],[4,5],[5,6]] },
  { id:'ben',   name:'Ben',   rest:'bakes when he\u2019s stressed.',
    points:[[-28,32],[28,32],[28,12],[-28,12],[-16,-8],[16,-8],[0,-22],[0,-32],[-16,12],[16,12],[0,-8]],
    lines:[[0,1],[1,2],[2,3],[3,0],[8,4],[4,5],[5,9],[10,6],[6,7]] },
  { id:'rosa',  name:'Rosa',  rest:'still writes letters.',
    points:[[-34,-14],[34,-14],[34,22],[-34,22],[0,8]],
    lines:[[0,1],[1,2],[2,3],[3,0],[0,4],[4,1]] }
];

const hero=document.getElementById('hunch-splash');
const field=document.getElementById('hs-field');
const pic=document.getElementById('hs-picture');
const fx=field.getContext('2d');
const px=pic.getContext('2d');
const insightEl=document.getElementById('hs-insight');

const STAR='#ffffff';
const T={
  dotSpread:620, dotBloom:420,
  glide:1000,
  penStart:1000, penDraw:3000,
  lineAt:.5, lineIn:2600,
  fadePic:2000,
  lineLag:700, fadeLine:1600,
  holdMin:2600, holdMax:4100
};

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

let W,H,dots=[],SCALE=3.2,lastPen=null;
let deck=[],deckIdx=0,cur=null,prev=null,penFrom=null;

function shuffle(){
  const last=deck.length?deck[deck.length-1]:null;
  deck=STORIES.slice();
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  if(deck[0]===last)[deck[0],deck[1]]=[deck[1],deck[0]];
}
function makeBeat(s){
  return { s,
    ox:(Math.random()-.5)*Math.min(W*.08,60),
    sj:.94+Math.random()*.14,
    hold:T.holdMin+Math.random()*(T.holdMax-T.holdMin) };
}
function geom(beat){
  const cx=W/2+beat.ox, cy=H*.46, k=SCALE*beat.sj;
  const pts=beat.s.points.map(([x,y])=>({x:cx+x*k,y:cy+y*k}));
  let bottom=-1e9; for(const p of pts) if(p.y>bottom) bottom=p.y;
  const L=beat.s.lines;
  return { pts, bottom, first:pts[L[0][0]], exit:pts[L[L.length-1][1]] };
}

function setInsight(s){ insightEl.innerHTML='<b>'+s.name+'</b><span class="rest">&nbsp;'+s.rest+'</span>'; }
function placeInsight(g){
  /* Sit the caption 40% of the way from the picture's bottom to the button
     zone. bottomLimit keeps it clear of the GO button. */
  const HS_LINE=0.40;
  const bottomLimit=H-132;
  const gap=Math.max(bottomLimit-g.bottom,0);
  insightEl.style.top=(g.bottom+Math.max(gap*HS_LINE,36))+'px';
}
function revealInsight(s){
  setInsight(s);
  const el=insightEl;
  if(reduced){ el.style.opacity=1; return; }
  el.style.transition='none'; el.style.clipPath='none'; el.style.transform='none'; el.style.opacity='1';
  const nm=el.querySelector('b'), rest=el.querySelector('.rest');
  nm.style.transition='none'; nm.style.opacity='0'; nm.style.transform='translateX(-10px)';
  rest.style.transition='none'; rest.style.clipPath='inset(-20% 100% -20% 0)'; rest.style.opacity='0';
  void el.offsetWidth;
  nm.style.transition='opacity .7s ease, transform .7s cubic-bezier(.3,.5,.25,1)';
  nm.style.opacity='1'; nm.style.transform='none';
  setTimeout(()=>{
    rest.style.transition='clip-path 2.2s cubic-bezier(.3,.5,.25,1), opacity 1.2s ease';
    rest.style.clipPath='inset(-20% -5% -20% 0)'; rest.style.opacity='1';
  },620);
}
function hideInsight(){
  if(reduced) return;
  const el=insightEl;
  el.style.transition='clip-path '+(T.fadeLine/1000)+'s cubic-bezier(.35,.45,.3,1), transform '+(T.fadeLine/1000)+'s cubic-bezier(.35,.45,.3,1), opacity '+(T.fadeLine/1000)+'s ease';
  el.style.clipPath='inset(-20% -5% -20% 105%)';
  el.style.transform='translateX(12px)';
  el.style.opacity=0;
}

function resize(){
  W=window.innerWidth; H=window.innerHeight;
  const dpr=Math.min(devicePixelRatio||1,2);
  for(const c of [field,pic]){ c.width=W*dpr; c.height=H*dpr; c.getContext('2d').setTransform(dpr,0,0,dpr,0,0); }
  SCALE=Math.min(4.6, Math.max(2.1, Math.min(W,H)/165), (H*.42-110)/46);
  if(cur){ cur.g=geom(cur.beat); placeInsight(cur.g); }
  if(prev) prev.g=geom(prev.beat);
  seed();
}
function seed(){
  dots=[];
  const n=Math.floor(W*H/5200);
  for(let i=0;i<n;i++) dots.push({
    x:Math.random()*W, y:Math.random()*H,
    r:1.2+Math.random()*2.2,
    vx:(Math.random()-.5)*.09, vy:(Math.random()-.5)*.09,
    tw:.6+Math.random()*1.4, ph:Math.random()*Math.PI*2
  });
}
function drawField(now){
  fx.clearRect(0,0,W,H);
  for(const d of dots){
    const tw = reduced ? .38 : .34 + .16*Math.sin(now*.0008*d.tw + d.ph);
    if(!reduced){
      d.x+=d.vx; d.y+=d.vy;
      if(d.x<-4)d.x=W+4; if(d.x>W+4)d.x=-4;
      if(d.y<-4)d.y=H+4; if(d.y>H+4)d.y=-4;
    }
    fx.beginPath(); fx.arc(d.x,d.y,d.r,0,Math.PI*2);
    fx.fillStyle='rgba(255,255,255,'+tw.toFixed(3)+')'; fx.fill();
  }
}

function renderStory(g,s,prog,alpha){
  let tip=null;
  const upto=prog*s.lines.length;
  s.lines.forEach(([a,b],i)=>{
    const seg=Math.min(Math.max(upto-i,0),1);
    if(seg<=0) return;
    const A=g.pts[a], B=g.pts[b];
    const dx=B.x-A.x, dy=B.y-A.y, len=Math.hypot(dx,dy)||1;
    const bow=(i%2?1:-1)*Math.min(len*.14,9);
    const cxp=(A.x+B.x)/2 - dy/len*bow, cyp=(A.y+B.y)/2 + dx/len*bow;
    let ex=A.x, ey=A.y;
    px.beginPath(); px.moveTo(A.x,A.y);
    for(let k2=1;k2<=16;k2++){
      const tt=seg*k2/16, u=1-tt;
      ex=u*u*A.x + 2*u*tt*cxp + tt*tt*B.x;
      ey=u*u*A.y + 2*u*tt*cyp + tt*tt*B.y;
      px.lineTo(ex,ey);
    }
    px.setLineDash([3,6]);
    px.strokeStyle=STAR; px.lineWidth=2.4; px.globalAlpha=alpha*.9; px.stroke();
    px.setLineDash([]);
    if(seg<1) tip={x:ex,y:ey};
  });
  const reach=new Array(g.pts.length).fill(1e9);
  s.lines.forEach(([a,b],i)=>{ if(i<reach[a])reach[a]=i; if(i+1<reach[b])reach[b]=i+1; });
  g.pts.forEach((p,pi)=>{
    const k=reduced?1:Math.min(Math.max((upto-reach[pi])*1.5,0),1);
    if(k<=0) return;
    const bloom=1+.22*Math.sin(Math.PI*k);
    px.beginPath(); px.arc(p.x,p.y,10*k,0,Math.PI*2);
    px.fillStyle=STAR; px.globalAlpha=alpha*.18*k; px.fill();
    px.beginPath(); px.arc(p.x,p.y,4*k*bloom,0,Math.PI*2);
    px.fillStyle=STAR; px.globalAlpha=alpha*k; px.fill();
  });
  px.globalAlpha=1;
  return tip;
}

function advance(now){
  prev=cur?{beat:cur.beat,g:cur.g,start:now}:null;
  penFrom=lastPen||(cur?cur.g.exit:null);
  deckIdx++; if(deckIdx>=deck.length){shuffle(); deckIdx=0;}
  cur={beat:makeBeat(deck[deckIdx]),start:now,lineShown:false};
  cur.g=geom(cur.beat);
  setTimeout(hideInsight,T.lineLag);
}

function frame(now){
  drawField(now);
  px.clearRect(0,0,W,H);

  if(reduced){
    renderStory(cur.g,cur.beat.s,1,1);
    if(!cur.lineShown){ cur.lineShown=true; placeInsight(cur.g); setInsight(cur.beat.s); insightEl.style.opacity=1; }
    requestAnimationFrame(frame); return;
  }

  const t=now-cur.start;

  if(prev){
    const a=1-Math.min((now-prev.start)/T.fadePic,1);
    if(a>0) renderStory(prev.g,prev.beat.s,1,a*a);
    else prev=null;
  }

  const prog=Math.min(Math.max((t-T.penStart)/T.penDraw,0),1);
  const tip=renderStory(cur.g,cur.beat.s,prog,1);

  if(prog>=T.lineAt && !cur.lineShown){
    cur.lineShown=true;
    placeInsight(cur.g);
    revealInsight(cur.beat.s);
  }

  let pen=null, penA=1;
  if(t<T.glide && penFrom){
    const q=t/T.glide, u=1-q;
    const A=penFrom, B=cur.g.first;
    const mx=(A.x+B.x)/2, my=(A.y+B.y)/2 - 60;
    pen={x:u*u*A.x+2*u*q*mx+q*q*B.x, y:u*u*A.y+2*u*q*my+q*q*B.y};
    penA=.55;
  } else if(prog<1){
    pen=tip||cur.g.first;
  } else {
    if(!cur.wander){
      const e=cur.g.exit;
      cur.wander={x:e.x,y:e.y,h:Math.random()*Math.PI*2,last:now};
    }
    const wd=cur.wander, dt=Math.min(now-wd.last,50)/1000; wd.last=now;
    wd.h+=Math.sin(now*.0006+wd.x*.013)*.9*dt;
    wd.x+=Math.cos(wd.h)*22*dt; wd.y+=Math.sin(wd.h)*22*dt;
    const m=46;
    if(wd.x<m||wd.x>W-m){ wd.h=Math.PI-wd.h; wd.x=Math.max(m,Math.min(W-m,wd.x)); }
    if(wd.y<m+70||wd.y>H-m-90){ wd.h=-wd.h; wd.y=Math.max(m+70,Math.min(H-m-90,wd.y)); }
    pen={x:wd.x,y:wd.y}; penA=.55;
  }
  if(pen){
    lastPen=pen;
    px.beginPath(); px.arc(pen.x,pen.y,3,0,Math.PI*2);
    px.fillStyle=STAR; px.globalAlpha=penA; px.fill();
    px.globalAlpha=1;
  }

  if(t>T.penStart+T.penDraw+cur.beat.hold) advance(now);
  requestAnimationFrame(frame);
}

function start(){
  shuffle();
  resize();
  cur={beat:makeBeat(deck[0]),start:performance.now(),lineShown:false};
  cur.g=geom(cur.beat);
  addEventListener('resize',resize);
  requestAnimationFrame(frame);
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',start);
}else{ start(); }
})();
