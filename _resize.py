import os, sys
try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "Pillow"])
    from PIL import Image

src = r"C:\Users\pedro\Downloads\pet social\Mozart"
out = os.path.join(src, "_preview")
os.makedirs(out, exist_ok=True)

files = sorted(
    [f for f in os.listdir(src) if f.lower().endswith(".png")],
    key=lambda x: int(''.join(ch for ch in os.path.splitext(x)[0] if ch.isdigit()) or 0),
)

for f in files:
    p = os.path.join(src, f)
    try:
        im = Image.open(p)
        w, h = im.size
        mode = im.mode
        alpha = False
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            a = im.convert("RGBA").split()[-1]
            alpha = a.getextrema()[0] < 250
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (221, 221, 221, 255))
        comp = Image.alpha_composite(bg, rgba).convert("RGB")
        comp.thumbnail((900, 900))
        comp.save(os.path.join(out, os.path.splitext(f)[0] + ".jpg"), "JPEG", quality=82)
        print(f"{f}: {w}x{h} mode={mode} transparente={alpha}")
    except Exception as e:
        print(f"{f}: ERRO {e}")
