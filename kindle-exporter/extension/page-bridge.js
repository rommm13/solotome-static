(() => {
  'use strict';
  const FLAG='__SOLOTOME_KINDLE_EXPORTER__';
  if(window[FLAG]) return;
  window[FLAG]=true;
  const channel='solotome-kindle-exporter';
  const books=new Map();
  let template=null;
  const nativeFetch=window.fetch.bind(window);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const interesting=/\/hz\/mycd\/|contentlist|pdocs|digital-console/i;
  const post=(type,data)=>window.postMessage({channel,from:'page',type,data},'*');

  function bookLike(v){
    if(!v||typeof v!=='object'||Array.isArray(v)) return false;
    if(v.deviceSerialNumber||v.deviceType||v.deviceTypeID||v.deviceAccountID) return false;
    const id=v.asin||v.ASIN||v.assetId||v.contentId;
    return !!id && !!(v.title||v.sortableTitle||v.contentTitle);
  }
  function findItems(node,depth=0){
    if(!node||typeof node!=='object'||depth>8) return [];
    let best=[];
    if(Array.isArray(node)){
      const hit=node.filter(bookLike);
      if(hit.length>=Math.ceil(node.length/2)) best=hit;
      for(const child of node){const x=findItems(child,depth+1);if(x.length>best.length)best=x;}
    }else{
      for(const child of Object.values(node)){if(child&&typeof child==='object'){const x=findItems(child,depth+1);if(x.length>best.length)best=x;}}
    }
    return best;
  }
  const idOf=v=>String(v.asin||v.ASIN||v.assetId||v.contentId||[v.title,v.author].join('|'));
  const parse=text=>{try{return JSON.parse(text)}catch{return null}};
  function ingest(text){const json=parse(text),items=findItems(json);for(const b of items)books.set(idOf(b),b);return{json,items};}
  function headersObject(h){
    const out={};
    try{if(h?.forEach)h.forEach((v,k)=>out[k]=v);else if(Array.isArray(h))h.forEach(([k,v])=>out[k]=v);else if(h)Object.assign(out,h);}catch{}
    for(const k of Object.keys(out)){const x=k.toLowerCase();if(['host','content-length','cookie','origin','referer','user-agent','accept-encoding','connection'].includes(x)||x.startsWith('sec-')||x.startsWith('proxy-'))delete out[k];}
    return out;
  }
  async function requestMeta(input,init){
    let url='',method='GET',headers={},body='';
    if(typeof input==='string')url=input;else if(input){url=input.url||'';method=input.method||method;headers=headersObject(input.headers);try{body=await input.clone().text()}catch{}}
    if(init){method=init.method||method;headers={...headers,...headersObject(init.headers)};if(typeof init.body==='string')body=init.body;else if(init.body instanceof URLSearchParams)body=init.body.toString();}
    return{url,method:String(method).toUpperCase(),headers,body};
  }
  function mutateObj(obj,start,size){
    let touched=false,holder=null;
    (function walk(v,d){if(!v||typeof v!=='object'||d>8)return;for(const k of Object.keys(v)){const x=v[k];if(/^(start|startindex|startitem|offset)$/i.test(k)&&typeof x!=='object'){v[k]=start;touched=true;holder=v}else if(/^(batchsize|pagesize|numberofitems|count|limit|maxresults|size)$/i.test(k)&&typeof x!=='object'){v[k]=size;touched=true;holder=v}else if(x&&typeof x==='object')walk(x,d+1)}})(obj,0);
    if(holder&&!Object.keys(holder).some(k=>/^(start|startindex|startitem|offset)$/i.test(k)))holder.startIndex=start;
    return touched;
  }
  function mutateBody(body,start,size){
    if(!body)return body;const t=body.trim();
    if(t.startsWith('{')||t.startsWith('[')){try{const o=JSON.parse(body);mutateObj(o,start,size);return JSON.stringify(o)}catch{return body}}
    try{const p=new URLSearchParams(body);let touched=false;for(const[k,v]of[...p]){if(/^(start|startindex|startitem|offset)$/i.test(k)){p.set(k,String(start));touched=true;continue}if(/^(batchsize|pagesize|numberofitems|count|limit|maxresults|size)$/i.test(k)){p.set(k,String(size));touched=true;continue}const q=(v||'').trim();if(q.startsWith('{')||q.startsWith('[')){try{const o=JSON.parse(v);if(mutateObj(o,start,size)){p.set(k,JSON.stringify(o));touched=true}}catch{}}}if(touched&&!Array.from(p.keys()).some(k=>/^(start|startindex|startitem|offset)$/i.test(k)))p.set('startIndex',String(start));return p.toString()}catch{return body}
  }
  function mutateUrl(url,start,size){try{const u=new URL(url,location.href);let touched=false;for(const k of[...u.searchParams.keys()]){if(/^(start|startindex|startitem|offset)$/i.test(k)){u.searchParams.set(k,String(start));touched=true}else if(/^(batchsize|pagesize|numberofitems|count|limit|maxresults|size)$/i.test(k)){u.searchParams.set(k,String(size));touched=true}}return touched?u.toString():url}catch{return url}}
  function totalFrom(json,depth=0){if(!json||typeof json!=='object'||depth>8)return 0;for(const[k,v]of Object.entries(json))if(/^(numberofitems|totalcontentcount|totalresultcount|numberofresults|totalitems|itemcount)$/i.test(k)&&Number(v)>0)return Number(v);for(const v of Object.values(json)){const n=totalFrom(v,depth+1);if(n)return n}return 0}
  function cursorFrom(json,depth=0){if(!json||typeof json!=='object'||depth>8)return null;for(const[k,v]of Object.entries(json)){if(typeof v==='string'&&v.length>3&&/(pagination.?token|continuation.?token|next.?page.?token|next.?token|nextpagekey|paginationkey|cursor)$/i.test(k))return{key:k,value:v}}for(const v of Object.values(json)){const c=cursorFrom(v,depth+1);if(c)return c}return null}
  function setCursorInBody(body,key,value){if(!body||!key||!value)return body;const t=body.trim();const put=o=>{let placed=false,container=null;(function walk(v,d){if(!v||typeof v!=='object'||d>8)return;for(const k of Object.keys(v)){if(k===key){v[k]=value;placed=true}else if(/^(start|startindex|startitem|offset|batchsize|pagesize|numberofitems|count|limit|maxresults|size)$/i.test(k)){container=v}else if(v[k]&&typeof v[k]==='object')walk(v[k],d+1)}})(o,0);if(!placed){(container||o)[key]=value}return o};if(t.startsWith('{')||t.startsWith('[')){try{return JSON.stringify(put(JSON.parse(body)))}catch{return body}}try{const q=new URLSearchParams(body);let placed=false;for(const[k,v]of[...q]){const z=(v||'').trim();if(k===key){q.set(k,value);placed=true}else if(z.startsWith('{')||z.startsWith('[')){try{q.set(k,JSON.stringify(put(JSON.parse(v))));placed=true}catch{}}}if(!placed)q.set(key,value);return q.toString()}catch{return body}}
  function domTotal(){for(const sel of['#CONTENT_COUNT','[id="CONTENT_COUNT"]','.content-count','#content-count']){const el=document.querySelector(sel);if(!el)continue;const nums=String(el.textContent||'').replace(/,/g,'').match(/\d+/g);if(nums?.length)return Math.max(...nums.map(Number))}return 0}
  async function scrape(){
    if(!template)throw new Error('Amazon ещё не загрузил список. Обнови Content Library → Docs и повтори.');
    books.clear();let start=0,total=domTotal(),last='',cursor=null;const size=100;
    for(let page=0;page<500;page++){
      let url=template.method==='GET'?mutateUrl(template.url,start,size):template.url;
      let body=template.method==='GET'?undefined:mutateBody(template.body,start,size);
      if(cursor){if(template.method==='GET'){try{const u=new URL(url,location.href);u.searchParams.set(cursor.key,cursor.value);url=u.toString()}catch{}}else body=setCursorInBody(body,cursor.key,cursor.value)}
      const headers={...template.headers};
      if(template.method!=='GET'&&!Object.keys(headers).some(k=>k.toLowerCase()==='content-type'))headers['Content-Type']=template.body.trim().startsWith('{')?'application/json':'application/x-www-form-urlencoded; charset=UTF-8';
      let text='';
      for(let attempt=0;attempt<3;attempt++){if(attempt)await wait(900*(attempt+1));try{const r=await nativeFetch(url,{method:template.method,headers,body,credentials:'include'});if(r.ok){text=await r.text();break}}catch{}}
      if(!text)throw new Error('Amazon не ответил при чтении страницы '+(page+1));
      const {json,items}=ingest(text);if(!total)total=totalFrom(json);cursor=cursorFrom(json);
      const first=items.length?idOf(items[0]):'';if(first&&first===last)break;last=first;
      post('progress',{collected:books.size,total,page:page+1});
      if(!items.length)break;start+=items.length;if(total&&books.size>=total)break;if(!total&&items.length<size)break;await wait(650);
    }
    return[...books.values()];
  }
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');const meta=interesting.test(url)?await requestMeta(input,init).catch(()=>null):null;const resp=await nativeFetch.apply(this,arguments);
    if(meta){try{const text=await resp.clone().text();const{items}=ingest(text);if(items.length){template=meta;post('ready',{captured:books.size})}}catch{}}
    return resp;
  };
  const X=window.XMLHttpRequest,open=X.prototype.open,send=X.prototype.send,set=X.prototype.setRequestHeader;
  X.prototype.open=function(method,url){this.__st={method,url,headers:{}};return open.apply(this,arguments)};
  X.prototype.setRequestHeader=function(k,v){if(this.__st)this.__st.headers[k]=v;return set.apply(this,arguments)};
  X.prototype.send=function(body){const m=this.__st;if(m&&interesting.test(String(m.url||'')))this.addEventListener('load',()=>{try{const{items}=ingest(this.responseText);if(items.length){template={url:m.url,method:String(m.method||'GET').toUpperCase(),headers:headersObject(m.headers),body:typeof body==='string'?body:''};post('ready',{captured:books.size})}}catch{}});return send.apply(this,arguments)};
  window.addEventListener('message',async ev=>{const m=ev.data;if(!m||m.channel!==channel||m.from!=='extension')return;if(m.type==='status')post('status',{ready:!!template,captured:books.size});if(m.type==='scrape'){try{post('result',{items:await scrape()})}catch(e){post('error',{message:String(e?.message||e)})}}});
})();
