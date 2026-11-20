"""Génère l'icône de l'appli : un cintre blanc sur fond bleu-vert (couleurs proches de Vinted).
Dessin original, pas le logo Vinted. Usage : python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

TEAL = (9, 177, 186)        # bleu-vert façon Vinted
TEAL_DARK = (0, 119, 130)
WHITE = (255, 255, 255)
S = 1024                    # dessin en grand puis réduit = bords lisses


def draw(size_out):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # fond : carré arrondi avec léger dégradé vertical
    bg = Image.new("RGBA", (S, S))
    for y in range(S):
        t = y / S
        c = tuple(int(TEAL[i] * (1 - t) + TEAL_DARK[i] * t) for i in range(3)) + (255,)
        ImageDraw.Draw(bg).line([(0, y), (S, y)], fill=c)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=230, fill=255)
    img.paste(bg, (0, 0), mask)

    w = 54  # épaisseur du trait
    # crochet du cintre
    # crochet : part de la gauche, passe par le haut et la droite, redescend au centre
    d.arc([427, 150, 597, 320], start=180, end=90, fill=WHITE, width=w)
    d.ellipse([427 - 0, 235 - w // 2, 427 + w, 235 + w // 2], fill=WHITE)  # bout arrondi
    d.line([(512, 300), (512, 400)], fill=WHITE, width=w)
    # épaules du cintre
    d.line([(512, 400), (190, 640)], fill=WHITE, width=w, joint="curve")
    d.line([(512, 400), (834, 640)], fill=WHITE, width=w, joint="curve")
    # barre du bas
    d.line([(190, 640), (834, 640)], fill=WHITE, width=w)
    for x in (190, 834):
        d.ellipse([x - w // 2, 640 - w // 2, x + w // 2, 640 + w // 2], fill=WHITE)
    d.ellipse([512 - w // 2, 400 - w // 2, 512 + w // 2, 400 + w // 2], fill=WHITE)
    # petite étiquette de prix accrochée
    d.line([(640, 640), (640, 730)], fill=WHITE, width=20)
    d.rounded_rectangle([585, 720, 695, 850], radius=22, fill=WHITE)
    d.ellipse([627, 742, 653, 768], fill=TEAL)
    return img.resize((size_out, size_out), Image.LANCZOS)


out = Path(__file__).resolve().parent.parent / "icons"
out.mkdir(exist_ok=True)
for n in (192, 512):
    draw(n).save(out / f"icon-{n}.png")
draw(180).save(out / "apple-touch-icon.png")
draw(256).save(out / "app.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("icônes générées dans", out)
