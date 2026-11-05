import { previewDocument } from "@/lib/kora/client";

// Fixed, editor-owned code only. Website scripts remain blocked by the nonce CSP
// and the iframe has an opaque origin (no allow-same-origin).
export function canvasDocument(
  html: string,
  css: string,
  token: string,
  selecting: boolean,
  origin: string,
  editable: boolean,
) {
  const bridge = `<script nonce="${token}">(()=>{
    const selecting=${JSON.stringify(selecting)},editable=${JSON.stringify(editable)};
    const nodes=()=>[...document.querySelectorAll('body *:not(script):not(style)')];
    const send=data=>parent.postMessage({...data,scope:'kora-preview',token:'${token}'},${JSON.stringify(origin)});
    const highlight=document.createElement('style');highlight.textContent='[data-kora-highlight]{outline:2px solid #a494f2!important;outline-offset:3px!important}';document.head.appendChild(highlight);
    function select(target,event,context=false){
      if(!editable||!(target instanceof Element))return;
      event.preventDefault();event.stopPropagation();
      const index=nodes().indexOf(target),style=getComputedStyle(target);if(index<0)return;
      document.querySelectorAll('[data-kora-highlight]').forEach(el=>el.removeAttribute('data-kora-highlight'));
      target.setAttribute('data-kora-highlight','true');
      send({type:'select',index,tag:target.tagName.toLowerCase(),text:(target.textContent||'').slice(0,3000),textEditable:target.children.length===0&&!['IMG','BR','HR','INPUT','SVG','PATH'].includes(target.tagName),fontSize:style.fontSize,color:style.color,fontWeight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,textAlign:style.textAlign,fontFamily:style.fontFamily,href:target.getAttribute('href')||'',alt:target.getAttribute('alt')||'',background:style.backgroundColor,radius:style.borderTopLeftRadius,paddingX:style.paddingLeft,paddingY:style.paddingTop,context,x:event.clientX,y:event.clientY});
    }
    document.addEventListener('click',event=>{
      const target=event.target;if(!(target instanceof Element))return;
      if(selecting)select(target,event);
      else{const link=target.closest('a');if(!link)return;event.preventDefault();const href=link.getAttribute('href')||'';if(/^\\/?(?:[a-z0-9-]+)\\/?$/i.test(href)||/^\\.\\/[a-z0-9-]+$/i.test(href))send({type:'navigate',slug:href.replace(/^\\.?\\//,'').replace(/\\/$/,'')});}
    },true);
    document.addEventListener('dblclick',event=>select(event.target,event),true);
    document.addEventListener('contextmenu',event=>select(event.target,event,true),true);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')send({type:'escape'});
      if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
      const key=event.key.toLowerCase();
      if(key==='s'||key==='z'){event.preventDefault();if(editable)send({type:'shortcut',action:key==='s'?'save':event.shiftKey?'redo':'undo'});}
    });
    window.addEventListener('message',event=>{
      if(event.source!==parent||event.origin!==${JSON.stringify(origin)}||event.data?.token!=='${token}'||event.data?.type!=='inspect'||!Number.isInteger(event.data.index))return;
      select(nodes()[event.data.index],{preventDefault(){},stopPropagation(){}});
    });
    document.body.dataset.koraMode=selecting?'select':'preview';
  })();</script>`;
  return previewDocument(html, css)
    .replace(
      "default-src 'none';",
      `default-src 'none'; script-src 'nonce-${token}';`,
    )
    .replace("</body>", `${bridge}</body>`);
}
