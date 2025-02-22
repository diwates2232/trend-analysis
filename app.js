require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const regionRoutes = require("./routes/regionRoutes");
const ping = require("ping");
const moment = require("moment-timezone");

const app = express();
const PORT = process.env.PORT || 80;

const { fetchAllIpAddress } = require("./services/excelService");

// Middleware
app.use(
  cors({
    origin: "http://127.0.0.1:5501",
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);
app.use(bodyParser.json());

// Routes
app.use("/api/regions", regionRoutes);

// Device status storage
let deviceStatus = new Map();

// Function to ping a single device
const checkDeviceStatus = async (ip) => {
  try {
    const result = await ping.promise.probe(ip);
    return result.alive;
  } catch (error) {
    console.error(`Ping error for ${ip}:`, error);
    return false;
  }
};

// Function to store status history
const storeStatusHistory = (ip, status) => {
  const now = moment().tz("Asia/Kolkata");
  const currentDate = now.format("YYYY-MM-DD");
  const currentWeek = now.week();
  const currentMonth = now.month() + 1;

  let currentDevice = deviceStatus.get(ip);

  if (!currentDevice) {
    currentDevice = {
      status: "Unknown",
      lastOnline: null,
      lastOffline: null,
      statusHistory: {
        day: {},
        week: {},
        month: {},
      },
    };
  }

  let history = currentDevice.statusHistory;

  if (!history.day[currentDate]) {
    history.day[currentDate] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
  }
  if (!history.week[currentWeek]) {
    history.week[currentWeek] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
  }
  if (!history.month[currentMonth]) {
    history.month[currentMonth] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
  }

  if (status === "Online") {
    if (currentDevice.lastOffline) {
      const downtimeDuration = now.diff(moment(currentDevice.lastOffline), "seconds");
      history.day[currentDate].downtimeDuration += downtimeDuration;
      history.week[currentWeek].downtimeDuration += downtimeDuration;
      history.month[currentMonth].downtimeDuration += downtimeDuration;
      history.day[currentDate].downtime++;
      history.week[currentWeek].downtime++;
      history.month[currentMonth].downtime++;
    }
    history.day[currentDate].uptime++;
    history.week[currentWeek].uptime++;
    history.month[currentMonth].uptime++;
    currentDevice.lastOnline = now.toDate();
    currentDevice.lastOffline = null;
  } else {
    history.day[currentDate].downtime++;
    history.week[currentWeek].downtime++;
    history.month[currentMonth].downtime++;
    if (!currentDevice.lastOffline) {
      currentDevice.lastOffline = now.toDate();
    }
  }

  currentDevice.status = status;
  deviceStatus.set(ip, currentDevice);
};

// Function to continuously ping devices and track uptime/downtime
const pingDevices = async () => {
  const devices = fetchAllIpAddress();

  for (const ip of devices) {
    const isAlive = await checkDeviceStatus(ip);
    const newStatus = isAlive ? "Online" : "Offline";

    const previousStatus = deviceStatus.get(ip)?.status || "Unknown";
    if (previousStatus !== newStatus) {
      storeStatusHistory(ip, newStatus);
    }
  }

  console.log("Updated device status:", Array.from(deviceStatus.entries()));
};

// Ping devices every 30 seconds
setInterval(pingDevices, 30000);

// Endpoint: Retrieve real-time status of all devices
app.get("/api/devices/status", (req, res) => {
  const response = {};
  deviceStatus.forEach((data, ip) => {
    response[ip] = { status: data.status };
  });
  res.json(response);
});

// Endpoint: Retrieve downtime, uptime, and downtime duration summary
app.get("/api/devices/status-summary", (req, res) => {
  const summary = {};
  deviceStatus.forEach((data, ip) => {
    summary[ip] = {
      day: data.statusHistory.day,
      week: data.statusHistory.week,
      month: data.statusHistory.month,
    };
  });
  res.json(summary);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Internal Server Error");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  pingDevices();
});
