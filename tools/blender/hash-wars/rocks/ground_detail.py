"""Bake a repeating 4 m field of fallen stems and mineral chips for the terrain."""
from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw

size = 512
rng = random.Random(2452)
height = Image.new("L", (size, size), 90)
draw = ImageDraw.Draw(height)
for i in range(12000):
    x, y = rng.randrange(size), rng.randrange(size)
    angle = rng.gauss(math.sin(y * math.tau / size), .85)
    length = rng.uniform(3, 15) if i % 3 else rng.uniform(1, 5)
    dx, dy = length * math.cos(angle), length * math.sin(angle)
    width = rng.uniform(.6, 1.8)
    points = [(x, y), (x + dx * .4 - dy / length * width,
                         y + dy * .4 + dx / length * width), (x + dx, y + dy)]
    tone = rng.randrange(38, 209)
    for ox in ([0, size] if x < 18 else [0, -size] if x > size - 18 else [0]):
        for oy in ([0, size] if y < 18 else [0, -size] if y > size - 18 else [0]):
            draw.polygon([(a + ox, b + oy) for a, b in points], fill=tone)

h = np.asarray(height).astype(float)
sx = np.roll(h, 1, axis=1) - np.roll(h, -1, axis=1)
sy = np.roll(h, 1, axis=0) - np.roll(h, -1, axis=0)
detail = np.stack([h, 128 + sx * .65, 128 + sy * .65], axis=-1)
out = Path(__file__).resolve().parents[4] / "assets/hash-wars/ground/litter.png"
Image.fromarray(detail.clip(0, 255).astype('uint8')).save(out)
