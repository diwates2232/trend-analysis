const xlsx = require("xlsx");
const path = require("path");
const ping = require("ping");

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

const loadExcelData = () => {
    if (Object.keys(allData).length === 0) { // Load only if not already loaded
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
    }
};

// Function to fetch all IP addresses
const fetchAllIpAddress = () => {
    const devices = {
        cameras: allData.cameras,
        archivers: allData.archivers,
        controllers: allData.controllers,
        servers: allData.servers,
    };

    merged = [...devices.cameras , ...devices.archivers, ...devices.controllers, ...devices.servers];
    addresses = merged.map(device => device.ip_address);
    return addresses;
};

// Function to compute global summary and details
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

// Function to compute region summary and details
const fetchRegionData = async (regionName) => {
    const devices = {
        cameras: allData.cameras.filter(row => row.location?.toLowerCase() === regionName.toLowerCase()),
        archivers: allData.archivers.filter(row => row.location?.toLowerCase() === regionName.toLowerCase()),
        controllers: allData.controllers.filter(row => row.location?.toLowerCase() === regionName.toLowerCase()),
        servers: allData.servers.filter(row => row.location?.toLowerCase() === regionName.toLowerCase()),
    };

    await pingDevices([...devices.cameras, ...devices.archivers, ...devices.controllers, ...devices.servers]);

    const summary = calculateSummary(devices);
    return { summary, details: devices };
};

// Helper function to calculate detailed summary
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

const pLimit = require("p-limit");

const cache = new Map(); // Stores device status temporarily
let deviceDowntimeData = {}; // Stores downtime and uptime information for devices

// Monitor devices' status over time and track downtime/uptime
const pingDevices = async (devices) => {
    const limit = pLimit(10); // Reduce concurrent ping requests to 10
    const pingPromises = devices.map((device) =>
        limit(async () => {
            const ipAddress = device.ip_address;
            const currentTime = new Date().getTime();
            if (cache.has(ipAddress)) {
                device.status = cache.get(ipAddress); // Use cached status
            } else {
                device.status = ipAddress ? await pingDevice(ipAddress) : "IP Address Missing";
                cache.set(ipAddress, device.status); // Store result in cache
            }

            // Track downtime and uptime for devices that go offline for more than 5 minutes
            if (device.status === "Offline") {
                if (deviceDowntimeData[ipAddress]) {
                    const lastOfflineTime = deviceDowntimeData[ipAddress].lastOfflineTime;
                    if (currentTime - lastOfflineTime > 300000) { // More than 5 minutes of downtime
                        deviceDowntimeData[ipAddress].downtime += 5; // Adding 5 minutes
                    }
                } else {
                    deviceDowntimeData[ipAddress] = { downtime: 5, lastOfflineTime: currentTime }; // Initialize with 5 minutes of downtime
                }
            } else {
                if (deviceDowntimeData[ipAddress]) {
                    deviceDowntimeData[ipAddress].uptime += 5; // Adding 5 minutes of uptime
                } else {
                    deviceDowntimeData[ipAddress] = { uptime: 5 }; // Initialize with 5 minutes of uptime
                }
            }
        })
    );

    await Promise.all(pingPromises);
};

// Function to ping a single device
const pingDevice = (ip) => {
    return new Promise((resolve) => {
        ping.sys.probe(ip, (isAlive) => {
            resolve(isAlive ? "Online" : "Offline");
        });
    });
};

// Preload data
loadExcelData();

// Endpoint to fetch downtime/uptime data
const fetchDeviceUptimeData = () => {
    return deviceDowntimeData;
};

module.exports = { fetchGlobalData, fetchRegionData, fetchAllIpAddress, fetchDeviceUptimeData };
