'use strict';
/* Descobre o município de um negócio do HubSpot a partir dos campos cidade/estado e do nome do negócio.
   Ordem: 1) campo cidade  2) nome do negócio + UF  3) siglas (MAO, PVH, BVB)  4) nome aproximado dentro da UF  5) nome único no país.
   Se não achar município: devolve só o estado (órgão estadual) ou nada (sem localização). Nunca descarta o negócio. */

const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x00-\x7f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

/* mesma medida de semelhança do difflib.SequenceMatcher.ratio() do Python */
function casados(a,alo,ahi,b,blo,bhi){
  let bi=alo,bj=blo,bk=0;
  for(let i=alo;i<ahi;i++) for(let j=blo;j<bhi;j++){
    let k=0;while(i+k<ahi&&j+k<bhi&&a[i+k]===b[j+k])k++;
    if(k>bk){bi=i;bj=j;bk=k;}
  }
  if(!bk) return 0;
  return bk+casados(a,alo,bi,b,blo,bj)+casados(a,bi+bk,ahi,b,bj+bk,bhi);
}
function ratio(a,b){if(!a.length&&!b.length)return 1;return 2*casados(a,0,a.length,b,0,b.length)/(a.length+b.length);}

const SOLUCOES=['Cidade na Mão','Aluno a Bordo','Alerta Cidade','Agenda Flash','Habita Fácil','Frota na Mão','Conecta Agro','Conecta Coop','Ouvidoria Digital','Gabinete Virtual','PCD Digital','SINE Digital','Central de Vagas','Tele Auditoria','E-Público','Checklist Digital','Fala Consumidor','Carteira de Benefícios','Escola Digital','SEMED Digital','Escola Segura','Ação e Prevenção','Merenda em Casa','Remédio em Casa','Melhor em Casa','HiperDia','Hemocentro','Campanha Saúde Digital','Inventário','Minha Empresa','CIPA Digital'];
const SOLN=SOLUCOES.map(s=>[norm(s),s]).concat([['cnm','Cidade na Mão']]);
const GENERICAS=new Set(['saude','escola','cidade','alerta','conecta','agro','digital','uniao','vitoria','alianca','planalto','paz','barra','centro','nova','novo','serra','mato','brasil','bom','bonito','lagoa','sede','ouro','prata','palma','palmas','esperanca','tabuleiro','progresso','central','registro','feliz','oliveira','queiroz','sertao','jonas','silva','santos','souza','carmo','lima']);
const ALIAS={MAO:['Manaus','AM'],PVH:['Porto Velho','RO'],BVB:['Boa Vista','RR']};
const PREFIXOS=['prefeitura municipal de','prefeitura de','prefeitura municipal','prefeitura','municipio de','camara municipal de','sec de saude','secretaria municipal de','secretaria de'];

function criarLocalizador(linhas){   /* linhas: [[ibge, nome, uf, nomeDaUF], ...] */
  const M=linhas.map(r=>({i:r[0],n:r[1],nn:norm(r[1]),u:r[2],ufn:r[3]}));
  const UFS={};M.forEach(m=>{UFS[m.u]=m.ufn;});
  const UFNAME={};Object.keys(UFS).forEach(u=>{UFNAME[norm(UFS[u])]=u;});UFNAME['para']='PA';
  const UFABBR=new Set(Object.keys(UFS));
  const porNome=new Map();M.forEach(m=>{if(!porNome.has(m.nn))porNome.set(m.nn,[]);porNome.get(m.nn).push(m);});
  const UFNAME_ORD=Object.entries(UFNAME).sort((a,b)=>b[0].length-a[0].length);
  const STATE_KEYS=Object.keys(UFNAME).sort((a,b)=>b.length-a.length);

  function ufDoCampo(estado){
    if(!estado) return null;
    const e=String(estado).replace(/\(.*?\)/g,'').trim();
    const m=String(estado).match(/\(([A-Za-z]{2})\)/);
    if(m&&UFABBR.has(m[1].toUpperCase())) return m[1].toUpperCase();
    if(UFABBR.has(e.toUpperCase())) return e.toUpperCase();
    const n=norm(e);
    return UFNAME[n]||null;
  }
  function ufsDoNome(nome){
    const out=[];
    const re=/(?<![A-Za-zÀ-ÿ])([A-Z]{2})(?![A-Za-zÀ-ÿ])/g;let x;
    while((x=re.exec(nome))){if(UFABBR.has(x[1])&&!out.includes(x[1]))out.push(x[1]);}
    const n=' '+norm(nome)+' ';
    for(const [nm,u] of UFNAME_ORD) if(n.includes(' '+nm+' ')&&!out.includes(u)) out.push(u);
    return out;
  }
  function spans(t,frase){const o=[];let k=t.indexOf(frase);while(k!==-1){o.push([k,k+frase.length]);k=t.indexOf(frase,k+1);}return o;}
  function acharMunicipios(texto,uf){
    const t=' '+norm(texto)+' ',stSp=[];
    for(const nm of STATE_KEYS) stSp.push(...spans(t,' '+nm+' '));
    const cand=[];
    for(const [nn,lst] of porNome){
      if(nn.length<4) continue;
      const sps=spans(t,' '+nn+' ');if(!sps.length) continue;
      if(sps.every(([a,b])=>stSp.some(([x,y])=>a>=x&&b<=y))) continue;   /* só aparece dentro de um nome de estado */
      for(const m of lst){if(uf&&m.u!==uf)continue;cand.push(m);}
    }
    return cand;
  }
  function aliases(texto){
    const toks=new Set(String(texto).match(/[A-Za-z]+/g)||[]);
    for(const k of Object.keys(ALIAS)) if(toks.has(k)){const [n,u]=ALIAS[k];return (porNome.get(norm(n))||[]).filter(m=>m.u===u);}
    return [];
  }
  function segmentos(nome){
    const out=[];
    for(const seg of String(nome).split(/\s+-\s+|\s*-\s*(?=[A-Za-zÀ-ÿ])|[()]|,/)){
      let n=norm(seg);
      for(const pf of PREFIXOS) if(n.startsWith(pf+' ')) n=n.slice(pf.length+1);
      if(n.length>=8) out.push(n);
    }
    return out;
  }
  const maisLongos=cand=>{const mx=Math.max(...cand.map(m=>m.nn.length));return cand.filter(m=>m.nn.length===mx);};
  const unicos=top=>new Set(top.map(m=>m.i)).size===1;
  const filtroPais=cand=>cand.filter(m=>!GENERICAS.has(m.nn)&&m.nn.length>=5&&porNome.get(m.nn).length===1);

  /* retorna {m, metodo} ; m = município ou null */
  function resolver(d,funil){
    const nome=d.dealname||'',cidade=String(d.cidade||'').trim(),estado=d.estado||'';
    const ufC=ufDoCampo(estado),ufsN=ufsDoNome(nome),ufs=[];
    for(const u of (ufC?[ufC]:[]).concat(ufsN)) if(u&&!ufs.includes(u)) ufs.push(u);
    const div=(ufC&&ufsN.length&&!ufsN.includes(ufC))?' | UF do campo ('+ufC+') diverge do nome ('+ufsN.join('/')+')':'';
    const ufUnico=ufs.length===1?ufs[0]:'';
    const texto=nome+' '+cidade+' '+String(estado).replace(/\(.*?\)/g,'');
    /* 1) campo cidade */
    if(cidade&&cidade.length>2&&!(norm(cidade) in UFNAME)&&!UFABBR.has(cidade.toUpperCase())){
      const nn=norm(cidade.replace(/\(.*?\)/g,''));
      const lst=(porNome.get(nn)||[]).filter(m=>!ufs.length||ufs.includes(m.u));
      if(lst.length===1) return {m:lst[0],metodo:'campo cidade'+div};
      if(lst.length>1) return {m:null,metodo:'cidade ambigua',uf:ufUnico};
      if(ufs.length){
        let b=null,br=-1;
        for(const m of M){if(!ufs.includes(m.u))continue;const r=ratio(nn,m.nn);if(r>br){br=r;b=m;}}
        if(b&&br>=0.88) return {m:b,metodo:'campo cidade (aproximado '+br.toFixed(2)+')'+div};
      }
    }
    const rep=funil==='Representantes';
    /* 2) nome do negócio, UF por UF */
    for(const uf of (ufs.length?ufs:(rep?[]:[null]))){
      let cand=acharMunicipios(texto,uf);
      if(uf===null) cand=filtroPais(cand);
      if(cand.length){
        const top=maisLongos(cand);
        if(unicos(top)) return {m:top[0],metodo:'nome do negócio'+(uf?' + UF':' (nome único no país)')+div};
        return {m:null,metodo:'nome ambiguo',uf:ufUnico};
      }
    }
    /* 3) siglas conhecidas */
    const al=aliases(nome);if(al.length===1) return {m:al[0],metodo:'sigla no nome'};
    /* 4) aproximado dentro da UF (erros de digitação) */
    if(ufs.length){
      let melhor=null;
      for(const seg of segmentos(nome)) for(const m of M){
        if(!ufs.includes(m.u)) continue;
        const r=ratio(seg,m.nn);
        if(r>=0.85&&(!melhor||r>melhor.r)) melhor={r,m};
      }
      if(melhor) return {m:melhor.m,metodo:'nome aproximado '+melhor.r.toFixed(2)+div};
    }
    /* 5) nome único no país, mesmo com UF divergente */
    const cand=rep?[]:filtroPais(acharMunicipios(texto,null));
    if(cand.length){const top=maisLongos(cand);if(unicos(top)) return {m:top[0],metodo:'nome único no país; UF do CRM diverge'+div};}
    /* sem município: só o estado (se for um só) ou nada */
    return {m:null,metodo:'sem município',uf:ufUnico};
  }
  function solucoesDe(nome){
    const t=' '+norm(nome)+' ',out=[];
    for(const [k,v] of SOLN) if(t.includes(' '+k+' ')&&!out.includes(v)) out.push(v);
    return out;
  }
  return {resolver,solucoesDe,norm,porIbge:new Map(M.map(m=>[m.i,m]))};
}
module.exports={criarLocalizador,norm};
