const $ = id => document.getElementById(id);
const queue = $('queue'), staff = $('staff'), hour = $('hour'), day = $('day');
let model;
let galleryData=[];
let activeFilter='all';
let chatWorker;
let chatReady=false;
let chatBusy=false;
let chatRequest=0;
const chatReplies=new Map();
const viewTabs=[...document.querySelectorAll('.view-tab')];
function selectView(name,moveFocus=false){
  viewTabs.forEach(tab=>{const selected=tab.dataset.view===name;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;document.getElementById(`view-${tab.dataset.view}`).hidden=!selected;if(selected&&moveFocus)tab.focus();});
  window.scrollTo({top:0,behavior:'smooth'});
}
viewTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>selectView(tab.dataset.view));
  tab.addEventListener('keydown',event=>{
    let next=index;
    if(event.key==='ArrowRight')next=(index+1)%viewTabs.length;
    else if(event.key==='ArrowLeft')next=(index-1+viewTabs.length)%viewTabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=viewTabs.length-1;
    else return;
    event.preventDefault();selectView(viewTabs[next].dataset.view,true);
  });
});

function estimate(queueCount, staffCount, hourValue, dayValue) {
  const days = ['Mon','Tue','Wed','Thu','Fri'];
  const x = [Number(hourValue), Number(staffCount), Number(queueCount), ...days.map(d => +(d === dayValue))];
  const z = x.map((v,i)=>(v-model.xMean[i])/model.xStd[i]);
  const hidden = model.W1.map((weights,i)=>Math.tanh(weights.reduce((sum,w,j)=>sum+w*z[j],model.b1[i])));
  const y = model.W2[0].reduce((sum,w,j)=>sum+w*hidden[j],model.b2[0]);
  return Math.max(0, y*model.yStd+model.yMean);
}
function niceMinutes(x) { return Math.round(x).toLocaleString(); }
function renderChart() {
  const q=Number(queue.value), s=Number(staff.value), h=Number(hour.value), d=day.value;
  const values=Array.from({length:5},(_,i)=>estimate(q,i+1,h,d));
  const w=440, ht=120, pad={l:4,r:8,t:12,b:15};
  const min=Math.max(0,Math.min(...values)-8), max=Math.max(...values)+8;
  const x=i=>pad.l+i*(w-pad.l-pad.r)/4;
  const y=v=>pad.t+(max-v)/(max-min||1)*(ht-pad.t-pad.b);
  const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  const area=`${x(0)},${ht-pad.b} ${points} ${x(4)},${ht-pad.b}`;
  const guides=[.25,.55,.85].map(t=>`<line x1="0" y1="${pad.t+t*(ht-pad.t-pad.b)}" x2="${w}" y2="${pad.t+t*(ht-pad.t-pad.b)}" stroke="#ffffff16" stroke-dasharray="2 4"/>`).join('');
  const marks=values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="${i+1===s?5.2:3.2}" fill="${i+1===s?'#d9ec86':'#a9b9a8'}" stroke="#26372d" stroke-width="2"/>`).join('');
  const labels=values.map((v,i)=>`<text x="${x(i)}" y="${Math.max(10,y(v)-10)}" text-anchor="middle" fill="${i+1===s?'#e6f3c5':'#b0beb1'}" font-size="9" font-family="DM Mono,monospace">${niceMinutes(v)}</text>`).join('');
  $('chart').innerHTML=`<svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" aria-hidden="true">${guides}<polygon points="${area}" fill="#d9ec86" opacity=".07"/><polyline points="${points}" fill="none" stroke="#9db994" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${marks}${labels}</svg>`;
  const current=values[s-1], next=values[Math.min(s,4)], previous=values[Math.max(s-2,0)];
  const diff=next-current;
  let insight;
  if(s===5) insight=`At this queue size, the model estimates about ${niceMinutes(Math.abs(current-previous))} ${current<previous?'fewer':'more'} minutes with 5 staff than with 4.`;
  else insight=`At this queue size, one more staff member shifts the estimate by about ${niceMinutes(Math.abs(diff))} ${diff<0?'fewer':'more'} minutes.`;
  $('insightText').textContent=insight;
}
function update() {
  if(!model)return;
  const q=Number(queue.value), s=Number(staff.value), h=Number(hour.value), d=day.value;
  const predicted=estimate(q,s,h,d);
  $('queueValue').textContent=q; $('staffValue').textContent=s;
  queue.style.setProperty('--fill',`${q/20*100}%`);staff.style.setProperty('--fill',`${(s-1)/4*100}%`);
  $('prediction').textContent=niceMinutes(predicted);
  $('summary').textContent=`${q} ${q===1?'person':'people'} in queue with ${s} ${s===1?'staff member':'staff members'}`;
  renderChart();
}
function renderGallery() {
  const filtered=galleryData.filter(item=>activeFilter==='all'||(activeFilter==='short'?item.queue<=6:activeFilter==='medium'?item.queue>=7&&item.queue<=13:item.queue>=14));
  const ordered=[...filtered].sort((a,b)=>a.queue-b.queue||a.staff-b.staff);
  const selected=ordered.length<=6?ordered:Array.from({length:6},(_,i)=>ordered[Math.floor((i+.5)*ordered.length/6)]);
  $('galleryCount').textContent=`Showing ${selected.length} of ${filtered.length} held-out visits`;
  $('gallery').innerHTML=selected.map(item=>{
    const label=item.queue===1?'person':'people';
    const time=item.hour<=11?`${item.hour}:00 AM`:item.hour===12?'12:00 PM':`${item.hour-12}:00 PM`;
    return `<article class="case-card" data-id="${item.id}"><div class="case-top"><span class="case-id">HELD-OUT VISIT #${String(item.id).padStart(3,'0')}</span><span class="queue-tag">${item.queue} ${label}</span></div><div class="case-scene"><span>${item.staff} ${item.staff===1?'staff':'staff'}</span><span>${item.day}</span><span>${time}</span></div><div class="case-prediction"><span>Model estimate</span><strong>${niceMinutes(item.predicted)} <small style="font:10px var(--sans);letter-spacing:0;color:#718071">min</small></strong></div><button class="reveal-button" type="button" aria-expanded="false">Reveal recorded wait</button><div class="revealed" hidden><div class="actual-result"><span>Recorded wait</span><strong>${niceMinutes(item.actual)} min</strong></div><div class="error-tag">Prediction error: ${niceMinutes(Math.abs(item.predicted-item.actual))} min</div></div></article>`;
  }).join('');
}
Promise.all([
  fetch('./model.json').then(r=>{if(!r.ok)throw new Error('Could not load model');return r.json();}),
  fetch('./gallery.json').then(r=>{if(!r.ok)throw new Error('Could not load held-out examples');return r.json();})
]).then(([loaded,examples])=>{
  model=loaded;galleryData=examples;$('mae').textContent=loaded.mae.toFixed(1);$('rmse').textContent=loaded.rmse.toFixed(1);$('baselineMae').textContent=loaded.baseline.mae.toFixed(1);$('baselineRmse').textContent=loaded.baseline.rmse.toFixed(1);update();renderGallery();
}).catch(()=>{$('prediction').textContent='Model unavailable';$('insightText').textContent='Run the app from a local web server so it can load the trained model.';});
[queue,staff,hour,day].forEach(el=>el.addEventListener('input',update));
[hour,day].forEach(el=>el.addEventListener('change',update));
$('reset').addEventListener('click',()=>{queue.value=10;staff.value=3;hour.value=11;day.value='Mon';update();});
$('gallery').addEventListener('click',event=>{
  const button=event.target.closest('.reveal-button');if(!button)return;
  const card=button.closest('.case-card');const details=card.querySelector('.revealed');
  details.hidden=!details.hidden;button.setAttribute('aria-expanded',String(!details.hidden));button.textContent=details.hidden?'Reveal recorded wait':'Hide recorded wait';
});
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{
  activeFilter=button.dataset.filter;document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b===button));if(galleryData.length)renderGallery();
}));

function setChatStatus(text,state=''){$('chatStatus').textContent=text;$('chatStatus').className=`chat-status ${state}`;}
function appendChat(text,role){const node=document.createElement('div');node.className=`chat-message ${role}`;node.textContent=text;$('chatMessages').append(node);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;return node;}
function setChatEnabled(enabled){$('chatInput').disabled=!enabled;$('chatSend').disabled=!enabled||chatBusy;document.querySelectorAll('#chatQuick button').forEach(button=>button.disabled=!enabled||chatBusy);}
function currentScenario(){
  const q=Number(queue.value),s=Number(staff.value),h=Number(hour.value),d=day.value;
  const comparison=Array.from({length:5},(_,i)=>`${i+1} staff: ${niceMinutes(estimate(q,i+1,h,d))} min`).join('; ');
  return `queue=${q}, staff=${s}, time=${h}:00, weekday=${d}, current neural-network estimate=${niceMinutes(estimate(q,s,h,d))} minutes. Model estimates for the same queue/time/day across staffing levels: ${comparison}.`; 
}
function askAssistant(question){
  if(!chatReady||chatBusy||!question.trim())return;
  chatBusy=true;setChatEnabled(false);appendChat(question,'user');
  const id=++chatRequest;const reply=appendChat('','assistant');reply.innerHTML='<span class="chat-thinking"><i></i><i></i><i></i></span>';
  chatReplies.set(id,reply);chatWorker.postMessage({type:'ask',id,content:question.trim(),context:currentScenario()});$('chatMessages').scrollTop=$('chatMessages').scrollHeight;
}
function startAssistant(){
  if(!window.isSecureContext){setChatStatus('SECURE PAGE NEEDED','error');$('chatProgress').textContent='Open this page through localhost or an HTTPS site.';return;}
  if(!navigator.gpu){setChatStatus('WEBGPU UNAVAILABLE','error');$('chatProgress').textContent='Try a current Chrome or Edge browser with WebGPU enabled.';return;}
  $('chatStart').disabled=true;$('chatStart').textContent='Starting…';$('chatProgress').textContent='Downloading and preparing the local model. This can take a few minutes.';setChatStatus('LOADING MODEL','loading');
  chatWorker=new Worker(new URL('./chat-worker.js',import.meta.url),{type:'module'});
  chatWorker.onmessage=({data})=>{
    if(data.type==='progress'){$('chatProgress').textContent=data.text||`Loading local model (${Math.round(data.progress*100)}%)`;return;}
    if(data.type==='ready'){chatReady=true;$('chatStart').disabled=true;$('chatStart').textContent='Local assistant ready';$('chatProgress').textContent='Model runs on this device and is cached by your browser.';setChatStatus('READY','ready');$('chatInput').placeholder='Ask about this wait-time scenario…';setChatEnabled(true);return;}
    if(data.type==='error'){chatReady=false;$('chatStart').disabled=false;$('chatStart').textContent='Try starting again';$('chatProgress').textContent=data.message||'Could not start the local model.';setChatStatus('UNAVAILABLE','error');return;}
    const reply=chatReplies.get(data.id);if(!reply)return;
    if(data.type==='token'){if(reply.querySelector('.chat-thinking'))reply.textContent='';reply.textContent+=data.text;$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
    if(data.type==='answer-done'||data.type==='answer-error'){
      if(data.type==='answer-error')reply.textContent=data.message||'I could not generate a reply.';
      if(!reply.textContent)reply.textContent='I could not generate a reply. Please try again.';
      chatReplies.delete(data.id);chatBusy=false;setChatEnabled(chatReady);$('chatInput').focus();
    }
  };
  chatWorker.onerror=event=>{chatReady=false;chatBusy=false;$('chatStart').disabled=false;$('chatStart').textContent='Try starting again';$('chatProgress').textContent=event.message||'The local model worker could not load.';setChatStatus('UNAVAILABLE','error');setChatEnabled(false);};
  chatWorker.postMessage({type:'init'});
}
$('chatStart').addEventListener('click',startAssistant);
$('chatForm').addEventListener('submit',event=>{event.preventDefault();const question=$('chatInput').value.trim();if(!question)return;$('chatInput').value='';$('chatInput').style.height='auto';askAssistant(question);});
$('chatInput').addEventListener('input',event=>{event.target.style.height='auto';event.target.style.height=`${Math.min(event.target.scrollHeight,78)}px`;});
$('chatQuick').addEventListener('click',event=>{const button=event.target.closest('button');if(button)askAssistant(button.textContent);});
$('chatInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('chatForm').requestSubmit();}});
