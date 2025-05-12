import { bucket } from "./../firebase";

export const uploadVideo = (file: Express.Multer.File): Promise<string> => {
  const blob = bucket.file(`videos/${file.originalname}`);
  const blobStream = blob.createWriteStream({
    metadata: { contentType: file.mimetype },
  });

  return new Promise((resolve, reject) => {
    blobStream.on("error", (err) => {
      reject(new Error("Upload error"));
    });

    blobStream.on("finish", async () => {
      try {
        const [signedUrl] = await blob.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 60 * 60 * 1000,
        });
        resolve(signedUrl);
      } catch (err) {
        reject(err);
      }
    });

    blobStream.end(file.buffer); // kick off the stream
  });
};

export const getFiles = async (prefix: string) => {
  const [files] = await bucket.getFiles({ prefix }); // 'videos/' is optional path/folder
  return files.map(
    (file) =>
      `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(file.name)}?alt=media`
  );
};
