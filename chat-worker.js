import { CreateMLCEngine } from 'https://esm.run/@mlc-ai/web-llm@0.2.89';

const MODEL_ID='Qwen3-0.6B-q4f16_1-MLC';
let engine;
let history=[];
const systemBase=`You are the Clinic Flow guide for an educational clinic wait-time simulator. Answer clearly in 2 to 5 short sentences. Explain the supplied simulator facts and help visitors compare scenarios. The wait-time predictor is a separate feedforward neural network; you are explaining it, not making or changing predictions. Use only the facts below and the live scenario context. Never invent a result, claim causation, give medical/operational advice, or describe estimates as guarantees. If asked about medical care or unrelated topics, politely redirect to the simulator. State uncertainty plainly.

Be prepared to answer these three evaluation questions directly:
1. Data: The data file is clinic-wait-times.csv, provided in this project. It contains 2,000 rows with hour, weekday, staff on shift, patients in queue, and wait minutes. No source or collection-method documentation was included, so do not claim where it was collected or whether the records are real or simulated; say the original source is unknown from the provided files.
2. Results: On the same random held-out set of 400 rows, the neural network had MAE 4.9 minutes and RMSE 6.2 minutes. The baseline is a constant predictor equal to the training-set mean wait; it had MAE 46.5 minutes and RMSE 64.0 minutes. Say the neural network performed better on this split, but do not imply that this proves performance elsewhere.
3. Outside the guide: No separate external dataset was evaluated. The 400 held-out records came from the same CSV, so performance on a different dataset or clinic is unknown.

Other facts: Inputs are limited to observed ranges: queue 0–20, staff 1–5, hour 8 AM–5 PM, Monday–Friday. The gallery samples six rows at a time from held-out records; visitors can reveal actual waits.`;

self.onmessage=async({data})=>{
  if(data.type==='init'){
    if(engine){self.postMessage({type:'ready'});return;}
    try{
      engine=await CreateMLCEngine(MODEL_ID,{initProgressCallback:progress=>self.postMessage({type:'progress',text:progress.text||'Preparing local model…',progress:progress.progress??0})});
      self.postMessage({type:'ready'});
    }catch(error){self.postMessage({type:'error',message:error?.message||'The local model could not start.'});}
    return;
  }
  if(data.type==='reset'){history=[];return;}
  if(data.type!=='ask'||!engine)return;
  const {id,content,context}=data;
  history.push({role:'user',content});
  const messages=[{role:'system',content:`${systemBase}\n\nCurrent simulator scenario (the values may change between messages): ${context}`} ,...history.slice(-10)];
  self.postMessage({type:'answer-start',id});
  let answer='';
  try{
    const stream=await engine.chat.completions.create({messages,stream:true,temperature:.35,max_tokens:180,enable_thinking:false});
    for await(const part of stream){const text=part.choices[0]?.delta?.content||'';if(text){answer+=text;self.postMessage({type:'token',id,text});}}
    if(!answer)answer=await engine.getMessage();
    history.push({role:'assistant',content:answer});history=history.slice(-10);
    self.postMessage({type:'answer-done',id});
  }catch(error){history.pop();self.postMessage({type:'answer-error',id,message:error?.message||'I could not generate a reply. Please try again.'});}
};
