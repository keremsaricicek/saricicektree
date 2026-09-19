import {feature} from 'topojson-client';
import topology from 'world-atlas/countries-50m.json';
// Real Natural Earth boundaries bundled with the app. No tile server or API key.
window.FamilyWorld=feature(topology,topology.objects.countries);
