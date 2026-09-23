# ABMS — Map, Functionality & UI Upgrade

## What changed
- Replaced the old schematic SVG network view with an interactive Leaflet map using Esri World Imagery satellite tiles.
- Added station labels and station-to-station route overlays.
- Added section task markers showing task counts and popup details for Pending/Ongoing/Completed/Scheduled tasks.
- Added real station names for a demo North India network, including the New Delhi–Chandigarh corridor and connected links.
- Added section coordinates to `data/sections.csv`.
- Emergency Maintenance now triggers automatic re-optimization after the task is added.
- What-if Simulation now returns and displays the isolated scenario result without changing the active plan.
- Simulation now validates that end time is after start time.
- Improved dashboard styling, hero section, navigation, status pills, cards, map presentation and visual hierarchy.

## Important prototype note
The station names and coordinates are representative demo mapping for the prototype. The satellite imagery is real, but the railway overlays are not live Indian Railways GIS track geometry. Production deployment should use authorized railway GIS/network data for exact track alignment and live asset/task locations.

## Map provider
The frontend uses Leaflet with Esri World Imagery and an Esri reference layer. Attribution is displayed on the map. See the Esri documentation for World Imagery and reference layers.
