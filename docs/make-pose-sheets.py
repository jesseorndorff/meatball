"""Render the README's pose sheets from the sprites in plugin/assets.

    python3 docs/make-pose-sheets.py

- docs/poses.svg: every pose, animated by the sprite's own CSS (transparent background).
- docs/poses.gif: the same sheet as a GIF, for places that won't play an SVG. The
  sprite is all 1x1 pixel rects, so this redraws it frame by frame, following the
  sprite's CSS animation rules (chomp, bob, roll, blink, hop, shake, cheer, ...).
"""

import importlib.util
import math
import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

SPRITE = 'plugin/assets/meatball.svg'
AGENTS = 'plugin/assets/meatball-agents.svg'

SCALE = 3  # screen pixels per sprite pixel: 32 -> 96
CELL = 128
TOP = 16  # headroom for the "!", the cheer and the flag
ROW = 32 * SCALE + TOP + 30
PER_ROW = 5
BACKGROUND = (33, 33, 33)  # the desktop app's band
LABEL = (150, 150, 150)
FRAME_MS = 60
LOOP_MS = 8400  # long enough for the slow bobs and the z's to come round

POSES = [
    ('rolling', dict(roll=True)),
    ('chomping an edit', dict(mouth='chomp')),
    ('running a command', dict(mood='busy', idle=True)),
    ('running tests', dict(mood='testing', idle=True)),
    ('tests passed', dict(mood='pass', idle=True)),
    ('tests failed', dict(mood='fail', idle=True)),
    ('opening a PR', dict(mood='deliver', idle=True)),
    ('PR opened', dict(mood='celebrate', idle=True)),
    ('something failed', dict(mood='hurt', idle=True)),
    ('waiting on you', dict(mood='alert', idle=True)),
    ('done!', dict(mouth='open', idle=True)),
    ('asleep', dict(mood='sleep', idle=True)),
    ('context filling', dict(fill='full', idle=True)),
    ('time to /compact', dict(fill='stuffed', idle=True)),
    ('subagents at work', dict(agents=3)),
]

MOODS = ('alert', 'hurt', 'sleep', 'busy', 'testing', 'pass', 'fail', 'deliver', 'celebrate')
SPIN_ORIGIN = {'normal': (15.5, 17.5), 'full': (15.5, 17.5), 'stuffed': (15.5, 16.5)}
AGENT_ORIGIN = {'a1': (5.5, 24.5, 0.0), 'a2': (16.5, 24.5, 0.15), 'a3': (27.5, 24.5, 0.30), 'a4': (38.5, 24.5, 0.45)}


def rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def phase(t, period, delay=0.0):
    return ((t - delay) % period) / period


def blink(t, period, delay=0.0):
    return phase(t, period, delay) < 0.5


def keyed(t, period, steps):
    """A steps(1) keyframe track: [(start fraction, value), ...], the last value held to the end."""
    p = phase(t, period)
    value = steps[0][1]
    for start, v in steps:
        if p >= start:
            value = v
    return value


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
                return blink(t, 0.36)
            if mouth != 'open':
                return False
        if c == 'm-closed':
            if mouth == 'chomp':
                return not blink(t, 0.36)
            if mouth == 'open':
                return False
        visible = {
            'x-alert': lambda: blink(t, 0.5),
            'x-hurt': lambda: blink(t, 0.4),
            'z1': lambda: phase(t, 2.8) >= 0.25,
            'z2': lambda: phase(t, 2.8, 1.4) >= 0.25,
            'sw': lambda: mood != 'testing' or blink(t, 0.8),
            'sm': lambda: mood != 'fail' or blink(t, 0.6),
            's1': lambda: mood != 'pass' or blink(t, 0.6),
            's2': lambda: mood != 'pass' or blink(t, 0.6, 0.3),
            'c0': lambda: mood != 'celebrate' or phase(t, 0.6) < 1 / 3,
            'c1': lambda: mood != 'celebrate' or phase(t, 0.6, -0.4) < 1 / 3,
            'c2': lambda: mood != 'celebrate' or phase(t, 0.6, -0.2) < 1 / 3,
        }
        if c in visible and not visible[c]():
            return False
    return True


def bob(pose, t):
    """The .bob group's offset in sprite pixels."""
    if pose.get('roll'):
        return 0, 0
    mood = pose.get('mood')
    if mood == 'alert':
        return 0, keyed(t, 1.4, [(0, 0), (0.08, -1), (0.16, 0), (0.24, -1), (0.32, 0)])
    if mood == 'hurt':
        return keyed(t, 1.0, [(0, 0), (0.06, -1), (0.12, 1), (0.18, -1), (0.24, 0)]), 0
    if mood == 'fail':
        return keyed(t, 1.2, [(0, 0), (0.04, -2), (0.08, 2), (0.12, -2), (0.16, 2), (0.20, -1), (0.24, 0)]), 0
    if mood == 'testing':
        return keyed(t, 0.5, [(0, (0, 0)), (0.2, (0, -1)), (0.4, (1, 0)), (0.6, (0, -1)), (0.8, (-1, 0))])
    if mood == 'deliver':
        return 0, -1 if phase(t, 0.5) >= 0.5 else 0
    if mood == 'sleep':
        return 0, -1 if phase(t, 2.8) >= 0.5 else 0
    if pose.get('idle'):
        return 0, -1 if phase(t, 1.2) >= 0.5 else 0
    return 0, 0


def cheer(pose, t):
    """The .v group's hop for a pass or a new PR."""
    if pose.get('mood') not in ('pass', 'celebrate') or pose.get('roll'):
        return 0
    return keyed(t, 1.2, [(0, 0), (0.08, -2), (0.16, -4), (0.24, -2), (0.32, 0), (0.40, -2), (0.48, 0)])


def lit(x0, y0, w, h, turn, origin, offset):
    cos, sin = round(math.cos(math.radians(turn))), round(math.sin(math.radians(turn)))
    for x in range(x0, x0 + w):
        for y in range(y0, y0 + h):
            cx, cy = x + 0.5 - origin[0], y + 0.5 - origin[1]
            yield round(origin[0] + cx * cos - cy * sin - 0.5) + offset[0], round(origin[1] + cx * sin + cy * cos - 0.5) + offset[1]


def pixels(node, pose, t, fill=None, opacity=1.0, offset=(0, 0), turn=0, origin=(0, 0)):
    """Yield (x, y, color, opacity) for every lit pixel of the meatball sprite under node."""
    classes = node.attrib.get('class', '').split()
    if classes and not shown(classes, pose, t):
        return
    fill = node.attrib.get('fill', fill)
    opacity *= float(node.attrib.get('opacity', 1))
    if 'v' in classes:
        offset = (offset[0], offset[1] + cheer(pose, t))
    if 'bob' in classes:
        dx, dy = bob(pose, t)
        offset = (offset[0] + dx, offset[1] + dy)
    if 'spin' in classes and pose.get('roll'):
        turn = int(phase(t, 0.6) * 4) * 90
        origin = SPIN_ORIGIN[pose.get('fill', 'normal')]
    if node.tag.endswith('rect'):
        a = node.attrib
        color = rgb(a.get('fill', fill))
        for x, y in lit(int(a['x']), int(a['y']), int(a['width']), int(a['height']), turn, origin, offset):
            yield x, y, color, opacity
        return
    for child in node:
        yield from pixels(child, pose, t, fill, opacity, offset, turn, origin)


def helpers(node, count, t, fill=None, opacity=1.0, turn=0, origin=(0, 0), spinning=False):
    """Yield the lit pixels of the agents strip showing `count` mini meatballs, each rolling."""
    classes = node.attrib.get('class', '').split()
    for c in classes:
        if c in AGENT_ORIGIN:
            if int(c[1]) > count:
                return
            ox, oy, delay = AGENT_ORIGIN[c]
            origin = (ox, oy)
            turn = int(phase(t, 0.6, -delay) * 4) * 90
    spinning = spinning or 'sp' in classes
    fill = node.attrib.get('fill', fill)
    opacity *= float(node.attrib.get('opacity', 1))
    if node.tag.endswith('rect'):
        a = node.attrib
        color = rgb(a.get('fill', fill))
        for x, y in lit(int(a['x']), int(a['y']), int(a['width']), int(a['height']), turn if spinning else 0, origin, (0, 0)):
            yield x, y, color, opacity
        return
    for child in node:
        yield from helpers(child, count, t, fill, opacity, turn, origin, spinning)


def tree(path):
    return ET.fromstring(re.sub(r'<style>.*?</style>', '', open(path).read(), flags=re.S))


def gif():
    meatball, strip = tree(SPRITE), tree(AGENTS)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 13)
    except OSError:
        font = ImageFont.load_default()
    rows = math.ceil(len(POSES) / PER_ROW)
    frames = []
    for ms in range(0, LOOP_MS, FRAME_MS):
        t = ms / 1000
        image = Image.new('RGB', (CELL * PER_ROW, ROW * rows), BACKGROUND)
        draw = ImageDraw.Draw(image)
        for i, (label, pose) in enumerate(POSES):
            col, row = i % PER_ROW, i // PER_ROW
            if 'agents' in pose:
                width = 44
                lit_pixels = helpers(strip, pose['agents'], t)
            else:
                width = 32
                lit_pixels = pixels(meatball, pose, t)
            left = col * CELL + (CELL - width * SCALE) // 2
            top = row * ROW + TOP
            for x, y, color, alpha in lit_pixels:
                blended = tuple(round(c * alpha + b * (1 - alpha)) for c, b in zip(color, BACKGROUND))
                px, py = left + x * SCALE, top + y * SCALE
                draw.rectangle([px, py, px + SCALE - 1, py + SCALE - 1], fill=blended)
            draw.text((col * CELL + CELL // 2, row * ROW + ROW - 10), label, fill=LABEL, font=font, anchor='ms')
        frames.append(image)
    frames[0].save('docs/poses.gif', save_all=True, append_images=frames[1:], duration=FRAME_MS, loop=0, optimize=True)
    print(f'docs/poses.gif: {len(frames)} frames')


def svg():
    spec = importlib.util.spec_from_file_location('build', 'scripts/build-sprites.py')
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)

    def inner(path):
        source = build.compact(open(path).read().strip())
        style = re.search(r'<style>.*?</style>', source, re.S).group(0)
        body = re.sub(r'^<svg[^>]*>', '', source.replace(style, '').replace('<title>Meatball</title>', '').replace('<title>Meatball agents</title>', ''))
        return style, body[: body.rindex('</svg>')]

    style, body = inner(SPRITE)
    strip_style, strip_body = inner(AGENTS)
    rows = math.ceil(len(POSES) / PER_ROW)
    width, height = CELL * PER_ROW, ROW * rows
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" data-fill="none" shape-rendering="crispEdges">',
        "<title>The meatball's poses</title>",
        style,
        strip_style,
        '<style>.label{font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;fill:#8b949e;text-anchor:middle}</style>',
    ]
    for i, (label, pose) in enumerate(POSES):
        col, row = i % PER_ROW, i // PER_ROW
        top = row * ROW + TOP
        if 'agents' in pose:
            size = 44 * SCALE
            x = col * CELL + (CELL - size) // 2
            out.append(f'<svg x="{x}" y="{top}" width="{size}" height="{32 * SCALE}" viewBox="0 0 44 32" overflow="visible" data-agents="{pose["agents"]}">{strip_body}</svg>')
        else:
            attrs = [f'data-fill="{pose.get("fill", "normal")}"']
            if pose.get('roll'):
                attrs.append('data-roll=""')
            if pose.get('mood'):
                attrs.append(f'data-mood="{pose["mood"]}"')
            if pose.get('mouth') == 'chomp':
                attrs.append('data-chomp=""')
            elif pose.get('mouth') == 'open':
                attrs.append('data-mouth="open"')
            if pose.get('idle'):
                attrs.append('data-idle=""')
            size = 32 * SCALE
            x = col * CELL + (CELL - size) // 2
            out.append(f'<svg x="{x}" y="{top}" width="{size}" height="{size}" viewBox="0 0 32 32" overflow="visible" {" ".join(attrs)}>{body}</svg>')
        out.append(f'<text class="label" x="{col * CELL + CELL // 2}" y="{row * ROW + ROW - 10}">{label}</text>')
    out.append('</svg>')
    open('docs/poses.svg', 'w').write(''.join(out))
    print(f'docs/poses.svg: {sum(len(p) for p in out) // 1024} KB')


if __name__ == '__main__':
    svg()
    gif()
