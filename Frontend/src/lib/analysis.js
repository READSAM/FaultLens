import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Analysis logic: sample-data generator, effort and recommendation rules, and the CSV, JSON and PDF exporters.
// Ported unchanged from the verified prototype; functions take the report object as an argument.
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const seedOf=n=>[...n].reduce((a,c)=>a*31+c.charCodeAt(0),7);
const ML=['Lines of code','Cyclomatic complexity','Halstead volume','Halstead difficulty','Halstead effort'],KEY=['loc','cc','halstead_volume','halstead_difficulty','halstead_effort'],W=[.16,.14,.06,.05,.06];
const FN={py:['load_data','clean_rows','train_model','handle_event','parse_args','merge_frames','validate','fetch_page','score_rows','write_report','retry','main'],java:['processOrder','loadUsers','calcTotal','handleRequest','parseJson','retryCall','buildQuery','validateToken','syncCache','renderView','closeConn','main'],cpp:['parseInput','allocBuffer','updateState','handleSignal','sortRecords','readConfig','mergeNodes','validate','renderFrame','flushQueue','computeHash','main']};
const LV=s=>s>=.6?'High':s>=.35?'Medium':'Low',PR=s=>'P'+(s>=.6?1:s>=.35?2:3),COL=s=>s>=.6?'var(--red)':s>=.35?'var(--warm)':'var(--accent)';
const PA=['Set a function-length limit and split the longest functions first.','Cap cyclomatic complexity (for example at 10) in code review or CI.','Simplify long expressions to bring Halstead volume down.','Use clearer names and fewer special cases to lower Halstead difficulty.','Simplify the functions with the highest Halstead effort.'];
const CL=x=>x.sc>=.5?'Fault-prone':'Not fault-prone';
const effort=x=>Math.max(.25,Math.round((x.m[0]/45+x.m[1]/7)*(.5+x.sc)*4)/4);
function recs(x){const t=[`Split into smaller functions (${x.m[0]} lines of code).`,`Reduce branching and add unit tests that cover each path (complexity ${x.m[1]}).`,'Break up long expressions and remove duplicated logic to cut Halstead volume.','Use clearer names and fewer distinct operators to lower Halstead difficulty.','Simplify the logic. High Halstead effort means this code is costly to read and change.'],r=x.sh.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).filter(a=>a[0]>.02).slice(0,2).map(a=>t[a[1]]);r.push(x.sc>=.6?'Review before the next release and write tests first.':x.sc>=.35?'Schedule a review in the next sprint.':'No action needed beyond normal code review.');return r}
const BASE=.22;
function whatIf(x){const l=Math.min(x.m[0],50),c=Math.min(x.m[1],10),k=l/x.m[0],j=c/x.m[1],m=[l,c,x.m[2]*k,x.m[3]*j,x.m[4]*k*j],z=[(m[0]-35)/60,(m[1]-6)/10,(m[2]-1500)/3000,(m[3]-8)/12,(m[4]-12000)/40000].map(v=>Math.max(-3,Math.min(3,v)));return Math.max(.03,Math.min(x.sc,x.sc+z.reduce((s,v,i)=>s+v*W[i],0)-x.sh.reduce((a,b)=>a+b,0)))}
export function recData(R){const o=R,java=o.lang==='Java',av=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0,tot=o.rows.reduce((s,x)=>s+x.sc,0),
tp=o.rows.filter(x=>x.m[0]>50||x.m[1]>10).slice(0,5),
rows=tp.map(x=>{const a=x.m[0]>50,b=x.m[1]>10;return{n:x.n,loc:x.f+':'+x.ln,p0:x.sc,p1:whatIf(x),ef:x.ef,why:[a&&`${x.m[0]} lines (target 50 or fewer)`,b&&`complexity ${x.m[1]} (target 10 or fewer)`].filter(Boolean).join(', '),act:a&&b?'Extract helper functions and flatten nested branches.':a?'Split into smaller functions.':'Use early returns or lookup tables to cut branches.'}}),
fl=Object.entries(o.rows.reduce((m,x)=>(m[x.f]=(m[x.f]||0)+x.sc,m),{})).sort((a,b)=>b[1]-a[1]),
left=o.rows.filter(x=>(tp.includes(x)?whatIf(x):x.sc)>=.5).length,eh=rows.reduce((s,r)=>s+r.ef,0),d=o.imp[0].i,
tool=[java?'Checkstyle MethodLength (max 50)':'clang-tidy readability-function-size (LineThreshold 50)',java?'Checkstyle or PMD CyclomaticComplexity (max 10)':'clang-tidy readability-function-cognitive-complexity'],
tt=(tp.length?tp:o.rows).slice(0,3);
return{rows,sum:rows.length?`Now ${o.fp} of ${o.n} functions (${o.pct}%) are fault-prone. After the ${rows.length} refactors below (about ${eh} h), ${left} would remain, and their average risk would drop from ${Math.round(av(tp.map(x=>x.sc))*100)}% to ${Math.round(av(tp.map(x=>whatIf(x)))*100)}%. Projected values re-score each function with its size and complexity at the targets.`:'No function exceeds the size and complexity targets (50 lines, complexity 10), so focus on tests and review of the top-ranked functions.',
prev:[`Add an automated check for ${ML[d].toLowerCase()}, your strongest risk driver${d<2?': '+tool[d]:''}.`,`Review every change to ${fl[0][0]} with two reviewers. It holds ${Math.round(100*fl[0][1]/tot)}% of the risk score.`,'Keep new functions under 50 lines and complexity 10 so they start in the Low risk band.'],
tests:[...tt.map(x=>`Write at least ${x.m[1]} test cases for ${x.n}, one per independent path, before and after refactoring.`),'Re-run the analysis after each refactor and confirm the function falls below 35% (Low risk).']}}
export function buildReport(name,lang,file){
const ext=lang==='java'?'java':'cpp',r=rng(seedOf(name+file+lang));
const names=FN[ext];
const rows=names.map(n=>{const loc=Math.round(5+r()*r()*150),cc=Math.round(1+r()*r()*30),hv=Math.round(loc*(8+r()*12)),hd=+(cc*(1+r()*2)).toFixed(1),he=Math.round(hv*hd),m=[loc,cc,hv,hd,he];
const z=[(loc-35)/60,(cc-6)/10,(hv-1500)/3000,(hd-8)/12,(he-12000)/40000].map(v=>Math.max(-3,Math.min(3,v))),sh=z.map((v,i)=>v*W[i]);
return{n,f:`src/${n.length%2?'core':'util'}.${ext}`,ln:10+Math.floor(r()*300),m,sh,sc:Math.max(.03,Math.min(.97,.22+sh.reduce((a,b)=>a+b,0)+(r()-.5)*.1))}}).sort((a,b)=>b.sc-a.sc);rows.forEach(x=>{x.ef=effort(x);x.rc=recs(x)});
return summarize(rows,{name,lang,file})}

function summarize(rows,{name,lang,file}){rows.forEach(x=>{x.ef=effort(x);x.rc=recs(x)});const n=rows.length,fp=rows.filter(x=>x.sc>=.5).length,lv={High:0,Medium:0,Low:0};rows.forEach(x=>lv[LV(x.sc)]++);
const imp=ML.map((l,i)=>({i,v:rows.reduce((s,x)=>s+Math.abs(x.sh[i]),0)/n})).sort((a,b)=>b.v-a.v);
const files={};rows.forEach(x=>files[x.f]=Math.max(files[x.f]||0,x.sc));
return{name,lang:lang==='java'?'Java':'C / C++',file,date:new Date().toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}),rows,n,fp,pct:Math.round(1000*fp/n)/10,lv,imp,files:Object.entries(files).sort((a,b)=>b[1]-a[1]).slice(0,4),drv:r=>ML[r.sh.indexOf(Math.max(...r.sh))]}}
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'project';
const cs=v=>/[",\n]/.test(String(v))?'"'+String(v).replace(/"/g,'""')+'"':v;
export function csv(R){const h=['rank','function','file','line','probability_pct','risk_label','predicted_class','effort_hours',...KEY,'top_driver','recommendations'];
return [h,...R.rows.map((x,i)=>[i+1,x.n,x.f,x.ln,(x.sc*100).toFixed(1),LV(x.sc),CL(x),x.ef,...x.m,R.drv(x),x.rc.join(' ')])].map(r=>r.map(cs).join(',')).join('\n')}
export function json(R){return JSON.stringify({project:R.name,source:R.file,generated:R.date,summary:{language:R.lang,effortHoursFaultProne:R.rows.filter(x=>x.sc>=.5).reduce((s,x)=>s+x.ef,0),modules:R.n,faultProne:R.fp,faultPronePct:R.pct,levels:R.lv,dominantMetrics:R.imp.map(x=>({metric:KEY[x.i],importance:+x.v.toFixed(4)}))},modules:R.rows.map((x,i)=>({rank:i+1,priority:PR(x.sc),name:x.n,file:x.f,line:x.ln,probability:+x.sc.toFixed(4),riskLabel:LV(x.sc),predictedClass:CL(x),effortHours:x.ef,recommendations:x.rc,faultProne:x.sc>=.5,metrics:Object.fromEntries(KEY.map((k,j)=>[k,x.m[j]])),shap:Object.fromEntries(KEY.map((k,j)=>[k,+x.sh[j].toFixed(4)]))}))},null,2)}
export function pdf(R){
const d=new jsPDF({unit:'pt',format:'a4'}),W=595,H=842,M=40,CW=515,PW=250,PH=200;
const RG={High:[217,60,66],Medium:[201,135,26],Low:[14,159,142]},INK=[16,35,59],MUT=[88,111,137],LN=[211,222,234],TEAL=[14,159,142],AMB=[201,135,26],WH=[255,255,255];
const A=s=>String(s).replace(/[^\x20-\x7E]/g,'?'),rc=s=>RG[LV(s)],f2=v=>v.toFixed(2);
const tx=(t,x,y,sz,col,b,o)=>{d.setFont('helvetica',b?'bold':'normal').setFontSize(sz||10).setTextColor(...(col||INK));d.text(Array.isArray(t)?t:String(t),x,y,o)};
const sec=(t,y)=>{tx(t,M,y,14,INK,1);d.setFillColor(...TEAL).rect(M,y+6,36,2,'F')};
const panel=(x,y,t)=>{d.setDrawColor(...LN).setLineWidth(.7).roundedRect(x,y,PW,PH,4,4);tx(t,x+10,y+18,9.5,INK,1)};
const wrap=(t,x,y,w,sz,col)=>{d.setFont('helvetica','normal').setFontSize(sz);const l=d.splitTextToSize(t,w);tx(l,x,y,sz,col);return y+l.length*(sz+3)};
const n=R.n,tot=R.rows.reduce((s,x)=>s+x.sc,0),avg=tot/n,LVL=['High','Medium','Low'],fe=R.rows.filter(x=>x.sc>=.5).reduce((s,x)=>s+x.ef,0),pef=R.rows.filter(x=>x.sc>=.6).reduce((s,x)=>s+x.ef,0);
/* page 1: summary */
d.setFillColor(...TEAL).rect(0,0,W,92,'F');
tx('Software Fault Triage Report',M,44,22,WH,1);tx(A(R.name),M,64,12,WH);
tx('Language: '+R.lang+'   |   Source: '+A(R.file)+'   |   Generated: '+A(R.date),M,80,9,[225,248,244]);
sec('Executive summary',122);
let y=wrap(`${R.fp} of ${n} functions (${R.pct}%) are classified fault-prone. ${R.lv.High} ${R.lv.High===1?'function is':'functions are'} P1 and should be reviewed first.`,M,148,CW,11);
const tw=(CW-30)/4;
[['Functions analyzed',n],['Classified fault-prone',R.pct+'%'],['High-risk functions',R.lv.High],['Effort to fix fault-prone',fe+' h']].forEach((k,i)=>{const x=M+i*(tw+10);d.setFillColor(244,247,250).setDrawColor(...LN).roundedRect(x,y+8,tw,58,4,4,'FD');tx(k[0],x+10,y+26,8,MUT);tx(k[1],x+10,y+52,18,INK,1)});
y+=96;sec('Priority distribution',y);y+=34;
let bx=M;LVL.forEach(k=>{const w=CW*R.lv[k]/n;if(w>0){d.setFillColor(...RG[k]).rect(bx,y,w,18,'F');bx+=w}});
y+=38;LVL.forEach((k,i)=>{d.setFillColor(...RG[k]).circle(M+4+i*170,y-3,3.5,'F');tx(`P${i+1} ${k}: ${R.lv[k]} (${Math.round(100*R.lv[k]/n)}%)`,M+14+i*170,y,9)});
y+=36;sec('Key findings',y);y+=28;
const fl=Object.entries(R.rows.reduce((o,x)=>(o[x.f]=(o[x.f]||0)+x.sc,o),{})).sort((a,b)=>b[1]-a[1]);
const hi=R.rows.filter(x=>x.sc>=.6),lo=R.rows.filter(x=>x.sc<.6),mean=(a,i)=>a.length?a.reduce((s,x)=>s+x.m[i],0)/a.length:0,top3=R.rows.slice(0,3);
const fnd=[`The three riskiest functions (${top3.map(x=>A(x.n)).join(', ')}) account for ${Math.round(100*top3.reduce((s,x)=>s+x.sc,0)/tot)}% of the combined risk score.`,
`${ML[R.imp[0].i]} is the strongest overall driver (mean SHAP impact ${R.imp[0].v.toFixed(3)}), followed by ${ML[R.imp[1].i].toLowerCase()}.`,
`${A(fl[0][0])} carries the most risk, with ${Math.round(100*fl[0][1]/tot)}% of the total score.`];
if(hi.length&&lo.length)fnd.push(`P1 functions average ${Math.round(mean(hi,0))} lines of code and complexity ${Math.round(mean(hi,1))}, against ${Math.round(mean(lo,0))} lines and complexity ${Math.round(mean(lo,1))} for the rest.`);
fnd.push(`Estimated effort to review and fix the ${R.fp} fault-prone ${R.fp===1?'function':'functions'} is about ${fe} hours, of which ${pef} hours are for high-risk functions.`);
fnd.forEach(t=>{d.setFillColor(...TEAL).circle(M+3,y-3,2,'F');y=wrap(t,M+14,y,CW-14,10)+4});

/* page 2: charts */
d.addPage();sec('Metric analysis',54);
const Y1=76,Y2=Y1+PH+15,X2=M+PW+15;
panel(M,Y1,'SHAP: important features');
R.imp.forEach((s,k)=>{const yy=Y1+52+k*30,w=85*s.v/R.imp[0].v;tx(ML[s.i],M+10,yy,7.5,MUT);d.setFillColor(...AMB).rect(M+122,yy-8,w,11,'F');tx(s.v.toFixed(3),M+126+w,yy,7.5)});
tx('Longer bars mean the metric moves scores more.',M+10,Y1+PH-12,7.5,MUT);
panel(X2,Y1,'Risk score distribution');
const bins=Array(10).fill(0);R.rows.forEach(x=>bins[Math.min(9,Math.floor(x.sc*10))]++);
const mb=Math.max(...bins),bw=21,bx0=X2+20,by=Y1+PH-34;
bins.forEach((c,k)=>{const h=c/mb*(PH-100);d.setFillColor(...RG[LV((k+.5)/10)]).rect(bx0+k*bw,by-h,bw-2,h,'F');if(c)tx(c,bx0+k*bw+(bw-2)/2,by-h-3,7.5,INK,0,{align:'center'})});
d.setDrawColor(...MUT).setLineWidth(.6).line(bx0,by,bx0+10*bw,by);
[0,50,100].forEach(v=>tx(v,bx0+v/10*bw,by+11,7.5,MUT,0,{align:'center'}));
tx('Risk score (0 to 100) and number of functions',X2+10,Y1+PH-9,7.5,MUT);
panel(M,Y2,'Size vs. complexity');
LVL.forEach((k,i)=>{d.setFillColor(...RG[k]).circle(M+PW-80+i*26,Y2+14,3,'F');tx('P'+(i+1),M+PW-75+i*26,Y2+17,7.5,MUT)});
const sx=M+34,sy=Y2+34,sw=PW-50,sh=PH-74,mxL=Math.max(...R.rows.map(x=>x.m[0])),mxC=Math.max(...R.rows.map(x=>x.m[1]));
d.setDrawColor(...MUT).setLineWidth(.6).line(sx,sy,sx,sy+sh).line(sx,sy+sh,sx+sw,sy+sh);
R.rows.forEach(x=>{d.setFillColor(...rc(x.sc)).circle(sx+x.m[0]/mxL*sw,sy+sh-x.m[1]/mxC*sh,3.2,'F')});
tx('0',sx-8,sy+sh+3,7,MUT);tx(mxL,sx+sw,sy+sh+11,7,MUT,0,{align:'right'});tx('Lines of code',sx+sw/2,sy+sh+22,7.5,MUT,0,{align:'center'});
tx(mxC,sx-5,sy+6,7,MUT,0,{align:'right'});tx('Complexity',sx-22,sy+sh/2,7.5,MUT,0,{angle:90});
panel(X2,Y2,'Riskiest files (top function score)');
R.files.forEach((t,k)=>{const yy=Y2+52+k*34,w=(PW-60)*t[1];tx(A(t[0]).slice(-30),X2+10,yy,7.5,MUT);d.setFillColor(...rc(t[1])).rect(X2+10,yy+5,w,9,'F');tx((t[1]*100).toFixed(0),X2+14+w,yy+13,7.5)});
wrap('Charts use the same colors as the risk labels: red is P1 (high risk), amber is P2 (medium) and teal is P3 (low). Functions in the upper right of the size chart are both long and complex, which is where faults tend to concentrate.',M,Y2+PH+26,CW,9,MUT);
const EY=Y2+PH+66;d.setDrawColor(...LN).setLineWidth(.7).roundedRect(M,EY,CW,128,4,4);tx('Estimated effort by risk label (hours to review and fix)',M+10,EY+18,9.5,INK,1);
const eh=LVL.map(k=>R.rows.filter(x=>LV(x.sc)===k).reduce((s,x)=>s+x.ef,0)),me=Math.max(...eh,1);
LVL.forEach((k,i)=>{const yy=EY+46+i*26,w=(CW-210)*eh[i]/me;tx(k+' risk',M+10,yy,8.5,MUT);d.setFillColor(...RG[k]).rect(M+80,yy-9,Math.max(w,1),12,'F');tx(`${eh[i]} h (${R.lv[k]} ${R.lv[k]===1?'function':'functions'})`,M+86+w,yy,8.5)});
tx('Effort is a heuristic from size, complexity and risk. Calibrate it with your own team data.',M+10,EY+118,7.5,MUT);
/* SHAP page */
d.addPage();sec('SHAP explanations',54);
{const bx2=M+150,bw2=CW-170,mx=Math.max(...R.rows.flatMap(x=>x.sh.map(Math.abs)),.01),mid=bx2+bw2/2;
d.setDrawColor(...LN).setLineWidth(.7).roundedRect(M,72,CW,262,4,4);tx('SHAP summary: each dot is one function',M+10,90,10,INK,1);
R.imp.forEach((s,k)=>{const yy=124+k*38,vs=R.rows.map(x=>x.m[s.i]),a=Math.min(...vs),b=Math.max(...vs);
tx(ML[s.i],M+12,yy+3,8.5,MUT);d.setDrawColor(...LN).setLineWidth(.4).line(bx2,yy,bx2+bw2,yy);
R.rows.forEach((x,j)=>{const t=b>a?(x.m[s.i]-a)/(b-a):.5;d.setFillColor(Math.round(47+170*t),Math.round(111-51*t),Math.round(214-148*t)).circle(mid+x.sh[s.i]/mx*(bw2/2-8),yy+((j*7)%5-2)*3,3,'F')})});
d.setDrawColor(...MUT).setLineWidth(.6).line(mid,104,mid,296);
tx('Lowers risk',bx2,314,8,MUT);tx('Raises risk',bx2+bw2,314,8,MUT,0,{align:'right'});
d.setFillColor(47,111,214).circle(M+16,326,3,'F');tx('Low metric value',M+24,329,8,MUT);d.setFillColor(217,60,66).circle(M+104,326,3,'F');tx('High metric value',M+112,329,8,MUT)}
{const t=R.rows[0],ord=t.sh.map((v,i)=>[v,i]).sort((a,b)=>Math.abs(b[0])-Math.abs(a[0])),rs=t.sc-(BASE+t.sh.reduce((a,b)=>a+b,0)),st=[...ord.map(a=>[ML[a[1]]+' = '+t.m[a[1]],a[0]]),['Other factors',rs]];
let c=BASE;const pt=st.map(s=>{const a=c;c+=s[1];return[a,c]}),vs=[BASE,t.sc,...pt.flat()],lo2=Math.min(0,...vs),hi2=Math.max(...vs),wx=M+175,ww=CW-235,px=v=>wx+(v-lo2)/(hi2-lo2)*ww;
const rw=[['Base value (average function)',BASE,0,BASE,LN],...st.map((s,i)=>[s[0],s[1],pt[i][0],pt[i][1],s[1]>=0?AMB:TEAL]),['Predicted probability',t.sc,0,t.sc,rc(t.sc)]];
d.setDrawColor(...LN).setLineWidth(.7).roundedRect(M,350,CW,rw.length*26+46,4,4);tx(`Why ${A(t.n)} scores ${(t.sc*100).toFixed(1)}% (SHAP waterfall)`,M+10,368,10,INK,1);
rw.forEach((r,i)=>{const yy=386+i*26,a=px(Math.min(r[2],r[3])),b=px(Math.max(r[2],r[3]));tx(r[0],M+12,yy+10,8.5,MUT);d.setFillColor(...r[4]).rect(a,yy,Math.max(b-a,1.5),13,'F');tx((i&&i<rw.length-1&&r[1]>=0?'+':'')+f2(r[1]),b+5,yy+10,8.5,INK)})}
wrap('How to read these plots: SHAP splits each probability into the push from every metric. In the summary plot, a dot to the right of the center line raised that function risk and a dot to the left lowered it. Red dots have a high value of the metric and blue dots a low one. The waterfall starts at the average function and adds each metric push to reach the final probability.',M,634,CW,9,MUT);
/* page 3: top functions */
d.addPage();sec('Functions to review first',54);
const cx=M+300;
R.rows.slice(0,4).forEach((x,k)=>{const y0=78+k*156;
d.setDrawColor(...LN).setLineWidth(.7).roundedRect(M,y0,CW,148,4,4);
tx(`${k+1}. ${A(x.n)}`,M+12,y0+20,12,INK,1);tx(`${A(x.f)}:${x.ln}   |   ${CL(x)}   |   Effort estimate ${x.ef} h`,M+12,y0+34,8.5,MUT);
d.setFillColor(...rc(x.sc)).roundedRect(M+CW-128,y0+9,116,18,9,9,'F');tx(`${LV(x.sc)} risk  ${(x.sc*100).toFixed(1)}%`,M+CW-70,y0+21,8.5,WH,1,{align:'center'});
tx(`LOC ${x.m[0]}  |  McCC ${x.m[1]}  |  Halstead volume ${x.m[2]}  |  difficulty ${x.m[3]}  |  effort ${x.m[4]}`,M+12,y0+50,8.5,INK);
const o=x.sh.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]);
tx(`Main risk driver: ${ML[o[0][1]].toLowerCase()} (+${f2(o[0][0])}).`+(o[4][0]<0?` Biggest reducer: ${ML[o[4][1]].toLowerCase()} (${f2(o[4][0])}).`:''),M+12,y0+63,8.5,MUT);
d.setDrawColor(...MUT).setLineWidth(.5).line(cx,y0+74,cx,y0+124);
x.sh.forEach((v,i)=>{const yy=y0+77+i*9.5,w=Math.min(110,Math.abs(v)*250);tx(ML[i],M+12,yy+6,7.5,MUT);d.setFillColor(...(v>0?AMB:TEAL)).rect(v>0?cx:cx-w,yy,w,7,'F');tx((v>0?'+':'')+f2(v),v>0?cx+w+4:cx-w-4,yy+6,7.5,INK,0,{align:v>0?'left':'right'})})});
/* full list */
d.addPage();sec('Full triage list',54);
autoTable(d,{startY:72,margin:{left:M,right:M,bottom:50},head:[['Rank','Function','Location','Probability','Risk label','Class','Effort','Top driver']],body:R.rows.map((x,i)=>[i+1,A(x.n),A(x.f)+':'+x.ln,(x.sc*100).toFixed(1)+'%',LV(x.sc),CL(x),x.ef+' h',R.drv(x)]),styles:{fontSize:8,cellPadding:4,textColor:INK},headStyles:{fillColor:TEAL,textColor:255},alternateRowStyles:{fillColor:[244,247,250]},didParseCell:h=>{if(h.section==='body'&&h.column.index===4){h.cell.styles.textColor=RG[String(h.cell.raw)];h.cell.styles.fontStyle='bold'}}});
y=d.lastAutoTable.finalY+34;if(y>620){d.addPage();y=54}
sec('How to read this report',y);y+=28;
[['Probability','Model estimate that a function is fault-prone, from 0 to 100%.'],['Risk label','High: 60% and above. Medium: 35 to 59%. Low: below 35%. A probability of 50% or more is classified fault-prone.'],['Effort estimate','Heuristic hours to review and fix a function, from its size, complexity and probability. Calibrate it with your own team data.'],['SHAP value','How much one metric pushed a score up (amber, positive) or down (teal, negative) compared with an average function.'],['Cyclomatic complexity','Number of independent paths through a function. Higher means more branches to test.'],['Halstead metrics','Volume, difficulty and effort derived from counts of operators and operands. They estimate how large and hard to understand the code is.']].forEach(r=>{tx(r[0],M,y,9,INK,1);y=wrap(r[1],M+120,y,CW-120,9,MUT)+5});
y+=10;if(y>690){d.addPage();y=54}
sec('Scope and limitations',y);y+=28;
wrap('Scores come from models trained on public fault datasets (NASA and PROMISE projects), so they rank where to look first and are not a verdict on any function. Halstead values are approximated from source tokens. Only functions found by the static parser are analyzed, and test, vendor and excluded paths are skipped. Values in this prototype report are sample data.',M,y,CW,9,MUT);
d.addPage();sec('Recommendations',54);y=80;
{const rd=recData(R),bl=a=>a.forEach(t=>{if(y>770){d.addPage();y=54}d.setFillColor(...AMB).circle(M+3,y-3,2,'F');y=wrap(A(t),M+14,y,CW-14,9.5,INK)+4}),sub=t=>{if(y>740){d.addPage();y=54}tx(t,M,y,11,INK,1);y+=18};
y=wrap(A(rd.sum),M,y,CW,10,INK)+12;
if(rd.rows.length){sub('1. Refactor the highest-risk functions');autoTable(d,{startY:y,margin:{left:M,right:M,bottom:50},head:[['Function','Problem','Action','Risk now to after','Effort']],body:rd.rows.map(r=>[A(r.n)+'\n'+A(r.loc),r.why,r.act,Math.round(r.p0*100)+'% to '+Math.round(r.p1*100)+'%',r.ef+' h']),styles:{fontSize:8,cellPadding:4,textColor:INK},headStyles:{fillColor:TEAL,textColor:255},alternateRowStyles:{fillColor:[244,247,250]}});y=d.lastAutoTable.finalY+22}
sub('2. Prevent new faults');bl(rd.prev);y+=8;sub('3. Test and verify');bl(rd.tests)}
const N=d.getNumberOfPages();
for(let i=1;i<=N;i++){d.setPage(i);d.setDrawColor(...LN).setLineWidth(.5).line(M,H-36,W-M,H-36);tx('FaultLens triage report | '+A(R.name).slice(0,60),M,H-22,8,MUT);tx(`Page ${i} of ${N}`,W-M,H-22,8,MUT,0,{align:'right'})}
return d.output('arraybuffer')}

const BK=['loc','cc','h_volume','h_difficulty','h_effort']
// Maps the FastAPI /analyze/{id} result to the shape the UI uses.
export function fromApi(res,{name,lang,file}){
const rows=res.modules.map(m=>({n:m.name,f:m.file,ln:m.line,m:BK.map(k=>m.metrics[k]??0),sh:BK.map(k=>m.shap[k]??0),sc:m.score})).sort((a,b)=>b.sc-a.sc)
return summarize(rows,{name,lang,file})}

export {ML,KEY,W,LV,PR,COL,CL,BASE,effort,recs,whatIf,slug}
