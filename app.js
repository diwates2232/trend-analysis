
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const ping = require("ping");
const regionRoutes = require("./routes/regionRoutes");
const { fetchAllIpAddress } = require("./services/excelService");

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(cors({
  origin: "http://127.0.0.1:5500", // Match your frontend's origin
  methods: "GET,POST,PUT,DELETE",
  allowedHeaders: "Content-Type,Authorization",
}));
app.use(bodyParser.json());

// Routes
app.use("/api/regions", regionRoutes);

// Store device statuses and downtime tracking
const devices = fetchAllIpAddress();
let deviceStatus = {};
let downtimeTracking = {}; // { ip: { lastOffline: timestamp, downtimeDuration: minutes } }
let uptimeDowntimeStats = {}; // Store daily, weekly, and monthly uptime/downtime

// Function to get the current date, week, and month keys
const getDateKeys = () => {
  const now = new Date();
  const day = now.toISOString().split("T")[0]; // YYYY-MM-DD format
  const week = Math.ceil(now.getDate() / 7); // Week number in the month
  const month = now.getMonth() + 1; // Month number
  return { day, week, month };
};

// Function to update device status and track downtime/uptime
async function pingDevices() {
  const { day, week, month } = getDateKeys();

  for (const ip of devices) {
    try {
      const result = await ping.promise.probe(ip);
      const isOnline = result.alive;
      
      if (!uptimeDowntimeStats[ip]) {
        uptimeDowntimeStats[ip] = { daily: {}, weekly: {}, monthly: {} };
      }

      // Initialize if not present
      if (!uptimeDowntimeStats[ip].daily[day]) {
        uptimeDowntimeStats[ip].daily[day] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
      }
      if (!uptimeDowntimeStats[ip].weekly[week]) {
        uptimeDowntimeStats[ip].weekly[week] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
      }
      if (!uptimeDowntimeStats[ip].monthly[month]) {
        uptimeDowntimeStats[ip].monthly[month] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
      }

      if (isOnline) {
        // If previously offline, calculate downtime duration
        if (downtimeTracking[ip] && downtimeTracking[ip].lastOffline) {
          const lastOfflineTime = downtimeTracking[ip].lastOffline;
          const downtimeMinutes = Math.floor((Date.now() - lastOfflineTime) / 60000); // Convert ms to minutes

          // Update downtime duration
          uptimeDowntimeStats[ip].daily[day].downtimeDuration += downtimeMinutes;
          uptimeDowntimeStats[ip].weekly[week].downtimeDuration += downtimeMinutes;
          uptimeDowntimeStats[ip].monthly[month].downtimeDuration += downtimeMinutes;

          // Reset tracking
          delete downtimeTracking[ip];
        }

        // Increase uptime count
        uptimeDowntimeStats[ip].daily[day].uptime += 1;
        uptimeDowntimeStats[ip].weekly[week].uptime += 1;
        uptimeDowntimeStats[ip].monthly[month].uptime += 1;
      } else {
        // If the device just went offline, store the timestamp


        if (!downtimeTracking[ip]) {
          // If the device just went offline, start tracking its downtime
          downtimeTracking[ip] = { lastOffline: Date.now(), totalDowntime: 0 };
        } else {
          // Device is still offline, calculate the new duration
          const lastOfflineTime = downtimeTracking[ip].lastOffline;
          const downtimeMinutes = Math.floor((Date.now() - lastOfflineTime) / 60000); // Convert ms to minutes
        
          if (downtimeMinutes > 0) {  // Only update if at least 1 minute has passed
            uptimeDowntimeStats[ip].daily[day].downtimeDuration += downtimeMinutes;
            uptimeDowntimeStats[ip].weekly[week].downtimeDuration += downtimeMinutes;
            uptimeDowntimeStats[ip].monthly[month].downtimeDuration += downtimeMinutes;
        
            // Update total downtime
            downtimeTracking[ip].totalDowntime += downtimeMinutes;
        
            // Update last offline time to the current timestamp (to avoid counting same duration multiple times)
            downtimeTracking[ip].lastOffline = Date.now();
          }
        }




        // Increase downtime count
        uptimeDowntimeStats[ip].daily[day].downtime += 1;
        uptimeDowntimeStats[ip].weekly[week].downtime += 1;
        uptimeDowntimeStats[ip].monthly[month].downtime += 1;
      }

      deviceStatus[ip] = isOnline ? "Online" : "Offline";
    } catch (error) {
      console.error(`Error pinging ${ip}:`, error);
      deviceStatus[ip] = "Offline";
    }
  }

  console.log("Updated device status:", deviceStatus);
}

// Ping devices every 30 seconds
setInterval(pingDevices, 30000);

// Get real-time status of all devices
app.get("/api/devices/status", (req, res) => {
  res.json(deviceStatus);
});

// New endpoint to get downtime/uptime summary
app.get("/api/devices/downtime-uptime", (req, res) => {
  res.json(uptimeDowntimeStats);
});

// Ping a specific device dynamically
app.get("/api/ping/:ip", async (req, res) => {
  const ip = req.params.ip;

  try {
    const result = await ping.promise.probe(ip);
    res.json({ ip, status: result.alive ? "Online" : "Offline" });
  } catch (error) {
    console.error(`Ping error for ${ip}:`, error);
    res.json({ ip, status: "Offline" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  pingDevices(); // Start pinging devices immediately
});

