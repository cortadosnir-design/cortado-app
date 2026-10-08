"""Print bounding boxes (after transforms) and the gaps between key elements of a template."""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
f=pathlib.Path(sys.argv[1]).resolve(); W,H=map(int,sys.argv[2].split('x'))
sel={'badge':'.badge','p1':'.p1','p2':'.p2','card':'.card','ribbon':'.ribbon','socials':'.socials','foot':'.foot','hrs':'.hrs .t','line':'.line'}
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':W,'height':H}); pg.goto(f.as_uri()); pg.wait_for_load_state('networkidle'); pg.evaluate('document.fonts.ready')
    r=pg.evaluate("s=>Object.fromEntries(Object.entries(s).map(([k,v])=>{const e=document.querySelector(v);if(!e)return[k,null];const b=e.getBoundingClientRect();return[k,[Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]]}))",sel)
    b.close()
for k,v in r.items(): print(f'{k:8s}',v)
g=lambda a,b_: r[b_][1]-r[a][3]
print('gaps: badge→photos',min(g('badge','p1'),g('badge','p2')),'| between photos',r['p2'][0]-r['p1'][2],
      '| photos→card',r['card'][1]-max(r['p1'][3],r['p2'][3]),'| ribbon→foot',r['foot'][1]-r['ribbon'][3],
      '| margins L',min(r['p1'][0],r['card'][0],r['socials'][0]),'R',W-max(r['p2'][2],r['card'][2],r['foot'][2]),'| top',r['badge'][1],'| bottom of content',max(r['socials'][3],r['foot'][3]))
