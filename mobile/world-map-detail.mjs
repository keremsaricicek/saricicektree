import { feature } from "topojson-client";
import topology from "world-atlas/countries-50m.json";
// Full Natural Earth 1:50m country outline, loaded when a map is zoomed in (see familyWorldLayer in community.js).
window.FamilyWorldDetail = feature(topology, topology.objects.countries);
