System.register(["./index-legacy-4892394d.js","./keyboard-legacy-be48c552.js"],(function(e,t){"use strict";var o,n,i,r,s,a,d,l,c,u,m;return{setters:[e=>{o=e.d,n=e.h,i=e.j,r=e.e,s=e.f,a=e.k,d=e.l,l=e.m,c=e.o},e=>{u=e.K,m=e.a}],execute:function(){
/*!
             * (C) Ionic http://ionicframework.com - MIT License
             */
const t=new WeakMap,v=(e,o,n,i=0,r=!1)=>{t.has(e)!==n&&(n?f(e,o,i,r):y(e,o))},f=(e,o,n,i=!1)=>{const r=o.parentNode,s=o.cloneNode(!1);s.classList.add("cloned-input"),s.tabIndex=-1,i&&(s.disabled=!0),r.appendChild(s),t.set(e,s);const a="rtl"===e.ownerDocument.dir?9999:-9999;e.style.pointerEvents="none",o.style.transform=`translate3d(${a}px,${n}px,0) scale(0)`},y=(e,o)=>{const n=t.get(e);n&&(t.delete(e),n.remove()),e.style.pointerEvents="",o.style.transform=""},p="input, textarea, [no-blur], [contenteditable]",w=(e,t,o,n)=>{const i=e.top,r=e.bottom,s=t.top,a=s+15,d=Math.min(t.bottom,n-o)-50-r,l=a-i,c=Math.round(d<0?-d:l>0?-l:0),u=Math.min(c,i-s),m=Math.abs(u)/.3;return{scrollAmount:u,scrollDuration:Math.min(400,Math.max(150,m)),scrollPadding:o,inputSafeY:4-(i-a)}},h="$ionPaddingTimer",b=(e,t,o)=>{const n=e[h];n&&clearTimeout(n),t>0?e.style.setProperty("--keyboard-offset",`${t}px`):e[h]=setTimeout((()=>{e.style.setProperty("--keyboard-offset","0px"),o&&o()}),120)},g=(e,t,o)=>{e.addEventListener("focusout",(()=>{t&&b(t,0,o)}),{once:!0})};let E=0;const S="data-ionic-skip-scroll-assist",L=e=>{document.activeElement!==e&&(e.setAttribute(S,"true"),e.focus())},D=async(e,t,o,n,i,r,s=!1,a=0,u=!0)=>{if(!o&&!n)return;const m=((e,t,o,n)=>{var i;const r=null!==(i=e.closest("ion-item,[ion-item]"))&&void 0!==i?i:e;return w(r.getBoundingClientRect(),t.getBoundingClientRect(),o,n)})(e,o||n,i,a);if(o&&Math.abs(m.scrollAmount)<4)return L(t),void(r&&null!==o&&(b(o,E),g(t,o,(()=>E=0))));if(v(e,t,!0,m.inputSafeY,s),L(t),d((()=>e.click())),r&&o&&(E=m.scrollPadding,b(o,E)),"undefined"!=typeof window){let n;const i=async()=>{void 0!==n&&clearTimeout(n),window.removeEventListener("ionKeyboardDidShow",s),window.removeEventListener("ionKeyboardDidShow",i),o&&await c(o,0,m.scrollAmount,m.scrollDuration),v(e,t,!1,m.inputSafeY),L(t),r&&g(t,o,(()=>E=0))},s=()=>{window.removeEventListener("ionKeyboardDidShow",s),window.addEventListener("ionKeyboardDidShow",i)};if(o){const e=await l(o),r=e.scrollHeight-e.clientHeight;if(u&&m.scrollAmount>r-e.scrollTop)return"password"===t.type?(m.scrollAmount+=50,window.addEventListener("ionKeyboardDidShow",s)):window.addEventListener("ionKeyboardDidShow",i),void(n=setTimeout(i,1e3))}i()}};e("startInputShims",(async(e,t)=>{if(void 0===o)return;const d="ios"===t,l="android"===t,c=e.getNumber("keyboardHeight",290),f=e.getBoolean("scrollAssist",!0),y=e.getBoolean("hideCaretOnScroll",d),w=e.getBoolean("inputBlurring",d),h=e.getBoolean("scrollPadding",!0),b=Array.from(o.querySelectorAll("ion-input, ion-textarea")),g=new WeakMap,E=new WeakMap,L=await u.getResizeMode(),k=async e=>{await new Promise((t=>r(e,t)));const t=e.shadowRoot||e,o=t.querySelector("input")||t.querySelector("textarea"),d=s(e),u=d?null:e.closest("ion-footer");if(o){if(d&&y&&!g.has(e)){const t=((e,t,o)=>{if(!o||!t)return()=>{};const r=o=>{var n;(n=t)===n.getRootNode().activeElement&&v(e,t,o)},s=()=>v(e,t,!1),a=()=>r(!0),d=()=>r(!1);return n(o,"ionScrollStart",a),n(o,"ionScrollEnd",d),t.addEventListener("blur",s),()=>{i(o,"ionScrollStart",a),i(o,"ionScrollEnd",d),t.removeEventListener("blur",s)}})(e,o,d);g.set(e,t)}if("date"!==o.type&&"datetime-local"!==o.type&&(d||u)&&f&&!E.has(e)){const t=((e,t,o,n,i,r,s,d=!1)=>{const l=r&&(void 0===s||s.mode===m.None);let c=!1;const u=void 0!==a?a.innerHeight:0,v=i=>{!1!==c?D(e,t,o,n,i.detail.keyboardHeight,l,d,u,!1):c=!0},f=()=>{c=!1,null==a||a.removeEventListener("ionKeyboardDidShow",v),e.removeEventListener("focusout",f,!0)},y=async()=>{t.hasAttribute(S)?t.removeAttribute(S):(D(e,t,o,n,i,l,d,u),null==a||a.addEventListener("ionKeyboardDidShow",v),e.addEventListener("focusout",f,!0))};return e.addEventListener("focusin",y,!0),()=>{e.removeEventListener("focusin",y,!0),null==a||a.removeEventListener("ionKeyboardDidShow",v),e.removeEventListener("focusout",f,!0)}})(e,o,d,u,c,h,L,l);E.set(e,t)}}};w&&(()=>{let e=!0,t=!1;const o=document,i=()=>{t=!0},r=()=>{e=!0},s=n=>{if(t)return void(t=!1);const i=o.activeElement;if(!i)return;if(i.matches(p))return;const r=n.target;r!==i&&(r.matches(p)||r.closest(p)||(e=!1,setTimeout((()=>{e||i.blur()}),50)))};n(o,"ionScrollStart",i),o.addEventListener("focusin",r,!0),o.addEventListener("touchend",s,!1)})();for(const o of b)k(o);o.addEventListener("ionInputDidLoad",(e=>{k(e.detail)})),o.addEventListener("ionInputDidUnload",(e=>{(e=>{if(y){const t=g.get(e);t&&t(),g.delete(e)}if(f){const t=E.get(e);t&&t(),E.delete(e)}})(e.detail)}))}))}}}));
