import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import prisma from "./config/prisma.js";

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5173";

app.use(helmet());

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "Riseora E-Commerce API is running",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(
    `Riseora API running on http://localhost:${PORT}`
  );
});

async function shutdown() {
  console.log("Shutting down Riseora API...");

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);