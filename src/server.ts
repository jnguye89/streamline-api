import express, { Request, Response } from "express";
import multer from "multer";
import * as dotenv from "dotenv";
import { getFiles, uploadVideo } from "./services/video.service";
import * as functions from "firebase-functions";

const cors = require("cors");

const app = express();
const admin = require("firebase-admin");

const radioService = require("./radio.service");

dotenv.config();
// Initialize Firebase Admin SDK
app.use(cors());
app.use(express.json());

// Set up Multer for file uploads (temporary storage for videos)
const storage = multer.memoryStorage(); // Use memory storage instead of disk
const upload = multer({ storage });

app.post(
  "/video",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File;

    if (!file) {
      res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const signedUrl = await uploadVideo(file);
      res.status(200).send({ url: signedUrl });
    } catch (error: Error | any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get("/videos", async (req, res) => {
  const files = await getFiles("videos/");
  res.status(200).send(files);
});

app.get("/listen/stations/:quantity", async (req, res) => {
  try {
    const stations = await radioService.getRandomStations(+req.params.quantity);
    console.log(stations);
    res.json(stations);
  } catch {
    res.status(500).json({ error: "Failed to fetch stations" });
  }
});

export const api = functions.https.onRequest(app);
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
