from pathlib import Path
from PIL import Image
import cairosvg,io
root=Path(__file__).resolve().parent.parent
svg=(root/'mobile/app-icon.svg').read_bytes()
icon=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg))).convert('RGB')
icon.save(root/'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
for path in (root/'android/app/src/main/res').glob('mipmap-*/*.png'):
 size=Image.open(path).size
 icon.resize(size,Image.Resampling.LANCZOS).save(path)
# Replace generated starter splash art with the same family emblem.
for path in [*(root/'android/app/src/main/res').glob('drawable*/splash.png'),*(root/'ios/App/App/Assets.xcassets/Splash.imageset').glob('*.png')]:
 size=Image.open(path).size
 canvas=Image.new('RGB',size,'#263e33');side=max(64,int(min(size)*.32));mark=icon.resize((side,side),Image.Resampling.LANCZOS);canvas.paste(mark,((size[0]-side)//2,(size[1]-side)//2));canvas.save(path)
