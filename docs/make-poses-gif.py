"""Render docs/poses.gif: the meatball's poses, animated, for places that won't play an SVG.

The sprite is all 1x1 pixel rects, so this redraws it frame by frame, following
the CSS animation rules in plugin/assets/meatball.svg (chomp, bob, roll, blink,
hop, shake, z's). Run from the repo root:

    python3 docs/make-poses-gif.py
"""

import math
import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

SPRITE = 'plugin/assets/meatball.svg'
OUT = 'docs/poses.gif'

SCALE = 3  # screen pixels per sprite pixel: 32 -> 96
CELL = 120
TOP = 14  # headroom for the "!" and the hop
HEIGHT = 146
BACKGROUND = (33, 33, 33)  # the desktop app's band
LABEL = (150, 150, 150)
FRAME_MS = 60
LOOP_MS = 8400  # long enough for the slow bobs and the z's to come round

POSES = [
    ('rolling', dict(roll=True)),
    ('chomping', dict(mouth='chomp')),
    ('running a command', dict(mood='busy', idle=True)),
    ('something failed', dict(mood='hurt', idle=True)),
    ('waiting on you', dict(mood='alert', idle=True)),
    ('done!', dict(mouth='open', idle=True)),
    ('asleep', dict(mood='sleep', idle=True)),
    ('context filling', dict(fill='full', idle=True)),
    ('time to /compact', dict(fill='stuffed', idle=True)),
]

MOODS = ('alert', 'hurt', 'sleep', 'busy')
SPIN_ORIGIN = {'normal': (15.5, 17.5), 'full': (15.5, 17.5), 'stuffed': (15.5, 16.5)}


def rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def phase(t, period, delay=0.0):
    return ((t - delay) % period) / period


def shown(classes, pose, t):
    """Whether a group with these classes is displayed and visible at time t."""
    fill = pose.get('fill', 'normal')
    mood = pose.get('mood')
    mouth = pose.get('mouth', 'closed')
    for c in classes:
        if c.startswith('v-') and c != f'v-{fill}':
            return False
        if c == 'feet' and pose.get('roll'):
            return False
        if c in ('f-default', 'mc-default') and mood:
            return False
        for prefix in ('f-', 'mc-', 'x-'):
            if c.startswith(prefix) and c[len(prefix):] in MOODS and c[len(prefix):] != mood:
                return False
        if c == 'm-open':
            if mouth == 'chomp':
                return phase(t, 0.36) < 0.5
            if mouth != 'open':
                return False
        if c == 'm-closed':
            if mouth == 'chomp':
                return phase(t, 0.36) >= 0.5
            if mouth == 'open':
                return False
        if c == 'x-alert' and phase(t, 0.5) >= 0.5:
            return False
        if c == 'x-hurt' and phase(t, 0.4) >= 0.5:
            return False
        if c == 'z1' and phase(t, 2.8) < 0.25:
            return False
        if c == 'z2' and phase(t, 2.8, 1.4) < 0.25:
            return False
    return True


def bob(pose, t):
    """The .bob group's offset in sprite pixels."""
    if pose.get('roll'):
        return 0, 0
    mood = pose.get('mood')
    if mood == 'alert':
        p = phase(t, 1.4)
        return 0, -2 if 0.08 <= p < 0.16 or 0.24 <= p < 0.32 else 0
    if mood == 'hurt':
        p = phase(t, 1.0)
        return (-1 if 0.06 <= p < 0.12 or 0.18 <= p < 0.24 else 1 if 0.12 <= p < 0.18 else 0), 0
    if mood == 'sleep':
        return 0, -1 if phase(t, 2.8) >= 0.5 else 0
    if pose.get('idle'):
        return 0, -1 if phase(t, 1.2) >= 0.5 else 0
    return 0, 0


def pixels(node, pose, t, fill=None, opacity=1.0, offset=(0, 0), turn=0, origin=(0, 0)):
    """Yield (x, y, color, opacity) for every lit sprite pixel under node."""
    classes = node.attrib.get('class', '').split()
    if classes and not shown(classes, pose, t):
        return
    fill = node.attrib.get('fill', fill)
    opacity *= float(node.attrib.get('opacity', 1))
    if 'bob' in classes:
        dx, dy = bob(pose, t)
        offset = (offset[0] + dx, offset[1] + dy)
    if 'spin' in classes and pose.get('roll'):
        turn = int(phase(t, 0.6) * 4) * 90
        origin = SPIN_ORIGIN[pose.get('fill', 'normal')]
    if node.tag.endswith('rect'):
        x0, y0 = int(node.attrib['x']), int(node.attrib['y'])
        w, h = int(node.attrib['width']), int(node.attrib['height'])
        color = rgb(node.attrib.get('fill', fill))
        cos, sin = round(math.cos(math.radians(turn))), round(math.sin(math.radians(turn)))
        for x in range(x0, x0 + w):
            for y in range(y0, y0 + h):
                cx, cy = x + 0.5 - origin[0], y + 0.5 - origin[1]
                rx = origin[0] + cx * cos - cy * sin - 0.5
                ry = origin[1] + cx * sin + cy * cos - 0.5
                yield round(rx) + offset[0], round(ry) + offset[1], color, opacity
        return
    for child in node:
        yield from pixels(child, pose, t, fill, opacity, offset, turn, origin)


def frame(root, font, t):
    image = Image.new('RGB', (CELL * len(POSES), HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    for i, (label, pose) in enumerate(POSES):
        left = i * CELL + (CELL - 32 * SCALE) // 2
        for x, y, color, alpha in pixels(root, pose, t):
            blended = tuple(round(c * alpha + b * (1 - alpha)) for c, b in zip(color, BACKGROUND))
            px, py = left + x * SCALE, TOP + y * SCALE
            draw.rectangle([px, py, px + SCALE - 1, py + SCALE - 1], fill=blended)
        draw.text((i * CELL + CELL // 2, HEIGHT - 12), label, fill=LABEL, font=font, anchor='ms')
    return image


def main():
    svg = re.sub(r'<style>.*?</style>', '', open(SPRITE).read(), flags=re.S)
    root = ET.fromstring(svg)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 13)
    except OSError:
        font = ImageFont.load_default()
    frames = [frame(root, font, ms / 1000) for ms in range(0, LOOP_MS, FRAME_MS)]
    frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=FRAME_MS, loop=0, optimize=True)
    print(f'{OUT}: {len(frames)} frames')


if __name__ == '__main__':
    main()
