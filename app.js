require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const regionRoutes = require("./routes/regionRoutes");
const ping = require("ping");
const net = require("net");
const { execSync } = require("child_process");
const { fetchAllIpAddress } = require("./services/excelService");

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

// Device status map: { ip: { status, failCount, lastOnline } }
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

// Main device monitoring loop
const pingDevices = async () => {
  const devices = fetchAllIpAddress();
  flushArpCache(); // Flush ARP cache before pinging

  const updatedStatus = {};
  for (const ip of devices) {
    const isAlive = await checkDeviceStatus(ip);

    // Get current device status
    const current = deviceStatus.get(ip) || { status: "Unknown", failCount: 0, lastOnline: null };

    if (isAlive) {
      // Reset fail count on successful response and update last online time
      deviceStatus.set(ip, { status: "Online", failCount: 0, lastOnline: new Date() });
      if (current.status !== "Online") {
        updatedStatus[ip] = "Online";
      }
    } else {
      // Increment fail count for each failed attempt
      const failCount = current.failCount + 1;
      const newStatus = failCount >= 3 ? "Offline" : "Online";
      deviceStatus.set(ip, { status: newStatus, failCount, lastOnline: current.lastOnline });
      if (current.status !== newStatus) {
        updatedStatus[ip] = newStatus;
      }
    }
  }

  // Log the updated status
  if (Object.keys(updatedStatus).length > 0) {
    console.log("Updated device status:", updatedStatus);
  }
};

// Endpoint: Ping a single IP dynamically
app.get("/api/ping/:ip", async (req, res) => {
  const ip = req.params.ip;

  try {
    const isAlive = await checkDeviceStatus(ip);
    res.json({ ip, status: isAlive ? "Online" : "Offline" });
  } catch (error) {
    console.error(`Ping error for ${ip}:`, error);
    res.json({ ip, status: "Offline" });
  }
});

// Endpoint: Retrieve all device statuses
app.get("/api/devices/status", (req, res) => {
  const statusObj = Object.fromEntries(
    Array.from(deviceStatus.entries()).map(([ip, { status }]) => [ip, status])
  );
  res.json(statusObj);
});

// Endpoint: Fetch uptime for all devices
app.get("/api/regions/devices/uptime", (req, res) => {
  const uptimeData = {};

  deviceStatus.forEach((value, ip) => {
    if (value.status === "Online" && value.lastOnline) {
      const uptime = new Date() - new Date(value.lastOnline); // Calculate uptime in milliseconds
      uptimeData[ip] = {
        status: value.status,
        uptime: Math.floor(uptime / 1000), // Uptime in seconds
      };
    } else {
      uptimeData[ip] = { status: value.status, uptime: 0 };
    }
  });

  res.json(uptimeData);
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

// Device status map: { ip: { status, failCount, lastOnline, statusHistory } }
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

// Function to store status in history
const storeStatusInHistory = (ip, status) => {
  const currentDate = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");
  const currentWeek = moment().tz("Asia/Kolkata").week();
  const currentMonth = moment().tz("Asia/Kolkata").month() + 1;

  const statusHistory = deviceStatus.get(ip)?.statusHistory || {
    day: {},
    week: {},
    month: {},
  };

  // Store status by day
  if (!statusHistory.day[currentDate]) {
    statusHistory.day[currentDate] = { uptime: 0, downtime: 0 };
  }
  if (status === "Online") {
    statusHistory.day[currentDate].uptime++;
  } else {
    statusHistory.day[currentDate].downtime++;
  }

  // Store status by week
  if (!statusHistory.week[currentWeek]) {
    statusHistory.week[currentWeek] = { uptime: 0, downtime: 0 };
  }
  if (status === "Online") {
    statusHistory.week[currentWeek].uptime++;
  } else {
    statusHistory.week[currentWeek].downtime++;
  }

  // Store status by month
  if (!statusHistory.month[currentMonth]) {
    statusHistory.month[currentMonth] = { uptime: 0, downtime: 0 };
  }
  if (status === "Online") {
    statusHistory.month[currentMonth].uptime++;
  } else {
    statusHistory.month[currentMonth].downtime++;
  }

  deviceStatus.set(ip, { ...deviceStatus.get(ip), statusHistory });
};

// Main device monitoring loop
const pingDevices = async () => {
  const devices = fetchAllIpAddress();
  flushArpCache(); // Flush ARP cache before pinging

  const updatedStatus = {};
  for (const ip of devices) {
    const isAlive = await checkDeviceStatus(ip);

    // Get current device status
    const current = deviceStatus.get(ip) || { status: "Unknown", failCount: 0, lastOnline: null, statusHistory: {} };

    if (isAlive) {
      // Reset fail count on successful response and update last online time
      deviceStatus.set(ip, { status: "Online", failCount: 0, lastOnline: new Date(), statusHistory: current.statusHistory });
      storeStatusInHistory(ip, "Online"); // Store status in history
      if (current.status !== "Online") {
        updatedStatus[ip] = "Online";
      }
    } else {
      // Increment fail count for each failed attempt
      const failCount = current.failCount + 1;
      const newStatus = failCount >= 3 ? "Offline" : "Online";
      deviceStatus.set(ip, { status: newStatus, failCount, lastOnline: current.lastOnline, statusHistory: current.statusHistory });
      storeStatusInHistory(ip, "Offline"); // Store status in history
      if (current.status !== newStatus) {
        updatedStatus[ip] = newStatus;
      }
    }
  }

  // Log the updated status
  if (Object.keys(updatedStatus).length > 0) {
    console.log("Updated device status:", updatedStatus);
  }
};

// Endpoint: Ping a single IP dynamically
app.get("/api/ping/:ip", async (req, res) => {
  const ip = req.params.ip;

  try {
    const isAlive = await checkDeviceStatus(ip);
    res.json({ ip, status: isAlive ? "Online" : "Offline" });
  } catch (error) {
    console.error(`Ping error for ${ip}:`, error);
    res.json({ ip, status: "Offline" });
  }
});

// Endpoint: Retrieve all device statuses
app.get("/api/devices/status", (req, res) => {
  const statusObj = Object.fromEntries(
    Array.from(deviceStatus.entries()).map(([ip, { status }]) => [ip, status])
  );
  res.json(statusObj);
});

// Endpoint: Fetch uptime for all devices
app.get("/api/regions/devices/uptime", (req, res) => {
  const uptimeData = {};

  deviceStatus.forEach((value, ip) => {
    if (value.status === "Online" && value.lastOnline) {
      const uptime = new Date() - new Date(value.lastOnline); // Calculate uptime in milliseconds
      uptimeData[ip] = {
        status: value.status,
        uptime: Math.floor(uptime / 1000), // Uptime in seconds
      };
    } else {
      uptimeData[ip] = { status: value.status, uptime: 0 };
    }
  });

  res.json(uptimeData);
});

// Endpoint: Fetch day, week, month-wise uptime and downtime data
app.get("/api/regions/devices/status-summary", (req, res) => {
  const summaryData = {};
  deviceStatus.forEach((value, ip) => {
    summaryData[ip] = value.statusHistory;
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







