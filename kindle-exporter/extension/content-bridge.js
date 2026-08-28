(() => {
  'use strict';
  const channel='solotome-kindle-exporter';
  let state={ready:false,captured:0,progress:null,result:null,error:''},autoStarted=false;
  const send=type=>window.postMessage({channel,from:'extension',type},'*');
  async function pendingAuto(){const x=await chrome.storage.local.get('kindleAuto');return x.kindleAuto?.pending?x.kindleAuto:null}
  async function maybeAuto(){
    if(autoStarted||!state.ready)return;
    const a=await pendingAuto();if(!a)return;
    autoStarted=true;state={...state,result:null,error:'',progress:{collected:0,total:0,page:0}};send('scrape');
  }
  window.addEventListener('message',async ev=>{
    const m=ev.data;if(!m||m.channel!==channel||m.from!=='page')return;
    if(m.type==='ready'||m.type==='status'){
      state={...state,ready:Boolean(m.data?.ready??true),captured:m.data?.captured||state.captured,error:''};
      if(state.ready)maybeAuto();
    }
    if(m.type==='progress')state={...state,progress:m.data};
    if(m.type==='result'){
      state={...state,result:m.data?.items||[],progress:null,error:''};
      await chrome.storage.local.set({kindleHarvest:{items:state.result,at:new Date().toISOString(),host:location.host}});
      const a=await pendingAuto();
      if(a){
        await chrome.storage.local.set({kindleAutoResult:{items:state.result,at:new Date().toISOString(),host:location.host}});
        await chrome.storage.local.set({kindleAuto:{...a,pending:false,completedAt:new Date().toISOString()}});
        if(a.returnUrl)setTimeout(()=>{try{if(window.opener){window.close();return}}catch{}location.href=a.returnUrl},350);
      }
    }
    if(m.type==='error'){state={...state,error:m.data?.message||'Ошибка Amazon',progress:null};autoStarted=false}
  });
  chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
    if(msg?.type==='ST_STATUS'){send('status');setTimeout(()=>reply({ok:true,...state}),120);return true}
    if(msg?.type==='ST_SCRAPE'){state={...state,result:null,error:'',progress:{collected:0,total:0,page:0}};send('scrape');reply({ok:true});return false}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.kindleAuto?.newValue?.pending)maybeAuto()});
  send('status');setTimeout(maybeAuto,900);
})();
