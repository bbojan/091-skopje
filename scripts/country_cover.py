# -*- coding: utf-8 -*-
# Land cover and the border of Macedonia for the country view (`npm run country`): every OSM area with a
# landuse / natural / water tag in the Geofabrik extract, sorted into the few classes the view paints, plus the
# country's own outline (the admin_level=2 boundary). Only the outer and inner rings, in lon / lat.
#   python3 -m venv .venv && .venv/bin/pip install osmium          (once; not an npm dependency)
#   curl -L -o data/macedonia.osm.pbf https://download.geofabrik.de/europe/macedonia-latest.osm.pbf
#   .venv/bin/python scripts/country_cover.py data/macedonia.osm.pbf data/country_cover.json
# Then `npm run country` rasterises it into public/country.png together with the heights.
import json, sys
import osmium

SRC, OUT = sys.argv[1], sys.argv[2]

# class numbers: the same as COVER in scripts/country.ts and src/country.ts
MEADOW, FIELD, FOREST, WATER, TOWN, ROCK, VINE = 1, 2, 3, 4, 5, 6, 7

def cover(t):
    lu, nat = t.get('landuse'), t.get('natural')
    if nat == 'water' or lu in ('reservoir', 'basin') or t.get('waterway') == 'riverbank': return WATER
    if lu in ('residential', 'commercial', 'industrial', 'retail', 'construction', 'garages', 'railway'): return TOWN
    if lu == 'vineyard': return VINE
    if lu in ('forest',) or nat == 'wood': return FOREST
    if lu in ('farmland', 'orchard', 'farmyard', 'plant_nursery', 'allotments', 'greenhouse_horticulture'): return FIELD
    if lu in ('meadow', 'grass', 'village_green') or nat in ('grassland', 'heath', 'scrub', 'shrubbery', 'fell'): return MEADOW
    if nat in ('bare_rock', 'scree', 'shingle', 'sand') or lu == 'quarry': return ROCK
    return 0

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.areas = []
        self.border = None
    def area(self, a):
        t = {k: v for k, v in a.tags}
        if t.get('boundary') == 'administrative' and t.get('admin_level') == '2' and t.get('ISO3166-1') == 'MK':
            self.border = self.rings(a)
            return
        c = cover(t)
        if not c: return
        try: self.areas.append([c, self.rings(a)])
        except osmium.InvalidLocationError: pass
    @staticmethod
    def rings(a):
        out = []
        for outer in a.outer_rings():
            out.append([round(v, 5) for n in outer for v in (n.lon, n.lat)])
            for inner in a.inner_rings(outer):
                out.append([round(v, 5) for n in inner for v in (n.lon, n.lat)])
        return out

h = H()
h.apply_file(SRC, locations=True)
if not h.border: sys.exit('no admin_level=2 boundary with ISO3166-1=MK in ' + SRC)
with open(OUT, 'w') as f: json.dump({'areas': h.areas, 'border': h.border}, f, separators=(',', ':'))
print(len(h.areas), 'areas,', len(h.border), 'border rings →', OUT)
