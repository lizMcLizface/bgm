// Moves the playhead overlay without re-rendering the page: the stats arrive about forty times a second.
export function movePlayhead(root,data){
 if(!root)return;
 root.style.setProperty('--step',data.running?data.step:-1);
 root.dataset.running=data.running?'1':'0';
}
