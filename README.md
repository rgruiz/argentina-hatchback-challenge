# Argentina Hatchback Challenge

A retro 2000s-styled 3D browser racing game built with vanilla JavaScript and Three.js, set at the **Autódromo Oscar y Juan Gálvez (Buenos Aires)**.

## Features

- **Playable Argentine-Spec Hatchbacks** (custom procedural CAD spline-patch 3D models & stock-spec 5-speed manual physics):
  - **VW Polo Track MY25** — 1.6L MSI 16V (110 CV / 155 Nm)
  - **Peugeot 208 Like MT** — 1.3L Firefly 8V (96 CV / 125 Nm)
- **Two Autódromo de Buenos Aires Layouts**:
  - **Circuito N° 12** — *S del Ciervo, Recta del Lago, Curvón Salotto, Chicana de Ascari, La Horquilla (Parga)*
  - **Circuito N° 8** — *Curva Reutemann, Confitería, Curva del Ombú, El Tobogán, Ascari, La Horquilla*
- **Detailed Buenos Aires Surroundings**: Grandstands, pit complex, control tower, floodlights, multi-species trees, city horizon skyline, and the iconic **Torre Espacial**, with selectable Day / Sunset / Dusk lighting.
- **Race Modes**: 1v1 Race, 3-AI Grid Race, and Solo Practice, featuring equal stock car physics, slipstream drafting, randomized AI personalities, overtakes, divebombs, defensive lines, and barrier recovery.
- **Multiple Camera Views**: 3rd Person Chase, 3D Cockpit Interior (with left/back/right look), Hood/Bonnet, and Far Arcade Chase.

## Controls

| Action | Keys |
| --- | --- |
| Throttle / Brake | `W` / `S` or `↑` / `↓` |
| Steer | `A` / `D` or `←` / `→` |
| Shift Up / Down | `E` or `Shift` / `Q` or `Ctrl` |
| Handbrake | `Space` |
| Switch Camera | `C` |
| Look Left / Back / Right | `V` / `B` / `N` |
| Reset Car | `R` |
| Garage & Track Menu | `Esc` |

## Running Locally

No build step is required. Open `index.html` directly in a modern browser, or serve the folder locally:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.
