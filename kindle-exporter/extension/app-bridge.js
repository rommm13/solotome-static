(() => {
  'use strict';
  const channel='solotome-kindle-connector';
  const post=(type,data)=>window.postMessage({channel,from:'extension',type,data},'*');
  async function deliver(){
    post('extension-ready',{version:chrome.runtime.getManifest().version});
    const x=await chrome.storage.local.get(['kindleAutoResult']);
    if(x.kindleAutoResult?.items?.length)post('result',x.kindleAutoResult);
  }
  window.addEventListener('message',async ev=>{
    const m=ev.data;
    if(!m||m.channel!==channel||m.from!=='page')return;
    if(m.type==='app-ready'){await deliver();return}
    if(m.type==='begin'){
      const returnUrl=String(m.data?.returnUrl||'');
      await chrome.storage.local.set({kindleAuto:{pending:true,returnUrl,startedAt:new Date().toISOString()}});
      await chrome.storage.local.remove('kindleAutoResult');
      post('begin-ack',{ok:true});return
    }
    if(m.type==='result-consumed'){
      await chrome.storage.local.remove(['kindleAutoResult','kindleAuto']);
      post('result-cleared',{ok:true});return
    }
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.kindleAutoResult?.newValue?.items?.length)deliver()});
  setTimeout(deliver,80);
})();
