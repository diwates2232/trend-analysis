const express = require("express");
const {
    getGlobalSummary,
    getGlobalDetails,
    getRegionSummary,
    getRegionDetails,
    getDeviceUptimeSummary
} = require("../controllers/regionControllers");

const router = express.Router();

// Global Routes
router.get("/summary/global", getGlobalSummary);
router.get("/details/global", getGlobalDetails);

// Region Routes
router.get("/summary/:regionName", getRegionSummary);
router.get("/details/:regionName", getRegionDetails);

// Device Uptime/Downtime Summary
router.get("/uptime-summary", getDeviceUptimeSummary);

module.exports = router;
