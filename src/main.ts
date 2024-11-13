// ~------------------INTRO SETUP----------------~

// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

//wasnt getting unique generations
//source: Brace
const seed = Date.now().toString();

//TO-DO
////empty for now
//fix css for buttons and inv

// ~------------------INTERFACES-----------------~

interface Cell {
  readonly i: number;
  readonly j: number;
}

interface Coin {
  readonly i: number;
  readonly j: number;
  readonly serial: number;
}

// ~-------------------VARIABLES-----------------~

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

//Player inventory management and panel
const playerInv: Coin[] = [];
const invPanel = document.querySelector<HTMLDivElement>("#inventory")!;

// Update inventory display
updateInventoryDisplay();

//map for coins in caches
const cacheCoins = new Map<string, Coin[]>();

//map for known cells (flyweight)
const knownCells = new Map<string, Cell>();

// ~------------------FUNCTIONS------------------~

function getCanonicalCell(i: number, j: number): Cell {
  const key = `${i},${j}`;
  if (!knownCells.has(key)) {
    knownCells.set(key, { i, j });
  }

  return knownCells.get(key)!;
}

function latLngToCell(latLng: leaflet.LatLng): Cell {
  const i = Math.floor(latLng.lat / GRID_CELL_SIZE);
  const j = Math.floor(latLng.lng / GRID_CELL_SIZE);

  return getCanonicalCell(i, j);
}

//Create Cache
function createCache(cell: Cell) {
  const cacheLat = cell.i * GRID_CELL_SIZE;
  const cacheLng = cell.j * GRID_CELL_SIZE;
  const bounds = leaflet.latLngBounds([
    [cacheLat, cacheLng],
    [cacheLat + GRID_CELL_SIZE, cacheLng + GRID_CELL_SIZE],
  ]);

  const cacheRect = leaflet.rectangle(bounds).addTo(map);
  const cacheKey = `${cell.i},${cell.j}`;

  const numCoins = Math.floor(luck(`${cell.i},${cell.j}:coins`) * 10) + 1;
  const coins: Coin[] = [];

  for (let serial = 0; serial < numCoins; serial++) {
    coins.push({ i: cell.i, j: cell.j, serial });
  }
  cacheCoins.set(cacheKey, coins);

  cacheRect.bindPopup(() => createCachePopup(cell));
}

//Create Cache Popup
function createCachePopup(cell: Cell) {
  const cacheKey = `${cell.i},${cell.j}`;
  const coins = cacheCoins.get(cacheKey)!;

  const content = document.createElement("div");
  content.innerHTML = `
    <div>This cache at ${cacheKey} has <span id="coinCount">${coins.length}</span> coins:</div>
    <ul id="cacheCoinsList"></ul>
    <div class="popup-button-container">
      <button id="collectBtn">Collect</button>
      <button id="depositBtn">Deposit</button>
    </div>`;

  const cacheCoinsList = content.querySelector<HTMLUListElement>(
    "#cacheCoinsList",
  )!;
  coins.forEach((coin) => {
    const listItem = document.createElement("li");
    listItem.textContent = `${coin.i}:${coin.j}#${coin.serial}`;
    cacheCoinsList.appendChild(listItem);
  });

  content.querySelector<HTMLButtonElement>("#collectBtn")!.onclick = () => {
    if (coins.length > 0) {
      const coin = coins.pop()!;
      playerInv.push(coin);
      updateInventoryDisplay();
      cacheCoinsList.removeChild(cacheCoinsList.lastChild!);
      content.querySelector<HTMLSpanElement>("#coinCount")!.textContent = coins
        .length.toString();
    } else {
      alert("No coins left to collect!");
    }
  };

  content.querySelector<HTMLButtonElement>("#depositBtn")!.onclick = () => {
    if (playerInv.length > 0) {
      const coin = playerInv.pop()!;
      coins.push(coin);
      updateInventoryDisplay();
      const listItem = document.createElement("li");
      listItem.textContent = `${coin.i}:${coin.j}#${coin.serial}`;
      cacheCoinsList.appendChild(listItem);
      content.querySelector<HTMLSpanElement>("#coinCount")!.textContent = coins
        .length.toString();
    } else {
      alert("No coins to deposit!");
    }
  };

  return content;
}

//Update inventory panel
function updateInventoryDisplay() {
  invPanel.textContent = "Inventory:";
  const totalCoins = document.createElement("div");
  totalCoins.textContent = `Total Coins: ${playerInv.length}`;

  if (playerInv.length === 0) {
    invPanel.textContent += " (empty)";
  } else {
    invPanel.appendChild(totalCoins);

    const list = document.createElement("ul");
    playerInv.forEach((coin) => {
      const listItem = document.createElement("li");
      listItem.textContent = `${coin.i}:${coin.j}#${coin.serial}`;
      list.appendChild(listItem);
    });
    invPanel.appendChild(list);
  }
}

// ~------------------INITIALIZATION-------------~

//Create coins
const playerCell = latLngToCell(PLAYER_LOCATION);

for (let x = -CACHE_RADIUS; x <= CACHE_RADIUS; x++) {
  for (let y = -CACHE_RADIUS; y <= CACHE_RADIUS; y++) {
    const cell = getCanonicalCell(playerCell.i + x, playerCell.j + y);
    if (luck(`${seed}:${cell.i},${cell.j}`) <= CACHE_PROBABILITY) {
      createCache(cell);
    }
  }
}
