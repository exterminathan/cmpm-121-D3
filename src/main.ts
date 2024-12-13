// ~------------------INTRO SETUP----------------~

// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

//Source image imports

// @ts-ignore <it literally won't work without this>
import playerIconImage from "../assets/location.png";

// @ts-ignore <it literally won't work without this again>
import markerIconImage from "../assets/marker64.png";

//wasnt getting unique generations
//source: Brace
const seed = Date.now().toString();

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
let playerLocation = leaflet.latLng(36.9895, -122.0627777);

const ZOOM = 19;
const GRID_CELL_SIZE = 0.0001;
const CACHE_RADIUS = 8;
const CACHE_PROBABILITY = 0.1;

const map = leaflet.map("map", {
  center: playerLocation,
  zoom: ZOOM,
  minZoom: ZOOM,
  maxZoom: ZOOM,
  zoomControl: false,
  scrollWheelZoom: false,
});

//custom dark map
//had to approve github.io domain in stadiamaps dev console
leaflet
  .tileLayer(
    "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    {
      minZoom: 0,
      maxZoom: 20,
      attribution:
        '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    } as leaflet.TileLayerOptions,
  )
  .addTo(map);

//custom player icon
const playerIconCustom = leaflet.icon({
  iconUrl: playerIconImage,
  iconSize: [35, 49],
  iconAnchor: [17.5, 49],
  popupAnchor: [0, -24.5],
});

const playerIcon = leaflet.marker(playerLocation, {
  icon: playerIconCustom,
  zIndexOffset: 1000,
}).addTo(map);

playerIcon.bindTooltip("Player's Location");

//Player inventory management and panel
const playerInv: Coin[] = [];
const invPanel = document.querySelector<HTMLDivElement>("#inventory")!;

// custom geocache icons
const geocacheIconSmall = leaflet.icon({
  iconUrl: markerIconImage,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const geocacheIconMed = leaflet.icon({
  iconUrl: markerIconImage,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

const geocacheIconLarge = leaflet.icon({
  iconUrl: markerIconImage,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

// gelocation tracker
let geoWatchID: number | null = null;

let movementHist: leaflet.LatLng[] = [];

let movementPolyline: leaflet.Polyline | null = null;

// Update inventory display
updateInventoryDisplay();

//map for coins in caches
let cacheCoins = new Map<string, Coin[]>();

//map for known cells (flyweight)
const knownCells = new Map<string, Cell>();

//map for cache rectangles
const cacheMarkers = new Map<string, leaflet.Marker>();

//set of visible cache keys
let visibleCacheKeys = new Set<string>();

//Initial DPad visibility state
let isDPadVisible = true;

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
  const cacheKey = `${cell.i},${cell.j}`;
  if (cacheMarkers.has(cacheKey)) {
    return;
  }

  const cacheLat = cell.i * GRID_CELL_SIZE;
  const cacheLng = cell.j * GRID_CELL_SIZE;

  // check for cache state
  if (!cacheCoins.has(cacheKey)) {
    const numCoins = Math.floor(luck(`${cell.i},${cell.j}:coins`) * 10) + 1;
    const coins: Coin[] = [];

    for (let serial = 0; serial < numCoins; serial++) {
      coins.push({ i: cell.i, j: cell.j, serial });
    }
    cacheCoins.set(cacheKey, coins);
  }

  const coins = cacheCoins.get(cacheKey)!;

  // icon pick based on num coins
  let iconToUse = geocacheIconSmall;
  if (coins.length > 3 && coins.length <= 7) {
    iconToUse = geocacheIconMed;
  } else if (coins.length > 7) {
    iconToUse = geocacheIconLarge;
  }

  const cacheMarker = leaflet.marker([cacheLat, cacheLng], {
    icon: iconToUse,
  }).addTo(map);

  cacheMarkers.set(cacheKey, cacheMarker);

  cacheMarker.bindPopup(() => createCachePopup(cell));
}

//Create Cache Popup
function createCachePopup(cell: Cell) {
  const cacheKey = `${cell.i},${cell.j}`;
  const coins = cacheCoins.get(cacheKey)!;

  const content = document.createElement("div");
  content.className = "popup-content";
  content.innerHTML = `
    <div>This cache at ${cacheKey} has <span id="coinCount">${coins.length}</span> coins:</div>
    <ul id="cacheCoinsList"></ul>
  `;

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "popup-button-container";

  // collect button
  const collectBtn = document.createElement("button");
  collectBtn.textContent = "Collect";
  collectBtn.className = "collect-deposit-btn";

  collectBtn.onclick = () => {
    if (coins.length > 0) {
      const coin = coins.pop()!;
      playerInv.push(coin);
      updateInventoryDisplay();
      cacheCoinsList.removeChild(cacheCoinsList.lastChild!);
      content.querySelector<HTMLSpanElement>("#coinCount")!.textContent = coins
        .length.toString();
      saveGameState();
    } else {
      createNotification("No coins left to collect!");
    }
  };

  // deposit button
  const depositBtn = document.createElement("button");
  depositBtn.textContent = "Deposit";
  depositBtn.className = "collect-deposit-btn";

  depositBtn.onclick = () => {
    if (playerInv.length > 0) {
      const coin = playerInv.pop()!;
      coins.push(coin);
      updateInventoryDisplay();
      const listItem = document.createElement("li");
      listItem.textContent = `${coin.i}:${coin.j}#${coin.serial}`;
      cacheCoinsList.appendChild(listItem);
      content.querySelector<HTMLSpanElement>("#coinCount")!.textContent = coins
        .length.toString();
      saveGameState();
    } else {
      createNotification("No coins to deposit!");
    }
  };

  //attach button containers
  buttonContainer.appendChild(collectBtn);
  buttonContainer.appendChild(depositBtn);
  content.appendChild(buttonContainer);

  const cacheCoinsList = content.querySelector<HTMLUListElement>(
    "#cacheCoinsList",
  )!;
  coins.forEach((coin) => {
    const listItem = document.createElement("li");
    listItem.textContent = `${coin.i}:${coin.j}#${coin.serial}`;
    cacheCoinsList.appendChild(listItem);
  });

  return content;
}

//Update inventory panel
function updateInventoryDisplay() {
  invPanel.innerHTML = "";

  //create header section
  const header = document.createElement("div");
  header.id = "inventoryHeader";
  header.innerHTML = `
    <div>Inventory</div>
    <div id="totalCoins">Total Coins: ${playerInv.length}</div>
  `;
  invPanel.appendChild(header);

  //create list container
  const listContainer = document.createElement("div");
  listContainer.id = "coinList";

  if (playerInv.length === 0) {
    listContainer.textContent = "(empty)";
  } else {
    const list = document.createElement("ul");
    playerInv.forEach((coin) => {
      const listItem = document.createElement("li");
      listItem.textContent = `${coin.i}:${coin.j}#${coin.serial}`;

      //special stuff
      listItem.style.cursor = "pointer";
      listItem.onclick = () => {
        const cacheLat = coin.i * GRID_CELL_SIZE;
        const cacheLng = coin.j * GRID_CELL_SIZE;
        const cacheLatLng = leaflet.latLng(cacheLat, cacheLng);
        map.setView(cacheLatLng, ZOOM);

        const cacheKey = `${coin.i},${coin.j}`;
        if (cacheMarkers.has(cacheKey)) {
          cacheMarkers.get(cacheKey)!.openPopup();
        } else {
          const cell = getCanonicalCell(coin.i, coin.j);
          createCache(cell);
          cacheMarkers.get(cacheKey)!.openPopup();
        }
      };

      list.appendChild(listItem);
    });
    listContainer.appendChild(list);
  }

  invPanel.appendChild(listContainer);
}

// generate caches as player moves
function generateCaches() {
  const newCacheKeys = new Set<string>();

  const playerLoc = latLngToCell(playerLocation);

  for (let x = -CACHE_RADIUS; x <= CACHE_RADIUS; x++) {
    for (let y = -CACHE_RADIUS; y <= CACHE_RADIUS; y++) {
      const cell = getCanonicalCell(playerLoc.i + x, playerLoc.j + y);
      const cacheKey = `${cell.i},${cell.j}`;

      if (cacheCoins.has(cacheKey)) {
        createCache(cell);
        newCacheKeys.add(cacheKey);
      } else if (luck(`${seed}:${cell.i},${cell.j}`) <= CACHE_PROBABILITY) {
        createCache(cell);
        newCacheKeys.add(cacheKey);
      }
    }
  }

  // remove non visibile caches
  for (const cacheKey of visibleCacheKeys) {
    if (!newCacheKeys.has(cacheKey)) {
      const cacheMarker = cacheMarkers.get(cacheKey);
      if (cacheMarker) {
        map.removeLayer(cacheMarker);
        cacheMarkers.delete(cacheKey);
      }
    }
  }

  visibleCacheKeys = newCacheKeys;

  map.invalidateSize();
}

// move player
function movePlayer(dLat: number, dLng: number) {
  const newLocation = leaflet.latLng(
    playerLocation.lat + dLat,
    playerLocation.lng + dLng,
  );

  movePlayerDirect(newLocation);
}

//move player directly to specific location
function movePlayerDirect(newLocation: leaflet.LatLng) {
  playerLocation = newLocation;

  movementHist.push(newLocation);

  if (movementPolyline) {
    movementPolyline.addLatLng(newLocation);
  } else {
    movementPolyline = leaflet.polyline(movementHist, { color: "red" }).addTo(
      map,
    );
  }

  playerIcon.setLatLng(playerLocation);
  map.panTo(playerLocation);
  generateCaches();

  saveGameState();
}

//geolocation functions
function startGeolocation() {
  if (navigator.geolocation) {
    geoWatchID = navigator.geolocation.watchPosition((position) => {
      const newLat = position.coords.latitude;
      const newLng = position.coords.longitude;
      const newLoc = leaflet.latLng(newLat, newLng);
      movePlayerDirect(newLoc);
    }, (error) => {
      console.error("cant geolocate:", error);
      alert("couldn't get geolocation.");
    }, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    });
  } else {
    alert("geolocation no working");
  }
}

function stopGeolocation() {
  if (geoWatchID !== null) {
    navigator.geolocation.clearWatch(geoWatchID);
    geoWatchID = null;
  }
}

function toggleDPadVisibility(show: boolean) {
  const dpadButtons = document.getElementById("dpadButtons")!;
  if (show) {
    dpadButtons.style.visibility = "visible";
  } else {
    dpadButtons.style.visibility = "hidden";
  }
}

function resetGameState() {
  stopGeolocation();

  //reset gelocation button appearance
  const geoButton = document.getElementById("geoButton")!;
  geoButton.textContent = "🌐";
  geoButton.style.color = "";

  toggleDPadVisibility(true);

  playerLocation = leaflet.latLng(36.9895, -122.0627777);

  //clear movement hist
  movementHist = [playerLocation];
  if (movementPolyline) {
    map.removeLayer(movementPolyline);
    movementPolyline = null;
  }

  playerInv.length = 0;

  cacheCoins.clear();

  knownCells.clear();

  cacheMarkers.forEach((marker) => {
    map.removeLayer(marker);
  });
  cacheMarkers.clear();
  visibleCacheKeys.clear();

  playerIcon.setLatLng(playerLocation);
  map.panTo(playerLocation);

  generateCaches();

  updateInventoryDisplay();

  localStorage.removeItem("geocoinGameState");

  map.invalidateSize();
}

// ~---------NOTIFICATION FUNCTIONS--------------~

function createInteractiveNotification(
  message: string,
  onConfirm: () => void,
  onCancel: () => void,
) {
  const notification = document.createElement("div");
  notification.className = "interactive-notification";
  notification.innerHTML = `
    <p>${message}</p>
    <div class="notification-buttons">
      <button id="confirmButton">Confirm</button>
      <button id="cancelButton">Cancel</button>
    </div>
  `;

  document.body.appendChild(notification);

  const confirmBtn = notification.querySelector<HTMLButtonElement>(
    "#confirmButton",
  )!;
  const cancelBtn = notification.querySelector<HTMLButtonElement>(
    "#cancelButton",
  )!;

  confirmBtn.onclick = () => {
    onConfirm();
    closeNotification(notification);
  };

  cancelBtn.onclick = () => {
    onCancel();
    closeNotification(notification);
  };
}

function createNotification(message: string) {
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("fade-out");
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 1000);
  }, 2000);
}

function closeNotification(notification: HTMLElement) {
  notification.classList.add("fade-out");
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 1000);
}

// ~---------------GAME SAVING-------------------~

// Save game state to localStorage
function saveGameState() {
  const gameState = {
    playerLocation: {
      lat: playerLocation.lat,
      lng: playerLocation.lng,
    },
    movementHist: movementHist.map((latlng) => ({
      lat: latlng.lat,
      lng: latlng.lng,
    })),
    playerInv: playerInv.map((coin) => ({ ...coin })),
    cacheCoins: Array.from(cacheCoins.entries()),
  };

  localStorage.setItem("geocoinGameState", JSON.stringify(gameState));
}

// Load game state from localStorage
function loadGameState() {
  const savedState = localStorage.getItem("geocoinGameState");

  if (savedState) {
    const gameState = JSON.parse(savedState);

    // Restore player location
    playerLocation = leaflet.latLng(
      gameState.playerLocation.lat,
      gameState.playerLocation.lng,
    );

    // Restore movement history
    movementHist = gameState.movementHist.map(
      (loc: { lat: number; lng: number }) => leaflet.latLng(loc.lat, loc.lng),
    );

    if (movementHist.length > 0) {
      movementPolyline = leaflet.polyline(movementHist, { color: "red" }).addTo(
        map,
      );
    }

    // Restore player inventory
    playerInv.length = 0;
    gameState.playerInv.forEach((coin: Coin) => {
      playerInv.push(coin);
    });

    // Restore cache coins
    cacheCoins.clear();
    cacheCoins = new Map(gameState.cacheCoins);

    updateInventoryDisplay();

    // Refresh player icon and map position
    playerIcon.setLatLng(playerLocation);
    map.panTo(playerLocation);

    const playerCell = latLngToCell(playerLocation);
    cacheCoins.forEach((_, cacheKey) => {
      const [i, j] = cacheKey.split(",").map(Number);
      const cell = getCanonicalCell(i, j);

      if (
        Math.abs(cell.i - playerCell.i) <= CACHE_RADIUS &&
        Math.abs(cell.j - playerCell.j) <= CACHE_RADIUS
      ) {
        createCache(cell);
      }
    });
  } else {
    generateCaches();
  }
}

// ~--------------INITIALIZATION-----------------~
loadGameState();

if (movementHist.length === 0) {
  movementHist.push(playerLocation);
}

// ~-------------------LISTENERS-----------------~
const northButton = document.getElementById("moveNorth")!;
const southButton = document.getElementById("moveSouth")!;
const eastButton = document.getElementById("moveEast")!;
const westButton = document.getElementById("moveWest")!;

northButton.addEventListener("click", () => movePlayer(GRID_CELL_SIZE, 0));
southButton.addEventListener("click", () => movePlayer(-GRID_CELL_SIZE, 0));
eastButton.addEventListener("click", () => movePlayer(0, GRID_CELL_SIZE));
westButton.addEventListener("click", () => movePlayer(0, -GRID_CELL_SIZE));

// Geolocation and reset buttons
const geoButton = document.getElementById("geoButton")!;
const resetButton = document.getElementById("resetButton")!;

geoButton.addEventListener("click", () => {
  if (geoWatchID === null) {
    startGeolocation();
    geoButton.textContent = "🌐 (ON)";
    geoButton.style.color = "white";
    toggleDPadVisibility(false);
  } else {
    stopGeolocation();
    geoButton.textContent = "🌐";
    geoButton.style.color = "";
    toggleDPadVisibility(true);
  }
});

resetButton.addEventListener("click", () => {
  createInteractiveNotification(
    "Are you sure you want to reset the game state?",
    () => {
      resetGameState();
      createNotification("Game reset successfully!");
    },
    () => {
      createNotification("Reset canceled.");
    },
  );
});

const toggleDPadButton = document.getElementById("toggleDPad")!;
toggleDPadButton.addEventListener("click", () => {
  isDPadVisible = !isDPadVisible;
  toggleDPadVisibility(isDPadVisible);
});

// doesn't work though, button is currently disabled
const resetLocationButton = document.getElementById("resetLocation")!;
resetLocationButton.addEventListener("click", () => {
  if (playerLocation) {
    map.setView(playerLocation, ZOOM);
    createNotification("Map centered on player!");
  } else {
    createNotification("Player location not available.");
  }
});
