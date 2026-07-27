import os

ROOT = r"C:\Users\pedro\Downloads\pet social\petsocial"
DIRS = ["app", "components", "lib", "public"]
EXTS = (".tsx", ".ts", ".json", ".html", ".js", ".jsx")
REPL = [(b"Pet Social", b"Maestro Pet"), (b"PET SOCIAL", b"MAESTRO PET")]

targets = [os.path.join(ROOT, "app.json")]
for d in DIRS:
    for r, _, fs in os.walk(os.path.join(ROOT, d)):
        for f in fs:
            if f.endswith(EXTS):
                targets.append(os.path.join(r, f))

files = 0
total = 0
for p in targets:
    try:
        s = open(p, "rb").read()
    except Exception:
        continue
    o = s
    c = 0
    for a, b in REPL:
        c += o.count(a)
        s = s.replace(a, b)
    if s != o:
        open(p, "wb").write(s)
        files += 1
        total += c
        print(f"{os.path.relpath(p, ROOT)}: {c}")

print(f"\n{files} arquivos, {total} substituicoes")
