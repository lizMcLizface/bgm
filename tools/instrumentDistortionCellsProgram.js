// Review-only finite program adapter. No arrays/table preparation run in audio render.
export class FrozenCellProgram{
 constructor(kernel,rate,options){this.kernel=kernel;this.rate=rate;this.options=options;this.channels=options.channels;this.drives=[0,0];this.events=[];this.make();}
 make(){this.core=this.kernel.create(this.rate,this.options);this.input=this.core.input;this.output=this.core.output;this.at=0;}
 get handle(){return this.core.handle;}
 curvePrepare(value){if(this.drives.length>=256)throw Error('Review drive ledger capacity');this.drives.push(value);return this.drives.length-1;}
 curve(slot){if(!Number.isInteger(slot)||slot<0||slot>=this.drives.length)throw Error('Review drive slot');const a=new Float32Array(44100);for(let i=0;i<a.length;i++)a[i]=this.core.cell(i,this.drives[slot]);return a;}
 curveEvent(slot,seconds){if(!Number.isInteger(slot)||slot<0||slot>=this.drives.length)throw Error('Review drive slot');this.events.push({kind:2,value:this.drives[slot],seconds});}
 gainEvent(lane,value,seconds){this.events.push({kind:lane,value,seconds});}
 prepare(){this.core.initial(0,1);this.core.initial(1,0);this.core.prepare();}
 render(channels,options){const frame=this.core.stat(0);while(this.at<this.events.length&&Math.round(this.events[this.at].seconds*this.rate)<=frame){const e=this.events[this.at++];const author=Math.round(e.seconds*this.rate);if(e.seconds!==author/this.rate)throw Error('Original review author seconds changed');this.core.enqueue(e.kind,e.value,author);}this.core.commit();this.core.render(channels,options);}
 reset(){this.core.dispose();this.make();this.prepare();}
 stat(i){return i===11?this.core.shape(0,this.core.stat(7)):this.core.stat(i);}
 stats(){return this.core.stats();}
 dispose(){this.core.dispose();}
}
