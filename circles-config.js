///////////////////////////////////////////////////////
// CONFIG
///////////////////////////////////////////////////////

const LOOP_THRESHOLD = 50;
const STAGE_ORBIT_RADIUS_FACTOR = 1.2;     // distance of parked spheres from center
const STAGE_SPHERE_RADIUS_FACTOR = 0.18;    // radius of parked spheres relative to main sphere

// Stage points per stage index, 0..8
const STAGE_POINTS = [1, 1, 1, 2, 2, 2, 2, 3, 0];

const LOOPS = [12, 10, 6, 40, 18, 7, 12, 4, 100];

// Per stage color palettes: STAGE_PALETTES[stageIndex][ringIndex]
const STAGE_PALETTES = [
    // Stage 0
    ["#70ffa3", "#6ef4ff", "#a98bff", "#ff7bd9", "#ffc857", "#f25f5c"],
    // Stage 1
    ["#c5e1a5", "#aed581", "#9ccc65", "#8bc34a", "#7cb342"],
    // Stage 2
    ["#ff6b6b", "#ffca57", "#ff9ff3", "#48dbff", "#1dffa1"],
    // Stage 3
    ["#e0f7fa", "#b2ebf2", "#80deea", "#4dd0e1", "#26c6da"],
    // Stage 4
    ["#f8bbd0", "#f48fb1", "#f06292", "#ec407a", "#d81b60"],
    // Stage 5
    ["#ffb3ba", "#ffdfba", "#ffffba", "#baffc9", "#bae1ff"],
    // Stage 6
    ["#d1c4e9", "#b39ddb", "#9575cd", "#7e57c2", "#673ab7"],
    // Stage 7
    ["#ffe082", "#ffd54f", "#ffca28", "#ffc107", "#ffb300"],
    // Stage 8 (final)
    ["#ffffff", "#e0e0e0", "#bdbdbd", "#9e9e9e", "#757575"]
];