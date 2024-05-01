# This script generates Guzztool's icon SVG (and PNGs).


import math
import os
import re
from xml.dom.minidom import parseString
from xml.etree.ElementTree import Element, tostring
import cairosvg

size = 1000
colors = {
    "light_grey": "#6e6e6e",
    "grey": "#45474c",
    "dark_blue": "#588ea5",
    "white": "#e9f7fa",
    "blue": "#64d1ef",
    "yellow": "#ffe369",
    "light_yellow": "#ffff83",
}

BASE_SIZE = 1000
# Everything is sized as if the SVG is 1000x1000, and then size is adjusted as needed


def F(s):
    return str(size * s / BASE_SIZE)


def unF(s):
    return float(s) / size * BASE_SIZE


svg = Element('svg', width=F(1000), height=F(1000), xmlns="http://www.w3.org/2000/svg")

# Icon base
# svg.append(Element('rect', width=F(1000), height=F(1000), fill=colors["light_grey"], rx=F(100), ry=F(100)))

# Background circle
background_circle_radius = 450
svg.append(Element('circle', cx=F(500), cy=F(500), r=F(background_circle_radius), fill=colors["grey"]))

# 8 radial blue lines between the white donut and background circle


def draw_radial_lines():
    for angle in range(0, 360, 360 // 12):
        # Skip cardinal directions
        if angle % 90 == 0:
            continue

        # Get endpoints a few degrees before and after the center
        thickness = 3  # in degrees
        x1 = F(500 + background_circle_radius * math.cos(math.radians(angle - thickness / 2)))
        y1 = F(500 + background_circle_radius * math.sin(math.radians(angle - thickness / 2)))
        x2 = F(500 + background_circle_radius * math.cos(math.radians(angle + thickness / 2)))
        y2 = F(500 + background_circle_radius * math.sin(math.radians(angle + thickness / 2)))

        # Get other two corners of the rectangle
        offset = background_circle_radius - white_donut_outer_radius + 10  # buffer so the rectangle sticks out underneath the white donut a bit

        x3 = F(unF(x2) - offset * math.cos(math.radians(angle)))
        y3 = F(unF(y2) - offset * math.sin(math.radians(angle)))
        x4 = F(unF(x1) - offset * math.cos(math.radians(angle)))
        y4 = F(unF(y1) - offset * math.sin(math.radians(angle)))

        # Draw rectangle + endcaps to fill the gap between the rectangle and the outer circle's edge
        svg.append(Element('path', d=f"M {x1},{y1} A {F(background_circle_radius)},{F(background_circle_radius)} 0 0,1 {x2},{y2} L {x3},{y3} L {x4},{y4} Z", fill=colors["dark_blue"]))

# White donut


def draw_donut(color, outer_radius, inner_radius):
    svg.append(Element('circle', cx=F(500), cy=F(500), r=F((outer_radius + inner_radius) / 2), fill="none", stroke=color, attrib={"stroke-width": F(outer_radius - inner_radius)}))


white_donut_outer_radius = 375
white_donut_inner_radius = 300
draw_radial_lines()  # Draw the radial lines here so they're under the middle circle but can access the middle_circle_radius variable
draw_donut(colors["white"], white_donut_outer_radius, white_donut_inner_radius)

# Yellow donut
yellow_donut_outer_radius = 225
yellow_donut_inner_radius = 150
draw_donut(colors["yellow"], yellow_donut_outer_radius, yellow_donut_inner_radius)

# Grey rectangles to segment the yellow donut into pieces
yellow_donut_segment_gap_thickness = 30
for angle in [0, 45, 135]:
    segment_separator_length = yellow_donut_outer_radius + yellow_donut_segment_gap_thickness  # Buffer so we don't have to deal with endcaps
    x1 = F(500 - segment_separator_length * math.cos(math.radians(angle)))
    y1 = F(500 - segment_separator_length * math.sin(math.radians(angle)))
    x2 = F(500 + segment_separator_length * math.cos(math.radians(angle)))
    y2 = F(500 + segment_separator_length * math.sin(math.radians(angle)))
    svg.append(Element('line', x1=x1, y1=y1, x2=x2, y2=y2, stroke=colors["grey"], attrib={"stroke-width": F(yellow_donut_segment_gap_thickness)}))

# Blue bullseye
bullseye_radius = 75
svg.append(Element('circle', cx=F(500), cy=F(500), r=F(bullseye_radius), fill=colors["blue"]))

# Bullseye ring
bullseye_ring_radius = 40
bullseye_ring_thickness = 10
svg.append(Element('circle', cx=F(500), cy=F(500), r=F(bullseye_ring_radius), fill="none", stroke=colors["dark_blue"], attrib={"stroke-width": F(bullseye_ring_thickness)}))

# Grey teardrops
teardrop_radius = 85


def draw_teardrop(x, y, color, angle):
    w = 20
    h = 50
    control_x1 = F(x - w)
    control_y1 = F(y - h)
    control_x2 = F(x + w)
    control_y2 = F(y - h)
    svg.append(Element('path', d=f"M {F(x)} {F(y)} C {control_x1} {control_y1}, {control_x2} {control_y2}, {F(x)} {F(y)}", fill=color, transform=f"rotate({angle} {F(500)} {F(500)})"))


for angle in range(0, 360, 360 // 8):
    draw_teardrop(500, 500 - teardrop_radius, colors["light_grey"], angle)

# Spikes
spike_radius = 275


def draw_spike(x, y, s, main_color, off_color, nub_color, angle, shadow_inverted):
    # Adapted from https://andyhayden.com/2013/dotable-dictionaries
    class Dotable(dict):
        __getattr__ = dict.__getitem__

        def __init__(self, d):
            self.update(**dict((k, self.parse(v)) for k, v in d.items()))

        @classmethod
        def parse(cls, v):
            if isinstance(v, dict):
                return cls(v)
            elif isinstance(v, list):
                return [cls.parse(i) for i in v]
            else:
                return v * s

    # Data of all control points and other important points
    p = Dotable.parse({
        "O1": {  # Top half of outer curve
            "p1": {"x": 0.024, "y": -0.904},
            "p2": {"x": 0.352, "y": -0.528},
        },
        "OM": {"x": 0.208, "y": -0.272},  # Outer curve midpoint
        "O2": {  # Bottom half of outer curve
            "p1": {"x": 0.16, "y": -0.192},
            "p2": {"x": 0.12, "y": -0.104},
        },
        "I": {  # Inner curve
            "p1": {"x": 0.05, "y": -0.3},
            "p2": {"x": 0.05, "y": -0.7},
        },
        "N": {  # Nub horizontal curve
            "p1": {"x": 0.05, "y": -0.1},
            "p2": {"x": -0.05, "y": -0.1},
        },
        "W": {  # Wings
            "T": {"x": 0, "y": -0.5},  # Top point along midline
            "B": {"x": 0, "y": -0.1},  # Bottom point along midline
            "O": {"x": 0.35, "y": -0.5},  # Outer wingtip (right side, left is just mirror of this)
        }
    })

    elems = []
    # Wings
    elems.append(Element('polyline', points=" ".join([
        f"{F(x + p.W.T.x)},{F(y + p.W.T.y)}",
        f"{F(x + p.W.O.x)},{F(y + p.W.O.y)}",
        f"{F(x + p.W.B.x)},{F(y + p.W.B.y)}",
        f"{F(x - p.W.O.x)},{F(y + p.W.O.y)}",
        "Z"
    ]), fill=nub_color))
    # Thin half
    elems.append(Element('path', d=" ".join([
        f"M {F(x)},{F(y - s)}",
        f"C {F(x + p.O1.p1.x)},{F(y + p.O1.p1.y)} {F(x + p.O1.p2.x)},{F(y + p.O1.p2.y)} {F(x + p.OM.x)},{F(y + p.OM.y)}",
        f"C {F(x + p.O2.p1.x)},{F(y + p.O2.p1.y)} {F(x + p.O2.p2.x)},{F(y + p.O2.p2.y)} {F(x)},{F(y)}",
    ]), fill=main_color))
    # Fat half
    elems.append(Element('path', d=" ".join([
        f"M {F(x)},{F(y - s)}",
        f"C {F(x - p.O1.p1.x)},{F(y + p.O1.p1.y)} {F(x - p.O1.p2.x)},{F(y + p.O1.p2.y)} {F(x - p.OM.x)},{F(y + p.OM.y)}",
        f"C {F(x - p.O2.p1.x)},{F(y + p.O2.p1.y)} {F(x - p.O2.p2.x)},{F(y + p.O2.p2.y)} {F(x)},{F(y)}",
        f"C {F(x + p.I.p1.x)},{F(y + p.I.p1.y)} {F(x + p.I.p2.x)},{F(y + p.I.p2.y)} {F(x)},{F(y - s)}",
    ]), fill=off_color))
    # Nub
    elems.append(Element('path', d=" ".join([
        # +1s expand the nub a bit to over-cover the part of the spike under it so we don't get edge artifacts
        f"M {F(x)},{F(y + 1)}",
        f"C {F(x - p.O2.p2.x)},{F(y + p.O2.p2.y)} {F(x - p.O2.p1.x)},{F(y + p.O2.p1.y)} {F(x - p.OM.x - 1)},{F(y + p.OM.y)}",
        f"C {F(x - p.OM.x - 1 + p.N.p1.x)},{F(y + p.OM.y + p.N.p1.y)} {F(x + p.OM.x + 1 + p.N.p2.x)},{F(y + p.OM.y + p.N.p2.y)} {F(x + p.OM.x + 1)},{F(y + p.OM.y)}",
        f"C {F(x + p.O2.p1.x)},{F(y + p.O2.p1.y)} {F(x + p.O2.p2.x)},{F(y + p.O2.p2.y)} {F(x)},{F(y + 1)}",
    ]), fill=nub_color))
    for elem in elems:
        elem.set("transform", f"rotate({angle} {F(500)} {F(500)})" + (f" translate({F(x * 2)}, 0) scale(-1, 1)" if shadow_inverted else ''))
        elem.set("shape-rendering", "auto")
        svg.append(elem)


for angle in range(0, 360, 360 // 8):
    draw_spike(x=500, y=500 - spike_radius, s=140,
               main_color=colors["yellow"], off_color=colors["light_yellow"], nub_color=colors["dark_blue"],
               angle=angle, shadow_inverted=angle >= 180)

# Crop out transparent edge (since I calced all the numbers assuming a background rect)
svg.set("viewBox", "50 50 900 900")


# Save
with open('src/static/icons/icon.svg', 'w') as f:
    f.write(parseString(tostring(svg)).toprettyxml())

# Export to PNG
for size in [16, 32, 48, 128]:
    cairosvg.svg2png(url='src/static/icons/icon.svg', write_to=f'src/static/icons/icon{size}.png', output_width=size, output_height=size)
