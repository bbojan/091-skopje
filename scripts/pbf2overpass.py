# -*- coding: utf-8 -*-
# The raw download without Overpass: builds the same "out geom" JSON as `npm run download` (the layers of
# data/query.overpassql, ways and relations with their full geometry) for a city's box from Geofabrik .osm.pbf
# extracts, for days when the Overpass servers are overloaded (Тетово, Брод and Ресен, Nov 2026: 5 of 42 tiles in
# 40 minutes). Checked against Overpass: the same building and road counts as a count query, the same elements
# in the tiles that did arrive (only edits newer than the mirror's snapshot differ).
#   python3 -m venv .venv && .venv/bin/pip install osmium          (once; not an npm dependency)
#   curl -L -o data/macedonia.osm.pbf https://download.geofabrik.de/europe/macedonia-latest.osm.pbf
#     (+ kosovo / albania / greece for boxes over the border; Greece is ~340 MB)
#   .venv/bin/python scripts/pbf2overpass.py S W N E data/<city>_raw.json data/macedonia.osm.pbf [data/albania.osm.pbf ...]
# S W N E: the city's bbox in scripts/config.ts. Then `npm run terrain` / `npm run data` as usual.
import json, re, sys
import osmium

S, W, N, E = map(float, sys.argv[1:5])
OUT = sys.argv[5]
FILES = sys.argv[6:]

def has(t, k): return k in t
def rx(t, k, pat): return k in t and re.search(pat, t[k]) is not None
def eq(t, k, v): return t.get(k) == v

def way_match(t):
    return (has(t, 'building') or has(t, 'building:part') or has(t, 'highway') or has(t, 'railway') or has(t, 'landuse')
            or has(t, 'leisure') or has(t, 'natural') or has(t, 'waterway')
            or rx(t, 'amenity', 'parking|school|university|place_of_worship|grave_yard') or rx(t, 'place', 'square')
            or has(t, 'area:highway') or rx(t, 'man_made', 'bridge|pier') or rx(t, 'power', 'switchgear|substation')
            or has(t, 'historic') or rx(t, 'barrier', 'city_wall|wall') or rx(t, 'man_made', 'cross'))
def rel_match(t):
    return has(t, 'building') or has(t, 'landuse') or has(t, 'leisure') or has(t, 'natural')
def node_match(t):
    return (eq(t, 'natural', 'tree') or rx(t, 'man_made', 'cross|tower|mast') or has(t, 'summit:cross') or eq(t, 'natural', 'peak')
            or rx(t, 'historic', 'memorial|monument') or eq(t, 'tourism', 'museum') or rx(t, 'amenity', 'theatre|townhall'))

def inside(lat, lon): return S <= lat <= N and W <= lon <= E
def seg_hits(a, b):
    # Liang–Barsky: does the segment a→b (lat, lon) cross the box?
    x0, y0, x1, y1 = a[1], a[0], b[1], b[0]
    dx, dy, t0, t1 = x1 - x0, y1 - y0, 0.0, 1.0
    for p, q in ((-dx, x0 - W), (dx, E - x0), (-dy, y0 - S), (dy, N - y0)):
        if p == 0:
            if q < 0: return False
        else:
            r = q / p
            if p < 0:
                if r > t1: return False
                t0 = max(t0, r)
            else:
                if r < t0: return False
                t1 = min(t1, r)
    return True
def geom_hits(g):
    pts = [p for p in g if p]
    if any(inside(p[0], p[1]) for p in pts): return True
    return any(seg_hits(pts[i], pts[i + 1]) for i in range(len(pts) - 1))

# pass 1: matching relations and the ways and nodes they need
rels = {}
need_ways, need_nodes = set(), set()
class R(osmium.SimpleHandler):
    def relation(self, r):
        t = {k: v for k, v in r.tags}
        if r.id in rels or not rel_match(t): return
        mem = [(m.type, m.ref, m.role) for m in r.members]
        rels[r.id] = (t, mem)
        for ty, ref, _ in mem:
            if ty == 'w': need_ways.add(ref)
            elif ty == 'n': need_nodes.add(ref)
for f in FILES: R().apply_file(f)
print('relations matching tags:', len(rels), file=sys.stderr)

# pass 2: ways (with locations) and nodes
ways, member_geom, nodes, node_ll = {}, {}, {}, {}
class H(osmium.SimpleHandler):
    def node(self, n):
        if n.id in need_nodes and n.location.valid(): node_ll[n.id] = (n.location.lat, n.location.lon)
        if not n.tags or n.id in nodes or not n.location.valid(): return
        t = {k: v for k, v in n.tags}
        if node_match(t) and inside(n.location.lat, n.location.lon): nodes[n.id] = {'type': 'node', 'id': n.id, 'lat': round(n.location.lat, 7), 'lon': round(n.location.lon, 7), 'tags': t}
    def way(self, w):
        g = None
        if w.id in need_ways or (w.id not in ways and w.tags):
            g = [(nd.location.lat, nd.location.lon) if nd.location.valid() else None for nd in w.nodes]
        if g is None: return
        if w.id in need_ways and (w.id not in member_geom or sum(1 for p in member_geom[w.id] if p) < sum(1 for p in g if p)): member_geom[w.id] = g
        if w.id in ways: return
        t = {k: v for k, v in w.tags}
        if t and way_match(t) and geom_hits(g):
            ways[w.id] = {'type': 'way', 'id': w.id, 'nodes': [nd.ref for nd in w.nodes], 'tags': t, '_g': g}
for f in FILES: H().apply_file(f, locations=True)

def gj(g): return [{'lat': round(p[0], 7), 'lon': round(p[1], 7)} if p else None for p in g]
out = list(nodes.values())
for w in ways.values():
    g = w.pop('_g'); w['geometry'] = gj(g); out.append(w)
nrel = 0
for rid, (t, mem) in rels.items():
    hit = False; members = []
    for ty, ref, role in mem:
        if ty == 'w':
            g = member_geom.get(ref)
            m = {'type': 'way', 'ref': ref, 'role': role}
            if g: m['geometry'] = gj(g); hit = hit or geom_hits(g)
            members.append(m)
        elif ty == 'n':
            m = {'type': 'node', 'ref': ref, 'role': role}
            if ref in node_ll: m['lat'], m['lon'] = node_ll[ref]; hit = hit or inside(*node_ll[ref])
            members.append(m)
        else: members.append({'type': 'relation', 'ref': ref, 'role': role})
    if hit: out.append({'type': 'relation', 'id': rid, 'members': members, 'tags': t}); nrel += 1
json.dump({'version': 0.6, 'generator': 'pbf2overpass (Geofabrik extracts)', 'elements': out}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'nodes {len(nodes)}, ways {len(ways)}, relations {nrel} -> {OUT}', file=sys.stderr)
