(() => {
  'use strict';
  const channel='solotome-kindle-exporter';
  let state={ready:false,captured:0,progress:null,result:null,error:''};
  const send=type=>window.postMessage({channel,from:'extension',type},'*');
  window.addEventListener('message',ev=>{const m=ev.data;if(!m||m.channel!==channel||m.from!=='page')return;if(m.type==='ready'||m.type==='status')state={...state,ready:Boolean(m.data?.ready??true),captured:m.data?.captured||state.captured,error:''};if(m.type==='progress')state={...state,progress:m.data};if(m.type==='result'){state={...state,result:m.data?.items||[],progress:null,error:''};chrome.storage.local.set({kindleHarvest:{items:state.result,at:new Date().toISOString(),host:location.host}})}if(m.type==='error')state={...state,error:m.data?.message||'Ошибка Amazon',progress:null}});
  chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{if(msg?.type==='ST_STATUS'){send('status');setTimeout(()=>reply({ok:true,...state}),120);return true}if(msg?.type==='ST_SCRAPE'){state={...state,result:null,error:'',progress:{collected:0,total:0,page:0}};send('scrape');reply({ok:true});return false}});
  send('status');
})();
