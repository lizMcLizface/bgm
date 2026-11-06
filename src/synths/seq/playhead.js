// Moves the playhead overlay without re-rendering the page: the stats arrive about forty times a second.
// The grid shows a window of sixteen steps starting at --off (the page scrolls through longer patterns); the playhead is hidden while it is outside it.
export function movePlayhead(root,data){
 if(!root)return;
 root.style.setProperty('--step',data.running?data.step:-1);
 root.dataset.running=data.running?'1':'0';
 const off=Number(root.style.getPropertyValue('--off'))||0;
 root.dataset.out=data.running&&(data.step<off||data.step>=off+16)?'1':'0';
}
