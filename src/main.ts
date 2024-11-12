// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

//wasnt getting unique generations
//source: Brace
const seed = Date.now().toString();

// Player Location
const PLAYER_LOCATION = leaflet.latLng(36.9895, -122.0627777);
const ZOOM = 19;
const GRID_CELL_SIZE = 0.0001;
const CACHE_RADIUS = 8;
const CACHE_PROBABILITY = 0.1;

const map = leaflet.map("map", {
  center: PLAYER_LOCATION,
  zoom: ZOOM,
  minZoom: ZOOM,
  maxZoom: ZOOM,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerIcon = leaflet.marker(PLAYER_LOCATION).addTo(map);
playerIcon.bindTooltip("Player's Location");

let playerInv = 0;
const invPanel = document.querySelector<HTMLDivElement>("#inventory")!;

// Update inventory display
updateInventoryDisplay();

const cacheData = new Map<string, number>();

function createCache(x: number, y: number) {
  const cacheLat = PLAYER_LOCATION.lat + x * GRID_CELL_SIZE;
  const cacheLng = PLAYER_LOCATION.lng + y * GRID_CELL_SIZE;
  const bounds = leaflet.latLngBounds([
    [cacheLat, cacheLng],
    [cacheLat + GRID_CELL_SIZE, cacheLng + GRID_CELL_SIZE],
  ]);

  const cacheRect = leaflet.rectangle(bounds).addTo(map);
  const cacheKey = `${x},${y}`;
  const initCoins = Math.floor(luck(`${cacheKey}:coins`) * 10) + 1;

  cacheData.set(cacheKey, initCoins);

  cacheRect.bindPopup(() => createCachePopup(cacheKey));
}

function createCachePopup(cacheKey: string) {
  const coinCount = cacheData.get(cacheKey)!;
  const content = document.createElement("div");
  content.innerHTML = `
    <div>This Cache is at ${cacheKey} and has <span id="coinCount">${coinCount}</span> coins</div>
    <br/>
    <button id="collectBtn">Collect</button>
    <br/>
    <button id="depositBtn">Deposit</button>`;

  content.querySelector<HTMLButtonElement>("#collectBtn")!.onclick = () => {
    if (cacheData.get(cacheKey)! > 0) {
      coinChange(cacheKey, -1);
      playerInv++;
      updateInventoryDisplay();
      content.querySelector<HTMLSpanElement>("#coinCount")!.textContent =
        cacheData.get(cacheKey)!.toString();
    } else {
      alert("No coins!");
    }
  };

  content.querySelector<HTMLButtonElement>("#depositBtn")!.onclick = () => {
    if (playerInv > 0) {
      coinChange(cacheKey, 1);
      playerInv--;
      updateInventoryDisplay();
      content.querySelector<HTMLSpanElement>("#coinCount")!.textContent =
        cacheData.get(cacheKey)!.toString();
    } else {
      alert("No coins to deposit!");
    }
  };

  return content;
}

function coinChange(cacheKey: string, amt: number) {
  const currCoins = cacheData.get(cacheKey)!;
  cacheData.set(cacheKey, currCoins + amt);
}

function updateInventoryDisplay() {
  invPanel.textContent = `Inventory: ${playerInv} coins`;
}

for (let x = -CACHE_RADIUS; x <= CACHE_RADIUS; x++) {
  for (let y = -CACHE_RADIUS; y <= CACHE_RADIUS; y++) {
    if (luck(`${seed}:${x},${y}`) <= CACHE_PROBABILITY) {
      createCache(x, y);
    }
  }
}
