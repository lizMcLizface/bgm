const owners=new WeakSet();
/** Explicit resource-free compatibility room-level interface. A caller may
 * recognize this exact capability; arbitrary setLevel methods remain real
 * effects requiring their own ownership and admission contract. */
export function createNoopRoomLevel(){const owner=Object.freeze({settled:true,hear(){},setLevel(){}});owners.add(owner);return owner;}
export const isNoopRoomLevel=owner=>owners.has(owner);
