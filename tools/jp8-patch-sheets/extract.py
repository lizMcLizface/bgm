import io,re,struct,sys
from PIL import Image
# Usage: python extract.py <Roland-Jupiter-8-Factory-patch-sheets.pdf> <pages dir>
# The scan is one image per page, in file order: CCITT G4 (1-bit) or JPEG (soft masks skipped).
# Also used for the Prophet-5 sheets and the Juno-60 book.
# G4 data is wrapped in a minimal one-strip TIFF so Pillow can decode it.
d=open(sys.argv[1],'rb').read()
out=sys.argv[2]
def g4(data,w,h,black1):
  tags=[(256,4,1,w),(257,4,1,h),(258,3,1,1),(259,3,1,4),(262,3,1,1 if black1 else 0),(273,4,1,8),(277,3,1,1),(278,4,1,h),(279,4,1,len(data))]
  ifd=struct.pack('<H',len(tags))+b''.join(struct.pack('<HHII',*t) for t in tags)+b'\0\0\0\0'
  return Image.open(io.BytesIO(b'II*\0'+struct.pack('<I',8+len(data))+data+ifd)).convert('L')
masks={int(m) for m in re.findall(rb'/SMask (\d+) 0 R',d)}
page=0
for m in re.finditer(rb'(\d+) 0 obj\s*<<(.*?)>>\s*stream\r?\n',d,re.S):
  n,head=int(m.group(1)),m.group(2)
  if b'/Subtype/Image' not in head.replace(b' ',b'') or n in masks:continue
  w=int(re.search(rb'/Width (\d+)',head).group(1));h=int(re.search(rb'/Height (\d+)',head).group(1))
  L=re.search(rb'/Length (\d+)( 0 R)?',head);n_=int(L.group(1))
  if L.group(2):n_=int(re.search(rb'%d 0 obj\s*(\d+)'%n_,d).group(1))  # indirect length
  data=d[m.end():m.end()+n_]
  if b'CCITTFaxDecode' in head:im=g4(data,w,h,b'/BlackIs1 true' in head)
  elif b'DCTDecode' in head:im=Image.open(io.BytesIO(data)).convert('L')
  else:continue
  page+=1;im.save(f'{out}/p{page:02d}.png');print(page,n,w,h,flush=True)
