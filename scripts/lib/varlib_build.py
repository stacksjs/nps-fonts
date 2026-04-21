#!/usr/bin/env python3
"""Bridge script: merges N static TTF masters into a variable TTF with a
single `wght` axis, using fontTools.varLib.

Usage:
    varlib_build.py <axis_default> <output.ttf> <wght>:<master.ttf> [<wght>:<master.ttf>...]

Example:
    varlib_build.py 400 out.ttf 100:thin.ttf 400:regular.ttf 900:black.ttf
"""
from __future__ import annotations

import sys
from pathlib import Path

from fontTools.designspaceLib import (
    AxisDescriptor,
    DesignSpaceDocument,
    InstanceDescriptor,
    SourceDescriptor,
)
from fontTools.varLib import build

# Named instances exposed in the `fvar` table — standard CSS weight names
# that land on or near the wght axis values.
WEIGHT_NAMES = {
    100: "Thin",
    200: "ExtraLight",
    300: "Light",
    400: "Regular",
    500: "Medium",
    600: "SemiBold",
    700: "Bold",
    800: "ExtraBold",
    900: "Black",
}


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print(__doc__, file=sys.stderr)
        return 2

    default = int(argv[1])
    out_path = Path(argv[2])
    master_specs = [s.split(":", 1) for s in argv[3:]]
    masters = [(int(w), Path(p)) for w, p in master_specs]
    masters.sort(key=lambda m: m[0])
    locs = [w for w, _ in masters]

    ds = DesignSpaceDocument()
    axis = AxisDescriptor()
    axis.name = "Weight"
    axis.tag = "wght"
    axis.minimum = min(locs)
    axis.maximum = max(locs)
    axis.default = default
    ds.addAxis(axis)

    for wght, path in masters:
        src = SourceDescriptor()
        src.path = str(path.resolve())
        src.location = {"Weight": wght}
        src.familyName = "NPS 2026"
        src.styleName = f"wght{wght}"
        ds.addSource(src)

    # Named instances at every standard CSS weight inside our axis range.
    for wght, style in sorted(WEIGHT_NAMES.items()):
        if wght < min(locs) or wght > max(locs):
            continue
        inst = InstanceDescriptor()
        inst.familyName = "NPS 2026"
        inst.styleName = style
        inst.location = {"Weight": wght}
        ds.addInstance(inst)

    font, _, _ = build(ds)
    font.save(str(out_path))
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes, {len(masters)} masters)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
