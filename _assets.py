import os
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

SRC = r"C:\Users\pedro\Downloads\pet social\Mozart"
REPO = r"C:\Users\pedro\Downloads\pet social\petsocial"
PUB = os.path.join(REPO, "public")
ASSETS = os.path.join(REPO, "assets", "images")
KIT = os.path.join(PUB, "mozart")
os.makedirs(KIT, exist_ok=True)

CREAM = (255, 243, 224, 255)

def load(n):
    return Image.open(os.path.join(SRC, f"{n}.png")).convert("RGBA")

def icon_on_bg(face, size, bg=CREAM, pad=0.08):
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - 2 * pad))
    f = face.copy()
    f.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(f, ((size - f.width) // 2, (size - f.height) // 2))
    return canvas.convert("RGB")

face = load(2)  # rosto + peito transparente

# --- App icons (fundo creme solido) ---
icon_targets = [
    (os.path.join(PUB, "icon-192.png"), 192),
    (os.path.join(PUB, "icon-512.png"), 512),
    (os.path.join(PUB, "apple-touch-icon.png"), 180),
    (os.path.join(ASSETS, "icon-192.png"), 192),
    (os.path.join(ASSETS, "icon-512.png"), 512),
    (os.path.join(ASSETS, "apple-touch-icon.png"), 180),
    (os.path.join(ASSETS, "icon.png"), 1024),
    (os.path.join(ASSETS, "favicon.png"), 96),
]
for path, size in icon_targets:
    icon_on_bg(face, size).save(path, "PNG")
    print("icon ->", os.path.relpath(path, REPO), size)

# --- Android adaptive foreground (transparente, safe zone) ---
def fg(face, size=1024, pad=0.24):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - 2 * pad))
    f = face.copy()
    f.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(f, ((size - f.width) // 2, (size - f.height) // 2))
    return canvas
fg(face).save(os.path.join(ASSETS, "android-icon-foreground.png"), "PNG")
print("android foreground ok")

# --- Splash (corpo inteiro transparente) ---
body = load(17)
sp = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
b = body.copy(); b.thumbnail((760, 760), Image.LANCZOS)
sp.alpha_composite(b, ((1024 - b.width) // 2, (1024 - b.height) // 2))
sp.save(os.path.join(ASSETS, "splash-icon.png"), "PNG")
print("splash ok")

# --- Kit do mascote (transparente, max 512) ---
kit = {
    "logo": 2, "rosto": 3, "oi": 6, "comemorando": 7, "dormindo": 8,
    "triste": 9, "curioso": 10, "coracao": 11, "detetive": 12,
    "ideia": 14, "megafone": 15, "maestro": 16, "corpo": 17,
    "espiando": 18, "placa": 19, "balao": 20,
}
for name, n in kit.items():
    im = load(n)
    im.thumbnail((512, 512), Image.LANCZOS)
    im.save(os.path.join(KIT, f"{name}.png"), "PNG")
    print("kit ->", name)

print("DONE")
