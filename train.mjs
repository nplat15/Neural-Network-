import fs from 'node:fs';

const rows = fs.readFileSync(new URL('./clinic-wait-times.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
  const [hour, day, staff, queue, wait] = line.split(',');
  return { x: [Number(hour), Number(staff), Number(queue), ...['Mon','Tue','Wed','Thu','Fri'].map(d => +(day === d))], y: Number(wait) };
});
let seed = 20261119;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
const train = rows.slice(0, Math.floor(rows.length * .8));
const test = rows.slice(train.length);
const nIn = train[0].x.length, nHidden = 12;
const xMean = Array.from({length:nIn}, (_,j) => train.reduce((s,r)=>s+r.x[j],0)/train.length);
const xStd = xMean.map((m,j) => Math.sqrt(train.reduce((s,r)=>s+(r.x[j]-m)**2,0)/train.length) || 1);
const yMean = train.reduce((s,r)=>s+r.y,0)/train.length;
const yStd = Math.sqrt(train.reduce((s,r)=>s+(r.y-yMean)**2,0)/train.length);
const norm = x => x.map((v,j)=>(v-xMean[j])/xStd[j]);
const X = train.map(r=>norm(r.x)), Y=train.map(r=>[(r.y-yMean)/yStd]);
const W1=Array.from({length:nHidden},()=>Array.from({length:nIn},()=> (rand()*2-1)*Math.sqrt(2/nIn)));
const b1=Array(nHidden).fill(0), W2=Array.from({length:1},()=>Array.from({length:nHidden},()=> (rand()*2-1)*Math.sqrt(1/nHidden))), b2=[0];
const params=[W1,b1,W2,b2], m=params.map(p=>Array.isArray(p[0])?p.map(r=>r.map(()=>0)):p.map(()=>0)), v=params.map(p=>Array.isArray(p[0])?p.map(r=>r.map(()=>0)):p.map(()=>0));
let step=0;
for(let epoch=0;epoch<650;epoch++){
  const g1=W1.map(r=>r.map(()=>0)), gb1=b1.map(()=>0), g2=W2.map(r=>r.map(()=>0)), gb2=[0];
  for(let k=0;k<X.length;k++){
    const h=W1.map((w,i)=>Math.tanh(w.reduce((s,a,j)=>s+a*X[k][j],b1[i])));
    const out=W2[0].reduce((s,a,j)=>s+a*h[j],b2[0]); const e=out-Y[k][0];
    gb2[0]+=2*e; h.forEach((a,j)=>g2[0][j]+=2*e*a);
    h.forEach((a,i)=>{const d=2*e*W2[0][i]*(1-a*a);gb1[i]+=d;X[k].forEach((z,j)=>g1[i][j]+=d*z);});
  }
  const grads=[g1,gb1,g2,gb2]; step++;
  for(let p=0;p<params.length;p++){
    const flat=(a,b,fn)=>{if(Array.isArray(a[0]))a.forEach((r,i)=>r.forEach((_,j)=>fn(i,j)));else a.forEach((_,i)=>fn(i));};
    flat(params[p],m[p],(i,j)=>{const grad=(Array.isArray(params[p][0])?grads[p][i][j]:grads[p][i])/X.length; const mm=Array.isArray(params[p][0])?m[p][i][j]:m[p][i], vv=Array.isArray(params[p][0])?v[p][i][j]:v[p][i];const nm=.9*mm+.1*grad,nv=.999*vv+.001*grad*grad;const upd=.018*(nm/(1-.9**step))/(Math.sqrt(nv/(1-.999**step))+1e-8);if(Array.isArray(params[p][0])){m[p][i][j]=nm;v[p][i][j]=nv;params[p][i][j]-=upd;}else{m[p][i]=nm;v[p][i]=nv;params[p][i]-=upd;}});
  }
}
function predict(x){const z=norm(x);const h=W1.map((w,i)=>Math.tanh(w.reduce((s,a,j)=>s+a*z[j],b1[i])));return (W2[0].reduce((s,a,j)=>s+a*h[j],b2[0]))*yStd+yMean;}
const errors=test.map(r=>predict(r.x)-r.y);
const mae=errors.reduce((s,e)=>s+Math.abs(e),0)/errors.length;
const rmse=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length);
const baselineErrors=test.map(r=>yMean-r.y);
const baselineMae=baselineErrors.reduce((s,e)=>s+Math.abs(e),0)/baselineErrors.length;
const baselineRmse=Math.sqrt(baselineErrors.reduce((s,e)=>s+e*e,0)/baselineErrors.length);
const data={features:['hour','staff','queue','Mon','Tue','Wed','Thu','Fri'],xMean,xStd,yMean,yStd,W1,b1,W2,b2,trainRows:train.length,testRows:test.length,mae,rmse,baseline:{name:'training-mean predictor',mae:baselineMae,rmse:baselineRmse},ranges:{hour:[8,17],staff:[1,5],queue:[0,20]},dataRows:rows.length};
fs.writeFileSync(new URL('./model.json',import.meta.url),JSON.stringify(data));
const gallery=test.map((r,i)=>({id:i+1,hour:r.x[0],staff:r.x[1],queue:r.x[2],day:['Mon','Tue','Wed','Thu','Fri'][r.x.slice(3).indexOf(1)],actual:Number(r.y.toFixed(1)),predicted:Number(predict(r.x).toFixed(1))}));
fs.writeFileSync(new URL('./gallery.json',import.meta.url),JSON.stringify(gallery));
console.log(`Saved model: ${train.length} train / ${test.length} test · MAE ${mae.toFixed(1)} min · RMSE ${rmse.toFixed(1)} min · baseline MAE ${baselineMae.toFixed(1)} min / RMSE ${baselineRmse.toFixed(1)} min`);
