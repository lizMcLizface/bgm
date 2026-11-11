/** Invoke every logical close immediately, then await every asynchronous owner.
 * Ignoring the returned promise remains safe; callers can await it for full cleanup. */
export function retireAudioActions(actions,message='Audio disposal failed'){
 const pending=[],errors=[];
 for(const action of actions)try{const result=action();if(result?.then)pending.push(result);}catch(error){errors.push(error);}
 const completed=Promise.allSettled(pending).then(results=>{for(const result of results)if(result.status==='rejected')errors.push(result.reason);if(errors.length)throw new AggregateError(errors,message);});
 completed.catch(()=>{});return completed;
}
export function awaitRetiredPreparation(pending){return Promise.resolve(pending).catch(error=>{if(error?.code!=='AUDIO_OWNER_DISPOSED')throw error;});}
/** Late preparations can create retirement work while the initial close settles. */
export async function finishAudioRetirement(initial,pending,failure,message){
 const [result]=await Promise.allSettled([initial]);
 for(;;){const remaining=[...(pending()??[])];if(!remaining.length)break;await Promise.allSettled(remaining);}
 const errors=[];if(result.status==='rejected')errors.push(result.reason);const earlier=failure();if(earlier&&!errors.includes(earlier))errors.push(earlier);if(errors.length)throw new AggregateError(errors,message);
}
