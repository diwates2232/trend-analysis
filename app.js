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
app.get("/api/devices/uptime", (req, res) => {
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
