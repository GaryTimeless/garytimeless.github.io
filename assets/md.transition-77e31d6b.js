import{g as b,b as r}from"./index-8d308d66.js";/*!
 * (C) Ionic http://ionicframework.com - MIT License
 */const v=(E,i)=>{var o,t,a;const l="40px",s="0px",c=i.direction==="back",u=i.enteringEl,d=i.leavingEl,m=b(u),g=m.querySelector("ion-toolbar"),n=r();if(n.addElement(m).fill("both").beforeRemoveClass("ion-page-invisible"),c?n.duration(((o=i.duration)!==null&&o!==void 0?o:0)||200).easing("cubic-bezier(0.47,0,0.745,0.715)"):n.duration(((t=i.duration)!==null&&t!==void 0?t:0)||280).easing("cubic-bezier(0.36,0.66,0.04,1)").fromTo("transform","translateY(".concat(l,")"),"translateY(".concat(s,")")).fromTo("opacity",.01,1),g){const e=r();e.addElement(g),n.addAnimation(e)}if(d&&c){n.duration(((a=i.duration)!==null&&a!==void 0?a:0)||200).easing("cubic-bezier(0.47,0,0.745,0.715)");const e=r();e.addElement(b(d)).onFinish(f=>{f===1&&e.elements.length>0&&e.elements[0].style.setProperty("display","none")}).fromTo("transform","translateY(".concat(s,")"),"translateY(".concat(l,")")).fromTo("opacity",1,0),n.addAnimation(e)}return n};export{v as mdTransitionAnimation};
