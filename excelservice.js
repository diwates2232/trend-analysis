
const xlsx = require("xlsx");
const path = require("path");
const ping = require("ping");
const pLimit = require("p-limit");

// Paths for Excel files
const archiverPath = path.join(__dirname, "../data/ArchiverData.xlsx");
const controllerPath = path.join(__dirname, "../data/ControllerData.xlsx");
const cameraPath = path.join(__dirname, "../data/CameraData.xlsx");
const serverPath = path.join(__dirname, "../data/ServerData.xlsx");

// Cache to store preloaded data
let allData = {};

// Function to normalize column headers
const normalizeHeaders = (data) => {
    return data.map((row) => {
        const normalizedRow = {};
        for (const key in row) {
            const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
            normalizedRow[normalizedKey] = row[key];
        }
        return normalizedRow;
    });
};

// Load Excel data

const loadExcelData = () => {
    if (Object.keys(allData).length === 0) { 
        try {
            const archiverWorkbook = xlsx.readFile(archiverPath);
            const controllerWorkbook = xlsx.readFile(controllerPath);
            const cameraWorkbook = xlsx.readFile(cameraPath);
            const serverWorkbook = xlsx.readFile(serverPath);

            allData = {
                archivers: normalizeHeaders(xlsx.utils.sheet_to_json(archiverWorkbook.Sheets[archiverWorkbook.SheetNames[0]])),
                controllers: normalizeHeaders(xlsx.utils.sheet_to_json(controllerWorkbook.Sheets[controllerWorkbook.SheetNames[0]])),
                cameras: normalizeHeaders(xlsx.utils.sheet_to_json(cameraWorkbook.Sheets[cameraWorkbook.SheetNames[0]])),
                servers: normalizeHeaders(xlsx.utils.sheet_to_json(serverWorkbook.Sheets[serverWorkbook.SheetNames[0]])),
            };

            console.log("Excel Data Loaded.");
        } catch (error) {
            console.error("Error loading Excel data:", error.message);
        }
    }
};




// Fetch all IP addresses
const fetchAllIpAddress = () => {
    const merged = [...allData.cameras, ...allData.archivers, ...allData.controllers, ...allData.servers];
    return merged.map(device => device.ip_address);
};

// Fetch global summary and details

const fetchGlobalData = async () => {
    const devices = {
        cameras: allData.cameras,
        archivers: allData.archivers,
        controllers: allData.controllers,
        servers: allData.servers,
    };

    await pingDevices([...devices.cameras, ...devices.archivers, ...devices.controllers, ...devices.servers]);

    const summary = calculateSummary(devices);
    return { summary, details: devices };
};


// Fetch region-wise summary and details
const fetchRegionData = async (regionName) => {
    const normalizedRegion = regionName.trim().toLowerCase();

    const devices = {
        cameras: allData.cameras.filter(row => row.location?.trim().toLowerCase() === normalizedRegion),
        archivers: allData.archivers.filter(row => row.location?.trim().toLowerCase() === normalizedRegion),
        controllers: allData.controllers.filter(row => row.location?.trim().toLowerCase() === normalizedRegion),
        servers: allData.servers.filter(row => row.location?.trim().toLowerCase() === normalizedRegion),
    };

    await pingDevices([...devices.cameras, ...devices.archivers, ...devices.controllers, ...devices.servers]);

    const summary = calculateSummary(devices);
    return { summary, details: devices };
};


// Calculate summary
const calculateSummary = (devices) => {
    const summary = {};

    for (const [key, deviceList] of Object.entries(devices)) {
        const total = deviceList.length;
        const online = deviceList.filter(device => device.status === "Online").length;
        const offline = total - online;

        summary[key] = { total, online, offline };
    }

    return {
        totalDevices: Object.values(summary).reduce((sum, { total }) => sum + total, 0),
        totalOnlineDevices: Object.values(summary).reduce((sum, { online }) => sum + online, 0),
        totalOfflineDevices: Object.values(summary).reduce((sum, { offline }) => sum + offline, 0),
        ...summary,
    };
};

// Caching for ping results
const cache = new Map();
let deviceDowntimeData = {};

// Ping devices and track uptime/downtime
const pingDevices = async (devices) => {
    const limit = pLimit(10); // Limit concurrent pings
    const pingPromises = devices.map((device) =>
        limit(async () => {
            const ipAddress = device.ip_address;
            const currentTime = Date.now();

            if (!ipAddress) {
                device.status = "IP Address Missing";
                return;
            }

            // Check if we have a cached result
            if (cache.has(ipAddress)) {
                const { status, timestamp } = cache.get(ipAddress);
                if (currentTime - timestamp < 60000) { // Refresh every 60 seconds
                    device.status = status;
                    return;
                }
            }

            // Perform ping
            const status = await pingDevice(ipAddress);
            device.status = status;
            cache.set(ipAddress, { status, timestamp: currentTime });

            // Track downtime/uptime
            if (status === "Offline") {
                if (!deviceDowntimeData[ipAddress]) {
                    deviceDowntimeData[ipAddress] = { downtime: 5, lastOfflineTime: currentTime };
                } else if (currentTime - deviceDowntimeData[ipAddress].lastOfflineTime > 300000) {
                    deviceDowntimeData[ipAddress].downtime += 5;
                    deviceDowntimeData[ipAddress].lastOfflineTime = currentTime;
                }
            } else {
                if (deviceDowntimeData[ipAddress]) {
                    deviceDowntimeData[ipAddress].uptime = (deviceDowntimeData[ipAddress].uptime || 0) + 5;
                    delete deviceDowntimeData[ipAddress].lastOfflineTime; 
                }
            }
        })
    );

    await Promise.all(pingPromises);
};

// Ping a single device
const pingDevice = async (ip) => {
    return new Promise((resolve) => {
        ping.sys.probe(ip, (isAlive) => {
            resolve(isAlive ? "Online" : "Offline");
        });
    });
};

// Fetch downtime/uptime data
const fetchDeviceUptimeData = () => {
    return deviceDowntimeData;
};

// Preload data
loadExcelData();

// Export functions
module.exports = { 
    fetchGlobalData, 
    fetchRegionData, 
    fetchAllIpAddress, 
    fetchDeviceUptimeData, 
    allData 
};
