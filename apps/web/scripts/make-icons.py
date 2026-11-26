# 임시 앱 아이콘 생성기 (자주색 바탕 + 가위). 로고가 생기면 public/icons 의 파일만 바꾸면 된다.
# 사용: python3 scripts/make-icons.py public/icons  (Pillow 필요)
import math, sys
from PIL import Image, ImageDraw
BG=(122,46,95); FG=(255,255,255)
def scissors(d, cx, cy, s):
    # s = overall scale (height ≈ s)
    pivot=(cx, cy - 0.02*s)
    for side in (-1, 1):
        ang = math.radians(90 + side*14)   # blade direction (up, slightly spread)
        # blade: from behind pivot to tip
        tip=(pivot[0] - math.cos(ang)*0.50*s*side*-1 if False else pivot[0] + math.cos(math.radians(90 - side*14))*0.0, 0)
    # simpler explicit geometry
    W=s
    def blade(sign):
        # tip at top, crossing at pivot, ends at handle (bottom, opposite side)
        tipx = cx + sign*0.17*W; tipy = cy - 0.46*W
        endx = cx - sign*0.13*W; endy = cy + 0.10*W
        dx, dy = tipx-endx, tipy-endy; L=math.hypot(dx,dy); ux,uy=dx/L,dy/L; nx,ny=-uy,ux
        w=0.055*W
        pts=[(tipx,tipy),
             (endx+ux*L*0.55 + nx*w*sign, endy+uy*L*0.55 + ny*w*sign),
             (endx + nx*w*0.7*sign, endy + ny*w*0.7*sign),
             (endx - nx*w*0.7*sign, endy - ny*w*0.7*sign),
             (endx+ux*L*0.55 - nx*w*0.25*sign, endy+uy*L*0.55 - ny*w*0.25*sign)]
        d.polygon(pts, fill=FG)
        # handle ring
        hx = cx - sign*0.17*W; hy = cy + 0.25*W; r=0.13*W; t=0.045*W
        d.ellipse([hx-r,hy-r,hx+r,hy+r], fill=FG)
        d.ellipse([hx-r+t,hy-r+t,hx+r-t,hy+r-t], fill=BG)
        # connect blade end to ring
        d.line([(endx,endy),(hx+sign*0.03*W,hy-r+0.01*W)], fill=FG, width=int(0.07*W))
    blade(1); blade(-1)
    pr=0.03*W; d.ellipse([cx-pr,pivot[1]-pr+0.02*W,cx+pr,pivot[1]+pr+0.02*W], fill=BG)

def make(size, content_ratio, rounded):
    S=1024
    im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    if rounded: d.rounded_rectangle([0,0,S-1,S-1], radius=int(S*0.22), fill=BG)
    else: d.rectangle([0,0,S,S], fill=BG)
    scissors(d, S/2, S/2+S*0.03*content_ratio, S*content_ratio)
    return im.resize((size,size), Image.LANCZOS)

out=sys.argv[1]
make(512,0.78,True).save(f'{out}/icon-512.png')
make(192,0.78,True).save(f'{out}/icon-192.png')
make(512,0.58,False).save(f'{out}/icon-maskable-512.png')   # 안전 영역(가운데 80%) 안에
make(180,0.70,False).convert('RGB').save(f'{out}/apple-touch-icon.png')  # iOS 가 직접 둥글게 자름
make(48,0.80,True).save(f'{out}/favicon-48.png')
make(32,0.82,True).save(f'{out}/favicon.ico', sizes=[(32,32),(16,16)])
