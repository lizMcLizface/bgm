import React,{Component,Suspense,useEffect,useState} from 'react';

// A fresh document also refreshes React.lazy's rejected import and the browser's
// module registry. Keep song links, hashes and local setup data intact.
export function freshPageUrl(href,stamp=Date.now()){
 const url=new URL(href);url.searchParams.set('_reload',String(stamp));return url.href;
}
export function reloadPage(){window.location.replace(freshPageUrl(window.location.href));}

export function LoadingPage({reload=reloadPage,slowAfterMs=10000}){
 const [slow,setSlow]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setSlow(true),slowAfterMs);return ()=>clearTimeout(timer);},[slowAfterMs]);
 return <main className="synth loading" data-startup-state={slow?'slow':'loading'}>
  <p role="status">{slow?'The page is taking longer than expected to open.':'Warming up…'}</p>
  {slow&&<><p>Some page files may still be loading. You can keep waiting or reload a fresh copy.</p><button type="button" onClick={reload}>Reload page</button><p>Saved setup data will be kept. An unsaved continuous sequence starts fresh when you reload.</p></>}
 </main>;
}

class StartupErrorBoundary extends Component {
 state={error:null};
 static getDerivedStateFromError(error){return {error};}
 render(){if(!this.state.error)return this.props.children;
  return <main className="synth loading" data-startup-state="error"><h1>This page couldn’t open</h1>
   <p role="alert">A page file or startup step failed. Reload a fresh copy to try again.</p>
   <pre className="startup-error">{String(this.state.error?.message??this.state.error).slice(0,1500)}</pre>
   <button type="button" onClick={this.props.reload}>Reload page</button><p>Saved setup data will be kept. An unsaved continuous sequence starts fresh when you reload.</p>
  </main>;
 }
}

export default function PageStartup({children,reload=reloadPage,slowAfterMs=10000}){
 return <StartupErrorBoundary reload={reload}><Suspense fallback={<LoadingPage reload={reload} slowAfterMs={slowAfterMs}/>}>{children}</Suspense></StartupErrorBoundary>;
}
