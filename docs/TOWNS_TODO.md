# Towns to do

**Finished: 11 maps on the site** (v11.0.0, 2026-11-21): 091 Скопје, 043 Кавадарци, 097 Битола,
096 Охрид (with Струга), 048 Прилеп, 098 Крушево, 042 Ростуше (with Дебар and Маврово),
033 Македонска Каменица (with Саса), 034 Дојран, 02 Батинци, 033 Берово (with Пехчево). Details in the
first table below.

**To do: 14 new maps** (8 shared, 6 single) **and Скопје widened** (east, west, north, with Матка), planned with the owner on 2026-11-21. None is started;
Тетово is next. How to build one: [ADDING_A_CITY.md](ADDING_A_CITY.md).

Coordinates are approximate, written from memory while planning: **check every point in OSM before
drawing a bbox**. Badge codes are the owner's own choice, not always the phone code (Bitola 097,
Ohrid 096, Prilep 048, Kruševo 098): ask for each one when it is started.

## Finished: on the site (11 maps)

| Map | Also on it | `?city=` | bbox (s, w, n, e) |
|---|---|---|---|
| 091 Скопје | — | — | 41.955, 21.33, 42.055, 21.525 |
| 043 Кавадарци | Тиквешко Езеро | `kavadarci` | 41.25, 21.85, 41.462, 22.062 |
| 097 Битола | Хераклеа | `bitola` | 40.955, 21.165, 41.085, 21.40 |
| 096 Охрид | Струга, the whole lake | `ohrid` | 40.885, 20.615, 41.205, 20.845 |
| 048 Прилеп | Маркови Кули, Трескавец | `prilep` | 41.31, 21.49, 41.41, 21.63 |
| 098 Крушево | — | `krusevo` | 41.33, 21.19, 41.405, 21.31 |
| 042 Ростуше | Бигорски, Дебар, Маврово | `rostuse` | 41.39, 20.49, 41.725, 20.815 |
| 033 Македонска Каменица | Саса, Калиманци | `kamenica` | 41.945, 22.495, 42.125, 22.71 |
| 034 Дојран | the whole lake | `dojran` | 41.15, 22.66, 41.27, 22.82 |
| 02 Батинци | Марков манастир | `batinci` | 41.875, 21.385, 41.955, 21.545 |
| 033 Берово | Пехчево, Беровско Езеро | `berovo` | 41.65, 22.82, 41.778, 22.94 |

## Planned maps

### 1. 094 Тетово — next

- **On it:** Тетово, Гостивар, Вруток, Шар Планина (Попова Шапка, Титов Врв).
- **Code:** **094** (decided). `?city=tetovo`, likely v12.0.0.
- **Extent:** **edge to edge with Ростуше** (decided): s = 41.725 (Rostuše's n). Draft: s 41.725,
  w ~20.72, n ~42.06, e ~21.06 (about 37 × 28 km), 20 m cells, `smooth: 1` (as Rostuše).
  Љуботен (42.19 N) is left out.
- **Landmarks:** Шарена џамија (painted façade), Арабати баба теке, Тетовско кале, Лешочки манастир;
  Гостивар's clock tower; the source of the Вардар at Вруток (springs, pools), ХЕЦ Вруток;
  Попова Шапка (ski lifts, hotels), Титов Врв, glacial lakes (Боговињско Езеро, `waterLevels`).
- **Per city:** `snowLabel` „снег на Шар“; the Шарпланинец companion is at home here; refill at the Вардар
  source and the glacial lakes; banners e.g. „Шар Планина го спаси Тетово!“ / „Поздрав од Полог!“.
- **Data:** ski lifts need aerialways (Skopje's gondola is a separate download, `data/aerialway.json`);
  Overture outlines for the Полог villages.
- **Open:** landmark priorities, the developer for the LinkedIn button.

### 2. Кратово

- **On it:** Кратово, Пробиштип, Злетово (Лесновски манастир between them).
- **Code:** open (phone codes 031 / 032). `?city=kratovo`.
- **Extent:** Kratovo 42.08 N 22.18 E, Probištip 41.995 N 22.18 E, Лесново 42.03 N 22.25 E.
  Draft: s ~41.94, w ~22.08, n ~42.13, e ~22.30. s 41.94 meets the Штип map.
- **Landmarks:** the town in its volcanic crater, medieval towers, stone bridges; Лесново monastery.

### 3. Штип

- **On it:** Штип, Кочани, Радовиш, Виница (at the east edge).
- **Name / code:** open (likely Штип, `?city=stip`).
- **Extent:** Štip 41.74 N 22.19 E, Kočani 41.92 N 22.41 E, Radoviš 41.64 N 22.46 E,
  Vinica 41.88 N 22.51 E. Draft: s ~41.60, w ~22.12, n ~41.94, e ~22.56 (about 43 × 38 km), 20 m cells.
  n 41.94 meets Кратово; s 41.60 meets Неготино.
- **Landmarks:** Исар and Св. Архангел Михаил, Безистен, the Брегалница; Кочани's rice fields (painted like
  Kavadarci's vineyards, `farmMask`), clock tower; Радовиш's centre; Виничко Кале (terracotta icons).

### 4. Струмица

- **On it:** Струмица, Валандово, Гевгелија (Богданци falls inside too).
- **Name / code:** open (likely Струмица, `?city=strumica`).
- **Extent:** Strumica 41.44 N 22.64 E, Valandovo 41.32 N 22.56 E, Gevgelija 41.14 N 22.50 E,
  Bogdanci 41.20 N 22.57 E. Draft: s ~41.10, w ~22.40, n ~41.50, e 22.66–22.75 (about 44 km tall), 20 m cells.
- **Open:** east edge. e = 22.66 is edge to edge with Дојран but leaves out Колешино waterfall (22.81);
  further east overlaps Дојран's map.
- **Landmarks:** Царевите кули, Водоча and Вељуса monasteries (`byzChurch`), Колешино if inside;
  the Vardar plain at Гевгелија, the Богданци wind farm.

### 5. Неготино

- **On it:** Неготино, Демир Капија, Криволак.
- **Name / code:** open (likely Неготино, `?city=negotino`).
- **Extent:** Negotino 41.48 N 22.09 E, Demir Kapija 41.41 N 22.24 E, Krivolak ~41.53 N ~22.08 E.
  Draft: s ~41.36, w 22.00–22.062, n ~41.60, e ~22.32 (about 27 × 23 km). n 41.60 meets Штип.
- **Open:** west edge. w = 22.062 is edge to edge with Кавадарци but puts Неготино at the very edge;
  further west overlaps Кавадарци's map.
- **Landmarks:** the Демир Капија gorge (the Vardar between cliffs), vineyards (`vineyards` / `vineShare`),
  Попова Кула winery, the Vardar and the railway.

### 6. Куманово

- **On it:** Куманово, Глажња lake (above Липково), Скачковце.
- **Code:** open (phone code 031). `?city=kumanovo`.
- **Extent:** Kumanovo 42.13 N 21.71 E, Глажња ~42.20 N ~21.58 E, Скачковце (find in OSM; widen the box
  to take it in). Draft: s ~42.08, w ~21.50, n ~42.25, e ~21.78. Skopje's map ends at n 42.055 today; once
  Скопје is widened north (below), make the two meet instead of overlapping.
- **Open:** Кокино (42.26 N 21.96 E) and Старо Нагоричане (42.20 N 21.83 E) are east of the box;
  including them makes the map much wider.
- **Landmarks:** Св. Никола; the lake and its dam (`waterLevels` if needed).

### 7. Ресен

- **On it:** Ресен, the whole of Преспанско Езеро (Albanian and Greek shores too, as Ohrid's map
  reaches into Albania), Голем Град.
- **Code:** open (phone code 047). `?city=resen`.
- **Extent:** Resen 41.09 N 21.01 E; Great Prespa ~40.75–41.05 N, 20.90–21.13 E. Draft: s ~40.70,
  w 20.845, n ~41.13, e 21.165 (about 48 × 27 km), 20 m cells. **Edge to edge with Охрид** (its e 20.845)
  **and Битола** (its w 21.165), Галичица between the two lakes.
- **Open:** whether Мала Преспа is included (s ~40.70 takes it in).
- **Landmarks:** Сарај, Голем Град (ruins), Курбиново, shore villages, apple orchards. Lake level by hand
  (`waterLevels`, as Dojran).

### 8. Македонски Брод

- **On it:** Македонски Брод, the whole of Козјак lake and Света Петка lake (Треска), Солунска Глава
  (Јакупица), Зрзе monastery. **Not Матка** (decided): Матка goes on the widened Скопје map.
- **Name / code:** open (`?city=brod`).
- **Extent:** Brod 41.51 N 21.22 E, Солунска Глава ~41.70 N ~21.38 E, Зрзе ~41.47 N ~21.35 E,
  Козјак dam ~41.87–41.90 N, Света Петка lake just below Матка (all to check). Draft: s ~41.45, w ~21.12,
  e ~21.42, n just past Света Петка's dam (about 50 × 25 km), 20 m cells. The north edge should meet the
  widened Скопје map's south edge, between Света Петка and Матка.
  e above 21.385 overlaps Батинци's north-east corner; Крушево's n is 41.405, Прилеп's w 21.49.
- **Landmarks:** Зрзе on its cliff, the Козјак and Света Петка dams, Пешна cave and Брод on the Треска,
  Солунска Глава's summit.

### 9. Скопје widened (east, west, north)

- **What:** the existing 091 Скопје map grows east, west and north. **Матка** (canyon, lake, dam,
  Св. Андреј, ~41.95 N 21.30 E) comes onto it.
- **Today:** s 41.955, w 21.33, n 42.055, e 21.525.
- **Edges to settle:** Матка lies at or just below the present south edge, so widening west alone may
  cut it: the west strip probably has to reach a little south (to meet the Брод map). North and east
  move toward the Куманово map: decide where the two meet. The south edge stays on Батинци's n (41.955).
- **Caution:** Скопје is the reference map. Its terrain settings are "unchanged since v1 (the reference
  images depend on it)", and every release checks that Скопје stays pixel-identical. Widening it changes
  every view, so the pixel check needs a new baseline taken on purpose, and the saved camera links,
  views and labels need checking. Ask the owner before starting.

### Maps of their own

Each gets a map of its own (decided); codes open.

| Town | ~Centre | Neighbours to keep in mind | Notes |
|---|---|---|---|
| Велес | 41.72 N 21.79 E | — | Св. Пантелејмон, clock tower, Vardar bridges, the town on its slopes |
| Свети Николе | 41.87 N 21.94 E | — | Овче Поле |
| Кичево | 41.51 N 20.96 E | Брод map to the east | Пречиста monastery |
| Демир Хисар | 41.22 N 21.20 E | between Битола (n 41.085) and Крушево (s 41.33) | Слепче, Смилево |
| Делчево | 41.97 N 22.77 E | just east of Каменица (e 22.71): can be edge to edge | Голак |
| Крива Паланка | 42.20 N 22.33 E | north-east of Кратово (n ~42.13) | Осогово monastery |

## Not placed yet

- **Градско and Стоби** (Roman and early Christian city, ~41.55 N 21.97 E): between Велес and Неготино.
  Either widen Неготино's map west or stretch Велес's south-east.
- **Вевчани** (~41.24 N 20.59 E): about 2 km west of Охрид's map (w 20.615); widen Охрид's map or leave it.
- **Росоман** (~41.52 N 21.95 E): just north of Кавадарци's map (n 41.462).
- **Кокино** (megalithic observatory, ~42.26 N 21.96 E) and **Старо Нагоричане**: east of the Куманово box;
  widen Куманово's map or leave them out.
- **Смоларски водопад** and **Ново Село** (~41.37 N 22.94 E): east of the Струмица map, south of Берово's.
- **Дебарца** (Белчишта, ~41.30 N 20.83 E, Пештани's hills): a gap between Охрид (n 41.205), Ростуше
  (s 41.39) and Кичево.
- **Pelagonia between Прилеп and Крушево** (Долнени, Кривогаштани): villages, a gap between the two maps.

Other municipality seats (Лозово, Чашка, Ранковце, Василево, Босилово, Ново Село, Конче, …) are villages;
most fall on one of the maps above.
