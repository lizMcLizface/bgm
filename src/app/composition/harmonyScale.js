export const HARMONY_SCALES={auto:'Automatic parent harmony',selected:'Selected scale colours',major:'Major harmony',minor:'Minor harmony'};
/** Only the familiar major/minor pentatonics have an automatic parent. */
export function harmonyMode(mode,choice='auto',generation='latest') {
    if(generation==='legacy'||choice==='selected')return mode;
    if(choice==='major')return 'Major-1';
    if(choice==='minor')return 'Major-6';
    return mode==='Pentatonic-1'?'Major-1':mode==='Pentatonic-5'?'Major-6':mode;
}
