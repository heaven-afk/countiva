import { getSupabase } from "./supabase";

export async function uploadBusinessLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP logo.");
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Choose a logo smaller than 2 MB.");
  const client = getSupabase();
  if (!client || !navigator.onLine)
    throw new Error("Connect to the internet to upload your logo.");
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    throw new Error("Sign in again to upload your logo.");
  const image = await createImageBitmap(file);
  let blob: Blob;
  try {
    const scale = Math.min(1, 768 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Couldn’t prepare your logo. Try another browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Couldn’t read this logo.")),
        "image/png",
      );
    });
  } finally {
    image.close();
  }
  const path = `${data.user.id}/${crypto.randomUUID()}.png`;
  const bucket = client.storage.from("business-logos");
  const result = await bucket.upload(path, blob, {
    contentType: "image/png",
    upsert: false,
    cacheControl: "31536000",
  });
  if (result.error)
    throw new Error(
      "Logo upload failed. Check your connection and ask your administrator to enable logo uploads if it keeps failing.",
    );
  return bucket.getPublicUrl(path).data.publicUrl;
}
