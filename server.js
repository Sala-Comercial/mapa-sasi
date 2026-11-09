'use strict';
/* Mapa SASI: um site só, ligado ao HubSpot.
   - serve a página (index.html)
   - lê os negócios do HubSpot (carga completa ao iniciar e de hora em hora, mudanças a cada poucos segundos,
     e na hora, se o webhook do HubSpot estiver configurado)
   - entrega à página por /api/negocios e por eventos em tempo real (/api/eventos)
   Sem dependências: precisa só do Node 18 ou mais novo. */
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const {criarLocalizador,norm}=require('./localizador');
const DIR=__dirname,DADOS=path.join(DIR,'data');

/* ---------- configuração (.env) ---------- */
try{
  for(const l of fs.readFileSync(path.join(DIR,'.env'),'utf8').split(/\r?\n/)){
    const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if(m&&!l.trim().startsWith('#')&&!(m[1] in process.env)) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');
  }
}catch(e){/* sem .env: usa o que estiver no ambiente */}
const CFG={
  porta:+process.env.PORT||8800,
  host:process.env.HOST||'127.0.0.1',
  token:process.env.HUBSPOT_TOKEN||'',
  api:(process.env.HUBSPOT_API||'https://api.hubapi.com').replace(/\/$/,''),
  intervalo:Math.max(5,+process.env.SYNC_SEGUNDOS||60),
  completaMin:Math.max(5,+process.env.SYNC_COMPLETA_MIN||60),
  segredo:process.env.HUBSPOT_CLIENT_SECRET||'',
  urlPublica:(process.env.PUBLIC_URL||'').replace(/\/$/,''),
  usuario:process.env.MAPA_USUARIO||'',
  senha:process.env.MAPA_SENHA||''
};
const lerJSON=(f,pad)=>{try{return JSON.parse(fs.readFileSync(path.join(DADOS,f),'utf8'));}catch(e){return pad;}};
const log=(...a)=>console.log(new Date().toLocaleTimeString('pt-BR'),...a);

/* ---------- dados de referência ---------- */
const loc=criarLocalizador(lerJSON('municipios.json',[]));
const AJUSTES=lerJSON('ajustes.json',{});            /* correções manuais por nome do negócio */
const FECHADAS=new Set(['negocio fechado','fechado','ata vigente']);
const EXCLUIDAS=new Set(lerJSON('etapas_excluidas.json',[]).map(String));   /* Perdido / Descontinuado */
let ROT=lerJSON('rotulos_padrao.json',{pipelines:{},etapas:{}});            /* ids -> nomes (o HubSpot atualiza) */
let donos=new Map();
const PROPS=['dealname','amount','pipeline','dealstage','hubspot_owner_id','cidade','estado','hs_lastmodifieddate'];

/* ---------- estado ---------- */
const store=new Map();                 /* id -> negócio no formato do painel */
const status={modo:CFG.token?'hubspot':'snapshot',ultima:null,erro:null,snapshotEm:'05/11/2026',total:0,sincronizando:false};
const clientes=new Set();
let salvarTimer=null;

function carregarInicial(){
  const cache=lerJSON('negocios_cache.json',null);
  const lista=cache&&cache.negocios||lerJSON('negocios_snapshot.json',[]);
  for(const n of lista) store.set(String(n.id),n);
  if(cache&&cache.ultima&&CFG.token){status.ultima=cache.ultima;}
  status.total=store.size;
  log('negócios carregados do arquivo:',store.size,cache?'(cache)':'(snapshot de 05/11/2026)');
}
function salvar(){
  clearTimeout(salvarTimer);
  salvarTimer=setTimeout(()=>{
    try{fs.writeFileSync(path.join(DADOS,'negocios_cache.json'),JSON.stringify({ultima:status.ultima,negocios:[...store.values()]}));}catch(e){log('não consegui gravar o cache:',e.message);}
  },1500);
}
function emitir(obj){
  const txt='data: '+JSON.stringify(obj)+'\n\n';
  for(const r of clientes){try{r.write(txt);}catch(e){clientes.delete(r);}}
}
const emitirStatus=()=>{status.total=store.size;emitir({tipo:'status',status:statusPublico()});};
const statusPublico=()=>({modo:status.modo,ultima:status.ultima,erro:status.erro,snapshotEm:status.snapshotEm,total:store.size});

/* ---------- negócio do HubSpot -> formato do painel ---------- */
function etapaExcluida(id,rotulo){
  if(EXCLUIDAS.has(String(id))) return true;
  const n=norm(rotulo);return n.includes('perdido')||n.includes('descontinuado');
}
function montar(deal){
  const p=deal.properties||{};
  const nome=(p.dealname||'').trim();
  const funil=ROT.pipelines[p.pipeline]||p.pipeline||'';
  const etapa=ROT.etapas[p.dealstage]||p.dealstage||'';
  const aj=AJUSTES[nome]||{};
  const r=loc.resolver({dealname:p.dealname,cidade:p.cidade,estado:p.estado},funil);
  let m=r.m,uf=r.uf||'';
  if(aj.ibge){m=loc.porIbge.get(Number(aj.ibge))||m;}
  if(!m&&aj.uf) uf=aj.uf;
  const amount=parseFloat(p.amount);
  return {
    id:String(deal.id),ibge:m?m.i:null,municipio:m?m.n:'',uf:m?m.u:uf,
    cliente:nome,solucoes:loc.solucoesDe(p.dealname||'').join(' | '),
    etapa,funil,fechado:FECHADAS.has(norm(etapa)),
    dono:(donos.get(String(p.hubspot_owner_id||''))||'').trim(),
    valor:amount>0?amount:null,
    _excluida:etapaExcluida(p.dealstage,etapa)
  };
}
const canon=o=>JSON.stringify(Object.keys(o).sort().map(k=>[k,o[k]]));
/* aplica um negócio ao estado; devolve true se algo mudou */
function aplicar(deal,emite=true){
  const n=montar(deal),id=n.id,excl=n._excluida;delete n._excluida;
  if(excl){
    if(store.delete(id)){if(emite)emitir({tipo:'remover',id});return true;}
    return false;
  }
  const ant=store.get(id);
  if(ant&&canon(ant)===canon(n)) return false;
  store.set(id,n);
  if(emite)emitir({tipo:'upsert',negocio:n});
  return true;
}
function remover(id){id=String(id);if(store.delete(id)){emitir({tipo:'remover',id});return true;}return false;}

/* ---------- HubSpot ---------- */
function hs(metodo,caminho,corpo){
  return new Promise((ok,erro)=>{
    const u=new URL(CFG.api+caminho),mod=u.protocol==='https:'?https:http;
    const req=mod.request(u,{method:metodo,headers:{Authorization:'Bearer '+CFG.token,'Content-Type':'application/json',Accept:'application/json'}},r=>{
      let b='';r.on('data',c=>b+=c);
      r.on('end',()=>{
        if(r.statusCode>=200&&r.statusCode<300){try{ok(JSON.parse(b||'{}'));}catch(e){erro(e);}}
        else if(r.statusCode===401||r.statusCode===403) erro(new Error('O HubSpot recusou o token ('+r.statusCode+'). Confira o HUBSPOT_TOKEN e as permissões do aplicativo privado.'));
        else erro(new Error('HubSpot '+r.statusCode+': '+b.slice(0,160)));
      });
    });
    req.on('error',erro);req.setTimeout(30000,()=>req.destroy(new Error('o HubSpot demorou demais para responder')));
    if(corpo)req.write(JSON.stringify(corpo));
    req.end();
  });
}
async function carregarDonos(){
  const mp=new Map();
  for(const arq of ['false','true']){
    let after;
    try{
      do{
        const j=await hs('GET','/crm/v3/owners?limit=500&archived='+arq+(after?'&after='+after:''));
        for(const o of j.results||[]){const nm=[o.firstName,o.lastName].filter(Boolean).join(' ').trim()||o.email||'';if(nm&&!mp.has(String(o.id)))mp.set(String(o.id),nm);}
        after=j.paging&&j.paging.next&&j.paging.next.after;
      }while(after);
    }catch(e){if(arq==='false')throw e;}
  }
  donos=mp;
}
async function carregarRotulos(){
  try{
    const j=await hs('GET','/crm/v3/pipelines/deals');
    const pipelines={},etapas={};
    for(const p of j.results||[]){pipelines[p.id]=p.label;for(const s of p.stages||[])etapas[s.id]=s.label;}
    ROT={pipelines:Object.assign({},ROT.pipelines,pipelines),etapas:Object.assign({},ROT.etapas,etapas)};
  }catch(e){log('não consegui ler os funis/etapas (uso os nomes salvos):',e.message);}
}
async function sincronizacaoCompleta(){
  await carregarDonos();await carregarRotulos();
  const vistos=new Set();let after,mudou=0;
  do{
    const j=await hs('GET','/crm/v3/objects/deals?limit=100&properties='+PROPS.join(',')+(after?'&after='+after:''));
    for(const d of j.results||[]){vistos.add(String(d.id));if(aplicar(d))mudou++;}
    after=j.paging&&j.paging.next&&j.paging.next.after;
  }while(after);
  for(const id of [...store.keys()]) if(!vistos.has(id)){remover(id);mudou++;}
  log('sincronização completa: '+vistos.size+' negócios no HubSpot, '+store.size+' no mapa, '+mudou+' mudança(s)');
}
let ultimaMod=0;
async function sincronizacaoIncremental(){
  const desde=Math.max(0,ultimaMod-10000);let after,mudou=0,maior=ultimaMod;
  do{
    const j=await hs('POST','/crm/v3/objects/deals/search',{
      filterGroups:[{filters:[{propertyName:'hs_lastmodifieddate',operator:'GTE',value:String(desde)}]}],
      sorts:[{propertyName:'hs_lastmodifieddate',direction:'ASCENDING'}],properties:PROPS,limit:100,after:after||undefined});
    for(const d of j.results||[]){
      if(aplicar(d))mudou++;
      const t=Date.parse(d.properties&&d.properties.hs_lastmodifieddate)||Number(d.properties&&d.properties.hs_lastmodifieddate)||0;
      if(t>maior)maior=t;
    }
    after=j.paging&&j.paging.next&&j.paging.next.after;
  }while(after);
  ultimaMod=maior;
  if(mudou) log('atualização: '+mudou+' negócio(s) novo(s) ou alterado(s)');
}
let ultimaCompleta=0;
async function ciclo(){
  if(status.sincronizando) return;
  status.sincronizando=true;
  try{
    const agora=Date.now();
    if(!ultimaCompleta||agora-ultimaCompleta>CFG.completaMin*60000){
      const inicio=Date.now();await sincronizacaoCompleta();ultimaCompleta=Date.now();ultimaMod=inicio-60000;
    }else await sincronizacaoIncremental();
    status.modo='hubspot';status.erro=null;status.ultima=new Date().toISOString();salvar();
  }catch(e){status.erro=e.message;log('erro ao falar com o HubSpot:',e.message);}
  finally{status.sincronizando=false;emitirStatus();setTimeout(ciclo,CFG.intervalo*1000);}
}

/* ---------- webhook do HubSpot (tempo real) ---------- */
function assinaturaValida(req,corpo){
  if(!CFG.segredo) return true;
  const ts=req.headers['x-hubspot-request-timestamp'],ass=req.headers['x-hubspot-signature-v3'];
  if(!ts||!ass||Math.abs(Date.now()-Number(ts))>300000||!CFG.urlPublica) return false;
  const esp=crypto.createHmac('sha256',CFG.segredo).update(req.method+CFG.urlPublica+req.url+corpo+ts).digest('base64');
  const a=Buffer.from(esp),b=Buffer.from(String(ass));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function tratarEventos(eventos){
  for(const ev of eventos){
    try{
      const id=String(ev.objectId);
      if(/deletion$/.test(ev.subscriptionType||'')){remover(id);continue;}
      const d=await hs('GET','/crm/v3/objects/deals/'+id+'?properties='+PROPS.join(','));
      aplicar(d);
    }catch(e){
      if(/ 404/.test(e.message)) remover(ev.objectId); else log('evento ignorado:',e.message);
    }
  }
  status.ultima=new Date().toISOString();salvar();emitirStatus();
}

/* ---------- servidor web ---------- */
let htmlCache={chave:'',gz:null};
function pagina(){
  const arq=path.join(DIR,'index.html'),st=fs.statSync(arq);
  const cfg=JSON.parse(fs.readFileSync(path.join(DIR,'config.json'),'utf8'));
  const vend=JSON.stringify(cfg.vendedores||[]);
  const chave=st.mtimeMs+'|'+vend;
  if(htmlCache.chave!==chave){
    const html=fs.readFileSync(arq,'utf8').replace('__VENDEDORES__',()=>vend);
    htmlCache={chave,gz:zlib.gzipSync(html,{level:6}),raw:Buffer.from(html)};
  }
  return htmlCache;
}
function autorizado(req){
  if(!CFG.usuario||!CFG.senha) return true;
  const h=req.headers.authorization||'';
  if(!h.startsWith('Basic ')) return false;
  const [u,...p]=Buffer.from(h.slice(6),'base64').toString().split(':');
  const ia=Buffer.from(u),ib=Buffer.from(CFG.usuario),pa=Buffer.from(p.join(':')),pb=Buffer.from(CFG.senha);
  return ia.length===ib.length&&crypto.timingSafeEqual(ia,ib)&&pa.length===pb.length&&crypto.timingSafeEqual(pa,pb);
}
const json=(res,obj,cod=200)=>{res.writeHead(cod,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};

const servidor=http.createServer((req,res)=>{
  const rota=req.url.split('?')[0];
  if(rota==='/webhook/hubspot'&&req.method==='POST'){
    let b='';req.on('data',c=>{b+=c;if(b.length>5e6)req.destroy();});
    req.on('end',()=>{
      if(!assinaturaValida(req,b)){res.writeHead(401);return res.end('assinatura inválida');}
      res.writeHead(200);res.end('ok');
      try{const ev=JSON.parse(b);tratarEventos(Array.isArray(ev)?ev:[ev]);}catch(e){log('webhook com corpo inválido');}
    });
    return;
  }
  if(!autorizado(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Mapa SASI"'});return res.end('Acesso restrito');}
  if(rota==='/'||rota==='/index.html'){
    try{
      const p=pagina(),gz=/\bgzip\b/.test(req.headers['accept-encoding']||'');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(gz?{'Content-Encoding':'gzip'}:{})});
      return res.end(gz?p.gz:p.raw);
    }catch(e){res.writeHead(500);return res.end('Erro ao montar a página: '+e.message);}
  }
  if(rota==='/api/negocios'){status.total=store.size;return json(res,{negocios:[...store.values()],status:statusPublico()});}
  if(rota==='/data/urbano_hosts.json'){
    return fs.readFile(path.join(DADOS,'urbano_hosts.json'),(e,b)=>{
      if(e){res.writeHead(404);return res.end('não encontrado');}
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=3600'});res.end(b);
    });
  }
  const mb=rota.match(/^\/data\/(urbano_(?:[cmf]|hit)\.bin)$/);   /* manchas urbanas das cidades (3 níveis) e mapa de acerto */
  if(mb){
    return fs.readFile(path.join(DADOS,mb[1]+'.gz'),(e,b)=>{
      if(e){res.writeHead(404);return res.end('não encontrado');}
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Encoding':'gzip','Cache-Control':'public, max-age=3600'});res.end(b);
    });
  }
  if(rota==='/api/status') return json(res,statusPublico());
  if(rota==='/api/eventos'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 5000\n: ok\n\n');clientes.add(res);
    req.on('close',()=>clientes.delete(res));return;
  }
  res.writeHead(404);res.end('não encontrado');
});
setInterval(()=>{for(const r of clientes){try{r.write(': ping\n\n');}catch(e){clientes.delete(r);}}},25000);

carregarInicial();
const exposto=!['127.0.0.1','localhost','::1'].includes(CFG.host);
if(exposto&&(!CFG.usuario||!CFG.senha)){
  console.error('\nPara abrir o mapa para a rede é preciso definir MAPA_USUARIO e MAPA_SENHA (arquivo .env ou o Iniciar_Mapa_Rede.bat).\nO mapa mostra os negócios de todos os vendedores, então não sobe sem senha.\n');
  process.exit(1);
}
function enderecosRede(){
  const os=require('os'),out=[];
  for(const lista of Object.values(os.networkInterfaces())) for(const i of lista||[]){
    if(i.family==='IPv4'&&!i.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) out.push(i.address);
  }
  return out;
}
servidor.listen(CFG.porta,CFG.host,()=>{
  log('Mapa SASI no ar: http://localhost:'+CFG.porta);
  if(exposto) for(const ip of enderecosRede()) log('Na rede local: http://'+ip+':'+CFG.porta+'  (pede usuário e senha)');
  if(CFG.token){log('Ligado ao HubSpot. Atualiza a cada '+CFG.intervalo+' s e faz carga completa a cada '+CFG.completaMin+' min.');ciclo();}
  else log('ATENÇÃO: sem HUBSPOT_TOKEN. Mostrando os dados salvos de 05/11/2026. Veja o LEIA-ME para ligar ao HubSpot.');
});
