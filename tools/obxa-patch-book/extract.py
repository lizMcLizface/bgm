import re,sys,zlib,struct
# Usage: python extract.py <OB-Xa_patch_book.pdf> <pages dir>
d=open(sys.argv[1],'rb').read()
out=sys.argv[2]
def lzw(data):
  # PDF LZWDecode, EarlyChange=1, MSB-first codes
  res=bytearray();table=[bytes([i]) for i in range(256)]+[b'',b''];w=9;bitbuf=0;bits=0;prev=None
  pos=0;n=len(data)
  while True:
    while bits<w and pos<n:bitbuf=(bitbuf<<8)|data[pos];pos+=1;bits+=8
    if bits<w:break
    code=(bitbuf>>(bits-w))&((1<<w)-1);bits-=w;bitbuf&=(1<<bits)-1
    if code==256:table=table[:258];w=9;prev=None;continue
    if code==257:break
    if prev is None:entry=table[code]
    elif code<len(table):entry=table[code];table.append(prev+entry[:1])
    else:entry=prev+prev[:1];table.append(entry)
    res+=entry;prev=entry
    if len(table)+1>=(1<<w) and w<12:w+=1
  return bytes(res)
def png(path,w,h,raw):
  rows=b''.join(b'\x00'+raw[y*w:(y+1)*w] for y in range(h))
  ch=lambda t,b:struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b))
  open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,0,0,0,0))+ch(b'IDAT',zlib.compress(rows,6))+ch(b'IEND',b''))
objs={int(m.group(1)):m.start() for m in re.finditer(rb'(\d+) 0 obj',d)}
def obj(n):s=objs[n];return d[s:d.find(b'endobj',s)]
# page order via Pages tree
root=int(re.search(rb'/Root (\d+) 0 R',d).group(1))
pages_root=int(re.search(rb'/Pages (\d+) 0 R',obj(root)).group(1))
def kids(n):
  b=obj(n)
  if b'/Kids' not in b:return [n]
  return sum((kids(int(k)) for k in re.findall(rb'(\d+) 0 R',re.search(rb'/Kids\s*\[(.*?)\]',b,re.S).group(1))),[])
pages=kids(pages_root);print(len(pages))
for i,p in enumerate(pages,1):
  im=int(re.search(rb'/Im\w* (\d+) 0 R',obj(p)).group(1));b=obj(im)
  w=int(re.search(rb'/Width (\d+)',b).group(1));h=int(re.search(rb'/Height (\d+)',b).group(1))
  L=re.search(rb'/Length (\d+)( 0 R)?',b);ln=int(L.group(1))
  if L.group(2):ln=int(re.search(rb'obj\s*(\d+)',obj(ln)).group(1))
  s=b.index(b'stream')+6;s+=2 if b[s:s+2]==b'\r\n' else 1
  raw=lzw(b[s:s+ln])
  if len(raw)<w*h:raw+=bytes(w*h-len(raw))
  png(f'{out}/p{i:02d}.png',w,h,raw[:w*h]);print(i,w,h,len(raw),flush=True)
