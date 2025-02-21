
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const regionRoutes = require("./routes/regionRoutes");
const ping = require("ping");
const net = require("net");
const { execSync } = require("child_process");
const { fetchAllIpAddress } = require("./services/excelService");
const moment = require("moment-timezone");

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(
  cors({
    origin: "http://127.0.0.1:5500",
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);
app.use(bodyParser.json());

// Routes
app.use("/api/regions", regionRoutes);

// Device status map: { ip: { status, failCount, lastOnline, lastOffline, statusHistory } }
let deviceStatus = new Map();

// Function to flush ARP cache (helps avoid false positives)
const flushArpCache = () => {
  try {
    const platform = process.platform;
    if (platform === "win32") {
      execSync("arp -d *");
    } else if (platform === "linux" || platform === "darwin") {
      execSync("sudo ip -s -s neigh flush all");
    }
    console.log("ARP cache flushed.");
  } catch (error) {
    console.error("Failed to flush ARP cache:", error);
  }
};

// Function to check TCP port
const checkTcpPort = (host, port = 80, timeout = 3000) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
};

// Enhanced ping with larger payload
const pingWithLargePayload = async (ip, retries = 3, delay = 1000) => {
  let successCount = 0;
  for (let i = 0; i < retries; i++) {
    try {
      const result = await ping.promise.probe(ip, { extra: ["-s", "1024"] }); // 1024 bytes payload
      if (result.alive) successCount++;
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`Ping error for ${ip}:`, error);
    }
  }
  return successCount === retries;
};

// Determine device status with stability checks
const checkDeviceStatus = async (ip) => {
  const pingAlive = await pingWithLargePayload(ip);
  const tcpAlive = pingAlive ? await checkTcpPort(ip) : false;
  return pingAlive && tcpAlive;
};

// Function to store status in history and calculate downtime duration

const storeStatusInHistory = (ip, status) => {
  const currentDate = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");
  const currentWeek = moment().tz("Asia/Kolkata").week();
  const currentMonth = moment().tz("Asia/Kolkata").month() + 1;

  let currentDeviceStatus = deviceStatus.get(ip);

  if (!currentDeviceStatus) {
    currentDeviceStatus = {
      status: "Unknown",
      failCount: 0,
      lastOnline: null,
      lastOffline: null,  // Timestamp for when the device went offline
      statusHistory: {
        day: {},
        week: {},
        month: {}
      }
    };
  }

  const statusHistory = currentDeviceStatus.statusHistory;

  // Ensure that the statusHistory object is initialized
  if (!statusHistory) {
    currentDeviceStatus.statusHistory = {
      day: {},
      week: {},
      month: {}
    };
  }

  // Initialize statusHistory if it's undefined
  if (!statusHistory.day) statusHistory.day = {};
  if (!statusHistory.week) statusHistory.week = {};
  if (!statusHistory.month) statusHistory.month = {};

  // Store status by day
  if (!statusHistory.day[currentDate]) {
    statusHistory.day[currentDate] = { uptime: 0, downtime: 0, downtimeDuration: 0 }; // Add downtimeDuration
  }

  if (status === "Online") {
    if (currentDeviceStatus.lastOffline) {
      const downtimeDuration = moment().diff(moment(currentDeviceStatus.lastOffline), 'seconds');
      statusHistory.day[currentDate].downtimeDuration += downtimeDuration;
      statusHistory.day[currentDate].downtime++;
    }
    statusHistory.day[currentDate].uptime++;
    currentDeviceStatus.lastOffline = null;
  } else {
    statusHistory.day[currentDate].downtime++;
    currentDeviceStatus.lastOffline = new Date();
  }

  // Store status by week
  if (!statusHistory.week[currentWeek]) {
    statusHistory.week[currentWeek] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
  }

  if (status === "Online") {
    if (currentDeviceStatus.lastOffline) {
      const downtimeDuration = moment().diff(moment(currentDeviceStatus.lastOffline), 'seconds');
      statusHistory.week[currentWeek].downtimeDuration += downtimeDuration;
      statusHistory.week[currentWeek].downtime++;
    }
    statusHistory.week[currentWeek].uptime++;
    currentDeviceStatus.lastOffline = null;
  } else {
    statusHistory.week[currentWeek].downtime++;
    currentDeviceStatus.lastOffline = new Date();
  }

  // Store status by month
  if (!statusHistory.month[currentMonth]) {
    statusHistory.month[currentMonth] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
  }

  if (status === "Online") {
    if (currentDeviceStatus.lastOffline) {
      const downtimeDuration = moment().diff(moment(currentDeviceStatus.lastOffline), 'seconds');
      statusHistory.month[currentMonth].downtimeDuration += downtimeDuration;
      statusHistory.month[currentMonth].downtime++;
    }
    statusHistory.month[currentMonth].uptime++;
    currentDeviceStatus.lastOffline = null;
  } else {
    statusHistory.month[currentMonth].downtime++;
    currentDeviceStatus.lastOffline = new Date();
  }

  deviceStatus.set(ip, currentDeviceStatus);
};

// Main device monitoring loop
const pingDevices = async () => {
  const devices = fetchAllIpAddress();
  flushArpCache(); // Flush ARP cache before pinging

  const updatedStatus = {};
  for (const ip of devices) {
    const isAlive = await checkDeviceStatus(ip);
    const current = deviceStatus.get(ip) || { status: "Unknown", failCount: 0, lastOnline: null };

    if (isAlive) {
      deviceStatus.set(ip, { status: "Online", failCount: 0, lastOnline: new Date() });
      storeStatusInHistory(ip, "Online");
      if (current.status !== "Online") {
        updatedStatus[ip] = "Online";
      }
    } else {
      const failCount = current.failCount + 1;
      const newStatus = failCount >= 3 ? "Offline" : "Online";
      deviceStatus.set(ip, { status: newStatus, failCount, lastOnline: current.lastOnline });
      storeStatusInHistory(ip, "Offline");
      if (current.status !== newStatus) {
        updatedStatus[ip] = newStatus;
      }
    }
  }

  if (Object.keys(updatedStatus).length > 0) {
    console.log("Updated device status:", updatedStatus);
  }
};

// Endpoint: Retrieve status summary for all devices (with uptime, downtime, and downtime duration)
app.get("/api/regions/devices/status-summary", (req, res) => {
  const summaryData = {};

  deviceStatus.forEach((device, ip) => {
    summaryData[ip] = {
      day: device.statusHistory.day,
      week: device.statusHistory.week,
      month: device.statusHistory.month
    };
  });

  res.json(summaryData);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Internal Server Error");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  pingDevices(); // Initial device status check
  setInterval(pingDevices, 120000); // Repeat every 2 minutes
});






const storeStatusInHistory = (ip, status) => {
  const currentDate = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");
  const currentWeek = moment().tz("Asia/Kolkata").week();
  const currentMonth = moment().tz("Asia/Kolkata").month() + 1;

  console.log(`Storing status for device: ${ip}, Status: ${status}`);

  let currentDeviceStatus = deviceStatus.get(ip);

  // If currentDeviceStatus is undefined, initialize it
  if (!currentDeviceStatus) {
    console.log(`Initializing new device status for: ${ip}`);
    currentDeviceStatus = {
      status: "Unknown",
      failCount: 0,
      lastOnline: null,
      lastOffline: null, // Timestamp for when the device went offline
      statusHistory: {
        day: {},
        week: {},
        month: {}
      }
    };
  }

  // Ensure that statusHistory is properly initialized
  let statusHistory = currentDeviceStatus.statusHistory;

  // Double-check initialization of statusHistory
  if (!statusHistory) {
    console.log(`Re-initializing statusHistory for device: ${ip}`);
    currentDeviceStatus.statusHistory = { day: {}, week: {}, month: {} };
    statusHistory = currentDeviceStatus.statusHistory;
  }

  // Store status by day
  if (!statusHistory.day[currentDate]) {
    console.log(`Initializing day history for: ${ip} on ${currentDate}`);
    statusHistory.day[currentDate] = { uptime: 0, downtime: 0, downtimeDuration: 0 }; // Add downtimeDuration
  }

  if (status === "Online") {
    if (currentDeviceStatus.lastOffline) {
      const downtimeDuration = moment().diff(moment(currentDeviceStatus.lastOffline), 'seconds');
      statusHistory.day[currentDate].downtimeDuration += downtimeDuration;
      statusHistory.day[currentDate].downtime++;
    }
    statusHistory.day[currentDate].uptime++;
    currentDeviceStatus.lastOffline = null;
  } else {
    statusHistory.day[currentDate].downtime++;
    currentDeviceStatus.lastOffline = new Date();
  }

  // Store status by week
  if (!statusHistory.week[currentWeek]) {
    console.log(`Initializing week history for: ${ip} on week ${currentWeek}`);
    statusHistory.week[currentWeek] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
  }

  if (status === "Online") {
    if (currentDeviceStatus.lastOffline) {
      const downtimeDuration = moment().diff(moment(currentDeviceStatus.lastOffline), 'seconds');
      statusHistory.week[currentWeek].downtimeDuration += downtimeDuration;
      statusHistory.week[currentWeek].downtime++;
    }
    statusHistory.week[currentWeek].uptime++;
    currentDeviceStatus.lastOffline = null;
  } else {
    statusHistory.week[currentWeek].downtime++;
    currentDeviceStatus.lastOffline = new Date();
  }

  // Store status by month
  if (!statusHistory.month[currentMonth]) {
    console.log(`Initializing month history for: ${ip} on month ${currentMonth}`);
    statusHistory.month[currentMonth] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
  }

  if (status === "Online") {
    if (currentDeviceStatus.lastOffline) {
      const downtimeDuration = moment().diff(moment(currentDeviceStatus.lastOffline), 'seconds');
      statusHistory.month[currentMonth].downtimeDuration += downtimeDuration;
      statusHistory.month[currentMonth].downtime++;
    }
    statusHistory.month[currentMonth].uptime++;
    currentDeviceStatus.lastOffline = null;
  } else {
    statusHistory.month[currentMonth].downtime++;
    currentDeviceStatus.lastOffline = new Date();
  }

  // Ensure device status is updated in the deviceStatus map
  deviceStatus.set(ip, currentDeviceStatus);

  console.log(`Device status updated for: ${ip}`, currentDeviceStatus);
};








